"""PYLOOM's four-part credit evaluation."""
import json
import math

# Score per question, all of it decided by the test cases (see test_case_score below):
# easy 5 questions x 4 = 20, medium 3 x 10 = 30, hard 2 x 25 = 50  ->  100 in total.
QUESTION_CREDITS = {"easy": 4, "medium": 10, "hard": 25}
LEVEL_QUESTION_COUNT = {"easy": 5, "medium": 3, "hard": 2}
LEVEL_SCORE = {level: QUESTION_CREDITS[level] * LEVEL_QUESTION_COUNT[level] for level in QUESTION_CREDITS}
TOTAL_SCORE = sum(LEVEL_SCORE.values())


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
        return isinstance(actual, str) and actual.startswith("data:image/")
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


def _share(question_credits, fraction):
    return int(question_credits * fraction + 0.5)


# Test evaluation: the whole question score, from the visible + hidden test cases.
def test_case_score(test_results, question_credits=4):
    """All test cases pass -> full score, two or more pass (not all) -> 3/4 of it, exactly one
    passes -> 1/4 of it, none pass -> 0 (easy: 4 / 3 / 1 / 0, medium: 10 / 8 / 3 / 0, hard: 25 / 19 / 6 / 0)."""
    total = len(test_results or [])
    passed = sum(1 for t in test_results or [] if t.get("passed"))
    if not total or not passed:
        return 0
    if passed == total:
        return question_credits
    return _share(question_credits, 0.25) if passed == 1 else _share(question_credits, 0.75)


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
            "breakdown": {"mapping_flow": 0, "logic_building": 0, "sample_output": 0, "output_check": 0, "test_cases": 0, "hint_penalty": 0},
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

    # The four checks are shown to the participant as PASS/FAIL (1/0); only the test
    # cases decide the credits.
    breakdown = {name: (1 if passed else 0) for name, passed in checks.items()}
    test_score = test_case_score(test_results, question_credits)
    if all(checks.values()):
        # Mapping, logic, sample output and output check all pass: full score.
        test_score = question_credits
    total_credits = max(0, test_score - credit_penalty)
    return {
        "round": mission.get("round", 1),
        "question_credits": question_credits,
        "all_passed": all(checks.values()),
        "attempted": True,
        "total_credits": total_credits,
        "breakdown": {**breakdown, "test_cases": test_score, "tests_passed": sum(1 for t in test_results or [] if t.get("passed")), "tests_total": len(test_results or []), "hint_penalty": -credit_penalty},
    }
