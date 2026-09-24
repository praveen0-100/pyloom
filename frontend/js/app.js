/**
 * PYLOOM Main Application State & Controller
 */

const flowState = {
  missionId: "mission_01",
  nodes: [],
  edges: [],
  selectedNode: null,
  credits: 0,
  round: 1,
  hintUsed: false,
  missions: [],
  progressRecords: {},
  advancing: false
};

const MAX_MAPPING_TRIALS = 3;
const QUESTIONS_PER_LEVEL = { easy: 5, medium: 3, hard: 2 };
let activeTimerLevel = null;

const PLAYER_STORAGE_KEY = "pyloom-player";

function getRegisteredPlayer() {
  try {
    const stored = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) || "null");
    if (stored && stored.teamId && stored.playerName && stored.college && stored.yearOfStudy) return stored;
  } catch (err) {
    /* ignore malformed storage */
  }
  return null;
}

function getTeamId() {
  return getRegisteredPlayer()?.teamId || "TEAM_07";
}

function renderPlayerIdentity() {
  const player = getRegisteredPlayer();
  const nameEl = document.getElementById("player-identity-name");
  const idEl = document.getElementById("player-identity-id");
  if (!player || !nameEl || !idEl) return;
  nameEl.textContent = player.playerName;
  idEl.textContent = `#${player.teamId}`;
}

function initParticipantRegistration() {
  return new Promise(resolve => {
    const gate = document.getElementById("participant-register");
    const form = document.getElementById("participant-register-form");
    const errorEl = document.getElementById("participant-register-error");

    const revealApp = () => {
      gate.hidden = true;
      document.querySelectorAll(".app-gated").forEach(el => { el.hidden = false; });
      renderPlayerIdentity();
      resolve();
    };

    const existingPlayer = getRegisteredPlayer();
    if (existingPlayer) {
      revealApp();
      return;
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      errorEl.textContent = "";
      const player = {
        playerName: document.getElementById("reg-player-name").value.trim(),
        teamId: document.getElementById("reg-player-id").value.trim(),
        college: document.getElementById("reg-player-college").value.trim(),
        yearOfStudy: document.getElementById("reg-player-year").value.trim()
      };
      if (!player.playerName || !player.teamId || !player.college || !player.yearOfStudy) {
        errorEl.textContent = "Please fill in every field.";
        return;
      }
      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      try {
        const res = await fetch("/api/participant/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            team_id: player.teamId,
            player_name: player.playerName,
            college: player.college,
            year_of_study: player.yearOfStudy
          })
        });
        const result = await res.json();
        if (!result.success) {
          errorEl.textContent = result.error || "Registration failed. Please try again.";
          submitBtn.disabled = false;
          return;
        }
        localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(player));
        revealApp();
      } catch (err) {
        console.error("Participant registration error:", err);
        errorEl.textContent = "Could not reach the server. Please try again.";
        submitBtn.disabled = false;
      }
    });
  });
}

function getEventCreditState() {
  try {
    return { credits: 10, enteredLevels: [], ...JSON.parse(localStorage.getItem("pyloom-event-credits") || "{}") };
  } catch (err) {
    return { credits: 10, enteredLevels: [] };
  }
}

function renderEventCredits() {
  const credits = getEventCreditState().credits;
  const creditsEl = document.getElementById("event-credits-display");
  if (creditsEl) creditsEl.textContent = credits;
}

function enterDifficulty(difficulty) {
  const level = (difficulty || "easy").toLowerCase();
  const state = getEventCreditState();
  if (!["easy", "medium", "hard"].includes(level) || state.enteredLevels.includes(level)) {
    renderEventCredits();
    return;
  }
  state.enteredLevels.push(level);
  state.credits += 10;
  localStorage.setItem("pyloom-event-credits", JSON.stringify(state));
  renderEventCredits();
  showMappingToast(`${level} level unlocked · +10 credits`, "success");
}

