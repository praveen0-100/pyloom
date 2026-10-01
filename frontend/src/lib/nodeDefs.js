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
  Get: ["cat-data", "GT"], Output: ["cat-data", "OUT"],
  Sum: ["cat-math", "∑"], Length: ["cat-math", "LN"], Average: ["cat-math", "AVG"],
  Min: ["cat-math", "MIN"], Max: ["cat-math", "MAX"], Add: ["cat-math", "+"],
  Subtract: ["cat-math", "-"], Multiply: ["cat-math", "×"], Divide: ["cat-math", "÷"],
  Round: ["cat-math", "RD"], Reverse: ["cat-string", "RV"],
  Compare: ["cat-logic", "?"], IfElse: ["cat-logic", "IF"], Lookup: ["cat-logic", "LK"],
  Hemisphere: ["cat-logic", "HM"],
  Uppercase: ["cat-string", "AA"], Lowercase: ["cat-string", "aa"], Replace: ["cat-string", "RP"],
  Split: ["cat-string", "SP"], Join: ["cat-string", "JN"], Pattern: ["cat-string", "★"],
  Filter: ["cat-logic", "FL"], Sort: ["cat-logic", "SR"], LineChart: ["cat-chart", "📈"]
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
  Get: "Reads key(s) from a dictionary", Reverse: "Reverses text",
  Compare: "Returns True/False for a comparison", IfElse: "Picks a value from a condition",
  Lookup: "Finds landmark country & coordinates", Hemisphere: "Classifies hemisphere from coordinates",
  Uppercase: "Converts string to uppercase", Replace: "Replaces search string matches",
  Filter: "Filters list items within range", Pattern: "Generates N-level triangle pattern",
  LineChart: "Renders Matplotlib line chart"
};
export const getModuleDesc = (type) => DESC[type] || "Processes flow data";

// Sidebar module library, grouped exactly like the original palette:
// [type, icon, description, optional icon class override]
export const MODULE_LIBRARY = [
  { title: "Data & I/O", cls: "cat-data", modules: [
    ["Input", "IN", "Data source input node"], ["List", "LS", "Convert to Python list"],
    ["Dictionary", "DC", "Create Python dict"], ["Output", "OUT", "Final result output node"],
    ["Get", "GT", "Read a key from a dictionary"] ] },
  { title: "Math & statistics", cls: "cat-math", modules: [
    ["Sum", "∑", "Sum list elements"], ["Length", "LN", "Calculate total count"],
    ["Average", "AVG", "Calculate mean average"], ["Add", "+", "Add two values"],
    ["Subtract", "-", "Subtract two values"], ["Multiply", "×", "Multiply values"],
    ["Divide", "÷", "Divide numerator/denom"], ["Round", "RD", "Round to decimals"] ] },
  { title: "String & formatting", cls: "cat-string", modules: [
    ["Uppercase", "AA", "Convert string to UPPER"], ["Replace", "RP", "Find & replace text"],
    ["Reverse", "RV", "Reverse text"], ["Pattern", "★", "Star triangle generator"] ] },
  { title: "Logic & charts", cls: "cat-logic", modules: [
    ["Compare", "?", "Returns True / False"], ["IfElse", "IF", "Pick a value by condition"],
    ["Lookup", "LK", "Landmark table lookup"], ["Hemisphere", "HM", "Classify hemisphere"],
    ["Filter", "FL", "Filter range values"], ["LineChart", "📈", "Matplotlib chart renderer", "cat-chart"] ] }
];
