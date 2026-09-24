"""PYLOOM's four-part credit evaluation."""
import json
import math

# Credits awarded for fully completing one question of each difficulty.
# easy: 5 questions x 4 = 20, medium: 3 questions x 10 = 30, hard: 2 questions x 25 = 50 (total 100).
QUESTION_CREDITS = {"easy": 4, "medium": 10, "hard": 25}


def _as_number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _outputs_match(actual, expected):
    if expected == "chart":
        return isinstance(actual, str) and actual.startswith("/generated/")
    actual_num, expected_num = _as_number(actual), _as_number(expected)
    if actual_num is not None and expected_num is not None and not isinstance(actual, str):
        return abs(actual_num - expected_num) < 1e-4
    if isinstance(expected, float) and isinstance(actual, (int, float)):
        return abs(float(actual) - expected) < 1e-4
    if isinstance(expected, str) and ":" in expected:
        # Missions may show a labelled sample such as "Average: 79.0" while
        # the execution engine returns the underlying value (79.0).
        label, sample_value = expected.split(":", 1)
        if label.strip().lower() in {"average", "total"}:
            return _outputs_match(actual, sample_value.strip())
    return str(actual) == str(expected)


outputs_match = _outputs_match


def _same_input(entered, expected):
    """True when the data typed into an Input node is the question's input (numbers may be typed as text)."""
    candidates = [entered]
    if isinstance(entered, str):
        try:
            candidates.append(json.loads(entered))
        except ValueError:
            pass
    for candidate in candidates:
        if candidate == expected:
            return True
        if isinstance(candidate, (int, float)) and isinstance(expected, (int, float)) and not isinstance(candidate, bool):
            if float(candidate) == float(expected):
                return True
    return False


def _input_entered(nodes, mission):
    if "input" not in mission:
        return True
    return any(_same_input((n.get("config") or {}).get("data"), mission["input"]) for n in nodes if n.get("type") == "Input")


def _configs_ok(nodes, mission):
    """Optional per-mission node settings, e.g. the LineChart title."""
    for rule in mission.get("config_checks", []):
        matching = [n for n in nodes if n.get("type") == rule.get("type")]
        if not any(str((n.get("config") or {}).get(rule["key"], "")).strip() == str(rule["equals"]) for n in matching):
            return False
    return True


def score_flow(flow_json, mission, test_results, graph_valid, base_output=None, credit_penalty=0):
    """Full share of the question's credits per passing check, half a share for each failed check
    once the participant has mapped something, and nothing at all for a skipped question."""
    nodes = flow_json.get("nodes", [])
    edges = flow_json.get("edges", [])
    question_credits = QUESTION_CREDITS.get(mission.get("difficulty"), QUESTION_CREDITS["easy"])
    credit_penalty = max(0, int(credit_penalty or 0))

    if not nodes or not edges:
        # Nothing was mapped: the question was skipped, so no credits at all.
        return {
            "round": mission.get("round", 1),
            "question_credits": question_credits,
            "all_passed": False,
            "attempted": False,
            "total_credits": 0,
            "breakdown": {"mapping_flow": 0, "logic_building": 0, "sample_output": 0, "output_check": 0, "hint_penalty": 0},
        }

    required_modules = mission.get("required_modules", [])
    node_types = {node.get("type") for node in nodes}

    checks = {
        "mapping_flow": bool(graph_valid),
        "logic_building": bool(
            (all(module in node_types for module in required_modules) if required_modules else len(nodes) >= 2)
            and edges
            and _configs_ok(nodes, mission)
            and _input_entered(nodes, mission)
        ),
        "sample_output": _outputs_match(base_output, mission.get("expected_check", mission.get("expected_output"))),
        # The participant's own final mapped output for this question, compared
        # directly against the question's expected answer (not the hidden test suite).
        "output_check": _outputs_match(base_output, mission.get("expected_check", mission.get("expected_output"))),
    }

    full_share = question_credits / 4
    breakdown = {name: (full_share if passed else full_share / 2) for name, passed in checks.items()}

    total_credits = max(0, math.floor(sum(breakdown.values()) + 1e-9) - credit_penalty)
    return {
        "round": mission.get("round", 1),
        "question_credits": question_credits,
        "all_passed": all(checks.values()),
        "attempted": True,
        "total_credits": total_credits,
        "breakdown": {**{name: round(value, 2) for name, value in breakdown.items()}, "hint_penalty": -credit_penalty},
    }