function spendEventCredits(amount) {
  const state = getEventCreditState();
  state.credits = Math.max(0, state.credits - amount);
  localStorage.setItem("pyloom-event-credits", JSON.stringify(state));
  renderEventCredits();
}

function getTrialState() {
  // Trial allowance is isolated by mission/question, so every question gets
  // its own three attempts when the participant enters it.
  const key = `pyloom-trials-${flowState.missionId}`;
  try {
    return { failed: 0, hintUsed: false, ...JSON.parse(localStorage.getItem(key) || "{}") };
  } catch (err) {
    return { failed: 0, hintUsed: false };
  }
}

function saveTrialState(state) {
  localStorage.setItem(`pyloom-trials-${flowState.missionId}`, JSON.stringify(state));
  flowState.hintUsed = Boolean(state.hintUsed);
  const counter = document.getElementById("trial-counter");
  if (counter) counter.textContent = `Mapping trials: ${Math.max(0, MAX_MAPPING_TRIALS - state.failed)} / ${MAX_MAPPING_TRIALS}`;
}

function consumeMappingTrial() {
  const state = getTrialState();
  if (state.failed < MAX_MAPPING_TRIALS) state.failed += 1;
  if (state.failed === MAX_MAPPING_TRIALS && !state.hintUsed) {
    state.hintUsed = true;
    spendEventCredits(3);
    document.getElementById("hint-modal")?.classList.add("active");
  }
  saveTrialState(state);
}

function closeHintModal() {
  document.getElementById("hint-modal")?.classList.remove("active");
}

function getGamificationState() {
  try {
    return {
      xp: 0,
      completed: [],
      attempted: [],
      bestScores: {},
      streak: 0,
      ...JSON.parse(localStorage.getItem("pyloom-gamification") || "{}")
    };
  } catch (err) {
    return { xp: 0, completed: [], attempted: [], bestScores: {}, streak: 0 };
  }
}

function saveGamificationState(state) {
  localStorage.setItem("pyloom-gamification", JSON.stringify(state));
}

function renderGamification() {
  const state = getGamificationState();
  const level = Math.floor(state.xp / 250) + 1;
  const levelXp = state.xp % 250;
  const progress = Math.min(100, (levelXp / 250) * 100);
  document.getElementById("player-level").textContent = level;
  document.getElementById("xp-display").textContent = `${state.xp} XP`;
  document.getElementById("xp-next-display").textContent = `${250 - levelXp} XP to next level`;
  document.getElementById("xp-bar").style.width = `${progress}%`;
  document.getElementById("mission-progress-display").textContent = `${state.completed.length} / 5`;
  document.getElementById("mission-progress-bar").style.width = `${Math.min(100, (state.completed.length / 5) * 100)}%`;
  document.getElementById("streak-display").textContent = `${state.streak} streak`;

  const badges = [];
  if (state.completed.length >= 1) badges.push("First solve");
  if (state.completed.length >= 3) badges.push("Flow builder");
  if (state.completed.length >= 5) badges.push("PYLOOM master");
  if (state.streak >= 3) badges.push("On fire");
  document.getElementById("badges-list").innerHTML = badges.length
    ? badges.map(badge => `<span class="badge-chip">★ ${badge}</span>`).join("")
    : '<span class="badge-chip is-locked">Complete a mission to earn badges</span>';
}

