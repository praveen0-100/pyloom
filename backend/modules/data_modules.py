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
        fmt = str(config["format"]).replace("\\n", "\n")
        try:
            return fmt.format(value=val)
        except Exception:
            return f"{fmt}: {val}"
    return val


def execute_get(val, config=None):
    """
    Reads value(s) out of a dictionary/list input.
    config['key'] may be one key ("rating_score") or several separated by commas
    ("notebook,pen,pencil_box"); several keys return a list in that order.
    """
    key_text = str((config or {}).get("key", "")).strip()
    keys = [k.strip() for k in key_text.split(",") if k.strip()]
    if not keys:
        raise ValueError("Get node needs a key, e.g. extra_hours.")

    def fetch(k):
        if isinstance(val, dict):
            if k not in val:
                raise ValueError(f"Key '{k}' not found in the input.")
            return val[k]
        if isinstance(val, (list, tuple)):
            return val[int(k)]
        raise ValueError("Get node needs a dictionary or list input.")

    values = [fetch(k) for k in keys]
    return values[0] if len(values) == 1 else values
