import ThemeToggle from "./ThemeToggle";
import Avatar from "./Avatar";
import { formatTimer, useTimerTick } from "../hooks/useSharedTimer";

const ClockIcon = () => (
  <svg className="stat-pill-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 4v4l2.5 2.5" /></svg>
);

export default function HeaderBar({ timer, scoreCredits, scoreMax, levelScore, levelMax, levelName, eventCredits, player, onExitEvent, onLogout, onInstructions }) {
  const { timerState, timerValues } = useTimerTick(timer);
  const levelText = timerValues ? formatTimer(Math.ceil(timerValues.level)) : "20:00";
  const mainText = timerValues ? formatTimer(Math.ceil(timerValues.main)) : "45:00";
  const started = timerState?.started;
  const levelPaused = timerState && (timerState.level_paused || (started && !timerState.level_entered));
  return (
    <header className="app-header app-gated">
      <div style={{ display: "flex", alignItems: "center" }}>
        <a href="/" className="brand">
          <div className="brand-icon brand-logo" aria-hidden="true">
            <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect className="logo-node" x="2" y="8" width="10" height="8" rx="2" stroke="#1a192b" strokeWidth="1.5" fill="#fff" />
              <rect className="logo-node" x="16" y="12" width="10" height="8" rx="2" stroke="#1a192b" strokeWidth="1.5" fill="#fff" />
              <path d="M12 12h4v4h-4z" fill="#7700ff" opacity="0.2" />
              <path d="M12 12c2 0 4-1 4-4M16 16c2 0 4 1 4 4" stroke="#7700ff" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="12" cy="12" r="2.5" fill="#7700ff" />
              <circle cx="20" cy="16" r="2.5" fill="#ff0072" />
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-name">PYLOOM</span>
            <span className="brand-tag">Python flow simulator</span>
          </div>
        </a>
        <nav className="header-nav" aria-label="Main">
          <a href="/" className="is-active">Editor</a>
        </nav>
      </div>

      <div className="header-right">
        <ThemeToggle />
        <div className={`stat-pill timer-box${levelPaused ? " is-paused" : ""}${timerState && !started ? " is-waiting" : ""}`}>
          <ClockIcon />
          <span className="timer-label">Level</span>
          <span id="timer-display">{levelText}</span>
        </div>
        <div className={`stat-pill main-timer-box${timerState?.main_paused ? " is-paused" : ""}${timerState && !started ? " is-waiting" : ""}`}>
          <ClockIcon />
          <span className="timer-label">Main</span>
          <span id="main-timer-display">{mainText}</span>
        </div>
        <div className="stat-pill credits-counter">
          <svg className="stat-pill-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5L8 2z" /></svg>
          <span>Score</span>
          <span id="credits-display">{scoreCredits} / {scoreMax}</span>
        </div>
        <div className="stat-pill level-score-counter" title={`Your total score in the ${levelName} level`}>
          <svg className="stat-pill-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 13V7M6 13V3M10 13V9M14 13V5" /></svg>
          <span>{levelName} total</span>
          <span id="level-score-display">{levelScore} / {levelMax}</span>
        </div>
        <div className="stat-pill event-credits-counter" title="Credits available for hints and event assistance">
          <svg className="stat-pill-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 4v8M5.5 6h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" /></svg>
          <span>Credits</span>
          <span id="event-credits-display">{eventCredits}</span>
        </div>
        <div className="stat-pill" id="player-identity-pill" title={player?.mode === "team" && player.members?.length ? `Team members: ${player.members.join(", ")}` : "Registered player"}>
          <Avatar file={player?.avatar} name={player?.playerName} size={24} />
          <span id="player-identity-name">{player?.playerName || "—"}</span>
          <span id="player-identity-id" style={{ opacity: 0.7 }}>{player ? `#${player.teamId}` : ""}</span>
        </div>
        <button type="button" className="btn btn-secondary header-action-btn" id="header-instructions-btn" onClick={onInstructions}>Instructions</button>
        <button type="button" className="btn btn-secondary header-action-btn" id="header-exit-btn" onClick={onExitEvent}>Exit event</button>
        <button type="button" className="btn btn-danger header-action-btn" id="header-logout-btn" onClick={onLogout}>Log out</button>
      </div>
    </header>
  );
}
