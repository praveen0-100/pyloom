export default function LockOverlay({ show, violation, superseded, onEnterFullscreen }) {
  const title = superseded ? "Opened in another tab" : violation ? "Participant session locked" : "Full screen required";
  const message = superseded
    ? "This participant is already open in another tab or window. Close this one; only one canvas can be used at a time."
    : violation
      ? "You left the canvas (full screen, tab or window changed). The session is locked and reported to the admin. An administrator must unlock it."
      : "Stay in this participant console in full screen. Leaving full screen, switching tabs or windows, or splitting the screen locks your session.";
  return (
    <div id="participant-lock-overlay" className="participant-lock-overlay" hidden={!show}>
      <div className="participant-lock-card">
        <div className="participant-lock-icon">⛶</div>
        <h2 id="participant-lock-title">{title}</h2>
        <p id="participant-lock-message">{message}</p>
        <button type="button" className="btn btn-primary" id="enter-participant-fullscreen-btn" hidden={violation || superseded} onClick={onEnterFullscreen}>
          Enter full screen
        </button>
      </div>
    </div>
  );
}
