/**
 * PYLOOM Countdown Timer
 */
let timerInterval = null;
let remainingSeconds = 20 * 60;

function startTimer(minutes = 20, onExpire = null) {
  if (timerInterval) clearInterval(timerInterval);
  remainingSeconds = minutes * 60;
  updateTimerUI();

  timerInterval = setInterval(() => {
    remainingSeconds--;
    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      remainingSeconds = 0;
      updateTimerUI();
      if (onExpire) onExpire();
    } else {
      updateTimerUI();
    }
  }, 1000);
}

function updateTimerUI() {
  const el = document.getElementById("timer-display");
  if (!el) return;

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function resetTimer(minutes = 20) {
  startTimer(minutes);
}
