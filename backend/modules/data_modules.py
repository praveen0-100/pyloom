"""
PYLOOM Data Modules
Controlled Python functions for data input, data structures, and format conversion.
"""

def execute_input(data, config=None):
    """Returns the input data directly or uses configured default if data is None."""
    if data is not None:
        return data
    if config and "data" in config:
        return config["data"]
    return []

def execute_list(val, config=None):
    """Ensures input is converted to a Python list."""
    if isinstance(val, list):
        return val
    if isinstance(val, (tuple, set)):
        return list(val)
    if isinstance(val, str):
        # If comma-separated or space separated numbers/strings
        if "," in val:
            parts = [p.strip() for p in val.split(",") if p.strip()]
        else:
            parts = val.split()
        res = []
        for p in parts:
            try:
                if "." in p:
                    res.append(float(p))
                else:
                    res.append(int(p))
            except ValueError:
                res.append(p)
        return res
    if val is None:
        return []
    return [val]

def execute_dictionary(val, config=None):
    """Constructs or returns a dict."""
    if isinstance(val, dict):
        return val
    if config and "key" in config and "value" in config:
        return {config["key"]: val}
    return {"data": val}

def execute_output(val, config=None):
    """Formats output value according to format string config."""
    if config and "format" in config and config["format"]:
        fmt = config["format"]
        try:
            return fmt.format(value=val)
        except Exception:
            return f"{fmt}: {val}"
    return val
