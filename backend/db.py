"""
Shared key/value store.

Vercel deploys the app as stateless, horizontally-scaled serverless functions -
each invocation can land on a different instance with its own filesystem and
memory, so anything kept in local /tmp files or Python globals (participant
records, progress, submissions, the shared timer) is invisible to other
instances. This module stores that mutable state in a Postgres table via
Supabase's REST API instead, so every instance reads/writes the same place.

Locally (no SUPABASE_URL/SUPABASE_SERVICE_KEY configured) there's only ever
one process, so state is persisted to a JSON file on disk instead - without
this fallback every kv_get/kv_set was a silent no-op, so nothing (timer
start/pause, the participant full-screen lock, participants, progress, ...)
ever actually stuck between requests.
"""
import os
import copy
import json
import threading
import requests
from requests.adapters import HTTPAdapter
from flask import g, has_request_context

# One pooled session reuses TCP/TLS connections to Supabase instead of opening a new
# one for every kv call (each admin/participant poll makes several).
_session = requests.Session()
_session.mount("https://", HTTPAdapter(pool_connections=4, pool_maxsize=16))

_MISSING = object()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

_LOCAL_STORE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "local_kv_store.json")
_local_lock = threading.Lock()


def _read_local_store():
    if not os.path.exists(_LOCAL_STORE_PATH):
        return {}
    try:
        with open(_LOCAL_STORE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _write_local_store(store):
    os.makedirs(os.path.dirname(_LOCAL_STORE_PATH), exist_ok=True)
    with open(_LOCAL_STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)


def _memo():
    """Per-request cache so the same key is fetched only once per API call."""
    if not has_request_context():
        return None
    cache = getattr(g, "_kv_memo", None)
    if cache is None:
        cache = g._kv_memo = {}
    return cache


def kv_get(key, default=None):
    memo = _memo()
    if memo is not None and key in memo:
        value = memo[key]
    else:
        value = _kv_fetch(key)
        if memo is not None:
            memo[key] = value
    return default if value is _MISSING else copy.deepcopy(value)


def kv_set(key, value):
    memo = _memo()
    if memo is not None:
        memo[key] = copy.deepcopy(value)
    _kv_store(key, value)


def _kv_fetch(key):
    if not SUPABASE_URL or not SUPABASE_KEY:
        with _local_lock:
            store = _read_local_store()
        return store.get(key, _MISSING)
    resp = _session.get(
        f"{SUPABASE_URL}/rest/v1/kv_store",
        headers=_HEADERS,
        params={"key": f"eq.{key}", "select": "value"},
        timeout=10,
    )
    resp.raise_for_status()
    rows = resp.json()
    return rows[0]["value"] if rows else _MISSING


def _kv_store(key, value):
    if not SUPABASE_URL or not SUPABASE_KEY:
        with _local_lock:
            store = _read_local_store()
            store[key] = value
            _write_local_store(store)
        return
    resp = _session.post(
        f"{SUPABASE_URL}/rest/v1/kv_store",
        headers={**_HEADERS, "Prefer": "resolution=merge-duplicates"},
        params={"on_conflict": "key"},
        json={"key": key, "value": value},
        timeout=10,
    )
    resp.raise_for_status()


# ---------------------------------------------------------------------------
# Sharded records: one row per item ("presence:TEAM_01") instead of one big JSON
# value per table. Writers touch only their own rows, so simultaneous requests
# from different participants can never overwrite each other's data.
# ---------------------------------------------------------------------------
_PAGE = 1000


def _quote(key):
    return '"' + key.replace("\\", "\\\\").replace('"', '\\"') + '"'


def kv_scan(prefix):
    """Every row whose key starts with `prefix`, as {full_key: value}."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        with _local_lock:
            store = _read_local_store()
        return {k: v for k, v in store.items() if k.startswith(prefix)}
    # PostgREST's LIKE wildcard is "*"; escape the literal ones in the prefix.
    pattern = prefix.replace("\\", "\\\\").replace("%", "\%").replace("_", "\_") + "*"
    out, offset = {}, 0
    while True:
        resp = _session.get(
            f"{SUPABASE_URL}/rest/v1/kv_store",
            headers=_HEADERS,
            params={"key": f"like.{pattern}", "select": "key,value", "order": "key.asc",
                    "limit": _PAGE, "offset": offset},
            timeout=10,
        )
        resp.raise_for_status()
        rows = resp.json()
        out.update({r["key"]: r["value"] for r in rows})
        if len(rows) < _PAGE:
            return out
        offset += _PAGE


def kv_get_many(keys):
    """{key: value} for the keys that exist, fetched in one round trip."""
    keys = list(dict.fromkeys(keys))
    if not keys:
        return {}
    if not SUPABASE_URL or not SUPABASE_KEY:
        with _local_lock:
            store = _read_local_store()
        return {k: store[k] for k in keys if k in store}
    resp = _session.get(
        f"{SUPABASE_URL}/rest/v1/kv_store",
        headers=_HEADERS,
        params={"key": "in.(" + ",".join(_quote(k) for k in keys) + ")", "select": "key,value"},
        timeout=10,
    )
    resp.raise_for_status()
    return {r["key"]: r["value"] for r in resp.json()}


def kv_write_many(items):
    """Upsert several rows in a single request."""
    if not items:
        return
    if not SUPABASE_URL or not SUPABASE_KEY:
        with _local_lock:
            store = _read_local_store()
            store.update(items)
            _write_local_store(store)
        return
    resp = _session.post(
        f"{SUPABASE_URL}/rest/v1/kv_store",
        headers={**_HEADERS, "Prefer": "resolution=merge-duplicates"},
        params={"on_conflict": "key"},
        json=[{"key": k, "value": v} for k, v in items.items()],
        timeout=10,
    )
    resp.raise_for_status()


def kv_delete_many(keys):
    keys = list(keys)
    if not keys:
        return
    if not SUPABASE_URL or not SUPABASE_KEY:
        with _local_lock:
            store = _read_local_store()
            for k in keys:
                store.pop(k, None)
            _write_local_store(store)
        return
    for i in range(0, len(keys), 100):
        resp = _session.delete(
            f"{SUPABASE_URL}/rest/v1/kv_store",
            headers=_HEADERS,
            params={"key": "in.(" + ",".join(_quote(k) for k in keys[i:i + 100]) + ")"},
            timeout=10,
        )
        resp.raise_for_status()
