"""
PYLOOM Analysis Modules (Hard level)
Steps that prepare data for the Pie / Bar chart blocks: totals, percentages, target
comparison, grade classification and counting.
"""

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
GRADES = ["A", "B", "C", "F"]


class PercentDict(dict):
    """Category -> percentage share. A plain dict subclass so the Pie chart block knows to print '%'."""


def _is_number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def execute_total_sum(val, config=None):
    """Total Sum: add up every category and keep the amounts for the next block."""
    if not isinstance(val, dict) or not val or not all(_is_number(v) for v in val.values()):
        raise ValueError('Total Sum needs category amounts, e.g. {"Rent": 12000, "Food": 6000}.')
    return {"amounts": dict(val), "total": sum(val.values())}


def execute_percentage(val, config=None):
    """Percentage Calculator: amount / total x 100 for every category."""
    if not isinstance(val, dict) or "amounts" not in val or "total" not in val:
        raise ValueError("Percentage Calculator needs the result of the Total Sum block.")
    if val["total"] == 0:
        raise ValueError("DIVISION_BY_ZERO: the total is 0, so no percentage can be calculated.")
    return PercentDict({k: round(v / val["total"] * 100, 2) for k, v in val["amounts"].items()})


def execute_target_compare(val, config=None):
    """Target Comparison: for each day, sales >= target -> 'Above Target', otherwise 'Below Target'."""
    if not isinstance(val, dict) or not isinstance(val.get("sales"), list) or "target" not in val:
        raise ValueError('Target Comparison needs the Input data {"sales": [...], "target": 200}.')
    sales, target = val["sales"], val["target"]
    if not all(_is_number(s) for s in sales) or not _is_number(target):
        raise ValueError("Sales and target must be numbers.")
    days = val.get("days") or [DAYS[i] if i < len(DAYS) else f"Day {i + 1}" for i in range(len(sales))]
    status = ["Above Target" if s >= target else "Below Target" for s in sales]
    return {"labels": list(days), "values": list(sales), "status": status, "target": target}


def _grade(score):
    if score >= 90:
        return "A"
    if score >= 75:
        return "B"
    if score >= 50:
        return "C"
    return "F"


def execute_grade_classifier(val, config=None):
    """Grade Classifier: A >= 90, B 75-89, C 50-74, F < 50 for each score."""
    if not isinstance(val, list) or not all(_is_number(s) for s in val):
        raise ValueError("Grade Classifier needs a list of scores, e.g. [95, 82, 67].")
    return [_grade(s) for s in val]


def execute_count_grades(val, config=None):
    """Count Aggregator: how many students got each grade (A, B, C, F)."""
    if not isinstance(val, list) or not all(g in GRADES for g in val):
        raise ValueError("Count Aggregator needs the grades from the Grade Classifier block.")
    return {g: val.count(g) for g in GRADES}