function renderLevelNavigation(activeLevel) {
  const currentLevel = (activeLevel || flowState.missions.find(m => m.id === flowState.missionId)?.difficulty || "easy").toLowerCase();
  document.querySelectorAll(".level-tab").forEach(tab => {
    const active = tab.dataset.level === currentLevel;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  const selector = document.getElementById("question-selector");
  if (!selector) return;
  selector.dataset.level = currentLevel;
  const questions = flowState.missions.filter(m => (m.difficulty || "easy").toLowerCase() === currentLevel);
  document.querySelectorAll(".level-tab").forEach(tab => {
    const count = QUESTIONS_PER_LEVEL[tab.dataset.level] || 0;
    const countEl = tab.querySelector(".level-count");
    if (countEl) countEl.textContent = count;
  });
  const gamification = getGamificationState();
  selector.innerHTML = questions.map((mission, index) => {
    const completed = gamification.completed.includes(mission.id);
    const active = mission.id === flowState.missionId;
    return `<button type="button" class="question-chip ${active ? 'is-current' : ''} ${completed ? 'is-complete' : ''}" data-mission-id="${mission.id}" aria-current="${active ? 'true' : 'false'}">${completed ? '✓ ' : ''}Question ${index + 1}</button>`;
  }).join("");
  selector.querySelectorAll(".question-chip").forEach(button => {
    const mission = questions.find(item => item.id === button.dataset.missionId);
    if (!gamification.completed.includes(mission.id)) {
      button.classList.add(gamification.attempted.includes(mission.id) ? "is-tried" : "is-unattempted");
    }
  });
  selector.querySelectorAll(".question-chip").forEach(button => {
    button.addEventListener("click", () => loadMissionData(button.dataset.missionId));
  });

  const currentIndex = questions.findIndex(m => m.id === flowState.missionId);
  const previousButton = document.getElementById("prev-question-btn");
  const nextButton = document.getElementById("next-question-btn");
  const position = document.getElementById("question-position");
  if (previousButton) previousButton.disabled = currentIndex <= 0;
  if (nextButton) nextButton.disabled = currentIndex < 0 || currentIndex >= questions.length - 1;
  if (position) position.textContent = currentIndex >= 0 ? `${currentIndex + 1} / ${questions.length}` : "";
}

function navigateQuestion(direction) {
  const currentLevel = (flowState.missions.find(m => m.id === flowState.missionId)?.difficulty || "easy").toLowerCase();
  const questions = flowState.missions.filter(m => (m.difficulty || "easy").toLowerCase() === currentLevel);
  const currentIndex = questions.findIndex(m => m.id === flowState.missionId);
  const nextIndex = currentIndex + direction;
  if (nextIndex >= 0 && nextIndex < questions.length) {
    loadMissionData(questions[nextIndex].id);
  }
}

function markMissionAttempted() {
  // Only a real attempt (nodes placed and connected) turns the question bar orange.
  if (flowState.nodes.length && flowState.edges.length) {
    const state = getGamificationState();
    if (!state.attempted.includes(flowState.missionId)) {
      state.attempted.push(flowState.missionId);
      saveGamificationState(state);
    }
  }
  renderLevelNavigation();
}

function updateGamification(result) {
  const state = getGamificationState();
  const score = result.credits || 0;
  const previousBest = state.bestScores[flowState.missionId] || 0;
  const improvedBy = Math.max(0, score - previousBest);
  if (!improvedBy) {
    renderGamification();
    return;
  }

  state.bestScores[flowState.missionId] = score;
  const completedNow = !!result.all_passed && !state.completed.includes(flowState.missionId);
  const xpAward = improvedBy * 3 + (completedNow ? 50 : 0);
  state.xp += xpAward;
  if (completedNow) {
    state.completed.push(flowState.missionId);
    state.streak += 1;
    showMappingToast(`Mission complete · +${xpAward} XP`, "success");
  }
  saveGamificationState(state);
  renderGamification();
}

let mappingToastTimer = null;

function showMappingToast(message, type) {
  const toast = document.getElementById("mapping-toast");
  if (!toast) return;

  clearTimeout(mappingToastTimer);
  toast.textContent = message;
  toast.className = `mapping-toast is-visible is-${type}`;
  mappingToastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3200);
}

document.addEventListener("DOMContentLoaded", async () => {
  await initParticipantRegistration();

  renderGamification();
  renderEventCredits();
  initCanvas();
  initConnections();

  await loadMissionsList();
  await loadParticipantProgress();
  await loadMissionData("mission_01");

  document.querySelectorAll(".level-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const firstQuestion = flowState.missions.find(
        mission => (mission.difficulty || "easy").toLowerCase() === tab.dataset.level
      );
      if (firstQuestion) loadMissionData(firstQuestion.id);
    });
  });
  document.getElementById("prev-question-btn")?.addEventListener("click", () => navigateQuestion(-1));
  document.getElementById("next-question-btn")?.addEventListener("click", () => navigateQuestion(1));
  renderLevelNavigation();

  initModuleSearch();
  initModuleDragEvents();
  initActionButtons();

  initializeParticipantLockUI();
  initializeSharedTimer("easy", onLevelTimeExpired, onMainTimeExpired, handleParticipantLockChange);
});

