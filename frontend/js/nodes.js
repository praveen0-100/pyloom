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
        <button class="node-btn config-btn" title="Configure">⚙</button>
        <button class="node-btn delete-btn" title="Delete">✕</button>
      </div>
    </div>
    <div class="node-body">
      <div class="node-desc">${getModuleDesc(node.type)}</div>
      <div class="node-config-summary" id="cfg-summary-${node.id}">
        ${getConfigSummaryText(node)}
      </div>
    </div>
  `;

  // Attach Drag Event to Node Header
  const headerEl = nodeEl.querySelector(".node-header");
  let isDragging = false;
  let dragOffsetX = 0, dragOffsetY = 0;

  headerEl.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging = true;
    const viewportRect = viewport.getBoundingClientRect();
    dragOffsetX = (e.clientX - viewportRect.left) / zoomLevel - node.x;
    dragOffsetY = (e.clientY - viewportRect.top) / zoomLevel - node.y;
    selectNode(node.id);
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const viewportRect = viewport.getBoundingClientRect();
    node.x = Math.max(0, (e.clientX - viewportRect.left) / zoomLevel - dragOffsetX);
    node.y = Math.max(0, (e.clientY - viewportRect.top) / zoomLevel - dragOffsetY);
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    redrawConnections();
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  // Attach button events
  nodeEl.querySelector(".config-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openConfigModal(node);
  });

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

function openConfigModal(node) {
  const overlay = document.getElementById("config-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");

  if (!overlay || !modalTitle || !modalBody) return;

  modalTitle.textContent = `Configure ${node.type}`;
  modalBody.innerHTML = "";

  // Dynamic config form based on module type
  if (node.type === "Input") {
    modalBody.innerHTML = `
      <div class="form-group">
        <label>Input Data (JSON format or comma-separated list)</label>
        <textarea id="cfg-input-data" class="form-control" rows="4">${JSON.stringify(node.config.data ?? [85, 72, 91, 68, 79])}</textarea>
      </div>
    `;
  } else if (node.type === "Output") {
    modalBody.innerHTML = `
      <div class="form-group">
        <label>Format String (Use {value})</label>
        <input type="text" id="cfg-fmt" class="form-control" value="${node.config.format || ''}" placeholder="e.g. Average: {value}">
      </div>
    `;
  } else if (["Add", "Subtract", "Multiply", "Divide"].includes(node.type)) {
    modalBody.innerHTML = `
      <div class="form-group">
        <label>Operand (Static Number if single input)</label>
        <input type="number" id="cfg-operand" class="form-control" value="${node.config.operand || 0}">
      </div>
    `;
  } else if (node.type === "Replace") {
    modalBody.innerHTML = `
      <div class="form-group">
        <label>Find Character/Sub-string</label>
        <input type="text" id="cfg-find" class="form-control" value="${node.config.find || ' '}">
      </div>
      <div class="form-group">
        <label>Replace With</label>
        <input type="text" id="cfg-replace" class="form-control" value="${node.config.replace_with || '-'}">
      </div>
    `;
  } else if (node.type === "Filter") {
    modalBody.innerHTML = `
      <div class="form-group">
        <label>Minimum Value</label>
        <input type="number" id="cfg-min" class="form-control" value="${node.config.min ?? 0}">
      </div>
      <div class="form-group">
        <label>Maximum Value</label>
        <input type="number" id="cfg-max" class="form-control" value="${node.config.max ?? 100}">
      </div>
    `;
  } else {
    modalBody.innerHTML = `<p style="color:var(--text-dim); font-size:0.85rem;">No configuration required for ${node.type}.</p>`;
  }

  // Save handler
  document.getElementById("modal-save-btn").onclick = () => {
    if (node.type === "Input") {
      try {
        const val = document.getElementById("cfg-input-data").value;
        node.config.data = JSON.parse(val);
      } catch (err) {
        node.config.data = document.getElementById("cfg-input-data").value;
      }
    } else if (node.type === "Output") {
      node.config.format = document.getElementById("cfg-fmt").value;
    } else if (["Add", "Subtract", "Multiply", "Divide"].includes(node.type)) {
      node.config.operand = parseFloat(document.getElementById("cfg-operand").value);
    } else if (node.type === "Replace") {
      node.config.find = document.getElementById("cfg-find").value;
      node.config.replace_with = document.getElementById("cfg-replace").value;
    } else if (node.type === "Filter") {
      node.config.min = parseFloat(document.getElementById("cfg-min").value);
      node.config.max = parseFloat(document.getElementById("cfg-max").value);
    }

    const summaryEl = document.getElementById(`cfg-summary-${node.id}`);
    if (summaryEl) summaryEl.textContent = getConfigSummaryText(node);

    overlay.classList.remove("active");
  };

  overlay.classList.add("active");
}

function getConfigSummaryText(node) {
  if (node.type === "Input" && node.config.data) {
    return `Data: ${JSON.stringify(node.config.data).slice(0, 18)}...`;
  }
  if (node.type === "Output" && node.config.format) {
    return `Format: "${node.config.format}"`;
  }
  if (node.type === "Replace") {
    return `'${node.config.find || ' '}' → '${node.config.replace_with || '-'}'`;
  }
  if (node.type === "Filter") {
    return `Range: [${node.config.min ?? 0}, ${node.config.max ?? 100}]`;
  }
  return "Default config";
}

function getModuleCategory(type) {
  const map = {
    Input: { class: "cat-data", icon: "IN" },
    List: { class: "cat-data", icon: "LS" },
    Dictionary: { class: "cat-data", icon: "DC" },
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
    Uppercase: "Converts string to uppercase",
    Replace: "Replaces search string matches",
    Filter: "Filters list items within range",
    Pattern: "Generates N-level triangle pattern",
    LineChart: "Renders Matplotlib line chart"
  };
  return map[type] || "Processes flow data";
}
