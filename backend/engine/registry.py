"""
PYLOOM Module Registry
Maps visual module type names to safe python functions.
"""
from backend.modules.data_modules import (
    execute_input, execute_list, execute_dictionary, execute_output, execute_get
)
from backend.modules.math_modules import (
    execute_sum, execute_length, execute_average, execute_min, execute_max,
    execute_add, execute_subtract, execute_multiply, execute_divide, execute_modulus, execute_round
)
from backend.modules.string_modules import (
    execute_uppercase, execute_lowercase, execute_replace, execute_split, execute_join, execute_pattern, execute_reverse
)
from backend.modules.logic_modules import (
    execute_filter, execute_sort, execute_compare, execute_ifelse
)
from backend.modules.geo_modules import execute_lookup, execute_hemisphere
from backend.modules.chart_modules import (
    execute_line_chart
)

MODULE_REGISTRY = {
    "Input": execute_input,
    "List": execute_list,
    "Dictionary": execute_dictionary,
    "Sum": execute_sum,
    "Length": execute_length,
    "Average": execute_average,
    "Min": execute_min,
    "Max": execute_max,
    "Add": execute_add,
    "Subtract": execute_subtract,
    "Multiply": execute_multiply,
    "Divide": execute_divide,
    "Modulus": execute_modulus,
    "Round": execute_round,
    "Uppercase": execute_uppercase,
    "Lowercase": execute_lowercase,
    "Replace": execute_replace,
    "Split": execute_split,
    "Join": execute_join,
    "Pattern": execute_pattern,
    "Filter": execute_filter,
    "Sort": execute_sort,
    "LineChart": execute_line_chart,
    "Get": execute_get,
    "Reverse": execute_reverse,
    "Compare": execute_compare,
    "IfElse": execute_ifelse,
    "Lookup": execute_lookup,
    "Hemisphere": execute_hemisphere,
    "Output": execute_output
}
