/**
 * PYLOOM Node Management Module
 */

function createNode(type, x, y, config = {}) {
  const node = {
    id: "node_" + crypto.randomUUID().slice(0, 8),
    type,
    x,
    y,
    config
  };

  flowState.nodes.push(node);
  renderNodeElement(node);
  redrawConnections();
  return node;
}

function renderNodeElement(node) {
  const viewport = document.getElementById("canvas-viewport");
  if (!viewport) return;

  const category = getModuleCategory(node.type);

  const nodeEl = document.createElement("div");
  nodeEl.className = "canvas-node";
  nodeEl.id = node.id;
  nodeEl.style.left = `${node.x}px`;
  nodeEl.style.top = `${node.y}px`;

  nodeEl.innerHTML = `
    <div class="node-ports">
      <div class="port port-input" data-node-id="${node.id}" data-port-type="input"></div>
      <div class="port port-output" data-node-id="${node.id}" data-port-type="output"></div>
    </div>
    <div class="node-header">
      <div class="node-title-group">
        <div class="node-type-icon ${category.class}">${category.icon}</div>
        <div class="node-title">${node.type}</div>
      </div>
      <div class="node-actions">
        <button class="node-btn delete-btn" title="Delete">✕</button>
      </div>
    </div>
    <div class="node-body">
      <div class="node-desc">${getModuleDesc(node.type)}</div>
      <div class="node-fields">${renderNodeFields(node)}</div>
    </div>
  `;

  // Attach Drag Event to Node Header
  const headerEl = nodeEl.querySelector(".node-header");
  let isDragging = false;
  let dragOffsetX = 0, dragOffsetY = 0;

  headerEl.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging = true;
    const viewportRect = viewport.getBoundingClientRect();
    dragOffsetX = (e.clientX - viewportRect.left) / zoomLevel - node.x;
    dragOffsetY = (e.clientY - viewportRect.top) / zoomLevel - node.y;
    selectNode(node.id);
  });

  document.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const viewportRect = viewport.getBoundingClientRect();
    node.x = Math.max(0, (e.clientX - viewportRect.left) / zoomLevel - dragOffsetX);
    node.y = Math.max(0, (e.clientY - viewportRect.top) / zoomLevel - dragOffsetY);
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    redrawConnections();
  });

  document.addEventListener("pointerup", () => { isDragging = false; });
  document.addEventListener("pointercancel", () => { isDragging = false; });

  // Attach button events
  bindNodeFields(node, nodeEl);

  nodeEl.querySelector(".delete-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    deleteNode(node.id);
  });

  nodeEl.addEventListener("click", (e) => {
    // Port clicks are handled by the canvas-level connection delegate.
    // Do not stop propagation here or selecting a node would prevent wiring.
    if (e.target.closest(".port")) return;
    e.stopPropagation();
    selectNode(node.id);
  });

  viewport.appendChild(nodeEl);
}

function selectNode(nodeId) {
  flowState.selectedNode = nodeId;
  document.querySelectorAll(".canvas-node").forEach(el => {
    el.classList.toggle("selected", el.id === nodeId);
  });
}

function deleteNode(nodeId) {
  flowState.nodes = flowState.nodes.filter(n => n.id !== nodeId);
  flowState.edges = flowState.edges.filter(e => e.from !== nodeId && e.to !== nodeId);

  const el = document.getElementById(nodeId);
  if (el) el.remove();
  redrawConnections();
}

