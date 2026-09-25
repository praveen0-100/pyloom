"""
PYLOOM Flask Web Server
Serves visual workflow execution APIs, static frontend, and admin dashboard.
"""
import os
import sys
import json
import time
import queue
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, Response, jsonify, request, send_from_directory, session, redirect, stream_with_context
from flask_cors import CORS


from backend.engine.validator import validate_flow
from backend.engine.executor import execute_flow
from backend.engine.scorer import score_flow, outputs_match

app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)
app.secret_key = os.environ.get("PYLOOM_ADMIN_SESSION_SECRET", "pyloom-admin-session-secret")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
GENERATED_DIR = os.path.join(BASE_DIR, "generated")

# Vercel's filesystem is read-only except /tmp, so copy the seed data there.
if os.environ.get("VERCEL"):
    import shutil
    _seed_dir = DATA_DIR
    DATA_DIR = "/tmp/pyloom_data"
    GENERATED_DIR = "/tmp/pyloom_generated"
    if not os.path.isdir(DATA_DIR):
        shutil.copytree(_seed_dir, DATA_DIR)
    os.environ["PYLOOM_GENERATED_DIR"] = GENERATED_DIR

ADMIN_USERNAME = "Adminpy"
ADMIN_PASSWORD = "Admin123"

LEVEL_TIME_LIMITS = {"easy": 18 * 60, "medium": 15 * 60, "hard": 12 * 60}
MAIN_TIME_LIMIT = 40 * 60
timer_lock = threading.Lock()
timer_subscribers = set()
timer_state = {
    "started": False,
    "main_paused": False,
    "level_paused": False,
    "participant_lock_enabled": False,
    "participant_violation": False,
    "participant_violation_reason": "",
    "main_remaining_seconds": MAIN_TIME_LIMIT,
    "level": "easy",
    "level_remaining_seconds": LEVEL_TIME_LIMITS["easy"],
    "last_tick": None,
}


def _timer_snapshot_locked():
    """Return the authoritative timer values, materializing elapsed time first."""
    if timer_state["started"]:
        elapsed = max(0, time.monotonic() - timer_state["last_tick"])
        timer_state["last_tick"] = time.monotonic()
        if not timer_state["main_paused"]:
            timer_state["main_remaining_seconds"] = max(0, timer_state["main_remaining_seconds"] - elapsed)
        if not timer_state["level_paused"]:
            timer_state["level_remaining_seconds"] = max(0, timer_state["level_remaining_seconds"] - elapsed)

        if timer_state["main_remaining_seconds"] <= 0:
            timer_state["main_paused"] = True
        if timer_state["level_remaining_seconds"] <= 0:
            timer_state["level_paused"] = True

    return {
        "paused": timer_state["main_paused"] and timer_state["level_paused"],
        "main_paused": timer_state["main_paused"],
        "level_paused": timer_state["level_paused"],
        "participant_lock_enabled": timer_state["participant_lock_enabled"],
        "participant_violation": timer_state["participant_violation"],
        "participant_violation_reason": timer_state["participant_violation_reason"],
        "main_remaining_seconds": int(timer_state["main_remaining_seconds"]),
        "level": timer_state["level"],
        "level_remaining_seconds": int(timer_state["level_remaining_seconds"]),
        "main_total_seconds": MAIN_TIME_LIMIT,
        "level_total_seconds": LEVEL_TIME_LIMITS[timer_state["level"]],
    }


def timer_snapshot():
    with timer_lock:
        return _timer_snapshot_locked()


def _broadcast_timer_state():
    snapshot = timer_snapshot()
    for subscriber in list(timer_subscribers):
        try:
            subscriber.put_nowait(snapshot)
        except queue.Full:
            pass


@app.route("/api/timer/state", methods=["GET"])
def get_timer_state():
    return jsonify({"success": True, "timer": timer_snapshot()})


@app.route("/api/timer/stream", methods=["GET"])
def timer_stream():
    subscriber = queue.Queue(maxsize=3)
    timer_subscribers.add(subscriber)

    @stream_with_context
    def events():
        try:
            subscriber.put(timer_snapshot())
            while True:
                try:
                    snapshot = subscriber.get(timeout=1)
                except queue.Empty:
                    snapshot = timer_snapshot()
                yield f"event: timer\ndata: {json.dumps(snapshot)}\n\n"
        finally:
            timer_subscribers.discard(subscriber)

    return Response(events(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })


