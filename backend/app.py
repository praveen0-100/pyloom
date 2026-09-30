"""
PYLOOM Flask Web Server
Serves visual workflow execution APIs, static frontend, and admin dashboard.
"""
import os
import sys
import copy
import json
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, jsonify, request, send_from_directory, session, redirect
from flask_cors import CORS


from backend.engine.validator import validate_flow
from backend.engine.executor import execute_flow
from backend.engine.scorer import score_flow, outputs_match
from flask import g, has_request_context
from backend import db as _db
from backend.db import kv_get as _raw_kv_get, kv_set as _raw_kv_set

# ---------------------------------------------------------------------------
# Sharded state. Tables that many participants write at once are stored one row
# per item (see db.kv_scan) instead of one JSON blob per table. A save only writes
# the items THIS request changed, so simultaneous requests from different
# participants never overwrite each other. kv_get/kv_set below route these keys
# transparently, so the rest of the app keeps using the same calls.
# name -> (row prefix, shape, id field)   shapes: list of records | dict | set of ids
# ---------------------------------------------------------------------------
SHARDS = {
    "participants.json": ("participants:", "list", "team_id"),
    "progress.json": ("progress:", "dict", None),
    "submissions.json": ("submissions:", "list", "_id"),
    "presence": ("presence:", "dict", None),
    "participant_violations": ("violation:", "dict", None),
    "level_entries": ("levelentry:", "dict", None),
    "forced_fullscreen": ("forcedfs:", "set", None),
    "deleted_participants": ("deleted:", "set", None),
}
_MISSING = object()
_migrated = False


def _shard_memo():
    if not has_request_context():
        return None
    memo = getattr(g, "_shard_memo", None)
    if memo is None:
        memo = g._shard_memo = {}
    return memo


def _shard_snapshot(name):
    """{id: value} for the whole shard, cached for the rest of this request."""
    memo = _shard_memo()
    if memo is not None and name in memo:
        return memo[name]
    prefix = SHARDS[name][0]
    items = {k[len(prefix):]: v for k, v in _db.kv_scan(prefix).items()}
    if memo is not None:
        memo[name] = items
    return items


def _shard_view(name, items):
    shape = SHARDS[name][1]
    if shape == "list":
        return sorted(copy.deepcopy(list(items.values())), key=lambda r: r.get("_ts", 0))
    if shape == "set":
        return sorted(items)
    return copy.deepcopy(items)


def _shard_items_from(name, data):
    _, shape, id_field = SHARDS[name]
    if shape == "list":
        new = {}
        for i, rec in enumerate(data or []):
            rec = dict(rec)
            rid = str(rec.get(id_field) or "")
            if not rid:
                rid = f"{time.time_ns():020d}-{uuid.uuid4().hex[:6]}"
                if id_field == "_id":
                    rec["_id"] = rid
            rec.setdefault("_ts", time.time())
            new[rid] = rec
        return new
    if shape == "set":
        return {str(i): True for i in data or []}
    return {str(k): v for k, v in dict(data or {}).items()}


def shard_read(name):
    return _shard_view(name, _shard_snapshot(name))


def shard_write(name, data):
    """Persist `data` for the shard, writing only the items that changed since it was read."""
    prefix = SHARDS[name][0]
    old = _shard_snapshot(name)
    new = _shard_items_from(name, data)
    _db.kv_write_many({prefix + k: v for k, v in new.items() if old.get(k, _MISSING) != v})
    _db.kv_delete_many([prefix + k for k in old if k not in new])
    memo = _shard_memo()
    if memo is not None:
        memo[name] = copy.deepcopy(new)


def shard_items(name, ids):
    """Just these items ({id: value}), fetched in one round trip."""
    prefix = SHARDS[name][0]
    memo = _shard_memo()
    if memo is not None and name in memo:
        return {i: copy.deepcopy(memo[name][i]) for i in ids if i in memo[name]}
    rows = _db.kv_get_many([prefix + i for i in ids])
    return {k[len(prefix):]: v for k, v in rows.items()}


def shard_item(name, item_id, default=None):
    return shard_items(name, [item_id]).get(item_id, default)


def shard_put(name, item_id, value):
    """Write one item without reading or touching any other row in the shard."""
    _db.kv_write_many({SHARDS[name][0] + item_id: value})
    memo = _shard_memo()
    if memo is not None and name in memo:
        memo[name][item_id] = copy.deepcopy(value)


def shard_drop(name, item_id):
    _db.kv_delete_many([SHARDS[name][0] + item_id])
    memo = _shard_memo()
    if memo is not None and name in memo:
        memo[name].pop(item_id, None)


def _migrate_to_shards():
    """One-off: split the old single-blob tables into per-item rows (idempotent)."""
    if _raw_kv_get("sharding_v2", None):
        return
    for name in ("participants.json", "progress.json", "submissions.json", "level_entries"):
        legacy = _raw_kv_get(name, None)
        if not legacy or _db.kv_scan(SHARDS[name][0]):
            continue
        if SHARDS[name][1] == "list":
            legacy = [{**rec, "_ts": i} for i, rec in enumerate(legacy)]
        items = _shard_items_from(name, legacy)
        _db.kv_write_many({SHARDS[name][0] + k: v for k, v in items.items()})
    _raw_kv_set("sharding_v2", True)



def kv_get(key, default=None):
    if key in SHARDS:
        return shard_read(key)
    return _raw_kv_get(key, default)


def kv_set(key, value):
    if key in SHARDS:
        return shard_write(key, value)
    return _raw_kv_set(key, value)

app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)
app.secret_key = os.environ.get("PYLOOM_ADMIN_SESSION_SECRET", "pyloom-admin-session-secret")

@app.before_request
def _ensure_migrated():
    global _migrated
    if not _migrated and request.path.startswith("/api/"):
        _migrate_to_shards()
        _migrated = True

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# missions.json / tests.json ship with the app and never change at runtime, so
# they're read straight from the deployment bundle instead of the DB.
DATA_DIR = os.path.join(BASE_DIR, "data")

# Records that change at runtime (participants, progress, submissions, the
# shared timer) live in Supabase (backend/db.py) - see MUTABLE_KEYS below -
# so every serverless instance (participant console and admin panel alike)
# reads and writes the exact same state instead of an instance-local copy.
MUTABLE_KEYS = {"participants.json", "progress.json", "submissions.json"}

ADMIN_USERNAME = "Adminpy"
ADMIN_PASSWORD = "Admin123"

