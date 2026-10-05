/** Node catalogue: categories, descriptions and the editable fields of each block. */
export const OPERATORS = ["==", "!=", ">", ">=", "<", "<="];
const OPERAND_FIELD = { key: "operand", kind: "number", placeholder: "Operand e.g. 10" };

export const NODE_FIELDS = {
  Input: [{ key: "data", kind: "textarea", placeholder: "Enter input data (JSON or list)" }],
  Output: [{ key: "format", kind: "text", placeholder: "e.g. Average: {value}" }],
  Add: [OPERAND_FIELD],
  Subtract: [OPERAND_FIELD],
  Multiply: [OPERAND_FIELD],
  Divide: [OPERAND_FIELD],
  Replace: [
    { key: "find", kind: "text", placeholder: "Find e.g. a", raw: true },
    { key: "replace_with", kind: "text", placeholder: "Replace with e.g. - (empty = delete)", raw: true, keepEmpty: true }
  ],
  Get: [{ key: "key", kind: "text", placeholder: "Key e.g. extra_hours" }],
  SetValue: [
    { key: "key", kind: "text", placeholder: "Key e.g. target" },
    { key: "value", kind: "text", placeholder: "Value e.g. 200" }
  ],
  PieChart: [{ key: "title", kind: "text", placeholder: "Chart title" }],
  BarChart: [
    { key: "title", kind: "text", placeholder: "Chart title" },
    { key: "y_label", kind: "text", placeholder: "Y label e.g. Sales ($)" }
  ],
  Compare: [
    { key: "op", kind: "select", options: OPERATORS, placeholder: "==" },
    { key: "value", kind: "text", placeholder: "Value e.g. 40" }
  ],
  IfElse: [
    { key: "op", kind: "select", options: OPERATORS, placeholder: ">=" },
    { key: "value", kind: "text", placeholder: "Compare with e.g. 4.5" },
    { key: "then", kind: "text", placeholder: "Then e.g. 2" },
    { key: "otherwise", kind: "text", placeholder: "Otherwise e.g. 1" }
  ],
  Round: [{ key: "decimals", kind: "number", placeholder: "Decimals e.g. 2", integer: true }],
  LineChart: [
    { key: "title", kind: "text", placeholder: "Title e.g. Weekly Attendance" },
    { key: "x_label", kind: "text", placeholder: "X label" },
    { key: "y_label", kind: "text", placeholder: "Y label" }
  ],
  Filter: [
    { key: "min", kind: "number", placeholder: "Min e.g. 0" },
    { key: "max", kind: "number", placeholder: "Max e.g. 100" }
  ]
};