let participantLockEnabled = false;

function initializeParticipantLockUI() {
  const overlay = document.getElementById("participant-lock-overlay");
  const enterButton = document.getElementById("enter-participant-fullscreen-btn");
  if (!overlay || !enterButton) return;

  const requestFullscreen = async () => {
    if (!participantLockEnabled) return;
    fullscreenTransitionUntil = Date.now() + 1500;
    try {
      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.warn("Fullscreen permission was not granted:", error);
    }
    updateParticipantLockOverlay();
  };

  enterButton.addEventListener("click", requestFullscreen);
  document.addEventListener("fullscreenchange", updateParticipantLockOverlay);
  document.addEventListener("fullscreenchange", monitorParticipantActivity);
  document.addEventListener("visibilitychange", () => {
    monitorParticipantActivity();
    updateParticipantLockOverlay();
  });
  window.addEventListener("blur", monitorParticipantActivity);
  window.addEventListener("resize", monitorParticipantActivity);
  window.addEventListener("focus", updateParticipantLockOverlay);
}

function updateParticipantLockOverlay() {
  const overlay = document.getElementById("participant-lock-overlay");
  if (!overlay) return;
  const needsFullscreen = participantLockEnabled && (participantLockViolation || (!document.fullscreenElement && document.visibilityState === "visible"));
  const title = document.getElementById("participant-lock-title");
  const message = document.getElementById("participant-lock-message");
  const button = document.getElementById("enter-participant-fullscreen-btn");
  if (participantLockViolation) {
    if (title) title.textContent = "Participant session locked";
    if (message) message.textContent = "Exam activity changed outside the participant console. An administrator must release and re-enable the session.";
    if (button) button.hidden = true;
  } else {
    if (title) title.textContent = "Participant mode is active";
    if (message) message.textContent = "Stay in this participant console. Full screen is required while the competition is locked.";
    if (button) button.hidden = false;
  }
  overlay.hidden = !needsFullscreen;
}

function handleParticipantLockChange(enabled, violation = false) {
  participantLockEnabled = Boolean(enabled);
  participantLockViolation = Boolean(violation);
  if (!participantLockEnabled) violationReported = false;
  document.body.classList.toggle("participant-lock-active", participantLockEnabled);
  if (!participantLockEnabled && document.fullscreenElement) {
    const exitPromise = document.exitFullscreen?.();
    exitPromise?.catch(() => {});
  }
  updateParticipantLockOverlay();
}

let participantLockViolation = false;
let violationReported = false;
let fullscreenTransitionUntil = 0;

function monitorParticipantActivity() {
  if (!participantLockEnabled || participantLockViolation) return;
  if (Date.now() < fullscreenTransitionUntil) return;
  const activityChanged = document.visibilityState === "hidden" || !document.fullscreenElement;
  if (!activityChanged || violationReported) return;
  violationReported = true;
  participantLockViolation = true;
  updateParticipantLockOverlay();
  fetch("/api/participant/lock-violation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: document.visibilityState === "hidden" ? "Participant tab or window lost visibility" : "Participant exited browser full screen" })
  }).catch(() => {});
}

function startLevelTimer(level) {
  const normalizedLevel = (level || "easy").toLowerCase();
  activeTimerLevel = normalizedLevel;
  setParticipantTimerLevel(normalizedLevel);
}

