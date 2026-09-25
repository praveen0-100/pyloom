"""
Shared Supabase-backed key/value store.

Vercel deploys the app as stateless, horizontally-scaled serverless functions -
each invocation can land on a different instance with its own filesystem and
memory, so anything kept in local /tmp files or Python globals (participant
records, progress, submissions, the shared timer) is invisible to other
instances. This module stores that mutable state in a Postgres table via
Supabase's REST API instead, so every instance reads/writes the same place.
"""
import os
import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def kv_get(key, default=None):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return default
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/kv_store",
        headers=_HEADERS,
        params={"key": f"eq.{key}", "select": "value"},
        timeout=10,
    )
    resp.raise_for_status()
    rows = resp.json()
    return rows[0]["value"] if rows else default


def kv_set(key, value):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/kv_store",
        headers={**_HEADERS, "Prefer": "resolution=merge-duplicates"},
        params={"on_conflict": "key"},
        json={"key": key, "value": value},
        timeout=10,
    )
    resp.raise_for_status()