LEVEL_TIME_LIMITS = {"easy": 20 * 60, "medium": 15 * 60, "hard": 10 * 60}
MAIN_TIME_LIMIT = 45 * 60
# Unlocking a hint already costs the participant 3 event credits, so it no longer also
# deducts from the question's 0-4 score (that pushed correct answers down to 0).
HINT_SCORE_PENALTY = 0
TIMER_KEY = "timer_state"
LEVEL_ENTRIES_KEY = "level_entries"
# Timers are started/paused only by the admin. Both the main timer and the level
# timer are shared: every participant sees the same countdown. The level countdown is
# the level's limit minus the admin's level clock (level_run_seconds); the admin
# restarts the level timer to give the whole cohort a fresh clock for the next level.
DEFAULT_TIMER_STATE = {
    "started": False,
    "main_paused": False,
    "level_paused": False,
    "participant_lock_enabled": False,
    "participant_violation": False,
    "participant_violation_reason": "",
    "main_remaining_seconds": MAIN_TIME_LIMIT,
    "level_run_seconds": 0.0,
    "last_tick": None,
}


_timer_cache = {"at": 0.0, "value": None}
TIMER_CACHE_SECONDS = 1.0


def _load_timer_state(cached=False):
    """Timer state. Participant polls pass cached=True so dozens of consoles polling each
    second share one database read per serverless instance; admin edits always read fresh."""
    if cached and time.time() - _timer_cache["at"] < TIMER_CACHE_SECONDS and _timer_cache["value"] is not None:
        return copy.deepcopy(_timer_cache["value"])
    state = {**DEFAULT_TIMER_STATE, **kv_get(TIMER_KEY, {})}
    _timer_cache.update(at=time.time(), value=copy.deepcopy(state))
    return state


def _timer_snapshot(timer_state):
    """Return the authoritative timer values, materializing elapsed time first."""
    if timer_state["started"]:
        now = time.time()
        elapsed = max(0, now - (timer_state["last_tick"] or now))
        timer_state["last_tick"] = now
        if not timer_state["main_paused"]:
            timer_state["main_remaining_seconds"] = max(0, timer_state["main_remaining_seconds"] - elapsed)
        if not timer_state["level_paused"]:
            timer_state["level_run_seconds"] += elapsed
        if timer_state["main_remaining_seconds"] <= 0:
            timer_state["main_paused"] = True

    return {
        "started": timer_state["started"],
        "paused": timer_state["main_paused"] and timer_state["level_paused"],
        "main_paused": timer_state["main_paused"],
        "level_paused": timer_state["level_paused"],
        "participant_lock_enabled": timer_state["participant_lock_enabled"],
        "participant_violation": timer_state["participant_violation"],
        "participant_violation_reason": timer_state["participant_violation_reason"],
        "main_remaining_seconds": round(timer_state["main_remaining_seconds"], 2),
        "level_run_seconds": round(timer_state["level_run_seconds"], 3),
        "main_total_seconds": MAIN_TIME_LIMIT,
    }


def timer_snapshot():
    # Read-only: computed on a copy and never written back. Participant and admin
    # consoles poll this every second; if each poll saved its (stale) copy it could
    # overwrite an admin pause/resume made a moment earlier.
    return _timer_snapshot(_load_timer_state(cached=True))


LEVEL_ORDER = ["easy", "medium", "hard"]


def _level_unlocked(team_id, level):
    """Easy runs from the start. Medium/hard timers only start once every question of the
    previous level has been attempted (tried, wrong or completed - any recorded attempt)."""
    idx = LEVEL_ORDER.index(level)
    if idx == 0:
        return True
    previous = LEVEL_ORDER[idx - 1]
    records = shard_item("progress.json", team_id, {})
    prev_ids = [m["id"] for m in load_json("missions.json")
                if str(m.get("difficulty", "easy")).lower() == previous]
    return bool(prev_ids) and all(records.get(mid, {}).get("attempts", 0) > 0 for mid in prev_ids)


def _team_level_clock(team_id):
    return shard_item(LEVEL_ENTRIES_KEY, team_id, {"used": {}, "active": None, "g0": 0.0})


def _level_view(snapshot, team_id, level):
    """The level countdown for `level`.

    Every level has its own timer per participant. It starts when the participant first
    enters the level (after the admin started the timers), runs only while they are on
    that level, and is paused - with its time kept - while they are on another one.
    Time is measured on the admin's level clock, so admin pause/resume applies to all.
    """
    total = LEVEL_TIME_LIMITS[level]
    clock = _team_level_clock(team_id)
    used = float(clock["used"].get(level, 0.0))
    unlocked = _level_unlocked(team_id, level)
    active = snapshot["started"] and unlocked and clock["active"] == level
    if active:
        used += max(0.0, snapshot["level_run_seconds"] - clock["g0"])
    return {
        "level": level,
        "level_entered": active,
        "level_unlocked": unlocked,
        "level_remaining_seconds": round(max(0, total - used), 2),
        "level_total_seconds": total,
    }


def _deactivate_level(team_id, global_seconds):
    """Pause this participant's running level timer (time already used is kept)."""
    clock = shard_item(LEVEL_ENTRIES_KEY, team_id)
    if not clock or not clock["active"]:
        return
    prev = clock["active"]
    clock["used"][prev] = float(clock["used"].get(prev, 0.0)) + max(0.0, global_seconds - clock["g0"])
    clock["active"] = None
    shard_put(LEVEL_ENTRIES_KEY, team_id, clock)


def _activate_level(team_id, level, global_seconds):
    """Make `level` this participant's running level, banking time on the previous one."""
    clock = shard_item(LEVEL_ENTRIES_KEY, team_id, {"used": {}, "active": None, "g0": 0.0})
    if clock["active"] == level:
        return
    if clock["active"]:
        prev = clock["active"]
        clock["used"][prev] = float(clock["used"].get(prev, 0.0)) + max(0.0, global_seconds - clock["g0"])
    clock["active"] = level
    clock["g0"] = global_seconds
    shard_put(LEVEL_ENTRIES_KEY, team_id, clock)


def _participant_timer(team_id, level):
    level = level if level in LEVEL_TIME_LIMITS else "easy"
    snapshot = timer_snapshot()
    return {**snapshot, **_level_view(snapshot, team_id, level)}


@app.route("/api/timer/state", methods=["GET"])
def get_timer_state():
    team_id = str(request.args.get("team_id", "")).strip()
    level = str(request.args.get("level", "easy")).lower()
    return jsonify({"success": True, "timer": _participant_timer(team_id, level)})


@app.route("/api/timer/level", methods=["POST"])
def enter_timer_level():
    """A participant entered a level: start THEIR countdown for it (once, if timers run)."""
    payload = request.get_json() or {}
    team_id = str(payload.get("team_id", "")).strip()
    level = str(payload.get("level", "")).lower()
    if not team_id or level not in LEVEL_TIME_LIMITS:
        return jsonify({"success": False, "error": "team_id and a valid level are required"}), 400
    snapshot = timer_snapshot()
    if snapshot["started"]:
        if _level_unlocked(team_id, level):
            _activate_level(team_id, level, snapshot["level_run_seconds"])
        else:
            # Locked level (previous one not finished): its timer stays paused, and the
            # level the participant just left stops running too.
            _deactivate_level(team_id, snapshot["level_run_seconds"])
    return jsonify({"success": True, "timer": _participant_timer(team_id, level)})


