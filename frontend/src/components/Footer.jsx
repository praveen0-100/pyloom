export default function Footer({ trialsLeft, maxTrials, locked, onClear, onRun, onSubmit }) {
  return (
    <footer className="app-footer app-gated">
      <div className="footer-meta">PYLOOM visual programming engine</div>
      <div className="action-btns">
        <button type="button" className="btn btn-secondary" id="reset-canvas-btn" onClick={onClear}>Clear canvas</button>
        <span className="trial-counter" id="trial-counter" aria-live="polite">Mapping trials: {trialsLeft} / {maxTrials}</span>
        <button type="button" className="btn btn-primary" id="run-flow-btn" disabled={locked || trialsLeft <= 0} title={trialsLeft <= 0 ? "No mapping trials left for this question" : undefined} onClick={onRun}>Run flow</button>
        <button type="button" className="btn btn-success" id="submit-flow-btn" disabled={locked || trialsLeft <= 0} title={trialsLeft <= 0 ? "No mapping trials left for this question" : undefined} onClick={onSubmit}>Submit solution</button>
      </div>
    </footer>
  );
}
