"""
PYLOOM Geography Modules
Predefined landmark dataset lookup and hemisphere classification.
"""

LANDMARKS = {
    "eiffel tower": {"landmark": "Eiffel Tower", "country": "France", "continent": "Europe", "lat": 48.86, "lon": 2.29},
    "taj mahal": {"landmark": "Taj Mahal", "country": "India", "continent": "Asia", "lat": 27.17, "lon": 78.04},
    "statue of liberty": {"landmark": "Statue of Liberty", "country": "USA", "continent": "North America", "lat": 40.69, "lon": -74.04},
    "sydney opera house": {"landmark": "Sydney Opera House", "country": "Australia", "continent": "Oceania", "lat": -33.86, "lon": 151.21},
    "christ the redeemer": {"landmark": "Christ the Redeemer", "country": "Brazil", "continent": "South America", "lat": -22.95, "lon": -43.21},
    "great pyramid of giza": {"landmark": "Great Pyramid of Giza", "country": "Egypt", "continent": "Africa", "lat": 29.98, "lon": 31.13},
}


def execute_lookup(val, config=None):
    """Matches a landmark name to its country, continent and coordinates."""
    record = LANDMARKS.get(str(val).strip().lower())
    if record is None:
        raise ValueError(f"Landmark '{val}' is not in the lookup table.")
    return dict(record)


def execute_hemisphere(val, config=None):
    """Adds a combined 'hemisphere' label (e.g. 'Northern & Eastern Hemisphere') to a lookup record."""
    if not isinstance(val, dict) or "lat" not in val or "lon" not in val:
        raise ValueError("Hemisphere node needs a Lookup record with lat and lon.")
    north_south = "Northern" if val["lat"] >= 0 else "Southern"
    east_west = "Eastern" if val["lon"] >= 0 else "Western"
    return {**val, "hemisphere": f"{north_south} & {east_west} Hemisphere"}