@app.route("/api/admin/timer/control", methods=["POST"])
def control_timer():
    payload = request.get_json() or {}
    action = str(payload.get("action", "")).lower()
    timer_name = str(payload.get("timer", "both" if action == "start" else "")).lower()
    if action not in {"start", "pause", "resume", "restart"}:
        return jsonify({"success": False, "error": "Action must be start, pause, resume, or restart"}), 400
    if timer_name not in {"main", "level", "both"} or (timer_name == "both" and action != "start"):
        return jsonify({"success": False, "error": "Timer must be main or level (or both for start)"}), 400

    timer_state = _load_timer_state()
    _timer_snapshot(timer_state)
    if action == "start":
        # Admin-only: starts both timers from scratch. Every participant's level
        # countdown begins when they (re)enter their level.
        timer_state["started"] = True
        timer_state["main_paused"] = False
        timer_state["level_paused"] = False
        timer_state["main_remaining_seconds"] = MAIN_TIME_LIMIT
        timer_state["level_run_seconds"] = 0.0
        kv_set(LEVEL_ENTRIES_KEY, {})
        log_activity("ADMIN", "timer", "Admin started both timers")
    elif action == "restart":
        if timer_name == "main":
            timer_state["main_remaining_seconds"] = MAIN_TIME_LIMIT
            timer_state["main_paused"] = False
        else:
            timer_state["level_paused"] = False
            timer_state["level_run_seconds"] = 0.0
            kv_set(LEVEL_ENTRIES_KEY, {})
    elif timer_name == "main":
        timer_state["main_paused"] = action == "pause" or timer_state["main_remaining_seconds"] <= 0
    else:
        timer_state["level_paused"] = action == "pause"
    timer_state["last_tick"] = time.time()
    snapshot = _timer_snapshot(timer_state)
    kv_set(TIMER_KEY, timer_state)
    _timer_cache["at"] = 0.0
    return jsonify({"success": True, "timer": snapshot})


@app.route("/api/admin/participants/<team_id>/fullscreen", methods=["POST"])
def control_single_participant_fullscreen(team_id):
    """Require (or stop requiring) full screen for one participant, independent of everyone else."""
    action = str((request.get_json() or {}).get("action", "")).lower()
    if action not in {"enable", "release"}:
        return jsonify({"success": False, "error": "Action must be enable or release"}), 400
    if action == "enable":
        shard_put(FORCED_FULLSCREEN_KEY, team_id, True)
    else:
        shard_drop(FORCED_FULLSCREEN_KEY, team_id)
    shard_drop(VIOLATIONS_KEY, team_id)
    return jsonify({"success": True, "forced": action == "enable"})


@app.route("/api/admin/participant-control", methods=["POST"])
def control_participant_lock():
    action = str((request.get_json() or {}).get("action", "")).lower()
    if action not in {"enable", "release"}:
        return jsonify({"success": False, "error": "Action must be enable or release"}), 400

    timer_state = _load_timer_state()
    timer_state["participant_lock_enabled"] = action == "enable"
    timer_state["participant_violation"] = False
    timer_state["participant_violation_reason"] = ""
    kv_set(VIOLATIONS_KEY, {})
    snapshot = _timer_snapshot(timer_state)
    kv_set(TIMER_KEY, timer_state)
    _timer_cache["at"] = 0.0
    return jsonify({"success": True, "participant_lock_enabled": snapshot["participant_lock_enabled"]})


RESET_EPOCH_KEY = "reset_epoch"


@app.route("/api/admin/reset-questions", methods=["POST"])
def reset_questions():
    """Wipe all progress and submissions so every team restarts every question."""
    save_json("progress.json", {})
    save_json("submissions.json", [])
    # Participants' browsers hold their own completed/trial state; a new epoch tells them to wipe it.
    kv_set(RESET_EPOCH_KEY, str(time.time()))
    log_activity("admin", "reset", "Progress and submissions reset")
    return jsonify({"success": True})


ACTIVITY_KEY = "activity_log"
PRESENCE_KEY = "presence"
VIOLATIONS_KEY = "participant_violations"
FORCED_FULLSCREEN_KEY = "forced_fullscreen"  # team_ids the admin individually put in full-screen mode
ACTIVITY_LIMIT = 300
PRESENCE_TTL_SECONDS = 25  # ~3 missed heartbeats before someone shows offline


def log_activity(team_id, kind, detail):
    """Append one participant/admin event to the shared activity feed (newest last)."""
    now = time.time()
    _db.kv_write_many({f"activity:{time.time_ns():020d}-{uuid.uuid4().hex[:4]}":
                       {"time": now, "team_id": team_id, "kind": kind, "detail": detail}})


def touch_presence(team_id, mission_id=None, active=True, fullscreen=None, entry=None):
    """Record that a participant is online (heartbeat) and which question they are on."""
    if entry is None:
        entry = shard_item(PRESENCE_KEY, team_id, {})
    changed_mission = mission_id and entry.get("mission_id") != mission_id
    entry.update({"last_seen": time.time(), "online": active})
    if fullscreen is not None:
        entry["fullscreen"] = bool(fullscreen)
    if mission_id:
        entry["mission_id"] = mission_id
    shard_put(PRESENCE_KEY, team_id, entry)
    return changed_mission


@app.route("/api/participant/status/<team_id>", methods=["GET"])
def participant_status(team_id):
    found = shard_items("participants.json", [team_id])
    if shard_item(DELETED_PARTICIPANTS_KEY, team_id):
        return jsonify({"success": True, "status": "removed"})
    participant = found.get(team_id)
    return jsonify({"success": True, "status": participant.get("status", "pending") if participant else "unknown"})


@app.route("/api/participant/heartbeat", methods=["POST"])
def participant_heartbeat():
    payload = request.get_json() or {}
    team_id = str(payload.get("team_id", "")).strip()
    if not team_id:
        return jsonify({"success": False, "error": "team_id required"}), 400
    mission_id = str(payload.get("mission_id", "")).strip() or None
    # Everything this heartbeat needs comes back in ONE round trip to the database.
    keys = {name: SHARDS[name][0] + team_id for name in
            ("participants.json", DELETED_PARTICIPANTS_KEY, PRESENCE_KEY, VIOLATIONS_KEY, FORCED_FULLSCREEN_KEY)}
    rows = _db.kv_get_many(list(keys.values()) + [RESET_EPOCH_KEY])
    participant = rows.get(keys["participants.json"])
    if not participant:
        removed = keys[DELETED_PARTICIPANTS_KEY] in rows
        return jsonify({"success": False, "error": "Not allowed by admin", "removed": removed}), 403
    if participant.get("status") != "active":
        return jsonify({"success": False, "error": "Not allowed by admin"}), 403
    # visible=false means the participant switched tab/window: mark them inactive now.
    visible = bool(payload.get("visible", True))
    if touch_presence(team_id, mission_id, active=visible, fullscreen=payload.get("fullscreen"),
                      entry=rows.get(keys[PRESENCE_KEY], {})) and visible:
        log_activity(team_id, "question", f"Opened question {mission_id}")
    return jsonify({
        "success": True,
        "reset_epoch": rows.get(RESET_EPOCH_KEY, "0"),
        "violation": keys[VIOLATIONS_KEY] in rows,
        "forced_lock": keys[FORCED_FULLSCREEN_KEY] in rows,
    })


