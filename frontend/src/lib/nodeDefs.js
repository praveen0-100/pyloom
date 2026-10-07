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
  Modulus: [OPERAND_FIELD],
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
  Modulus: ["cat-math", "mod"], Round: ["cat-math", "RD"], Reverse: ["cat-string", "RV"],
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
  Input: "Starts the flow with the question data you type in",
  Output: "Shows the final result; type a format like Total: {value}",
  List: "Turns the input into a Python list",
  Get: "Picks one value out of a dictionary by its key",
  SetValue: "Adds a new key and value you type into the data",
  Sum: "Adds all the numbers in a list into one total",
  Length: "Counts how many items are in a list",
  Average: "Finds the mean of a list of numbers",
  Min: "Finds the smallest number in a list",
  Max: "Finds the largest number in a list",
  Add: "Adds the number you type (or a second input) to the value",
  Subtract: "Subtracts the number you type (or a second input) from the value",
  Multiply: "Multiplies the value by the number you type (or a second input)",
  Divide: "Divides the first input by the second input",
  Modulus: "Gives the remainder after dividing (7 % 3 = 1)",
  Square: "Multiplies a number by itself (x × x)",
  Round: "Rounds a number to the decimals you type",
  Convert: "Turns °F into °C: (F − 32) × 5 ÷ 9",
  Compare: "Checks two values (==, >=, <, ...) and gives True or False",
  IfElse: "Checks a condition and gives back one of two answers you type",
  Filter: "Drops every number outside your Min to Max range",
  Sort: "Puts a list in ascending order",
  Reverse: "Flips text backwards (abc → cba)",
  Uppercase: "Changes every letter to a capital",
  Lowercase: "Changes every letter to small letters",
  Replace: "Swaps a piece of text for another piece",
  Split: "Cuts text into a list at a separator",
  Join: "Glues a list into one text with a separator",
  Pattern: "Generates an N-level star pattern",
  Lookup: "Finds a landmark's country and coordinates",
  Hemisphere: "Tells which hemisphere a coordinate is in",
  LineChart: "Draws a line chart; type the title and axis labels",
  Midpoint: "Finds the middle index of the current search range",
  BinaryCompare: "Checks the middle value against the target, then keeps the left or right half",
  RepeatSearch: "Repeats middle-and-compare until the target's index is found (-1 if missing)",
  Div4Check: "Checks whether a year is divisible by 4",
  CenturyRule: "A year divisible by 100 is a leap year only if it is also divisible by 400",
  CompareSwap: "Does ONE pass: swaps neighbours when the left one is bigger",
  PassRepeat: "Repeats swap passes until nothing is left to swap (sorted)",
  TotalSum: "Adds all the category amounts into one total",
  Percentage: "Turns each amount into its share: amount ÷ total × 100",
  TargetCompare: "Labels each value Above Target or Below Target",
  GradeClassifier: "Turns each score into a grade: A ≥90, B 75-89, C 50-74, F <50",
  CountGrades: "Counts how many students got each grade",
  PieChart: "Draws a pie chart of the shares; type the title",
  BarChart: "Draws a bar chart (green above / red below); type the title and Y label"
};
// Simple names shown to players; the engine keeps using the internal type names.
const LABELS = {
  Get: "Get Value", SetValue: "Set Value", Compare: "Compare", Reverse: "Reverse Text", Convert: "°F to °C",
  Midpoint: "Middle", BinaryCompare: "Compare Middle", RepeatSearch: "Repeat Search",
  Div4Check: "Divisible by 4", CenturyRule: "Century Rule", CompareSwap: "Swap Pairs",
  PassRepeat: "Repeat Passes", TotalSum: "Total Amount", Percentage: "Percent",
  TargetCompare: "Above / Below", GradeClassifier: "Grade", CountGrades: "Count Grades",
  PieChart: "Pie Chart", BarChart: "Bar Chart", LineChart: "Line Chart", IfElse: "If / Else"
};
export const getModuleLabel = (type) => LABELS[type] || type;
export const getModuleDesc = (type) => DESC[type] || "Processes flow data";

// Sidebar module library: grouped by what the blocks do. Descriptions come from DESC so the sidebar and
// the canvas always say the same thing. A few blocks are not needed by every question (Min, Max, Modulus,
// Subtract, Multiply, Uppercase, Lowercase, Replace): choose the ones the Operation really calls for.
// [type, icon, description, optional icon class override]
const m = (type, icon, cls) => [type, icon, getModuleDesc(type), cls];
export const MODULE_LIBRARY = [
  { id: "io", title: "Input / Output", cls: "cat-data", modules: [
    m("Input", "IN"), m("Output", "OUT"), m("Get", "GT"), m("SetValue", "SET") ] },
  { id: "math", title: "Math", cls: "cat-math", modules: [
    m("Sum", "∑"), m("Length", "LN"), m("Min", "MIN"), m("Max", "MAX"),
    m("Add", "+"), m("Subtract", "-"), m("Multiply", "×"), m("Divide", "÷"),
    m("Modulus", "mod"), m("Square", "x²"), m("Round", "RD"), m("Convert", "°") ] },
  { id: "logic", title: "Logic & Text", cls: "cat-logic", modules: [
    m("Compare", "?"), m("IfElse", "IF"), m("Filter", "FL"),
    m("Reverse", "RV", "cat-string"), m("Uppercase", "AA", "cat-string"),
    m("Lowercase", "aa", "cat-string"), m("Replace", "RP", "cat-string") ] },
  { id: "algo", title: "Search & Sort", cls: "cat-algo", modules: [
    m("Midpoint", "MID"), m("BinaryCompare", "<=>"), m("RepeatSearch", "↻"),
    m("Div4Check", "÷4"), m("CenturyRule", "100"), m("CompareSwap", "⇄"), m("PassRepeat", "↻") ] },
  { id: "chart", title: "Charts & Grades", cls: "cat-chart", modules: [
    m("TotalSum", "Σ"), m("Percentage", "%"), m("TargetCompare", "≥T"),
    m("GradeClassifier", "A-F"), m("CountGrades", "#"), m("PieChart", "◔"), m("BarChart", "▮▮") ] }
];
