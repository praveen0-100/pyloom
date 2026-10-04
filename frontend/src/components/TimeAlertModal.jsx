import { useEffect } from "react";

/** In-page time warning (browser dialogs would drop full screen). Closes itself after a few seconds. */
export default function TimeAlertModal({ alert, onClose }) {
  useEffect(() => {
    if (!alert) return undefined;
    const id = setTimeout(onClose, alert.urgent ? 6000 : 10000);
    return () => clearTimeout(id);
  }, [alert, onClose]);
  return (
    <div className={`modal-overlay${alert ? " active" : ""}`} id="time-alert-modal" role="alertdialog" aria-modal="true" aria-labelledby="time-alert-title">
      <div className="modal-content hint-modal-content">
        <div className="modal-header">
          <h3 className="modal-title" id="time-alert-title">⏰ {alert?.title}</h3>
          <button type="button" className="node-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p><strong>{alert?.message}</strong></p>
          <div className="hint-modal-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>OK</button>
          </div>
        </div>
      </div>
    </div>
  );
}
