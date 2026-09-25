/**
 * PYLOOM shared timer client.
 * The Flask server is authoritative; this browser only renders its state.
 */
let timerStream = null;
let timerTick = null;
let timerState = null;
let onLevelExpired = null;
let onMainExpired = null;
let onParticipantLockChange = null;

function formatTimer(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// The server sends the remaining time at the moment of each poll; between polls the
// display is computed from the local clock, so the numbers count down smoothly and
// a fresh poll only corrects drift instead of making the digits jump.
let timerBaseAt = 0;

function displayedTimerValues() {
  const elapsed = timerState.started ? Math.max(0, (performance.now() - timerBaseAt) / 1000) : 0;
  return {
    main: timerState.main_paused ? timerState.main_remaining_seconds : Math.max(0, timerState.main_remaining_seconds - elapsed),
    level: timerState.level_paused ? timerState.level_remaining_seconds : Math.max(0, timerState.level_remaining_seconds - elapsed)
  };
}

function renderSharedTimer() {
  if (!timerState) return;
  const values = displayedTimerValues();
  const levelEl = document.getElementById("timer-display");
  const mainEl = document.getElementById("main-timer-display");
  if (levelEl) levelEl.textContent = formatTimer(Math.ceil(values.level));
  if (mainEl) mainEl.textContent = formatTimer(Math.ceil(values.main));
  document.querySelector(".timer-box")?.classList.toggle("is-paused", timerState.level_paused);
  document.querySelector(".main-timer-box")?.classList.toggle("is-paused", timerState.main_paused);
  const status = document.getElementById("timer-status");
  if (status) status.textContent = !timerState.started ? "Waiting for admin" : timerState.paused ? "Paused" : "Running";
  document.querySelector(".timer-box")?.classList.toggle("is-waiting", !timerState.started);
  document.querySelector(".main-timer-box")?.classList.toggle("is-waiting", !timerState.started);
}

function applySharedTimerState(nextState) {
  const previous = timerState;
  timerState = { ...nextState };
  timerBaseAt = performance.now();
  renderSharedTimer();
  if ((!previous || previous.participant_lock_enabled !== timerState.participant_lock_enabled || previous.participant_violation !== timerState.participant_violation) && onParticipantLockChange) {
    onParticipantLockChange(timerState.participant_lock_enabled, timerState.participant_violation, timerState.participant_violation_reason);
  }
  if (previous && previous.main_remaining_seconds > 0 && timerState.main_remaining_seconds <= 0 && onMainExpired) onMainExpired();
  if (previous && previous.level_remaining_seconds > 0 && timerState.level_remaining_seconds <= 0 && onLevelExpired) onLevelExpired();
}

function startDisplayTick() {
  clearInterval(timerTick);
  timerTick = setInterval(renderSharedTimer, 250);
}

async function initializeSharedTimer(level, levelExpired, mainExpired, participantLockChanged) {
  onLevelExpired = levelExpired;
  onMainExpired = mainExpired;
  onParticipantLockChange = participantLockChanged;
  try {
    const response = await fetch("/api/timer/state");
    const result = await response.json();
    if (result.success) applySharedTimerState(result.timer);
  } catch (error) {
    console.error("Unable to load shared timer:", error);
  }
  if (timerStream) clearInterval(timerStream);
  const pollTimer = async () => {
    try {
      const response = await fetch("/api/timer/state");
      const result = await response.json();
      if (result.success) applySharedTimerState(result.timer);
    } catch (error) {
      console.error("Unable to poll shared timer:", error);
    }
  };
  // 1s poll keeps the fullscreen-lock/violation state (admin-driven) close to
  // instant; paused while the tab is hidden so a backgrounded participant
  // console doesn't keep hammering the API, and catches up the moment it's
  // visible again.
  timerStream = setInterval(() => {
    if (document.visibilityState === "visible") pollTimer();
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pollTimer();
  });
  startDisplayTick();
}

async function setParticipantTimerLevel(level) {
  try {
    const response = await fetch("/api/timer/level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level })
    });
    const result = await response.json();
    if (result.success) applySharedTimerState(result.timer);
  } catch (error) {
    console.error("Unable to change shared timer level:", error);
  }
}

// Compatibility wrappers for any existing callers.
function startTimer() {}
function resetTimer() {}
function startMainTimer() {}