@app.route("/api/timer/level", methods=["POST"])
def set_timer_level():
    level = str((request.get_json() or {}).get("level", "")).lower()
    if level not in LEVEL_TIME_LIMITS:
        return jsonify({"success": False, "error": "Invalid level"}), 400

    with timer_lock:
        if not timer_state["started"]:
            timer_state["started"] = True
            timer_state["last_tick"] = time.monotonic()
        _timer_snapshot_locked()
        if timer_state["level"] != level:
            timer_state["level"] = level
            timer_state["level_remaining_seconds"] = LEVEL_TIME_LIMITS[level]
            if timer_state["started"] and not timer_state["level_paused"]:
                timer_state["last_tick"] = time.monotonic()
        snapshot = _timer_snapshot_locked()
    _broadcast_timer_state()
    return jsonify({"success": True, "timer": snapshot})


@app.route("/api/admin/timer/control", methods=["POST"])
def control_timer():
    payload = request.get_json() or {}
    action = str(payload.get("action", "")).lower()
    timer_name = str(payload.get("timer", "")).lower()
    if timer_name not in {"main", "level"}:
        return jsonify({"success": False, "error": "Timer must be main or level"}), 400
    if action not in {"pause", "resume", "restart"}:
        return jsonify({"success": False, "error": "Action must be pause, resume, or restart"}), 400

    with timer_lock:
        if not timer_state["started"]:
            timer_state["started"] = True
            timer_state["last_tick"] = time.monotonic()
        _timer_snapshot_locked()
        pause_key = f"{timer_name}_paused"
        remaining_key = f"{timer_name}_remaining_seconds"
        if action == "restart":
            total_seconds = MAIN_TIME_LIMIT if timer_name == "main" else LEVEL_TIME_LIMITS[timer_state["level"]]
            timer_state[remaining_key] = total_seconds
            timer_state[pause_key] = False
        else:
            timer_state[pause_key] = action == "pause" or timer_state[remaining_key] <= 0
        if action == "resume" and timer_state[remaining_key] > 0:
            timer_state[pause_key] = False
        timer_state["last_tick"] = time.monotonic()
        snapshot = _timer_snapshot_locked()
    _broadcast_timer_state()
    return jsonify({"success": True, "timer": snapshot})


@app.route("/api/admin/participant-control", methods=["POST"])
def control_participant_lock():
    action = str((request.get_json() or {}).get("action", "")).lower()
    if action not in {"enable", "release"}:
        return jsonify({"success": False, "error": "Action must be enable or release"}), 400

    with timer_lock:
        timer_state["participant_lock_enabled"] = action == "enable"
        timer_state["participant_violation"] = False
        timer_state["participant_violation_reason"] = ""
        snapshot = _timer_snapshot_locked()
    _broadcast_timer_state()
    return jsonify({"success": True, "participant_lock_enabled": snapshot["participant_lock_enabled"]})


@app.route("/api/participant/lock-violation", methods=["POST"])
def report_participant_lock_violation():
    reason = str((request.get_json() or {}).get("reason", "Fullscreen or focus was lost"))[:160]
    with timer_lock:
        if timer_state["participant_lock_enabled"]:
            timer_state["participant_violation"] = True
            timer_state["participant_violation_reason"] = reason
        snapshot = _timer_snapshot_locked()
    _broadcast_timer_state()
    return jsonify({"success": True, "participant_violation": snapshot["participant_violation"]})

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(GENERATED_DIR, exist_ok=True)

@app.before_request
def protect_admin_routes():
    public_admin_paths = {"/api/admin/login", "/api/admin/session"}
    if request.path.startswith("/api/admin/") and request.path not in public_admin_paths:
        if not session.get("admin_authenticated"):
            return jsonify({"success": False, "error": "Admin authentication required"}), 401

def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return [] if filename.endswith(".json") else {}

def save_json(filename, data):
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def record_progress(team_id, mission_id, status, flow=None, scoring=None, total_credits=None, all_tests_passed=None):
    progress = load_json("progress.json")
    participant = progress.setdefault(team_id, {})
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
    save_json("progress.json", progress)
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
    session["admin_authenticated"] = True
    return jsonify({"success": True})


