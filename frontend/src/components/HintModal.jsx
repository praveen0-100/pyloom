/** Hints are revealed one step at a time, only after spending 3 credits (once per question). */
export default function HintModal({ open, paid, steps, revealed, credits, error, onClose, onSpend, onNext }) {
  const allShown = revealed >= steps.length;
  return (
    <div className={`modal-overlay${open ? " active" : ""}`} id="hint-modal" role="dialog" aria-modal="true" aria-labelledby="hint-modal-title">
      <div className="modal-content hint-modal-content">
        <div className="modal-header">
          <h3 className="modal-title" id="hint-modal-title">{paid ? "Hint - step by step" : "Unlock hints?"}</h3>
          <button type="button" className="node-btn" id="hint-modal-close-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div id="hint-confirm-view" className="modal-body" hidden={paid}>
          <p>Hints are revealed <strong>one small step at a time</strong> - never the full solution.</p>
          <p className="hint-cost">Unlocking hints for this question costs <strong>3 credits</strong>. They are deducted from your total credits and from this question&apos;s score.</p>
          <p id="hint-credit-balance">You have {credits} credits.</p>
          <p id="hint-confirm-error" className="admin-login-error" role="alert">{error}</p>
          <div className="hint-modal-actions">
            <button type="button" className="btn btn-secondary" id="hint-cancel-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" id="hint-spend-btn" onClick={onSpend}>Spend 3 credits</button>
          </div>
        </div>
        <div id="hint-steps-view" className="modal-body" hidden={!paid}>
          <p id="hint-step-counter" className="hint-cost">Step {revealed} of {steps.length}</p>
          <div id="hint-guide" className="hint-guide">
            <ol className="hint-step-list">
              {steps.slice(0, revealed).map((step, i) => (
                <li key={i}><strong>{step.title}</strong><br />{step.text}</li>
              ))}
            </ol>
          </div>
          <div className="hint-modal-actions">
            <button type="button" className="btn btn-secondary" id="hint-modal-use-btn" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-primary" id="hint-next-btn" disabled={allShown} onClick={onNext}>
              {revealed === 0 ? "Show first step" : allShown ? "All steps shown" : "Show next step"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