async function loadMissionsList() {
  try {
    const data = await API.getMissions();
    const difficultyOrder = { easy: 0, medium: 1, hard: 2 };
    flowState.missions = (data.missions || []).sort((a, b) =>
      (difficultyOrder[(a.difficulty || "easy").toLowerCase()] ?? 99) -
      (difficultyOrder[(b.difficulty || "easy").toLowerCase()] ?? 99)
    );
  } catch (err) {
    console.error("Failed to load missions:", err);
  }
}

async function loadParticipantProgress() {
  try {
    const result = await API.getProgress(getTeamId());
    if (!result.success) return;
    const state = getGamificationState();
    flowState.progressRecords = result.progress || {};
    Object.entries(result.progress || {}).forEach(([missionId, record]) => {
      const earned = (record.best_credits || 0) > 0 || record.status === "completed";
      if (earned && !state.attempted.includes(missionId)) state.attempted.push(missionId);
      if (record.status === "completed" && !state.completed.includes(missionId)) state.completed.push(missionId);
    });
    saveGamificationState(state);
    renderGamification();
  } catch (err) {
    console.error("Progress load error:", err);
  }
}

function restoreSavedMapping(record) {
  if (!record?.flow) return;
  flowState.nodes = (record.flow.nodes || []).map((node, index) => ({
    ...node,
    x: Number.isFinite(node.x) ? node.x : 80 + (index % 2) * 220,
    y: Number.isFinite(node.y) ? node.y : 60 + Math.floor(index / 2) * 140
  }));
  flowState.edges = record.flow.edges || [];
  flowState.nodes.forEach(node => renderNodeElement(node));
  redrawConnections();
}

async function loadMissionData(missionId) {
  try {
    const res = await API.getMission(missionId);
    if (!res.success) return;

    flowState.missionId = missionId;
    flowState.missionInput = res.mission.input;
    renderHintGuide(res.mission.guide);
    flowState.round = res.mission.round || 1;
    const missionLevel = (res.mission.difficulty || "easy").toLowerCase();
    // The level timer is shared by all questions in a level and restarts only
    // when the participant advances to a different difficulty.
    if (missionLevel !== activeTimerLevel) startLevelTimer(missionLevel);

    saveTrialState(getTrialState());
    enterDifficulty(res.mission.difficulty);
    renderLevelNavigation(res.mission.difficulty);

    document.getElementById("mission-title").textContent = res.mission.title;
    document.getElementById("mission-desc").textContent = res.mission.description;
    document.getElementById("mission-input").textContent = formatMissionValue(res.mission.input);
    document.getElementById("mission-operation").textContent = res.mission.operation || "—";
    document.getElementById("mission-expected").textContent = formatMissionValue(res.mission.expected_output);
    const referenceImage = document.getElementById("mission-reference-image");
    if (referenceImage) {
      referenceImage.hidden = !res.mission.image;
      referenceImage.src = res.mission.image || "";
      referenceImage.alt = `${res.mission.title} reference image`;
    }
    resetCanvasState();
    const savedRecord = flowState.progressRecords[missionId];
    restoreSavedMapping(savedRecord);
    // A previously scored question keeps showing its recorded score instead of
    // resetting to 0 just because the participant switched away and back.
    if (savedRecord && savedRecord.scoring) {
      const QUESTION_CREDITS = { easy: 4, medium: 10, hard: 25 };
      const questionCredits = QUESTION_CREDITS[missionLevel] || 4;
      flowState.credits = savedRecord.credits || 0;
      updateScoringUI(flowState.credits, savedRecord.scoring, questionCredits);
    }

    // Render test suite preview
    renderTestList(res.tests);
  } catch (err) {
    console.error("Failed to load mission:", err);
  }
}

