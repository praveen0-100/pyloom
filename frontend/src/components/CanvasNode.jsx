import { memo, useEffect, useRef } from "react";
import { NODE_FIELDS, fieldDisplayValue, getModuleCategory, getModuleDesc, getModuleLabel, readNodeField } from "../lib/nodeDefs";

/**
 * One block on the canvas. Fields are uncontrolled (typing edits the block directly, like the
 * original app) and report parsed values through onConfig. Dragging uses pointer events.
 */
function CanvasNode({ node, selected, connecting, getZoom, getViewportEl, registerEl, onSelect, onMove, onDelete, onConfig, onPortClick }) {
  const category = getModuleCategory(node.type);
  const nodeRef = useRef(null);
  const nodeLatest = useRef(node);
  nodeLatest.current = node;

  useEffect(() => {
    registerEl(node.id, nodeRef.current);
    return () => registerEl(node.id, null);
  }, [node.id, registerEl]);

  const startDrag = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const viewport = getViewportEl();
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const zoom = getZoom();
    const offsetX = (e.clientX - rect.left) / zoom - nodeLatest.current.x;
    const offsetY = (e.clientY - rect.top) / zoom - nodeLatest.current.y;
    onSelect(node.id);

    // Move/up listeners exist only while dragging; updates are batched per animation frame.
    let frame = 0;
    let pending = null;
    const apply = () => {
      frame = 0;
      if (!pending) return;
      const r = viewport.getBoundingClientRect();
      const z = getZoom();
      onMove(node.id, Math.max(0, (pending.clientX - r.left) / z - offsetX), Math.max(0, (pending.clientY - r.top) / z - offsetY));
      pending = null;
    };
    const move = (ev) => {
      pending = ev;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  };

  const fields = NODE_FIELDS[node.type] || [];

  const fieldProps = (field) => ({
    className: "node-field",
    "data-field": field.key,
    "aria-label": field.placeholder,
    // Selecting/typing in a field must not start a canvas pan or drag.
    onPointerDown: (e) => { e.stopPropagation(); onSelect(node.id); },
    onKeyDown: (e) => e.stopPropagation(),
    onChange: (e) => onConfig(node.id, field.key, readNodeField(field, e.target))
  });

  return (
    <div
      ref={nodeRef}
      className={`canvas-node${selected ? " selected" : ""}`}
      id={node.id}
      style={{ left: `${node.x}px`, top: `${node.y}px` }}
      onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
    >
      <div className="node-ports">
        <div className={`port port-input`} data-node-id={node.id} data-port-type="input" onClick={(e) => { e.stopPropagation(); onPortClick(node.id, "input"); }}></div>
        <div className={`port port-output${connecting ? " is-connecting" : ""}`} data-node-id={node.id} data-port-type="output" onClick={(e) => { e.stopPropagation(); onPortClick(node.id, "output"); }}></div>
      </div>
      <div className="node-header" onPointerDown={startDrag}>
        <div className="node-title-group">
          <div className={`node-type-icon ${category.class}`}>{category.icon}</div>
          <div className="node-title">{getModuleLabel(node.type)}</div>
        </div>
        <div className="node-actions">
          <button className="node-btn delete-btn" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}>✕</button>
        </div>
      </div>
      <div className="node-body">
        <div className="node-desc">{getModuleDesc(node.type)}</div>
        <div className="node-fields">
          {fields.map((field) => {
            const value = fieldDisplayValue(field, node.config);
            if (field.kind === "select") {
              const chosen = node.config[field.key] ?? field.placeholder;
              return (
                <select key={field.key} {...fieldProps(field)} defaultValue={chosen}>
                  {field.options.map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
              );
            }
            if (field.kind === "textarea") {
              return <textarea key={field.key} {...fieldProps(field)} rows={2} placeholder={field.placeholder} defaultValue={value} />;
            }
            return (
              <input
                key={field.key}
                {...fieldProps(field)}
                type={field.kind === "number" ? "number" : "text"}
                step={field.kind === "number" ? "any" : undefined}
                placeholder={field.placeholder}
                defaultValue={value}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(CanvasNode);
