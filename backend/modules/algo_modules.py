"""
PYLOOM Algorithm Modules (Medium level)
Each block is ONE small, readable step of a classic algorithm. The participant chains the
steps together exactly like the question's block diagram.
"""


# ---------------------------------------------------------------- Binary search
# The search "state" travels from block to block as a dictionary:
#   {"array": [...], "target": 10, "low": 0, "high": 6, "mid": 3, "found": False, "index": -1}

def _search_state(val):
    if not isinstance(val, dict) or "array" not in val or "target" not in val:
        raise ValueError('Binary search needs the Input data {"array": [...], "target": ...}.')
    if not isinstance(val["array"], list):
        raise ValueError("'array' must be a list of numbers, e.g. [2, 4, 6].")
    return dict(val)


def execute_midpoint(val, config=None):
    """Midpoint: pick the middle index of the current search range (low..high)."""
    state = _search_state(val)
    state.setdefault("low", 0)
    state.setdefault("high", len(state["array"]) - 1)
    state.setdefault("found", False)
    state.setdefault("index", -1)
    state["mid"] = (state["low"] + state["high"]) // 2
    return state


def execute_binary_compare(val, config=None):
    """Compare: middle value == target -> found; target smaller -> left half; larger -> right half."""
    state = _search_state(val)
    if "mid" not in state:
        raise ValueError("Compare needs the middle index - put the Midpoint block before it.")
    if state["low"] > state["high"]:
        return state  # nothing left to search
    middle_value = state["array"][state["mid"]]
    if middle_value == state["target"]:
        state["found"], state["index"] = True, state["mid"]
    elif state["target"] < middle_value:
        state["high"] = state["mid"] - 1
    else:
        state["low"] = state["mid"] + 1
    return state


def execute_repeat_search(val, config=None):
    """Repeat: run Midpoint + Compare again on the narrowed range until the target is found.
    Returns the index of the target, or -1 when it is not in the array."""
    state = _search_state(val)
    if "low" not in state or "high" not in state:
        raise ValueError("Repeat needs the search range - connect Midpoint and Compare before it.")
    while not state["found"] and state["low"] <= state["high"]:
        state = execute_binary_compare(execute_midpoint(state))
    return state["index"] if state["found"] else -1


# -------------------------------------------------------------------- Leap year
def _whole_year(val):
    try:
        return int(val)
    except (TypeError, ValueError):
        raise ValueError("The year must be a whole number, e.g. 2000.")


def execute_div4_check(val, config=None):
    """Divisible-by-4 check: keeps the year and adds div4 = True/False."""
    year = _whole_year(val)
    return {"year": year, "div4": year % 4 == 0}


def execute_century_rule(val, config=None):
    """Century rule: a century year (divisible by 100) must also be divisible by 400."""
    if not isinstance(val, dict) or "div4" not in val:
        raise ValueError("Century Rule needs the result of the Div-by-4 Check block.")
    year = val["year"]
    if not val["div4"]:
        return False
    return year % 100 != 0 or year % 400 == 0


# ------------------------------------------------------------------ Bubble sort
def _number_list(val):
    if not isinstance(val, list):
        raise ValueError("Sorting needs a list of numbers, e.g. [64, 25, 12].")
    return list(val)


def _one_pass(items):
    """Compare every adjacent pair once; swap when the left one is greater. Returns swapped?"""
    swapped = False
    for i in range(len(items) - 1):
        if items[i] > items[i + 1]:
            items[i], items[i + 1] = items[i + 1], items[i]
            swapped = True
    return swapped


def execute_compare_swap(val, config=None):
    """Compare & Swap: ONE pass over the list."""
    items = _number_list(val)
    _one_pass(items)
    return items


def execute_pass_repeat(val, config=None):
    """Pass Repeat: keep making passes until a whole pass needs no swaps - the list is sorted."""
    items = _number_list(val)
    while _one_pass(items):
        pass
    return items
