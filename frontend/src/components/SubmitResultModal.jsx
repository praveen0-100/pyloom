/** Submit outcome shown inside the page (a browser alert() would drop full screen). */
export default function SubmitResultModal({ result, onClose }) {
  return (
    <div className={`modal-overlay${result ? " active" : ""}`} id="submit-result-modal" role="dialog" aria-modal="true" aria-labelledby="submit-result-title">
      <div className="modal-content hint-modal-content">
        <div className="modal-header">
          <h3 className="modal-title" id="submit-result-title">{result?.failed ? "Submission not accepted" : "Solution submitted successfully"}</h3>
          <button type="button" className="node-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {result?.failed ? (
            <p className="admin-login-error" role="alert">{result.message}</p>
          ) : result ? (
            <>
              <p>Status: <strong>{String(result.status).toUpperCase()}</strong></p>
              <p>Score earned: <strong>{result.credits} / {result.max}</strong></p>
            </>
          ) : null}
          {result?.failed && (
            <div className="hint-modal-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>OK</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
