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
    execute_line_chart, execute_pie_chart, execute_bar_chart
)
from backend.modules.math_modules import execute_square, execute_convert
from backend.modules.algo_modules import (
    execute_midpoint, execute_binary_compare, execute_repeat_search,
    execute_div4_check, execute_century_rule, execute_compare_swap, execute_pass_repeat
)
from backend.modules.analysis_modules import (
    execute_total_sum, execute_percentage, execute_target_compare,
    execute_grade_classifier, execute_count_grades
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
    "Square": execute_square,
    "Convert": execute_convert,
    "Midpoint": execute_midpoint,
    "BinaryCompare": execute_binary_compare,
    "RepeatSearch": execute_repeat_search,
    "Div4Check": execute_div4_check,
    "CenturyRule": execute_century_rule,
    "CompareSwap": execute_compare_swap,
    "PassRepeat": execute_pass_repeat,
    "TotalSum": execute_total_sum,
    "Percentage": execute_percentage,
    "TargetCompare": execute_target_compare,
    "GradeClassifier": execute_grade_classifier,
    "CountGrades": execute_count_grades,
    "PieChart": execute_pie_chart,
    "BarChart": execute_bar_chart,
    "Output": execute_output
}