export function fieldDisplayValue(field, config) {
  const value = config[field.key];
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

// Empty fields are left out of the config so the engine's own defaults apply.
export function readNodeField(field, el) {
  const raw = el.value;
  const text = field.raw ? raw : raw.trim();
  if (text === "") return field.keepEmpty ? "" : undefined;
  if (field.kind === "number") {
    const num = field.integer ? parseInt(text, 10) : parseFloat(text);
    return Number.isNaN(num) ? undefined : num;
  }
  if (field.key === "data") {
    try { return JSON.parse(text); } catch (err) { return raw; }
  }
  return text;
}

const CATEGORY = {
  Input: ["cat-data", "IN"], List: ["cat-data", "LS"], Dictionary: ["cat-data", "DC"],
  Get: ["cat-data", "GT"], SetValue: ["cat-data", "SET"], Output: ["cat-data", "OUT"],
  Sum: ["cat-math", "∑"], Length: ["cat-math", "LN"], Average: ["cat-math", "AVG"],
  Min: ["cat-math", "MIN"], Max: ["cat-math", "MAX"], Add: ["cat-math", "+"],
  Subtract: ["cat-math", "-"], Multiply: ["cat-math", "×"], Divide: ["cat-math", "÷"],
  Round: ["cat-math", "RD"], Reverse: ["cat-string", "RV"],
  Compare: ["cat-logic", "?"], IfElse: ["cat-logic", "IF"], Lookup: ["cat-logic", "LK"],
  Hemisphere: ["cat-logic", "HM"],
  Uppercase: ["cat-string", "AA"], Lowercase: ["cat-string", "aa"], Replace: ["cat-string", "RP"],
  Split: ["cat-string", "SP"], Join: ["cat-string", "JN"], Pattern: ["cat-string", "★"],
  Filter: ["cat-logic", "FL"], Sort: ["cat-logic", "SR"], LineChart: ["cat-chart", "📈"],
  Square: ["cat-math", "x²"], Convert: ["cat-math", "°"],
  Midpoint: ["cat-algo", "MID"], BinaryCompare: ["cat-algo", "<=>"], RepeatSearch: ["cat-algo", "↻"],
  Div4Check: ["cat-algo", "÷4"], CenturyRule: ["cat-algo", "100"],
  CompareSwap: ["cat-algo", "⇄"], PassRepeat: ["cat-algo", "↻"],
  TotalSum: ["cat-chart", "Σ"], Percentage: ["cat-chart", "%"], TargetCompare: ["cat-chart", "≥T"],
  GradeClassifier: ["cat-chart", "A-F"], CountGrades: ["cat-chart", "#"],
  PieChart: ["cat-chart", "◔"], BarChart: ["cat-chart", "▮▮"]
};

export function getModuleCategory(type) {
  const [cls, icon] = CATEGORY[type] || ["cat-data", "M"];
  return { class: cls, icon };
}

const DESC = {
  Input: "Provides raw dataset input", List: "Converts input to Python list",
  Output: "Receives & formats final result", Sum: "Calculates sum of list elements",
  Length: "Calculates total count / length", Average: "Calculates arithmetic mean",
  Divide: "Divides numerator by denominator", Subtract: "Subtracts operand or 2nd input",
  Multiply: "Multiplies by operand or 2nd input", Round: "Rounds a number to N decimals",
  Get: "Reads key(s) from a dictionary", SetValue: "Adds a key and value you type to the data", Reverse: "Reverses text",
  Compare: "Returns True/False for a comparison", IfElse: "Picks a value from a condition",
  Lookup: "Finds landmark country & coordinates", Hemisphere: "Classifies hemisphere from coordinates",
  Uppercase: "Converts string to uppercase", Replace: "Replaces search string matches",
  Filter: "Filters list items within range", Pattern: "Generates N-level triangle pattern",
  LineChart: "Renders Matplotlib line chart",
  Square: "Multiplies a number by itself", Convert: "Fahrenheit → Celsius: (F-32) × 5 / 9",
  Midpoint: "Picks the middle index of the search range",
  BinaryCompare: "Middle = target? Else keep the left or right half",
  RepeatSearch: "Repeats Midpoint + Compare, returns the index",
  Div4Check: "Is the year divisible by 4?",
  CenturyRule: "Century years must also be divisible by 400",
  CompareSwap: "One pass: swap neighbours if left > right",
  PassRepeat: "Repeats passes until nothing is left to swap",
  TotalSum: "Adds up all the category amounts",
  Percentage: "Each amount ÷ total × 100",
  TargetCompare: "Marks each day Above / Below the target",
  GradeClassifier: "Score → grade: A ≥90, B 75-89, C 50-74, F <50",
  CountGrades: "Counts the students in each grade",
  PieChart: "Draws a pie chart", BarChart: "Draws a green / red bar chart"
};
// Simple names shown to players; the engine keeps using the internal type names.
const LABELS = {
  Get: "Get Value", SetValue: "Set Value", Compare: "Is True?", Reverse: "Reverse Text", Convert: "°F to °C",
  Midpoint: "Middle", BinaryCompare: "Compare Middle", RepeatSearch: "Repeat Search",
  Div4Check: "Divisible by 4", CenturyRule: "Century Rule", CompareSwap: "Swap Pairs",
  PassRepeat: "Repeat Passes", TotalSum: "Total Amount", Percentage: "Percent",
  TargetCompare: "Above / Below", GradeClassifier: "Grade", CountGrades: "Count Grades",
  PieChart: "Pie Chart", BarChart: "Bar Chart", LineChart: "Line Chart", IfElse: "If / Else"
};
export const getModuleLabel = (type) => LABELS[type] || type;
export const getModuleDesc = (type) => DESC[type] || "Processes flow data";

// Sidebar module library: the blocks the PYLOOM question set uses, grouped by what they do.
// [type, icon, description, optional icon class override]
export const MODULE_LIBRARY = [
  { id: "io", title: "Input / Output", cls: "cat-data", modules: [
    ["Input", "IN", "Start here: type the question data"], ["Output", "OUT", "End here: the final result"],
    ["Get", "GT", "Read a key from a dictionary"], ["SetValue", "SET", "Type a key and value to add to the data"] ] },
  { id: "math", title: "Math", cls: "cat-math", modules: [
    ["Sum", "∑", "Add up the list"], ["Length", "LN", "Count the items"],
    ["Add", "+", "Add two values"], ["Subtract", "-", "Subtract two values"],
    ["Multiply", "×", "Multiply values"], ["Divide", "÷", "First input ÷ second input"],
    ["Square", "x²", "Multiply a number by itself"], ["Round", "RD", "Round to decimals"],
    ["Convert", "°", "Fahrenheit → Celsius"] ] },
  { id: "logic", title: "Logic & Text", cls: "cat-logic", modules: [
    ["Compare", "?", "Returns True / False"], ["IfElse", "IF", "Pick one of two answers you type"],
    ["Filter", "FL", "Keep numbers between Min and Max"], ["Reverse", "RV", "Reverse text", "cat-string"] ] },
  { id: "algo", title: "Search & Sort", cls: "cat-algo", modules: [
    ["Midpoint", "MID", "Middle index of the range"], ["BinaryCompare", "<=>", "Middle vs target"],
    ["RepeatSearch", "↻", "Repeat until found"], ["Div4Check", "÷4", "Divisible by 4?"],
    ["CenturyRule", "100", "÷100 needs ÷400"], ["CompareSwap", "⇄", "One bubble-sort pass"],
    ["PassRepeat", "↻", "Repeat passes until sorted"] ] },
  { id: "chart", title: "Charts & Grades", cls: "cat-chart", modules: [
    ["TotalSum", "Σ", "Total of all categories"], ["Percentage", "%", "Share of the total"],
    ["TargetCompare", "≥T", "Above / Below target"], ["GradeClassifier", "A-F", "Score → grade"],
    ["CountGrades", "#", "Students per grade"], ["PieChart", "◔", "Pie chart render"],
    ["BarChart", "▮▮", "Bar chart render"] ] }
];