@app.route("/api/participant/logout", methods=["POST"])
def participant_logout():
    team_id = str((request.get_json() or {}).get("team_id", "")).strip()
    if team_id:
        touch_presence(team_id, active=False)
        _deactivate_level(team_id, timer_snapshot()["level_run_seconds"])
        log_activity(team_id, "logout", "Left the competition")
    return jsonify({"success": True})


@app.route("/api/participant/lock-violation", methods=["POST"])
def report_participant_lock_violation():
    body = request.get_json() or {}
    reason = str(body.get("reason", "Fullscreen or focus was lost"))[:160]
    team_id = str(body.get("team_id", "")).strip() or "UNKNOWN"
    recorded = False
    # A violation locks only the participant who caused it; everyone else is unaffected.
    if _load_timer_state()["participant_lock_enabled"] or shard_item(FORCED_FULLSCREEN_KEY, team_id):
        if not shard_item(VIOLATIONS_KEY, team_id):
            log_activity(team_id, "violation", reason)
        shard_put(VIOLATIONS_KEY, team_id, reason)
        recorded = True
    return jsonify({"success": True, "participant_violation": recorded})


ADMIN_LOCK_KEY = "admin_lock"
ADMIN_LOCK_TTL_SECONDS = 10


def _admin_lock_active(lock):
    return bool(lock) and time.time() - lock.get("last_seen", 0) < ADMIN_LOCK_TTL_SECONDS


def _claim_admin(refresh_only=False):
    """Only one admin may be signed in at a time (participants are unlimited).

    The active admin holds a lock that their dashboard keeps alive by polling; it
    expires a few seconds after they close the tab, freeing the seat. Returns True
    if this browser session holds (or just took) the admin seat.
    """
    sid = session.get("admin_id")
    lock = kv_get(ADMIN_LOCK_KEY, None)
    if _admin_lock_active(lock) and lock.get("id") != sid:
        return False
    if refresh_only and not sid:
        return False
    if not lock or lock.get("id") != sid or time.time() - lock.get("last_seen", 0) > 3:
        kv_set(ADMIN_LOCK_KEY, {"id": sid, "last_seen": time.time()})
    return True


@app.before_request
def protect_admin_routes():
    public_admin_paths = {"/api/admin/login", "/api/admin/session", "/api/admin/logout"}
    if request.path.startswith("/api/admin/") and request.path not in public_admin_paths:
        if not session.get("admin_authenticated") or not _claim_admin(refresh_only=True):
            return jsonify({"success": False, "error": "Admin authentication required"}), 401

MUTABLE_DEFAULTS = {"participants.json": [], "progress.json": {}, "submissions.json": []}

_STATIC_JSON = {}

def load_json(filename):
    if filename in MUTABLE_KEYS:
        return kv_get(filename, MUTABLE_DEFAULTS[filename])
    # missions.json / tests.json never change at runtime: parse them once per process.
    if filename not in _STATIC_JSON:
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                _STATIC_JSON[filename] = json.load(f)
        else:
            _STATIC_JSON[filename] = [] if filename.endswith(".json") else {}
    return copy.deepcopy(_STATIC_JSON[filename])

def save_json(filename, data):
    if filename in MUTABLE_KEYS:
        kv_set(filename, data)
        return
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def record_progress(team_id, mission_id, status, flow=None, scoring=None, total_credits=None, all_tests_passed=None):
    participant = shard_item("progress.json", team_id, {})
    current = participant.get(mission_id, {})
    current["attempts"] = current.get("attempts", 0) + 1
    if flow is not None:
        current["flow"] = flow
    if scoring is not None:
        current["scoring"] = scoring
    if total_credits is not None:
        current["credits"] = total_credits
        # The leaderboard always reflects the best credits a team has ever earned on
        # this question, so a later experiment/regression never lowers their score.
        current["best_credits"] = max(current.get("best_credits", 0), total_credits)
    if all_tests_passed is not None:
        # Once every test case (hidden and visible) has passed for this question,
        # that "entire pass case" achievement is kept even if a later retry regresses.
        current["all_tests_passed"] = current.get("all_tests_passed", False) or bool(all_tests_passed)
    # Completion is final for this question; later retries must not erase it.
    if current.get("status") != "completed" or status == "completed":
        current["status"] = status
    participant[mission_id] = current
    shard_put("progress.json", team_id, participant)
    log_activity(team_id, "run", f"Ran {mission_id}: {status.replace('_', ' ')}, {total_credits if total_credits is not None else 0} credits")
    return current

@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/admin")
def serve_admin():
    return redirect("/admin.html")


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    payload = request.get_json() or {}
    if payload.get("username") != ADMIN_USERNAME or payload.get("password") != ADMIN_PASSWORD:
        return jsonify({"success": False, "error": "Invalid username or password"}), 401
    session["admin_id"] = session.get("admin_id") or uuid.uuid4().hex
    if not _claim_admin():
        session.pop("admin_id", None)
        return jsonify({"success": False, "error": "Another admin is already signed in. Only one admin is allowed at a time."}), 409
    session["admin_authenticated"] = True
    return jsonify({"success": True})


@app.route("/api/admin/session", methods=["GET"])
def admin_session():
    authenticated = bool(session.get("admin_authenticated")) and _claim_admin(refresh_only=True)
    return jsonify({"success": True, "authenticated": authenticated})


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    lock = kv_get(ADMIN_LOCK_KEY, None)
    if lock and lock.get("id") == session.get("admin_id"):
        kv_set(ADMIN_LOCK_KEY, {})
    session.pop("admin_authenticated", None)
    session.pop("admin_id", None)
    return jsonify({"success": True})


