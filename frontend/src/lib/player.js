/** Registered participant identity (kept in localStorage like the original app). */
export const PLAYER_STORAGE_KEY = "pyloom-player";

export function getRegisteredPlayer() {
  try {
    const stored = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) || "null");
    if (stored && stored.teamId && stored.playerName && stored.college && stored.yearOfStudy) return stored;
  } catch (err) {
    /* ignore malformed storage */
  }
  return null;
}

export function getTeamId() {
  return getRegisteredPlayer()?.teamId || "TEAM_07";
}

// Erase this browser's stored identity and every per-question state (keeps only the colour mode).
export function wipeLocalParticipantState() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("pyloom-") && k !== "pyloom-color-mode" && k !== "pyloom-reset-epoch")
      .forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    /* ignore */
  }
}

// A deleted participant is kicked out immediately: wipe local identity/progress and
// reload so they land back on the registration gate.
export function forceParticipantLogout(message) {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("pyloom-") && k !== "pyloom-color-mode")
      .forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    /* ignore */
  }
  alert(message || "Your access was removed by the admin. You will be returned to the login screen.");
  window.location.reload();
}
