"""
PYLOOM Flask Web Server
Serves visual workflow execution APIs, static frontend, and admin dashboard.
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, jsonify, request, send_from_directory, session, redirect
from flask_cors import CORS


from backend.engine.validator import validate_flow
from backend.engine.executor import execute_flow
from backend.engine.scorer import score_flow

app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)
app.secret_key = os.environ.get("PYLOOM_ADMIN_SESSION_SECRET", "pyloom-admin-session-secret")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
GENERATED_DIR = os.path.join(BASE_DIR, "generated")

ADMIN_USERNAME = "Adminpy"
ADMIN_PASSWORD = "Admin123"

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


def record_progress(team_id, mission_id, status, flow=None, scoring=None):
    progress = load_json("progress.json")
    participant = progress.setdefault(team_id, {})
    current = participant.get(mission_id, {})
    current["attempts"] = current.get("attempts", 0) + 1
    if flow is not None:
        current["flow"] = flow
    if scoring is not None:
        current["scoring"] = scoring
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
        progress_record = record_progress(team_id, mission_id, "incorrect_mapping", flow=flow)
        score_data = score_flow(flow, mission, [], graph_valid=False, base_output=None, credit_penalty=hint_penalty)
        return jsonify({
            "success": False,
            "error": val_error,
            "output": None,
            "test_results": [],
            "credits": score_data["total_credits"],
            "scoring_breakdown": score_data["breakdown"]
            ,"progress": progress_record
        })

    # 2. Execute Base Flow
    exec_success, base_output = execute_flow(flow, input_data_override=mission.get("input"))
    if not exec_success:
        progress_record = record_progress(team_id, mission_id, "tried", flow=flow)
        score_data = score_flow(flow, mission, [], graph_valid=True, base_output=None, credit_penalty=hint_penalty)
        return jsonify({
            "success": False,
            "error": base_output,
            "output": None,
            "test_results": [],
            "credits": score_data["total_credits"],
            "scoring_breakdown": score_data["breakdown"]
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
            if isinstance(t_expected, float) and isinstance(t_out, (int, float)):
                passed = abs(float(t_out) - t_expected) < 1e-4
            elif t_expected == "chart" and isinstance(t_out, str) and t_out.startswith("/generated/"):
                passed = True
            else:
                passed = str(t_out) == str(t_expected)

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
    completed = all(score_data["breakdown"].get(key) == 10 for key in ("mapping_flow", "logic_building", "sample_output", "output_check"))
    progress_record = record_progress(
        team_id, mission_id, "completed" if completed else "tried",
        flow=flow, scoring=score_data["breakdown"]
    )

    # Detect output type (text, number, pattern, chart image)
    is_chart = isinstance(base_output, str) and base_output.startswith("/generated/")

    return jsonify({
        "success": True,
        "output": base_output,
        "is_chart": is_chart,
        "test_results": test_results,
        "credits": score_data["total_credits"],
        "scoring_breakdown": score_data["breakdown"]
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

    test_results = []
    if is_valid:
        for t in tests:
            t_success, t_out = execute_flow(flow, input_data_override=t.get("input"))
            passed = False
            t_expected = t.get("expected")
            if t_success:
                if isinstance(t_expected, float) and isinstance(t_out, (int, float)):
                    passed = abs(float(t_out) - t_expected) < 1e-4
                elif t_expected == "chart" and isinstance(t_out, str) and t_out.startswith("/generated/"):
                    passed = True
                else:
                    passed = str(t_out) == str(t_expected)
            test_results.append({"passed": passed, "hidden": t.get("hidden", False)})

    score_data = score_flow(flow, mission, test_results, graph_valid=is_valid, base_output=None, credit_penalty=hint_penalty)

    submissions = load_json("submissions.json")
    record = {
        "team_id": team_id,
        "mission_id": mission_id,
        "mission_title": mission.get("title", "Unknown Mission"),
        "round": mission.get("round", 1),
        "credits": score_data["total_credits"],
        "status": "accepted" if is_valid else "rejected",
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
        "credits": score_data["total_credits"],
        "status": "accepted" if is_valid else "rejected"
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
    """Merge explicitly managed participants with teams that have submitted."""
    participants = load_json("participants.json")
    submissions = load_json("submissions.json")
    by_team = {p.get("team_id"): p for p in participants if p.get("team_id")}
    for submission in submissions:
        team_id = submission.get("team_id")
        if team_id and team_id not in by_team:
            by_team[team_id] = {"team_id": team_id, "status": "active"}
    return list(by_team.values())


def _mission_difficulty(mission):
    return mission.get("difficulty", "easy").lower()


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
    participants.append({"team_id": team_id, "status": "pending"})
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

if __name__ == "__main__":
    print("Starting PYLOOM Web Application on http://127.0.0.1:5000 ...")
    app.run(host="127.0.0.1", port=5000, debug=True)