@app.route("/api/participant/register", methods=["POST"])
def register_participant():
    """Public self-registration for the participant console (login-style gate).

    Upserts the player's profile into participants.json keyed by their chosen
    Player ID (used as team_id everywhere else in the API). New players start as
    "pending" and appear on the admin panel until the admin allows them in.
    """
    payload = request.get_json() or {}
    team_id = str(payload.get("team_id", "")).strip()
    player_name = str(payload.get("player_name", "")).strip()
    college = str(payload.get("college", "")).strip()
    year_of_study = str(payload.get("year_of_study", "")).strip()

    if not team_id or not player_name or not college or not year_of_study:
        return jsonify({"success": False, "error": "Player name, ID, college, and year of study are all required"}), 400

    rows = _db.kv_get_many([SHARDS["participants.json"][0] + team_id, SHARDS[DELETED_PARTICIPANTS_KEY][0] + team_id])
    if rows.get(SHARDS[DELETED_PARTICIPANTS_KEY][0] + team_id):
        if not payload.get("login"):
            # Background re-announce from a console that is still open: keep it kicked out.
            return jsonify({"success": False, "error": "This participant was removed by the admin.", "removed": True}), 403
        # An explicit login from the form frees the ID again: it re-registers as a new,
        # pending participant, so removed names can be reused.
        shard_drop(DELETED_PARTICIPANTS_KEY, team_id)

    participant = rows.get(SHARDS["participants.json"][0] + team_id)
    if participant:
        participant["player_name"] = player_name
        participant["college"] = college
        participant["year_of_study"] = year_of_study
        # Keep the existing status: an already-allowed player stays allowed on re-login.
    else:
        participant = {
            "team_id": team_id,
            "player_name": player_name,
            "college": college,
            "year_of_study": year_of_study,
            "status": "pending",
        }
        participant["_ts"] = time.time()
    shard_put("participants.json", team_id, participant)
    log_activity(team_id, "login", f"{player_name} logged in")
    return jsonify({"success": True, "participant": participant})


@app.route("/api/missions", methods=["GET"])
def get_missions():
    missions = load_json("missions.json")
    return jsonify({"success": True, "missions": missions})

@app.route("/api/mission/<mission_id>", methods=["GET"])
def get_mission(mission_id):
    missions = load_json("missions.json")
    tests_db = load_json("tests.json")
    
    mission = next((m for m in missions if m["id"] == mission_id), None)
    if not mission:
        return jsonify({"success": False, "error": "Mission not found"}), 404
        
    tests = tests_db.get(mission_id, [])
    # Return visible tests details, obscure hidden inputs
    client_tests = []
    for t in tests:
        if t.get("hidden"):
            client_tests.append({
                "test_id": t["test_id"],
                "name": f"Hidden Test ({t['test_id']})",
                "hidden": True
            })
        else:
            client_tests.append(t)

    return jsonify({"success": True, "mission": mission, "tests": client_tests})

def _timed_lock_error(mission, team_id):
    """Why this question can't be attempted right now because of the timers, or None.

    Main timer over: everything is closed. This participant's level timer over: only
    questions of that level are closed, so they can move on to another level.
    """
    snapshot = timer_snapshot()
    if not snapshot["started"]:
        return None
    if snapshot["main_remaining_seconds"] <= 0:
        return "Main event time expired. Submissions are locked."
    level = _mission_difficulty(mission)
    view = _level_view(snapshot, team_id, level) if level in LEVEL_TIME_LIMITS else None
    if view and view["level_entered"] and view["level_remaining_seconds"] <= 0:
        return f"Your {level} level time is up. Move on to another level."
    return None


@app.route("/api/run-flow", methods=["POST"])
def run_flow():
    payload = request.get_json() or {}
    mission_id = payload.get("mission_id", "mission_01")
    flow = payload.get("flow", {})
    hint_penalty = HINT_SCORE_PENALTY if payload.get("hint_used") else 0
    team_id = payload.get("team_id", "TEAM_07")

    missions = load_json("missions.json")
    tests_db = load_json("tests.json")
    mission = next((m for m in missions if m["id"] == mission_id), {})
    tests = tests_db.get(mission_id, [])

    lock_error = _timed_lock_error(mission, team_id)
    if lock_error:
        return jsonify({"success": False, "error": lock_error, "output": None, "test_results": [], "locked": True}), 403

    # 1. Validate Graph
    is_valid, val_error = validate_flow(flow, required_modules=mission.get("required_modules"))
    if not is_valid:
        score_data = score_flow(flow, mission, [], graph_valid=False, base_output=None, credit_penalty=hint_penalty)
        progress_record = record_progress(
            team_id, mission_id, "incorrect_mapping",
            flow=flow, scoring=score_data["breakdown"], total_credits=score_data["total_credits"]
        )
        return jsonify({
            "success": False,
            "error": val_error,
            "output": None,
            "test_results": [],
            "credits": score_data["total_credits"],
            "scoring_breakdown": score_data["breakdown"],
            "question_credits": score_data["question_credits"],
            "all_passed": score_data["all_passed"]
            ,"progress": progress_record
        })

    # 2. Execute Base Flow
    exec_success, base_output = execute_flow(flow, input_data_override=mission.get("input"))
    if not exec_success:
        score_data = score_flow(flow, mission, [], graph_valid=True, base_output=None, credit_penalty=hint_penalty)
        progress_record = record_progress(
            team_id, mission_id, "tried",
            flow=flow, scoring=score_data["breakdown"], total_credits=score_data["total_credits"]
        )
        return jsonify({
            "success": False,
            "error": base_output,
            "output": None,
            "test_results": [],
            "credits": score_data["total_credits"],
            "scoring_breakdown": score_data["breakdown"],
            "question_credits": score_data["question_credits"],
            "all_passed": score_data["all_passed"]
            ,"progress": progress_record
        })

    # 3. Run Test Suite
    test_results = []
    for t in tests:
        t_input = t.get("input")
        t_expected = t.get("expected")
        
        t_success, t_out = execute_flow(flow, input_data_override=t_input)
        
        passed = False
        if t_success:
            passed = outputs_match(t_out, t_expected)

        t_res = {
            "test_id": t.get("test_id"),
            "name": t.get("name"),
            "passed": passed,
            "hidden": t.get("hidden", False)
        }
        if not t.get("hidden"):
            t_res["input"] = t_input
            t_res["expected"] = t_expected
            t_res["received"] = t_out if t_success else "ERROR"
            
        test_results.append(t_res)

    # 4. Calculate Credits
    score_data = score_flow(flow, mission, test_results, graph_valid=True, base_output=base_output, credit_penalty=hint_penalty)
    all_tests_passed = bool(test_results) and all(t.get("passed") for t in test_results)
    completed = score_data["all_passed"]
    progress_record = record_progress(
        # Ran fine but the output/tests are wrong -> "wrong_output" (red chip).
        team_id, mission_id, "completed" if completed else ("wrong_output" if score_data["attempted"] else "tried"),
        flow=flow, scoring=score_data["breakdown"], total_credits=score_data["total_credits"],
        all_tests_passed=all_tests_passed
    )

    # Detect output type (text, number, pattern, chart image)
    is_chart = isinstance(base_output, str) and base_output.startswith("data:image/")

    return jsonify({
        "success": True,
        "output": base_output,
        "is_chart": is_chart,
        "test_results": test_results,
        "credits": score_data["total_credits"],
        "scoring_breakdown": score_data["breakdown"],
        "question_credits": score_data["question_credits"],
        "all_passed": score_data["all_passed"]
        ,"progress": progress_record
    })