// Editable fields shown directly on each block. Nothing is pre-filled: the example
// values are only placeholders, and an empty field is left out of the config so the
// engine's own defaults apply.
const OPERATORS = ["==", "!=", ">", ">=", "<", "<="];
const OPERAND_FIELD = { key: "operand", kind: "number", placeholder: "Operand e.g. 10" };
const NODE_FIELDS = {
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

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fieldDisplayValue(field, node) {
  const value = node.config[field.key];
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function renderNodeFields(node) {
  return (NODE_FIELDS[node.type] || []).map(field => {
    const value = escapeAttr(fieldDisplayValue(field, node));
    const common = `class="node-field" data-field="${field.key}" aria-label="${escapeAttr(field.placeholder)}"`;
    if (field.kind === "select") {
      const chosen = node.config[field.key] ?? field.placeholder;
      return `<select ${common}>${field.options.map(op => `<option value="${op}"${op === chosen ? " selected" : ""}>${op}</option>`).join("")}</select>`;
    }
    if (field.kind === "textarea") {
      return `<textarea ${common} rows="2" placeholder="${escapeAttr(field.placeholder)}">${value}</textarea>`;
    }
    const type = field.kind === "number" ? "number" : "text";
    return `<input ${common} type="${type}"${field.kind === "number" ? ' step="any"' : ""} placeholder="${escapeAttr(field.placeholder)}" value="${value}">`;
  }).join("");
}

function readNodeField(field, el) {
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

// Typing edits the block directly and is saved straight away (the autosave picks it up).
function bindNodeFields(node, nodeEl) {
  const fields = NODE_FIELDS[node.type] || [];
  nodeEl.querySelectorAll(".node-field").forEach(el => {
    const field = fields.find(f => f.key === el.dataset.field);
    const save = () => {
      const value = readNodeField(field, el);
      if (value === undefined) delete node.config[field.key];
      else node.config[field.key] = value;
    };
    el.addEventListener(field.kind === "select" ? "change" : "input", save);
    // Selecting/typing in a field must not start a canvas pan or drag.
    el.addEventListener("pointerdown", (e) => { e.stopPropagation(); selectNode(node.id); });
    el.addEventListener("keydown", (e) => e.stopPropagation());
  });
}

function getModuleCategory(type) {
  const map = {
    Input: { class: "cat-data", icon: "IN" },
    List: { class: "cat-data", icon: "LS" },
    Dictionary: { class: "cat-data", icon: "DC" },
    Get: { class: "cat-data", icon: "GT" },
    Output: { class: "cat-data", icon: "OUT" },

    Sum: { class: "cat-math", icon: "∑" },
    Length: { class: "cat-math", icon: "LN" },
    Average: { class: "cat-math", icon: "AVG" },
    Min: { class: "cat-math", icon: "MIN" },
    Max: { class: "cat-math", icon: "MAX" },
    Add: { class: "cat-math", icon: "+" },
    Subtract: { class: "cat-math", icon: "-" },
    Multiply: { class: "cat-math", icon: "×" },
    Divide: { class: "cat-math", icon: "÷" },
    Round: { class: "cat-math", icon: "RD" },
    Reverse: { class: "cat-string", icon: "RV" },
    Compare: { class: "cat-logic", icon: "?" },
    IfElse: { class: "cat-logic", icon: "IF" },
    Lookup: { class: "cat-logic", icon: "LK" },
    Hemisphere: { class: "cat-logic", icon: "HM" },

    Uppercase: { class: "cat-string", icon: "AA" },
    Lowercase: { class: "cat-string", icon: "aa" },
    Replace: { class: "cat-string", icon: "RP" },
    Split: { class: "cat-string", icon: "SP" },
    Join: { class: "cat-string", icon: "JN" },
    Pattern: { class: "cat-string", icon: "★" },

    Filter: { class: "cat-logic", icon: "FL" },
    Sort: { class: "cat-logic", icon: "SR" },
    LineChart: { class: "cat-chart", icon: "📈" }
  };
  return map[type] || { class: "cat-data", icon: "M" };
}

function getModuleDesc(type) {
  const map = {
    Input: "Provides raw dataset input",
    List: "Converts input to Python list",
    Output: "Receives & formats final result",
    Sum: "Calculates sum of list elements",
    Length: "Calculates total count / length",
    Average: "Calculates arithmetic mean",
    Divide: "Divides numerator by denominator",
    Subtract: "Subtracts operand or 2nd input",
    Multiply: "Multiplies by operand or 2nd input",
    Round: "Rounds a number to N decimals",
    Get: "Reads key(s) from a dictionary",
    Reverse: "Reverses text",
    Compare: "Returns True/False for a comparison",
    IfElse: "Picks a value from a condition",
    Lookup: "Finds landmark country & coordinates",
    Hemisphere: "Classifies hemisphere from coordinates",
    Uppercase: "Converts string to uppercase",
    Replace: "Replaces search string matches",
    Filter: "Filters list items within range",
    Pattern: "Generates N-level triangle pattern",
    LineChart: "Renders Matplotlib line chart"
  };
  return map[type] || "Processes flow data";
}