function renderHintGuide(guide) {
  const container = document.getElementById("hint-guide");
  if (!container) return;
  container.innerHTML = "";
  if (!guide) return;
  const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const section = (title, body) => `<h4>${title}</h4>${body}`;
  container.innerHTML =
    section("1. Input block", `<p>Enter the question input (shown in the left panel) into the Input node yourself.</p>`) +
    section("2. Mapping (connect in this order)", `<ol>${(guide.mapping || []).map(step => `<li>${esc(step)}</li>`).join("")}</ol>`) +
    section("3. Output check", `<p>${esc(guide.output)}</p>`);
}

function formatMissionValue(value) {
  if (value === undefined || value === null) return "—";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function resetCanvasState() {
  flowState.nodes = [];
  flowState.edges = [];
  flowState.selectedNode = null;
  flowState.credits = 0;

  const viewport = document.getElementById("canvas-viewport");
  if (viewport) {
    viewport.querySelectorAll(".canvas-node").forEach(n => n.remove());
  }

  redrawConnections();
  updateScoringUI(0, null);

  const resView = document.getElementById("execution-result");
  if (resView) {
    resView.classList.remove("is-error");
    resView.textContent = "Ready to execute flow.";
  }

  const chartImg = document.getElementById("chart-preview");
  if (chartImg) chartImg.style.display = "none";
}

function renderTestList(tests) {
  const container = document.getElementById("test-list");
  if (!container) return;

  container.innerHTML = "";
  const evaluations = [
    ["mapping_flow", "Mapping Flow"],
    ["logic_building", "Logic building"],
    ["sample_output", "Output compare with sample output"],
    ["output_check", "Output check"]
  ];
  evaluations.forEach(([key, label]) => {
    const item = document.createElement("div");
    item.className = "test-item";
    item.id = `evaluation-item-${key}`;

    item.innerHTML = `
      <span>${label}</span>
      <span class="test-status" id="evaluation-status-${key}">PENDING</span>
    `;
    container.appendChild(item);
  });
}

function initModuleSearch() {
  const searchInput = document.getElementById("module-search");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll(".module-card").forEach(card => {
      const name = card.querySelector(".module-name").textContent.toLowerCase();
      const desc = card.querySelector(".module-desc").textContent.toLowerCase();
      const match = name.includes(query) || desc.includes(query);
      card.style.display = match ? "flex" : "none";
    });
  });
}

function initModuleDragEvents() {
  document.querySelectorAll(".module-card").forEach(card => {
    card.addEventListener("dragstart", (e) => {
      const type = card.dataset.moduleType;
      e.dataTransfer.setData("text/plain", type);
    });
  });
}

function initActionButtons() {
  const runBtn = document.getElementById("run-flow-btn");
  if (runBtn) runBtn.onclick = handleRunFlow;

  const resetBtn = document.getElementById("reset-canvas-btn");
  if (resetBtn) resetBtn.onclick = resetCanvasState;

  const submitBtn = document.getElementById("submit-flow-btn");
  if (submitBtn) submitBtn.onclick = handleSubmit;

  // Modal Close
  const closeBtn = document.getElementById("modal-close-btn");
  if (closeBtn) {
    closeBtn.onclick = () => {
      document.getElementById("config-modal").classList.remove("active");
    };
  }
  document.getElementById("hint-modal-close-btn")?.addEventListener("click", closeHintModal);
  document.getElementById("hint-modal-use-btn")?.addEventListener("click", closeHintModal);
  document.getElementById("open-hint-btn")?.addEventListener("click", () => {
    document.getElementById("hint-modal")?.classList.add("active");
  });
}

