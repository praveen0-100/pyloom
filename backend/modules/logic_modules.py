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