@app.route("/api/admin/session", methods=["GET"])
def admin_session():
    return jsonify({"success": True, "authenticated": bool(session.get("admin_authenticated"))})


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin_authenticated", None)
    return jsonify({"success": True})

@app.route("/generated/<path:filename>")
def serve_generated(filename):
    return send_from_directory(GENERATED_DIR, filename)

@app.route("/api/participant/register", methods=["POST"])
def register_participant():
    """Public self-registration for the participant console (login-style gate).

    Upserts the player's profile into participants.json keyed by their chosen
    Player ID (used as team_id everywhere else in the API) and marks them active
    so they can start immediately without waiting on admin approval.
    """
    payload = request.get_json() or {}
    team_id = str(payload.get("team_id", "")).strip()
    player_name = str(payload.get("player_name", "")).strip()
    college = str(payload.get("college", "")).strip()
    year_of_study = str(payload.get("year_of_study", "")).strip()

    if not team_id or not player_name or not college or not year_of_study:
        return jsonify({"success": False, "error": "Player name, ID, college, and year of study are all required"}), 400

    participants = load_json("participants.json")
    participant = next((p for p in participants if p.get("team_id") == team_id), None)
    if participant:
        participant["player_name"] = player_name
        participant["college"] = college
        participant["year_of_study"] = year_of_study
        participant["status"] = "active"
    else:
        participant = {
            "team_id": team_id,
            "player_name": player_name,
            "college": college,
            "year_of_study": year_of_study,
            "status": "active",
        }
        participants.append(participant)
    save_json("participants.json", participants)
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

@app.route("/api/run-flow", methods=["POST"])
def run_flow():
    payload = request.get_json() or {}
    mission_id = payload.get("mission_id", "mission_01")
    flow = payload.get("flow", {})
    hint_penalty = 3 if payload.get("hint_used") else 0
    team_id = payload.get("team_id", "TEAM_07")

    missions = load_json("missions.json")
    tests_db = load_json("tests.json")
    mission = next((m for m in missions if m["id"] == mission_id), {})
    tests = tests_db.get(mission_id, [])

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
    completed = score_data["all_passed"]
    all_tests_passed = bool(test_results) and all(t.get("passed") for t in test_results)
    progress_record = record_progress(
        team_id, mission_id, "completed" if completed else "tried",
        flow=flow, scoring=score_data["breakdown"], total_credits=score_data["total_credits"],
        all_tests_passed=all_tests_passed
    )

    # Detect output type (text, number, pattern, chart image)
    is_chart = isinstance(base_output, str) and base_output.startswith("/generated/")

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


@app.route("/api/progress/<team_id>", methods=["GET"])
def get_progress(team_id):
    progress = load_json("progress.json")
    return jsonify({"success": True, "progress": progress.get(team_id, {})})

@app.route("/api/submit", methods=["POST"])
def submit_solution():
    payload = request.get_json() or {}
    team_id = payload.get("team_id", "TEAM_01")
    mission_id = payload.get("mission_id", "mission_01")
    flow = payload.get("flow", {})
    hint_penalty = 3 if payload.get("hint_used") else 0

    missions = load_json("missions.json")
    tests_db = load_json("tests.json")
    mission = next((m for m in missions if m["id"] == mission_id), {})
    tests = tests_db.get(mission_id, [])

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
        submissions[existing_idx] = record
    else:
        submissions.append(record)

    save_json("submissions.json", submissions)

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


@app.route("/api/admin/leaderboard", methods=["GET"])
def get_admin_leaderboard():
    """Admin-only leaderboard: player ID, name, college, year of study, and total score.

    Score is recorded automatically: every /api/run-flow call that earns credits on a
    question updates that team's best_credits for the question in progress.json, and
    this endpoint sums the best credits across every level/question a team has
    attempted, plus a one-time bonus per level once a team has fully completed it -
    the bonus is split across level completion, correct mapping on every question,
    passing every test case ("entire pass case"), and solving efficiently
    (performance). Participants who have not earned any credits yet are included
    with a score of 0 so the admin has full visibility into the roster.
    """
    participants = _admin_participants()
    progress = load_json("progress.json")
    missions = load_json("missions.json")

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

    return jsonify({"success": True, "leaderboard": leaderboard})

if __name__ == "__main__":
    print("Starting PYLOOM Web Application on http://127.0.0.1:5000 ...")
    app.run(host="127.0.0.1", port=5000, debug=True)