@app.route("/api/participant/score/<team_id>", methods=["GET"])
def participant_score(team_id):
    """Final score summary shown to a participant when they exit the event."""
    missions = load_json("missions.json")
    progress = load_json("progress.json")
    records = progress.get(team_id, {})
    total, level_bonuses = _final_credits(team_id, progress, missions)
    levels = {}
    for difficulty in ("easy", "medium", "hard"):
        level_missions = [m for m in missions if _mission_difficulty(m) == difficulty]
        levels[difficulty] = {
            "questions": len(level_missions),
            "completed": sum(1 for m in level_missions if records.get(m["id"], {}).get("status") == "completed"),
            "credits": sum(records.get(m["id"], {}).get("best_credits", 0) for m in level_missions),
            "bonus": level_bonuses.get(difficulty, {}).get("bonus", 0),
        }
    board = _build_leaderboard(_admin_participants(), progress, missions)
    rank = next((row["rank"] for row in board if row["player_id"] == team_id), None)
    return jsonify({"success": True, "total": total, "levels": levels, "rank": rank, "players": len(board)})


@app.route("/api/progress/<team_id>", methods=["GET"])
def get_progress(team_id):
    return jsonify({"success": True, "progress": shard_item("progress.json", team_id, {})})

@app.route("/api/save-flow", methods=["POST"])
def save_flow_draft():
    """Autosave a participant's in-progress mapping so a refresh never loses it.

    Only stores the flow; it never touches attempts, credits or status.
    """
    payload = request.get_json() or {}
    team_id = str(payload.get("team_id", "")).strip()
    mission_id = str(payload.get("mission_id", "")).strip()
    flow = payload.get("flow")
    if not team_id or not mission_id or not isinstance(flow, dict)             or not isinstance(flow.get("nodes", []), list) or not isinstance(flow.get("edges", []), list):
        return jsonify({"success": False, "error": "team_id, mission_id and a valid flow are required"}), 400
    rows = _db.kv_get_many([SHARDS["participants.json"][0] + team_id, SHARDS["progress.json"][0] + team_id])
    participant = rows.get(SHARDS["participants.json"][0] + team_id)
    if not participant or participant.get("status") != "active":
        return jsonify({"success": False, "error": "Not allowed by admin"}), 403

    team_progress = rows.get(SHARDS["progress.json"][0] + team_id, {})
    record = team_progress.setdefault(mission_id, {})
    record["flow"] = flow
    record["saved_at"] = time.time()
    shard_put("progress.json", team_id, team_progress)
    return jsonify({"success": True})


@app.route("/api/submit", methods=["POST"])
def submit_solution():
    payload = request.get_json() or {}
    team_id = payload.get("team_id", "TEAM_01")
    mission_id = payload.get("mission_id", "mission_01")
    flow = payload.get("flow", {})
    hint_penalty = HINT_SCORE_PENALTY if payload.get("hint_used") else 0

    missions = load_json("missions.json")
    tests_db = load_json("tests.json")
    mission = next((m for m in missions if m["id"] == mission_id), {})
    tests = tests_db.get(mission_id, [])

    lock_error = _timed_lock_error(mission, team_id)
    if lock_error:
        return jsonify({"success": False, "submitted": False, "error": lock_error, "locked": True}), 403

    is_valid, _ = validate_flow(flow, required_modules=mission.get("required_modules"))

    # Execute the flow against the mission's own sample input first - without this,
    # base_output stayed None and the sample_output/output_check scores were always
    # marked wrong even for a correct mapping, which made Submit disagree with Run Flow.
    base_output = None
    exec_success = False
    if is_valid:
        exec_success, base_output = execute_flow(flow, input_data_override=mission.get("input"))
        if not exec_success:
            base_output = None

    test_results = []
    if is_valid:
        for t in tests:
            t_success, t_out = execute_flow(flow, input_data_override=t.get("input"))
            passed = False
            t_expected = t.get("expected")
            if t_success:
                passed = outputs_match(t_out, t_expected)
            test_results.append({"passed": passed, "hidden": t.get("hidden", False)})

    score_data = score_flow(flow, mission, test_results, graph_valid=is_valid, base_output=base_output, credit_penalty=hint_penalty)
    all_tests_passed = bool(test_results) and all(t.get("passed") for t in test_results)

    # Submitting records progress the same way Run Flow does, so the credits earned
    # here actually count toward this team's saved progress and leaderboard score.
    completed = score_data["all_passed"]
    record_progress(
        team_id, mission_id, "completed" if completed else "tried",
        flow=flow, scoring=score_data["breakdown"], total_credits=score_data["total_credits"],
        all_tests_passed=all_tests_passed
    )

    submissions = load_json("submissions.json")
    record = {
        "team_id": team_id,
        "mission_id": mission_id,
        "mission_title": mission.get("title", "Unknown Mission"),
        "round": mission.get("round", 1),
        "credits": score_data["total_credits"],
        "mission_credits": score_data["question_credits"],
        "status": "accepted" if is_valid and exec_success else "rejected",
        "flow": flow,
        "submitted_at": os.popen("date /t").read().strip() if os.name == 'nt' else "2026-09-16"
    }

    # Update or add submission for team
    existing_idx = next((i for i, s in enumerate(submissions) if s["team_id"] == team_id and s["mission_id"] == mission_id), None)
    if existing_idx is not None:
        record["_id"], record["_ts"] = submissions[existing_idx].get("_id"), submissions[existing_idx].get("_ts", 0)
        submissions[existing_idx] = record
    else:
        submissions.append(record)

    save_json("submissions.json", submissions)
    log_activity(team_id, "submit", f"Submitted {mission.get('title', mission_id)}: {record['status']}, {record['credits']} credits")

    return jsonify({
        "submitted": True,
        "success": True,
        "all_passed": score_data["all_passed"],
        "credits": score_data["total_credits"],
        "scoring_breakdown": score_data["breakdown"],
        "mission_credits": score_data["question_credits"],
        "status": record["status"]
    })

@app.route("/api/admin/submissions", methods=["GET"])
def get_admin_submissions():
    submissions = load_json("submissions.json")
    return jsonify({
        "success": True,
        "submissions": submissions,
        "teams_online": max(len(submissions) + 2, 5)
    })


