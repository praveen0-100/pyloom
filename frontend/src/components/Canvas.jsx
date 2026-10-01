import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import CanvasNode from "./CanvasNode";

function bezier(x1, y1, x2, y2) {
  const deltaY = Math.abs(y2 - y1) * 0.5;
  const c1y = y1 + Math.max(deltaY, 30);
  const c2y = y2 - Math.max(deltaY, 30);
  return `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
}

/**
 * Pannable / zoomable canvas: drop target for the module library, the node blocks, the SVG
 * connections (click an output port, then an input port; click a line to delete it) and
 * the zoom / fit / auto-layout toolbar.
 *
 * `view` ({zoom, panX, panY}) lives in the parent (it needs it for tap-to-add); `viewRef`
 * always holds the latest value for pointer handlers.
 */
export default function Canvas({
  wrapperRef, nodes, edges, selectedNode, view, viewRef, setView,
  onDropType, onSelect, onMoveNode, onDeleteNode, onConfig, onConnect, onDeleteEdge, onAutoLayout
}) {
  const viewportRef = useRef(null);
  const nodeEls = useRef(new Map());
  const [heights, setHeights] = useState({});
  const [connectFrom, setConnectFrom] = useState(null);
  const [panning, setPanning] = useState(false);

  const registerEl = useCallback((id, el) => {
    if (el) nodeEls.current.set(id, el);
    else nodeEls.current.delete(id);
  }, []);
  const getZoom = useCallback(() => viewRef.current.zoom, [viewRef]);
  const getViewportEl = useCallback(() => viewportRef.current, []);

  // Keep lines attached to the rendered node height (content can resize a node).
  useLayoutEffect(() => {
    const next = {};
    let changed = false;
    nodes.forEach((n) => {
      const h = nodeEls.current.get(n.id)?.offsetHeight || 70;
      next[n.id] = h;
      if (heights[n.id] !== h) changed = true;
    });
    if (changed || Object.keys(heights).length !== nodes.length) setHeights(next);
  });

  const updateView = useCallback((patch) => {
    const next = { ...viewRef.current, ...patch };
    viewRef.current = next;
    setView(next);
  }, [viewRef, setView]);

  // Drag-and-drop from the module library.
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };
  const onDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("text/plain");
    if (!type) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    onDropType(type, Math.max(20, e.clientX - rect.left - viewRef.current.panX), Math.max(20, e.clientY - rect.top - viewRef.current.panY));
  };

  // Pan (mouse/touch/pen) + two-finger pinch zoom via pointer events.
  useEffect(() => {
    const wrap = wrapperRef.current;
    const pointers = new Map();
    let isPanning = false;
    let startX = 0, startY = 0, pinchDist = 0;

    const down = (e) => {
      if (!(e.target === wrap || e.target.id === "connections-svg" || e.target.id === "canvas-viewport")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        isPanning = true;
        setPanning(true);
        startX = e.clientX - viewRef.current.panX;
        startY = e.clientY - viewRef.current.panY;
        onSelect(null);
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist) updateView({ zoom: Math.min(Math.max(0.4, viewRef.current.zoom * (d / pinchDist)), 1.8) });
        pinchDist = d;
        return;
      }
      if (!isPanning) return;
      updateView({ panX: e.clientX - startX, panY: e.clientY - startY });
    };
    const end = (e) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        startX = p.x - viewRef.current.panX;
        startY = p.y - viewRef.current.panY;
      }
      if (pointers.size === 0) {
        isPanning = false;
        setPanning(false);
      }
    };
    const wheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      updateView({ zoom: Math.min(Math.max(0.5, viewRef.current.zoom + delta), 1.8) });
    };
    wrap.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    wrap.addEventListener("wheel", wheel, { passive: false });
    return () => {
      wrap.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      wrap.removeEventListener("wheel", wheel);
    };
  }, [wrapperRef, viewRef, updateView, onSelect]);

  // Port wiring: click an output port, then an input port of another block.
  const connectRef = useRef(null);
  const onPortClick = useCallback((nodeId, portType) => {
    const from = connectRef.current;
    if (!from) {
      if (portType === "output") { connectRef.current = nodeId; setConnectFrom(nodeId); }
      return;
    }
    if (portType === "input" && from !== nodeId) onConnect(from, nodeId);
    connectRef.current = null;
    setConnectFrom(null);
  }, [onConnect]);

  // Touch screens: two quick taps on the same line unlink it (dblclick is not reliable on touch).
  const lastTap = useRef({ index: -1, at: 0 });
  const doubleTap = (e, index) => {
    if (e.pointerType === "mouse") return;
    const now = Date.now();
    if (lastTap.current.index === index && now - lastTap.current.at < 400) {
      lastTap.current = { index: -1, at: 0 };
      onDeleteEdge(index);
    } else {
      lastTap.current = { index, at: now };
    }
  };

  const { zoom, panX, panY } = view;

  return (
    <section
      className={`canvas-wrapper${panning ? " is-panning" : ""}`}
      id="canvas-wrapper"
      ref={wrapperRef}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="canvas-viewport" id="canvas-viewport" ref={viewportRef} style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}>
        <svg id="connections-svg" aria-hidden="true">
          {edges.map((edge, index) => {
            const from = nodes.find((n) => n.id === edge.from);
            const to = nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;
            const d = bezier(from.x + 100, from.y + (heights[from.id] || 70), to.x + 100, to.y);
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <path d={d} className="connection-track" aria-hidden="true" />
                <path d={d} className="connection-path" data-edge-index={index} style={{ pointerEvents: "none" }} />
                {/* Wide invisible hit area so the line is easy to double-click / double-tap. */}
                <path
                  d={d}
                  className="connection-hit"
                  fill="none"
                  stroke="transparent"
                  strokeWidth="16"
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onClick={(e) => e.stopPropagation()}
                  // Double-click (or double-tap on touch screens) unlinks the connection.
                  onDoubleClick={(e) => { e.stopPropagation(); onDeleteEdge(index); }}
                  onPointerUp={(e) => doubleTap(e, index)}
                >
                  <title>Double-click to unlink</title>
                </path>
              </g>
            );
          })}
        </svg>
        {nodes.map((node) => (
          <CanvasNode
            key={node.id}
            node={node}
            selected={selectedNode === node.id}
            connecting={connectFrom === node.id}
            getZoom={getZoom}
            getViewportEl={getViewportEl}
            registerEl={registerEl}
            onSelect={onSelect}
            onMove={onMoveNode}
            onDelete={onDeleteNode}
            onConfig={onConfig}
            onPortClick={onPortClick}
          />
        ))}
      </div>

      <div className="canvas-toolbar" role="toolbar" aria-label="Canvas controls">
        <button type="button" className="tool-btn" id="zoom-in-btn" title="Zoom in" aria-label="Zoom in" onClick={() => updateView({ zoom: Math.min(1.8, viewRef.current.zoom + 0.1) })}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v10M3 8h10" /></svg>
        </button>
        <button type="button" className="tool-btn" id="zoom-out-btn" title="Zoom out" aria-label="Zoom out" onClick={() => updateView({ zoom: Math.max(0.4, viewRef.current.zoom - 0.1) })}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8h10" /></svg>
        </button>
        <div className="tool-btn-divider"></div>
        <button type="button" className="tool-btn" id="reset-view-btn" title="Fit view" aria-label="Reset view" onClick={() => updateView({ zoom: 1, panX: 0, panY: 0 })}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 8a6 6 0 1 0 6-6" /><path d="M2 4v4h4" /></svg>
        </button>
        <button type="button" className="tool-btn" id="auto-layout-btn" title="Auto layout" aria-label="Auto layout" onClick={onAutoLayout}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /><path d="M7 4.5h2M4.5 7v2M11.5 7v2M7 11.5h2" /></svg>
        </button>
      </div>
    </section>
  );
}