async function handleRunFlow() {
  if (flowState.advancing) return;
  markMissionAttempted();
  const resView = document.getElementById("execution-result");
  const chartImg = document.getElementById("chart-preview");

  if (resView) {
    resView.classList.remove("is-error");
    resView.textContent = "Validating and executing graph...";
  }

  try {
    const res = await API.runFlow(flowState.missionId, flowState);
    
    if (!res.success) {
      showMappingToast("mapping flow incorrect", "error");
      if (resView) {
        resView.classList.add("is-error");
        resView.textContent = `[${res.error.type}] ${res.error.message}`;
      }
      if (chartImg) chartImg.style.display = "none";
      flowState.credits = res.credits || 0;
      if (res.progress) flowState.progressRecords[flowState.missionId] = res.progress;
      updateScoringUI(res.credits || 0, res.scoring_breakdown || null, res.question_credits);
      consumeMappingTrial();
      return;
    }

    // Success
    showMappingToast("flow successfully mapped", "success");
    if (resView) {
      resView.classList.remove("is-error");
      if (typeof res.output === "object") {
        resView.textContent = JSON.stringify(res.output, null, 2);
      } else {
        resView.textContent = String(res.output);
      }
    }

    if (res.is_chart && chartImg) {
      chartImg.src = res.output;
      chartImg.style.display = "block";
    } else if (chartImg) {
      chartImg.style.display = "none";
    }

    // Update Test Statuses
    if (res.test_results) {
      res.test_results.forEach(t => {
        const statusEl = document.getElementById(`test-status-${t.test_id}`);
        const itemEl = document.getElementById(`test-item-${t.test_id}`);
        if (statusEl && itemEl) {
          statusEl.textContent = t.passed ? "✓ PASS" : "✗ FAIL";
          statusEl.className = `test-status ${t.passed ? 'pass' : 'fail'}`;
          itemEl.className = `test-item ${t.passed ? 'pass' : 'fail'}`;
        }
      });
    }

    // Update Credits UI
    flowState.credits = res.credits;
    if (res.progress) flowState.progressRecords[flowState.missionId] = res.progress;
    updateScoringUI(res.credits, res.scoring_breakdown, res.question_credits);
    updateGamification(res);
    const fullShare = (res.question_credits || 4) / 4;
    Object.entries(res.scoring_breakdown || {}).forEach(([key, score]) => {
      const statusEl = document.getElementById(`evaluation-status-${key}`);
      const itemEl = document.getElementById(`evaluation-item-${key}`);
      if (statusEl && itemEl) {
        const passed = score >= fullShare;
        statusEl.textContent = passed ? "PASS" : "REVIEW";
        statusEl.className = `test-status ${passed ? 'pass' : 'fail'}`;
        itemEl.className = `test-item ${passed ? 'pass' : 'fail'}`;
      }
    });

    const outputIsIncorrect = Object.entries(res.scoring_breakdown || {})
      .some(([key, score]) => ["sample_output", "output_check"].includes(key) && score < fullShare);
    if (outputIsIncorrect) consumeMappingTrial();

    if (res.all_passed) renderLevelNavigation();

  } catch (err) {
    showMappingToast("mapping flow incorrect", "error");
    if (resView) {
      resView.classList.add("is-error");
      resView.textContent = `Client execution error: ${err.message}`;
    }
  }
}

async function handleSubmit() {
  try {
    const res = await API.submitSolution(getTeamId(), flowState.missionId, flowState);

    // The submitted score is now the source of truth for this question's credits,
    // exactly like Run Flow - keep the UI, saved progress and leaderboard in sync.
    flowState.credits = res.credits || 0;
    updateScoringUI(res.credits || 0, res.scoring_breakdown || null, res.mission_credits);
    updateGamification(res);
    if (res.all_passed) renderLevelNavigation();
    await loadParticipantProgress();

    alert(`Solution Submitted Successfully!\nStatus: ${res.status.toUpperCase()}\nCredits Earned: ${res.credits} / ${res.mission_credits ?? 4}`);
  } catch (err) {
    alert(`Submission failed: ${err.message}`);
  }
}

function lockTimedActions(message) {
  alert(message);
  document.getElementById("submit-flow-btn").disabled = true;
  document.getElementById("run-flow-btn").disabled = true;
}

function onLevelTimeExpired() {
  lockTimedActions("Level time expired! Submissions locked.");
}

function onMainTimeExpired() {
  lockTimedActions("Main event time expired! Submissions locked.");
}
