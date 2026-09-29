/**
 * PYLOOM Canvas Controls & Auto Layout
 */

let zoomLevel = 1.0;
let panX = 0, panY = 0;

function initCanvas() {
  const canvasWrapper = document.getElementById("canvas-wrapper");
  const viewport = document.getElementById("canvas-viewport");

  if (!canvasWrapper || !viewport) return;

  // HTML5 Drag-and-Drop from Module Library
  canvasWrapper.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  canvasWrapper.addEventListener("drop", (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("text/plain");
    if (!type) return;

    const rect = canvasWrapper.getBoundingClientRect();
    const x = e.clientX - rect.left - panX;
    const y = e.clientY - rect.top - panY;

    createNode(type, Math.max(20, x), Math.max(20, y));
  });

  // Pan (mouse/touch/pen) + two-finger pinch zoom via pointer events
  const pointers = new Map();
  let isPanning = false;
  let startX = 0, startY = 0;
  let pinchDist = 0;

  canvasWrapper.addEventListener("pointerdown", (e) => {
    if (!(e.target === canvasWrapper || e.target.id === "connections-svg" || e.target.id === "canvas-viewport")) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      isPanning = true;
      canvasWrapper.classList.add("is-panning");
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      selectNode(null);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  document.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) {
        zoomLevel = Math.min(Math.max(0.4, zoomLevel * (d / pinchDist)), 1.8);
        updateViewportTransform();
      }
      pinchDist = d;
      return;
    }
    if (!isPanning) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    updateViewportTransform();
  });

  const endPointer = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 1) {
      const [p] = [...pointers.values()];
      startX = p.x - panX; startY = p.y - panY;
    }
    if (pointers.size === 0) {
      isPanning = false;
      canvasWrapper.classList.remove("is-panning");
    }
  };
  document.addEventListener("pointerup", endPointer);
  document.addEventListener("pointercancel", endPointer);

  // Zoom controls
  canvasWrapper.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    zoomLevel = Math.min(Math.max(0.5, zoomLevel + delta), 1.8);
    updateViewportTransform();
  });

  // Canvas toolbar handlers
  const zoomInBtn = document.getElementById("zoom-in-btn");
  if (zoomInBtn) zoomInBtn.onclick = () => { zoomLevel = Math.min(1.8, zoomLevel + 0.1); updateViewportTransform(); };

  const zoomOutBtn = document.getElementById("zoom-out-btn");
  if (zoomOutBtn) zoomOutBtn.onclick = () => { zoomLevel = Math.max(0.4, zoomLevel - 0.1); updateViewportTransform(); };

  const resetViewBtn = document.getElementById("reset-view-btn");
  if (resetViewBtn) resetViewBtn.onclick = () => { zoomLevel = 1.0; panX = 0; panY = 0; updateViewportTransform(); };

  const autoLayoutBtn = document.getElementById("auto-layout-btn");
  if (autoLayoutBtn) autoLayoutBtn.onclick = performAutoLayout;
}

function updateViewportTransform() {
  const viewport = document.getElementById("canvas-viewport");
  if (viewport) {
    viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  }
}

function performAutoLayout() {
  if (!flowState.nodes.length) return;

  const startX = 120;
  let currentY = 60;
  const gapY = 120;

  // Simple sequential auto-layout
  flowState.nodes.forEach((node, i) => {
    node.x = startX + (i % 2 === 0 ? 0 : 40);
    node.y = currentY;
    currentY += gapY;

    const el = document.getElementById(node.id);
    if (el) {
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
    }
  });

  redrawConnections();
}