def _admin_participants():
    """Merge explicitly managed participants with teams seen in submissions/progress."""
    participants = load_json("participants.json")
    submissions = load_json("submissions.json")
    progress = load_json("progress.json")
    by_team = {p.get("team_id"): p for p in participants if p.get("team_id")}
    for submission in submissions:
        team_id = submission.get("team_id")
        if team_id and team_id not in by_team:
            by_team[team_id] = {"team_id": team_id, "status": "active"}
    for team_id in progress:
        if team_id and team_id not in by_team:
            by_team[team_id] = {"team_id": team_id, "status": "active"}
    return list(by_team.values())


def _team_earned_credits(team_id, progress):
    """Sum of the best credits a team has ever earned across every mission attempted.

    Sourced from progress.json, which is updated on every /api/run-flow call - so a
    team's leaderboard score rises the moment they earn credits on any question,
    without needing a separate explicit submission.
    """
    records = progress.get(team_id, {})
    return sum(record.get("best_credits", 0) for record in records.values())


def _mission_difficulty(mission):
    return mission.get("difficulty", "easy").lower()


# On top of the per-question credits, a team can earn a one-time bonus for each
# difficulty level, split evenly across four factors: finishing every question in
# the level, mapping every question correctly, passing every test case (hidden and
# visible - the "entire pass case"), and solving efficiently (few retries).
LEVEL_BONUS_TOTAL = {"easy": 8, "medium": 12, "hard": 16}
PERFORMANCE_MAX_AVG_ATTEMPTS = 2


def _level_bonus(team_id, progress, missions, difficulty):
    level_missions = [m for m in missions if _mission_difficulty(m) == difficulty]
    if not level_missions:
        return 0, {}
    records = progress.get(team_id, {})
    level_records = [records.get(m["id"], {}) for m in level_missions]

    level_completed = all(r.get("status") == "completed" for r in level_records)
    if not level_completed:
        return 0, {"level_completed": False}

    component = LEVEL_BONUS_TOTAL[difficulty] / 4
    factors = {"level_completed": True}

    factors["correct_mapping"] = all((r.get("scoring") or {}).get("mapping_flow", 0) > 0 for r in level_records)
    factors["entire_pass_case"] = all(r.get("all_tests_passed") for r in level_records)
    avg_attempts = sum(r.get("attempts", 1) for r in level_records) / len(level_records)
    factors["performance"] = avg_attempts <= PERFORMANCE_MAX_AVG_ATTEMPTS

    bonus = component  # level completion itself always earns its share
    bonus += component * factors["correct_mapping"]
    bonus += component * factors["entire_pass_case"]
    bonus += component * factors["performance"]
    return round(bonus, 2), factors


def _final_credits(team_id, progress, missions):
    """Base per-question credits plus the level-completion bonus for every level."""
    base = _team_earned_credits(team_id, progress)
    level_bonuses = {}
    bonus_total = 0
    for difficulty in ("easy", "medium", "hard"):
        bonus, factors = _level_bonus(team_id, progress, missions, difficulty)
        level_bonuses[difficulty] = {"bonus": bonus, **factors}
        bonus_total += bonus
    return round(base + bonus_total, 2), level_bonuses


@app.route("/api/admin/summary", methods=["GET"])
def get_admin_summary():
    missions = load_json("missions.json")
    submissions = load_json("submissions.json")
    participants = _admin_participants()

    levels = {}
    for difficulty in ("easy", "medium", "hard"):
        level_missions = [m for m in missions if _mission_difficulty(m) == difficulty]
        level_ids = {m["id"] for m in level_missions}
        completed = len({s["team_id"] for s in submissions
                          if s.get("mission_id") in level_ids and s.get("status") == "accepted"})
        levels[difficulty] = {"total": len(level_missions), "completed": completed}

    participant_ids = {p["team_id"] for p in participants}
    attempted_pairs = {(s.get("team_id"), s.get("mission_id")) for s in submissions}
    completed_questions = sum(1 for s in submissions if s.get("status") == "accepted")
    wrong_questions = sum(1 for s in submissions if s.get("status") == "rejected")
    total_questions = len(participant_ids) * len(missions)

    return jsonify({
        "success": True,
        "participants": {
            "canvas": len(participants),
            "active": sum(1 for p in participants if p.get("status") == "active"),
            "pending": sum(1 for p in participants if p.get("status") == "pending"),
        },
        "levels": levels,
        "questions": {
            "completed": completed_questions,
            "tried": len(attempted_pairs),
            "wrong": wrong_questions,
            "incomplete": max(0, total_questions - len(attempted_pairs)),
        },
        "participant_records": participants,
        "progress_records": load_json("progress.json"),
    })


@app.route("/api/admin/progress/<team_id>/<mission_id>", methods=["PUT"])
def edit_admin_progress(team_id, mission_id):
    payload = request.get_json() or {}
    flow = payload.get("flow")
    if not isinstance(flow, dict) or not isinstance(flow.get("nodes", []), list) or not isinstance(flow.get("edges", []), list):
        return jsonify({"success": False, "error": "A valid flow with nodes and edges is required"}), 400

    progress = load_json("progress.json")
    participant = progress.get(team_id)
    record = participant.get(mission_id) if participant else None
    if not record:
        return jsonify({"success": False, "error": "Progress record not found"}), 404
    record["flow"] = flow
    record["edited_by_admin"] = True
    save_json("progress.json", progress)
    return jsonify({"success": True, "record": record})


@app.route("/api/admin/participants", methods=["POST"])
def add_admin_participant():
    payload = request.get_json() or {}
    team_id = str(payload.get("team_id", "")).strip()
    if not team_id:
        return jsonify({"success": False, "error": "Team ID is required"}), 400

    participants = load_json("participants.json")
    if any(p.get("team_id") == team_id for p in participants):
        return jsonify({"success": False, "error": "Participant already exists"}), 409
    participants.append({
        "team_id": team_id,
        "player_name": str(payload.get("player_name", "")).strip(),
        "college": str(payload.get("college", "")).strip(),
        "year_of_study": str(payload.get("year_of_study", "")).strip(),
        "status": "pending",
    })
    save_json("participants.json", participants)
    return jsonify({"success": True, "participant": participants[-1]})


@app.route("/api/admin/participants/<team_id>/allow", methods=["POST"])
def allow_admin_participant(team_id):
    participants = load_json("participants.json")
    participant = next((p for p in participants if p.get("team_id") == team_id), None)
    if not participant:
        return jsonify({"success": False, "error": "Participant not found"}), 404
    participant["status"] = "active"
    save_json("participants.json", participants)
    return jsonify({"success": True, "participant": participant})


@app.route("/api/admin/participants/<team_id>/revoke", methods=["POST"])
def revoke_admin_participant(team_id):
    """Send an allowed participant back to pending (they must be activated again)."""
    participants = load_json("participants.json")
    participant = next((p for p in participants if p.get("team_id") == team_id), None)
    if not participant:
        return jsonify({"success": False, "error": "Participant not found"}), 404
    participant["status"] = "pending"
    save_json("participants.json", participants)
    return jsonify({"success": True, "participant": participant})


