"""
PYLOOM String Modules
Controlled functions for text manipulation and pattern generation.
"""

def execute_uppercase(val, config=None):
    if isinstance(val, str):
        return val.upper()
    if isinstance(val, list):
        return [str(x).upper() for x in val]
    return str(val).upper()

def execute_lowercase(val, config=None):
    if isinstance(val, str):
        return val.lower()
    if isinstance(val, list):
        return [str(x).lower() for x in val]
    return str(val).lower()

def execute_replace(val, config=None):
    find_str = config.get("find", " ") if config else " "
    replace_str = config.get("replace_with", "-") if config else "-"
    if isinstance(val, str):
        return val.replace(find_str, replace_str)
    return str(val).replace(find_str, replace_str)

def execute_split(val, config=None):
    delimiter = config.get("delimiter", ",") if config else ","
    if isinstance(val, str):
        return [p.strip() for p in val.split(delimiter) if p.strip()]
    return [str(val)]

def execute_join(val, config=None):
    delimiter = config.get("delimiter", "-") if config else "-"
    if isinstance(val, (list, tuple)):
        return delimiter.join(str(x) for x in val)
    return str(val)

def execute_pattern(val, config=None):
    """Generates N-level star pattern."""
    try:
        n = int(val)
    except Exception:
        n = 5
    return "\n".join("*" * i for i in range(1, n + 1))


def execute_reverse(val, config=None):
    if isinstance(val, list):
        return list(reversed(val))
    return str(val)[::-1]
