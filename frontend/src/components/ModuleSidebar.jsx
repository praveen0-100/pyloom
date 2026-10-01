import { useState } from "react";
import { MODULE_LIBRARY } from "../lib/nodeDefs";
import { formatMissionValue } from "../lib/storage";

export default function ModuleSidebar({ missionInput, onTapAdd }) {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase();

  return (
    <aside className="sidebar-left">
      <div className="panel-header">
        <span>Nodes</span>
        <span className="panel-header-hint">Drag to canvas</span>
      </div>

      <div className="question-input-card" id="question-input-card">
        <div className="question-input-title">Question input</div>
        <pre id="mission-input" className="question-input-value">{formatMissionValue(missionInput)}</pre>
        <div className="question-input-hint">Type this data into the Input node yourself, then connect the flow.</div>
      </div>

      <div className="search-box">
        <input type="text" id="module-search" className="search-input" placeholder="Search nodes…" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="module-list">
        {MODULE_LIBRARY.map((group) => (
          <div className="module-category" key={group.title}>
            <div className="category-title">{group.title}</div>
            {group.modules.map(([type, icon, desc, iconCls]) => {
              const match = type.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
              return (
                <div
                  className="module-card"
                  key={type}
                  draggable="true"
                  data-module-type={type}
                  style={{ display: match ? "flex" : "none" }}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", type)}
                  // Touch / small screens have no HTML5 drag-and-drop: tap adds the module.
                  onClick={() => onTapAdd(type)}
                >
                  <div className={`module-icon ${iconCls || group.cls}`}>{icon}</div>
                  <div className="module-info">
                    <div className="module-name">{type}</div>
                    <div className="module-desc">{desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
