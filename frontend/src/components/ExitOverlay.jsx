import { getRegisteredPlayer } from "../lib/player";

/** Exit confirmation, then the thank-you slide with the final scores. */
export default function ExitOverlay({ open, view, score, onCancel, onConfirm, onLogout }) {
  const player = getRegisteredPlayer();
  return (
    <div id="exit-overlay" className="exit-overlay" hidden={!open}>
      <div className="exit-card" id="exit-confirm-view" hidden={view !== "confirm"}>
        <div className="participant-lock-icon">&#9211;</div>
        <h2>Exit the event?</h2>
        <p>Your solutions are saved. After you exit you can view your scores, but you will not be able to continue solving.</p>
        <div className="exit-actions">
          <button type="button" className="btn btn-secondary" id="exit-cancel-btn" onClick={onCancel}>Keep solving</button>
          <button type="button" className="btn btn-primary" id="exit-confirm-btn" onClick={onConfirm}>Exit &amp; view scores</button>
        </div>
      </div>
      <div className="exit-final" id="exit-final-view" hidden={view !== "final"}>
        <div className="exit-confetti" aria-hidden="true"></div>
        <div className="brand-name">PYLOOM</div>
        <h1 className="exit-thanks">THANK YOU FOR PARTICIPATING<br />IN THE PYLOOM</h1>
        <p className="exit-player" id="exit-player">{player ? `${player.playerName} · #${player.teamId}` : ""}</p>
        <div className="exit-total"><span id="exit-total">{score ? score.total : 0} / {score?.max_total ?? 100}</span><small>total score</small></div>
        <div className="exit-levels" id="exit-levels">
          {score && ["easy", "medium", "hard"].map((level) => {
            const l = score.levels[level];
            return (
              <div className="exit-level" key={level}>
                <strong>{level}</strong>
                <span>{l.completed} / {l.questions} solved</span>
                <span>{l.credits} / {l.max} score</span>
              </div>
            );
          })}
        </div>
        <p className="exit-rank" id="exit-rank">{score && score.rank ? `Rank ${score.rank} of ${score.players}` : ""}</p>
        <button type="button" className="btn btn-secondary" id="exit-logout-btn" onClick={onLogout}>Log out</button>
      </div>
    </div>
  );
}
