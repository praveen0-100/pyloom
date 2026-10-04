/** localStorage-backed participant state: event credits, trials, gamification. */
export const MAX_MAPPING_TRIALS = 3;
export const QUESTIONS_PER_LEVEL = { easy: 5, medium: 3, hard: 2 };
export const LEVEL_ORDER = ["easy", "medium", "hard"];
// Score per question and per level: easy 5 x 4 = 20, medium 3 x 10 = 30, hard 2 x 25 = 50 (total 100).
export const QUESTION_CREDITS = { easy: 4, medium: 10, hard: 25 };
export const LEVEL_SCORE = { easy: 20, medium: 30, hard: 50 };
export const TOTAL_SCORE = 100;

const CREDITS_KEY = "pyloom-event-credits-v3";
const GAMIFICATION_KEY = "pyloom-gamification";

const read = (key, fallback) => {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) || "{}") };
  } catch (err) {
    return fallback;
  }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* ignore */ }
};

export const loadEventCredits = () => read(CREDITS_KEY, { credits: 10, enteredLevels: [], completedLevels: [], rewardedLevels: [] });
export const saveEventCredits = (state) => write(CREDITS_KEY, state);

export const loadTrial = (missionId) => read(`pyloom-trials-${missionId}`, { failed: 0, hintUsed: false });
export const saveTrial = (missionId, state) => write(`pyloom-trials-${missionId}`, state);

const GAM_DEFAULT = { xp: 0, completed: [], attempted: [], bestScores: {}, streak: 0 };
export const loadGamification = () => read(GAMIFICATION_KEY, GAM_DEFAULT);
export const saveGamification = (state) => write(GAMIFICATION_KEY, state);

export const levelOf = (mission) => (mission?.difficulty || "easy").toLowerCase();
export const formatMissionValue = (value) =>
  value === undefined || value === null ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
