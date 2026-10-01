/** In-page confirmation (browser dialogs would drop full screen). */
export default function LogoutModal({ open, busy, onCancel, onConfirm }) {
  return (
    <div className={`modal-overlay${open ? " active" : ""}`} id="logout-modal" role="dialog" aria-modal="true" aria-labelledby="logout-modal-title">
      <div className="modal-content hint-modal-content">
        <div className="modal-header">
          <h3 className="modal-title" id="logout-modal-title">Log out?</h3>
          <button type="button" className="node-btn" aria-label="Close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <p>You will be logged out of the canvas. <strong>Everything you saved (mappings, scores and progress) is erased</strong> unless you have already exited the event. You can log in again with the same Player ID, after the admin approves you.</p>
          <div className="hint-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Stay</button>
            <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>{busy ? "Logging out…" : "Log out"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
