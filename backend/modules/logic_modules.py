"""
PYLOOM Logic & Filtering Modules
Controlled functions for conditional logic and list filtering.
"""

def execute_filter(val, config=None):
    """
    Filters items in a list. Default config filters numerical range [min_val, max_val]
    e.g. Round 2 Mission 02: Keep valid marks between 0 and 100.
    """
    min_val = config.get("min", 0) if config else 0
    max_val = config.get("max", 100) if config else 100
    
    if isinstance(val, (list, tuple)):
        filtered = []
        for x in val:
            try:
                num = float(x)
                if min_val <= num <= max_val:
                    # Convert to int if integer value
                    if num.is_integer():
                        filtered.append(int(num))
                    else:
                        filtered.append(num)
            except (ValueError, TypeError):
                continue
        return filtered
    return val

def execute_sort(val, config=None):
    reverse = config.get("reverse", False) if config else False
    if isinstance(val, (list, tuple)):
        return sorted(val, reverse=bool(reverse))
    return val


_OPS = {
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}


def _compare(a, op, b):
    if op not in _OPS:
        raise ValueError(f"Unsupported comparison operator '{op}'.")
    return bool(_OPS[op](a, b))


def _number_or_raw(value):
    """Config values arrive as text from the UI; use numbers when they look like numbers."""
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return value
    return value


def execute_compare(val, config=None):
    """
    Returns True/False.
    - Two connected inputs [a, b]: compares a <op> b (use "==" for equality checks).
    - One input: compares it against config['value'].
    """
    op = (config or {}).get("op", "==")
    if isinstance(val, (list, tuple)) and len(val) >= 2:
        return _compare(val[0], op, val[1])
    return _compare(val, op, _number_or_raw((config or {}).get("value", 0)))


def execute_ifelse(val, config=None):
    """Returns config['then'] when (input <op> config['value']) holds, else config['otherwise']."""
    cfg = config or {}
    matched = _compare(val, cfg.get("op", ">="), _number_or_raw(cfg.get("value", 0)))
    return _number_or_raw(cfg.get("then", 1) if matched else cfg.get("otherwise", 0))
