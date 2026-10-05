"""
PYLOOM Math Modules
Controlled functions for numerical calculations and aggregations.
"""

def execute_sum(val, config=None):
    if isinstance(val, (list, tuple, set)):
        # Filter valid numbers
        nums = [x for x in val if isinstance(x, (int, float))]
        return sum(nums)
    if isinstance(val, (int, float)):
        return val
    return 0

def execute_length(val, config=None):
    if isinstance(val, (list, tuple, set, dict, str)):
        return len(val)
    return 0

def execute_average(val, config=None):
    if isinstance(val, (list, tuple, set)):
        nums = [x for x in val if isinstance(x, (int, float))]
        if not nums:
            return 0.0
        return float(sum(nums) / len(nums))
    if isinstance(val, (int, float)):
        return float(val)
    return 0.0

def execute_min(val, config=None):
    if isinstance(val, (list, tuple, set)) and val:
        nums = [x for x in val if isinstance(x, (int, float))]
        return min(nums) if nums else 0
    return val

def execute_max(val, config=None):
    if isinstance(val, (list, tuple, set)) and val:
        nums = [x for x in val if isinstance(x, (int, float))]
        return max(nums) if nums else 0
    return val

def execute_add(val, config=None):
    # Expects val to be list of 2 items or val + config['operand']
    if isinstance(val, (list, tuple)) and len(val) >= 2:
        return val[0] + val[1]
    op = config.get("operand", 0) if config else 0
    try:
        total = val + float(op)
        return int(total) if isinstance(val, int) and not isinstance(val, bool) and total == int(total) else total
    except Exception:
        return val

def execute_subtract(val, config=None):
    if isinstance(val, (list, tuple)) and len(val) >= 2:
        # Two connected inputs: the difference between them, so the order in which the
        # participant connected the two blocks does not matter.
        return abs(val[0] - val[1])
    op = config.get("operand", 0) if config else 0
    try:
        return val - float(op)
    except Exception:
        return val

def execute_multiply(val, config=None):
    if isinstance(val, (list, tuple)) and len(val) >= 2:
        return val[0] * val[1]
    op = config.get("operand", 1) if config else 1
    try:
        return val * float(op)
    except Exception:
        return val

def execute_divide(val, config=None):
    # If val is a list of 2 items (e.g. [sum, length])
    if isinstance(val, (list, tuple)) and len(val) >= 2:
        denom = val[1]
        if denom == 0:
            raise ValueError("DIVISION_BY_ZERO: Cannot divide by zero.")
        return val[0] / denom
    op = config.get("operand", 1) if config else 1
    if float(op) == 0:
        raise ValueError("DIVISION_BY_ZERO: Cannot divide by zero.")
    try:
        return val / float(op)
    except Exception:
        return val

def execute_modulus(val, config=None):
    if isinstance(val, (list, tuple)) and len(val) >= 2:
        return val[0] % val[1]
    op = config.get("operand", 1) if config else 1
    return val % float(op)

def execute_round(val, config=None):
    decimals = config.get("decimals", 2) if config else 2
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return round(float(val), int(decimals))
    return val


def execute_square(val, config=None):
    """Square: value x value (e.g. height 1.75 -> 3.0625)."""
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return val * val
    raise ValueError("Square needs a number.")


def execute_convert(val, config=None):
    """Convert: Fahrenheit -> Celsius with C = (F - 32) x 5 / 9, rounded to 1 decimal."""
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return round((val - 32) * 5 / 9, 1)
    raise ValueError("Convert needs a temperature number in °F.")
