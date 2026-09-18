/**
 * PYLOOM Connections & SVG Bezier Drawing Module
 */

let activeDrawingPort = null;

function initConnections() {
  const svg = document.getElementById("connections-svg");
  const viewport = document.getElementById("canvas-viewport");

  if (!viewport) return;

  // Port click delegate for connecting ports
  viewport.addEventListener("click", (e) => {
    const portEl = e.target.closest(".port");
    if (!portEl) return;

    e.stopPropagation();
    const nodeId = portEl.dataset.nodeId;
    const portType = portEl.dataset.portType;

    if (!activeDrawingPort) {
      if (portType === "output") {
        activeDrawingPort = { nodeId, portType, portEl };
        portEl.classList.add("is-connecting");
      }
    } else {
      if (portType === "input" && activeDrawingPort.nodeId !== nodeId) {
        // Create connection edge
        connectNodes(activeDrawingPort.nodeId, nodeId);
      }
      // Reset active port drawing
      if (activeDrawingPort.portEl) {
        activeDrawingPort.portEl.classList.remove("is-connecting");
      }
      activeDrawingPort = null;
    }
  });
}

function connectNodes(fromId, toId) {
  // Prevent duplicate edge
  const exists = flowState.edges.some(e => e.from === fromId && e.to === toId);
  if (!exists) {
    flowState.edges.push({ from: fromId, to: toId });
    redrawConnections();
  }
}

function redrawConnections() {
  const svg = document.getElementById("connections-svg");
  if (!svg) return;

  svg.innerHTML = "";

  flowState.edges.forEach((edge, index) => {
    const fromNode = flowState.nodes.find(n => n.id === edge.from);
    const toNode = flowState.nodes.find(n => n.id === edge.to);

    if (!fromNode || !toNode) return;

    // Node port coordinates (Node width 200px, ports centered at top & bottom).
    // Use the rendered node height so the line stays attached when content or
    // configuration changes its size.
    const x1 = fromNode.x + 100;
    const fromNodeEl = document.getElementById(fromNode.id);
    const y1 = fromNode.y + (fromNodeEl ? fromNodeEl.offsetHeight : 70);
    const x2 = toNode.x + 100;
    const y2 = toNode.y; // input port top

    const d = calculateBezierPath(x1, y1, x2, y2);

    // A faint track keeps the dotted flow readable on both canvas themes.
    const track = document.createElementNS("http://www.w3.org/2000/svg", "path");
    track.setAttribute("d", d);
    track.setAttribute("class", "connection-track");
    track.setAttribute("aria-hidden", "true");
    svg.appendChild(track);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "connection-path");
    path.setAttribute("data-edge-index", index);
    path.setAttribute("title", "Click to delete connection");

    path.addEventListener("click", (e) => {
      e.stopPropagation();
      flowState.edges.splice(index, 1);
      redrawConnections();
    });

    svg.appendChild(path);
  });
}

function calculateBezierPath(x1, y1, x2, y2) {
  const deltaY = Math.abs(y2 - y1) * 0.5;
  const cp1x = x1;
  const cp1y = y1 + Math.max(deltaY, 30);
  const cp2x = x2;
  const cp2y = y2 - Math.max(deltaY, 30);

  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
}
