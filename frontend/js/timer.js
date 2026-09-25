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

function renderSharedTimer() {
  if (!timerState) return;
  const levelEl = document.getElementById("timer-display");
  const mainEl = document.getElementById("main-timer-display");
  if (levelEl) levelEl.textContent = formatTimer(timerState.level_remaining_seconds);
  if (mainEl) mainEl.textContent = formatTimer(timerState.main_remaining_seconds);
  document.querySelector(".timer-box")?.classList.toggle("is-paused", timerState.level_paused);
  document.querySelector(".main-timer-box")?.classList.toggle("is-paused", timerState.main_paused);
  const status = document.getElementById("timer-status");
  if (status) status.textContent = timerState.paused ? "Paused" : "Running";
}

function applySharedTimerState(nextState) {
  const previous = timerState;
  timerState = { ...nextState };
  renderSharedTimer();
  if ((!previous || previous.participant_lock_enabled !== timerState.participant_lock_enabled || previous.participant_violation !== timerState.participant_violation) && onParticipantLockChange) {
    onParticipantLockChange(timerState.participant_lock_enabled, timerState.participant_violation, timerState.participant_violation_reason);
  }
  if (previous && previous.main_remaining_seconds > 0 && timerState.main_remaining_seconds <= 0 && onMainExpired) onMainExpired();
  if (previous && previous.level_remaining_seconds > 0 && timerState.level_remaining_seconds <= 0 && onLevelExpired) onLevelExpired();
}

function startDisplayTick() {
  clearInterval(timerTick);
  timerTick = setInterval(() => {
    if (!timerState) return;
    if (!timerState.main_paused) timerState.main_remaining_seconds = Math.max(0, timerState.main_remaining_seconds - 1);
    if (!timerState.level_paused) timerState.level_remaining_seconds = Math.max(0, timerState.level_remaining_seconds - 1);
    renderSharedTimer();
  }, 1000);
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
  if (level) await setParticipantTimerLevel(level);
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
