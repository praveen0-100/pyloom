"""PYLOOM's four-part credit evaluation."""


def _outputs_match(actual, expected):
    if expected == "chart":
        return isinstance(actual, str) and actual.startswith("/generated/")
    if isinstance(expected, float) and isinstance(actual, (int, float)):
        return abs(float(actual) - expected) < 1e-4
    if isinstance(expected, str) and ":" in expected:
        # Missions may show a labelled sample such as "Average: 79.0" while
        # the execution engine returns the underlying value (79.0).
        label, sample_value = expected.split(":", 1)
        if label.strip().lower() in {"average", "total"}:
            return _outputs_match(actual, sample_value.strip())
    return str(actual) == str(expected)


def score_flow(flow_json, mission, test_results, graph_valid, base_output=None, credit_penalty=0):
    """Award 10 credits for a passing check and 5 credits otherwise."""
    nodes = flow_json.get("nodes", [])
    edges = flow_json.get("edges", [])
    required_modules = mission.get("required_modules", [])
    node_types = {node.get("type") for node in nodes}

    checks = {
        "mapping_flow": bool(graph_valid),
        "logic_building": bool(
            (all(module in node_types for module in required_modules) if required_modules else len(nodes) >= 2)
            and edges
        ),
        "sample_output": _outputs_match(base_output, mission.get("expected_output")),
        "output_check": bool(test_results) and all(test.get("passed") for test in test_results),
    }
    breakdown = {name: 10 if passed else 5 for name, passed in checks.items()}

    credit_penalty = max(0, int(credit_penalty or 0))
    return {
        "round": mission.get("round", 1),
        "total_credits": max(0, sum(breakdown.values()) - credit_penalty),
        "breakdown": {**breakdown, "hint_penalty": -credit_penalty},
    }