DELETED_PARTICIPANTS_KEY = "deleted_participants"


@app.route("/api/admin/participants/<team_id>", methods=["DELETE"])
def delete_admin_participant(team_id):
    """Admin-only: permanently remove a participant, their saved progress, and
    force their participant console to log out. The team_id is tombstoned so
    the console's own auto-register-on-load call can't silently recreate them.
    """
    participants = load_json("participants.json")
    remaining = [p for p in participants if p.get("team_id") != team_id]
    if len(remaining) == len(participants):
        return jsonify({"success": False, "error": "Participant not found"}), 404
    save_json("participants.json", remaining)

    progress = load_json("progress.json")
    if team_id in progress:
        del progress[team_id]
        save_json("progress.json", progress)

    shard_drop(PRESENCE_KEY, team_id)
    shard_drop(VIOLATIONS_KEY, team_id)
    shard_drop(FORCED_FULLSCREEN_KEY, team_id)
    shard_put(DELETED_PARTICIPANTS_KEY, team_id, True)

    return jsonify({"success": True})


@app.route("/api/admin/participants/<team_id>", methods=["PUT"])
def update_admin_participant(team_id):
    """Admin-only: edit a participant's profile fields (name, college, year of study)."""
    payload = request.get_json() or {}
    participants = load_json("participants.json")
    participant = next((p for p in participants if p.get("team_id") == team_id), None)
    if not participant:
        return jsonify({"success": False, "error": "Participant not found"}), 404

    for field in ("player_name", "college", "year_of_study"):
        if field in payload:
            participant[field] = str(payload.get(field, "")).strip()

    save_json("participants.json", participants)
    return jsonify({"success": True, "participant": participant})


def _build_leaderboard(participants, progress, missions):
    """Shared by /api/admin/leaderboard and /api/admin/live so both stay in sync.

    Score is recorded automatically: every /api/run-flow call that earns credits on a
    question updates that team's best_credits for the question in progress.json, and
    this sums the best credits across every level/question a team has attempted,
    plus a one-time bonus per level once a team has fully completed it - the bonus
    is split across level completion, correct mapping on every question, passing
    every test case ("entire pass case"), and solving efficiently (performance).
    Participants who have not earned any credits yet are included with a score of 0
    so the admin has full visibility into the roster.
    """
    leaderboard = []
    for participant in participants:
        team_id = participant.get("team_id")
        score, level_bonuses = _final_credits(team_id, progress, missions)
        leaderboard.append({
            "player_id": team_id,
            "player_name": participant.get("player_name") or "—",
            "college": participant.get("college") or "—",
            "year_of_study": participant.get("year_of_study") or "—",
            "score": score,
            "level_bonuses": level_bonuses,
        })
    leaderboard.sort(key=lambda row: row["score"], reverse=True)
    for rank, row in enumerate(leaderboard, start=1):
        row["rank"] = rank
    return leaderboard


@app.route("/api/admin/leaderboard", methods=["GET"])
def get_admin_leaderboard():
    participants = _admin_participants()
    progress = load_json("progress.json")
    missions = load_json("missions.json")
    return jsonify({"success": True, "leaderboard": _build_leaderboard(participants, progress, missions)})


def _online_participants(participants, missions):
    """Participants whose console sent a heartbeat within PRESENCE_TTL_SECONDS."""
    presence = kv_get(PRESENCE_KEY, {})
    titles = {m["id"]: m.get("title", m["id"]) for m in missions}
    by_team = {p.get("team_id"): p for p in participants}
    now = time.time()
    forced = set(kv_get(FORCED_FULLSCREEN_KEY, []))
    online = []
    for team_id, entry in presence.items():
        if not entry.get("online") or now - entry.get("last_seen", 0) > PRESENCE_TTL_SECONDS:
            continue
        p = by_team.get(team_id, {})
        online.append({
            "team_id": team_id,
            "player_name": p.get("player_name") or "—",
            "college": p.get("college") or "—",
            "mission": titles.get(entry.get("mission_id"), entry.get("mission_id") or "—"),
            "seconds_since_seen": int(now - entry.get("last_seen", now)),
            "fullscreen": bool(entry.get("fullscreen")),
            "forced_fullscreen": team_id in forced,
        })
    online.sort(key=lambda row: row["team_id"])
    return online


@app.route("/api/admin/live", methods=["GET"])
def get_admin_live():
    """Everything the admin dashboard polls for, in one round trip.

    Replaces four separate polled requests (summary, leaderboard, submissions,
    timer) with a single call so the dashboard can refresh on a tight interval
    without multiplying serverless invocations per tick.
    """
    missions = load_json("missions.json")
    submissions = load_json("submissions.json")
    progress = load_json("progress.json")
    participants = _admin_participants()

    levels = {}
    for difficulty in ("easy", "medium", "hard"):
        level_missions = [m for m in missions if _mission_difficulty(m) == difficulty]
        level_ids = {m["id"] for m in level_missions}
        completed = len({s["team_id"] for s in submissions
                          if s.get("mission_id") in level_ids and s.get("status") == "accepted"})
        levels[difficulty] = {"total": len(level_missions), "completed": completed}

    participant_ids = {p["team_id"] for p in participants}
    attempted_pairs = {(s.get("team_id"), s.get("mission_id")) for s in submissions}
    completed_questions = sum(1 for s in submissions if s.get("status") == "accepted")
    wrong_questions = sum(1 for s in submissions if s.get("status") == "rejected")
    total_questions = len(participant_ids) * len(missions)

    online_list = _online_participants(participants, missions)
    online_ids = {row["team_id"] for row in online_list}
    participants = [{**p, "online": p.get("team_id") in online_ids} for p in participants]

    return jsonify({
        "success": True,
        "timer": {**timer_snapshot(), "participant_violation": bool(kv_get(VIOLATIONS_KEY, {}))},
        "summary": {
            "participants": {
                "canvas": len(participants),
                "active": sum(1 for p in participants if p.get("status") == "active"),
                "pending": sum(1 for p in participants if p.get("status") == "pending"),
            },
            "levels": levels,
            "questions": {
                "completed": completed_questions,
                "tried": len(attempted_pairs),
                "wrong": wrong_questions,
                "incomplete": max(0, total_questions - len(attempted_pairs)),
            },
            "participant_records": participants,
        },
        "leaderboard": _build_leaderboard(participants, progress, missions),
        "submissions": submissions,
        "online_participants": online_list,
    })

if __name__ == "__main__":
    print("Starting PYLOOM Web Application on http://127.0.0.1:5000 ...")
    app.run(host="127.0.0.1", port=5000, debug=True)
