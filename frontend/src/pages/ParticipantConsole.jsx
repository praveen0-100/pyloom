import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HeaderBar from "../components/HeaderBar";
import ModuleSidebar from "../components/ModuleSidebar";
import Canvas from "../components/Canvas";
import RightPanel from "../components/RightPanel";
import Footer from "../components/Footer";
import HintModal from "../components/HintModal";
import SubmitResultModal from "../components/SubmitResultModal";
import LogoutModal from "../components/LogoutModal";
import { InstructionsModal, RulesModal } from "../components/IntroModals";
import LockOverlay from "../components/LockOverlay";
import ExitOverlay from "../components/ExitOverlay";
import { API, beacon, flowPayload, postJson } from "../lib/api";
import { getRegisteredPlayer, getTeamId, wipeLocalParticipantState } from "../lib/player";
import {
  LEVEL_ORDER, LEVEL_SCORE, MAX_MAPPING_TRIALS, QUESTION_CREDITS, levelOf,
  loadEventCredits, saveEventCredits, loadGamification, saveGamification, loadTrial, saveTrial
} from "../lib/storage";
import { useSharedTimer } from "../hooks/useSharedTimer";
import { useParticipantLock } from "../hooks/useParticipantLock";
import { useTimeAlerts } from "../hooks/useTimeAlerts";
import TimeAlertModal from "../components/TimeAlertModal";

const EXIT_STORAGE_PREFIX = "pyloom-exited-";
const READY_RESULT = { text: "Ready to execute flow.", error: false };
const NO_SCORING = { credits: 0, max: 4, breakdown: null };

/**
 * The participant console (everything behind the registration gate): node editor, mission
 * panel, scoring, hints, timers, full-screen lock and the exit flow.
 */
export default function ParticipantConsole({ onRevoked }) {
  const player = getRegisteredPlayer();

  // ---- core flow state (refs mirror the latest values for timers / async handlers) ----
  const [missions, setMissions] = useState([]);
  const [missionId, setMissionId] = useState("easy_1");
  const [mission, setMission] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [progress, setProgress] = useState({});
  const [gam, setGam] = useState(loadGamification);
  const [eventCredits, setEventCredits] = useState(() => loadEventCredits().credits);
  const [trial, setTrial] = useState(() => loadTrial("easy_1"));
  const [scoring, setScoring] = useState(NO_SCORING);
  const [evals, setEvals] = useState({});
  const [result, setResult] = useState(READY_RESULT);
  const [chartSrc, setChartSrc] = useState("");
  const [hintOpen, setHintOpen] = useState(false);
  const [hintError, setHintError] = useState("");
  const [toast, setToast] = useState({ message: "", type: "", visible: false });
  const [lockReason, setLockReason] = useState("");
  const [submitResult, setSubmitResult] = useState(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [timeAlert, setTimeAlert] = useState(null);
  const timedOutLevels = useRef(new Set());
  // Right after login: 1) instructions, then 2) rules (first time only). The header button reopens them.
  const introKey = `pyloom-intro-seen-${getTeamId()}`;
  const [intro, setIntro] = useState(() => {
    try { return localStorage.getItem(introKey) ? { step: null, first: false } : { step: "instructions", first: true }; } catch (_) { return { step: "instructions", first: true }; }
  });
  const [loggingOut, setLoggingOut] = useState(false);
  const [exit, setExit] = useState({ open: false, view: "confirm", score: null });

  const live = useRef({});
  live.current = { missions, missionId, nodes, edges, progress, gam, trial, mission };
  const wrapperRef = useRef(null);
  const viewRef = useRef(view);
  const progressRef = useRef({});
  const gamRef = useRef(gam);
  const trialRef = useRef(trial);
  const missionIdRef = useRef("easy_1");
  const autosave = useRef({ ready: false, signature: "" });
  const activeTimerLevel = useRef(null);
  const exitedRef = useRef(false);
  const toastTimer = useRef(null);
  const advancing = useRef(false);

  // ---- toast ----
  const showToast = useCallback((message, type) => {
    clearTimeout(toastTimer.current);
    setToast({ message, type, visible: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3200);
  }, []);

  // ---- persisted state helpers ----
  const commitGam = useCallback((state) => { gamRef.current = state; saveGamification(state); setGam(state); }, []);
  const commitTrial = useCallback((state) => {
    trialRef.current = state;
    saveTrial(missionIdRef.current, state);
    setTrial(state);
  }, []);
  const setProgressRecord = useCallback((id, record) => {
    progressRef.current = { ...progressRef.current, [id]: record };
    setProgress(progressRef.current);
  }, []);
  const spendEventCredits = (amount) => {
    const state = loadEventCredits();
    state.credits = Math.max(0, state.credits - amount);
    saveEventCredits(state);
    setEventCredits(state.credits);
  };
  // Event credits start at 10 (easy). Fully completing a level and then ENTERING the next one
  // adds 10 more to the credits the participant already has (once per level).
  const rewardOnLevelEntry = (level, state) => {
    const prev = LEVEL_ORDER[LEVEL_ORDER.indexOf(level) - 1];
    if (!prev) return;
    const rewarded = state.rewardedLevels || (state.rewardedLevels = []);
    if (rewarded.includes(level)) return;
    const prevMissions = live.current.missions.filter((m) => levelOf(m) === prev);
    const prevDone = prevMissions.length > 0 && prevMissions.every((m) => gamRef.current.completed.includes(m.id));
    if (!prevDone) return;
    rewarded.push(level);
    // Credits already granted on completion by an older build must not be paid twice.
    if ((state.completedLevels || []).includes(prev)) return;
    state.credits += 10;
    showToast(`${level} level unlocked · +10 credits`, "success");
  };

  // ---- timers + full-screen lock ----
  const lock = useParticipantLock({
    active: true,
    getMissionId: () => missionIdRef.current,
    exitedRef,
    onRevoked: () => {
      // The canvas is autosaved every 1.5s; release full screen and wait for the admin to re-activate.
      document.body.classList.remove("participant-lock-active");
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      onRevoked?.();
    }
  });
  const currentMissionLevel = () => levelOf(live.current.missions.find((m) => m.id === missionIdRef.current));

  const timer = useSharedTimer({
    onLevelExpired: () => { applyTimedLock(); advanceLevelOnTimeout(); },
    onMainExpired: () => applyTimedLock()
  });

  useTimeAlerts(timer, (a) => {
    setTimeAlert(a);
    showToast(`${a.title}: ${a.message}`, a.urgent ? "error" : "success");
  });

  // When the main timer ends everything is locked. When a level timer ends only questions of
  // THAT level are locked; the participant can switch levels and keep solving.
  const lockReasonRef = useRef("");
  function computeTimedLockReason() {
    const t = timer.getState();
    if (!t || !t.started) return "";
    const values = timer.displayed();
    if (values.main <= 0) return "main";
    if (values.level <= 0 && currentMissionLevel() === t.level) return "level";
    return "";
  }
  function applyTimedLock() {
    const reason = computeTimedLockReason();
    if (reason === lockReasonRef.current) return;
    lockReasonRef.current = reason;
    setLockReason(reason);
    const t = timer.getState();
    if (reason === "main") {
      showToast("Main event time expired! Submissions locked.", "error");
    } else if (reason === "level") {
      const other = LEVEL_ORDER.filter((l) => l !== t.level).join(" or ");
      showToast(`${t.level} level time is up. Switch to the ${other} level to keep solving.`, "error");
    }
  }
  const applyTimedLockRef = useRef(applyTimedLock);
  applyTimedLockRef.current = applyTimedLock;
  useEffect(() => {
    const id = setInterval(() => applyTimedLockRef.current(), 500);
    return () => clearInterval(id);
  }, []);

  // A level's shared timer ran out: move on to the next level's first unfinished question.
  function advanceLevelOnTimeout() {
    const level = currentMissionLevel();
    const nextLevel = LEVEL_ORDER[LEVEL_ORDER.indexOf(level) + 1];
    timedOutLevels.current.add(level);
    if (!nextLevel) return;
    const inNext = live.current.missions.filter((m) => levelOf(m) === nextLevel);
    if (!inNext.length) return;
    const next = inNext.find((m) => !gamRef.current.completed.includes(m.id)) || inNext[0];
    showToast(`${level} level time is up! Moving to ${nextLevel}…`, "error");
    loadMissionData(next.id);
  }

  // ---- flow editing ----
  const prefilledConfig = (type) => {
    const m = live.current.missions.find((x) => x.id === missionIdRef.current);
    const fixed = m?.prefilled_config?.[type];
    if (fixed) return { ...fixed };
    const keys = m?.prefilled_keys?.[type];
    if (!keys || !keys.length) return {};
    const used = live.current.nodes.filter((n) => n.type === type).map((n) => n.config.key);
    return { key: keys.find((k) => !used.includes(k)) ?? keys[keys.length - 1] };
  };

  const createNode = (type, x, y) => {
    const node = { id: "node_" + crypto.randomUUID().slice(0, 8), type, x, y, config: prefilledConfig(type) };
    setNodes((list) => { const next = [...list, node]; live.current.nodes = next; return next; });
  };
  const onTapAdd = (type) => {
    if (!window.matchMedia("(pointer: coarse), (max-width: 767px)").matches) return;
    const wrap = wrapperRef.current;
    if (!wrap) return;
    const n = live.current.nodes.length;
    const { zoom, panX, panY } = viewRef.current;
    const x = (wrap.clientWidth / 2) / zoom - panX / zoom - 90 + (n % 3) * 20;
    const y = (wrap.clientHeight / 3) / zoom - panY / zoom + (n % 4) * 20;
    createNode(type, Math.max(20, x), Math.max(20, y));
    wrap.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const onMoveNode = useCallback((id, x, y) => setNodes((list) => list.map((n) => (n.id === id ? { ...n, x, y } : n))), []);
  const onDeleteNode = useCallback((id) => {
    setNodes((list) => list.filter((n) => n.id !== id));
    setEdges((list) => list.filter((e) => e.from !== id && e.to !== id));
  }, []);
  const onConfig = useCallback((id, key, value) => setNodes((list) => list.map((n) => {
    if (n.id !== id) return n;
    const config = { ...n.config };
    if (value === undefined) delete config[key];
    else config[key] = value;
    return { ...n, config };
  })), []);
  const onConnect = useCallback((from, to) => setEdges((list) => (list.some((e) => e.from === from && e.to === to) ? list : [...list, { from, to }])), []);
  const onDeleteEdge = useCallback((index) => setEdges((list) => list.filter((_, i) => i !== index)), []);
  const onSelect = useCallback((id) => setSelectedNode(id), []);
  const onDropType = (type, x, y) => createNode(type, x, y);
  const onAutoLayout = () => {
    setNodes((list) => {
      let y = 60;
      return list.map((n, i) => {
        const placed = { ...n, x: 120 + (i % 2 === 0 ? 0 : 40), y };
        y += 120;
        return placed;
      });
    });
  };

  const resetCanvasState = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setScoring({ ...NO_SCORING, max: QUESTION_CREDITS[currentLevel] || 4 });
    setResult(READY_RESULT);
    setChartSrc("");
  };

  // ---- autosave: the canvas is saved shortly after every change so a refresh or crash never loses a mapping ----
  const flowSignature = () => JSON.stringify(flowPayload(live.current.nodes, live.current.edges));
  const saveFlowNow = (useBeacon) => {
    const body = { team_id: getTeamId(), mission_id: live.current.missionId, flow: flowPayload(live.current.nodes, live.current.edges) };
    if (useBeacon && navigator.sendBeacon) {
      beacon("/api/save-flow", body);
      return Promise.resolve();
    }
    return fetch("/api/save-flow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
  };
  useEffect(() => {
    const save = async () => {
      if (!autosave.current.ready) return;
      const signature = flowSignature();
      if (signature === autosave.current.signature) return;
      autosave.current.signature = signature;
      const id = live.current.missionId;
      const flow = flowPayload(live.current.nodes, live.current.edges);
      try {
        const res = await saveFlowNow(false);
        if (res && res.ok === false) throw new Error("save failed");
        progressRef.current = { ...progressRef.current, [id]: { ...(progressRef.current[id] || {}), flow } };
      } catch (err) {
        autosave.current.signature = ""; // retry on the next tick
      }
    };
    const interval = setInterval(save, 1500);
    const flush = () => {
      if (!autosave.current.ready || flowSignature() === autosave.current.signature) return;
      autosave.current.signature = flowSignature();
      saveFlowNow(true);
    };
    const onHidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- mission loading ----
  async function loadParticipantProgress() {
    try {
      const res = await API.getProgress(getTeamId());
      if (!res.success) return;
      const state = { ...gamRef.current, attempted: [...gamRef.current.attempted], completed: [...gamRef.current.completed] };
      progressRef.current = res.progress || {};
      setProgress(progressRef.current);
      Object.entries(res.progress || {}).forEach(([id, record]) => {
        const earned = (record.best_credits || 0) > 0 || record.status === "completed";
        if (earned && !state.attempted.includes(id)) state.attempted.push(id);
        const mapped = record.flow && (record.flow.nodes || []).length && (record.flow.edges || []).length;
        if (record.status === "completed" && mapped && !state.completed.includes(id)) state.completed.push(id);
      });
      commitGam(state);
    } catch (err) {
      console.error("Progress load error:", err);
    }
  }

  async function loadMissionData(id) {
    try {
      // Save the mapping of the question being left FIRST, so edits made in the last moments
      // (before the 1.5s autosave tick) are never lost or attached to the next question.
      if (autosave.current.ready) {
        autosave.current.ready = false;
        const prevId = live.current.missionId;
        const flow = flowPayload(live.current.nodes, live.current.edges);
        if (JSON.stringify(flow) !== autosave.current.signature) {
          try { await saveFlowNow(false); } catch (_) { /* best effort */ }
          progressRef.current = { ...progressRef.current, [prevId]: { ...(progressRef.current[prevId] || {}), flow } };
        }
      }
      const res = await API.getMission(id);
      if (!res.success) { autosave.current.ready = true; return; }
      missionIdRef.current = id;
      live.current.missionId = id;
      const level = levelOf(res.mission);
      // The level timer is shared by all questions in a level and restarts only when the
      // participant advances to a different difficulty.
      if (level !== activeTimerLevel.current) {
        activeTimerLevel.current = level;
        timer.setLevel(level);
      }
      const nextTrial = loadTrial(id);
      trialRef.current = nextTrial;
      setTrial(nextTrial);
      const credits = loadEventCredits();
      if (LEVEL_ORDER.includes(level)) {
        if (!credits.enteredLevels.includes(level)) credits.enteredLevels.push(level);
        rewardOnLevelEntry(level, credits);
        saveEventCredits(credits);
      }
      setEventCredits(credits.credits);

      autosave.current.ready = false;
      try { localStorage.setItem(`pyloom-last-mission-${getTeamId()}`, id); } catch (_) { /* ignore */ }
      const saved = progressRef.current[id];
      const restored = (saved?.flow?.nodes || []).map((node, index) => ({
        ...node,
        x: Number.isFinite(node.x) ? node.x : 80 + (index % 2) * 220,
        y: Number.isFinite(node.y) ? node.y : 60 + Math.floor(index / 2) * 140
      }));
      const restoredEdges = saved?.flow?.edges || [];
      autosave.current.signature = JSON.stringify(flowPayload(restored, restoredEdges));
      live.current.nodes = restored;
      live.current.edges = restoredEdges;

      setMissionId(id);
      setMission(res.mission);
      setNodes(restored);
      setEdges(restoredEdges);
      setSelectedNode(null);
      setResult(READY_RESULT);
      setChartSrc("");
      // A previously scored question keeps showing its recorded score.
      const maxCredits = QUESTION_CREDITS[level] || 4;
      setScoring(saved && saved.scoring ? { credits: saved.credits || 0, max: maxCredits, breakdown: saved.scoring } : { ...NO_SCORING, max: maxCredits });
      setEvals({});
      autosave.current.ready = true;
    } catch (err) {
      autosave.current.ready = true;
      console.error("Failed to load mission:", err);
    }
  }

  // ---- boot (runs once after the approval gate) ----
  useEffect(() => {
    (async () => {
      try {
        const data = await API.getMissions();
        const order = { easy: 0, medium: 1, hard: 2 };
        const sorted = (data.missions || []).sort((a, b) => (order[levelOf(a)] ?? 99) - (order[levelOf(b)] ?? 99));
        live.current.missions = sorted;
        setMissions(sorted);
      } catch (err) {
        console.error("Failed to load missions:", err);
      }
      await loadParticipantProgress();
      // Reopen the question the participant was last on.
      const last = localStorage.getItem(`pyloom-last-mission-${getTeamId()}`);
      await loadMissionData(live.current.missions.some((m) => m.id === last) ? last : "easy_1");
      let exited = false;
      try { exited = localStorage.getItem(EXIT_STORAGE_PREFIX + getTeamId()) === "1"; } catch (_) { /* ignore */ }
      if (exited) showExitSlide();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // ---- navigation / gamification ----
  const currentLevel = levelOf(missions.find((m) => m.id === missionId) || mission);
  const questions = useMemo(() => missions.filter((m) => levelOf(m) === currentLevel), [missions, currentLevel]);
  const currentIndex = questions.findIndex((m) => m.id === missionId);
  // Score earned in this level so far (best submitted score per question), out of the level total.
  const levelScore = questions.reduce(
    (sum, m) => sum + Math.min(progress[m.id]?.best_credits || 0, QUESTION_CREDITS[currentLevel] || 0), 0);

  // Green only when solved correctly AND a mapping exists (canvas for the open question, saved record for the others).
  const isComplete = (id) => {
    if (!gam.completed.includes(id)) return false;
    if (id === missionId) return nodes.length > 0 && edges.length > 0;
    const saved = progress[id];
    return !!(saved && saved.status === "completed" && saved.flow && (saved.flow.nodes || []).length && (saved.flow.edges || []).length);
  };
  const questionStatus = (id) => {
    const wrong = ["incorrect_mapping", "wrong_output"].includes(progress[id]?.status);
    return wrong ? "is-wrong" : gam.attempted.includes(id) ? "is-tried" : "is-unattempted";
  };
  const navigateQuestion = (direction) => {
    const next = questions[currentIndex + direction];
    if (next) loadMissionData(next.id);
  };
  // A level opens only after every question of the level before it has been submitted
  // (or that level's timer ran out).
  const levelDone = (level) => {
    const inLevel = live.current.missions.filter((m) => levelOf(m) === level);
    return timedOutLevels.current.has(level) || (inLevel.length > 0 && inLevel.every((m) =>
      (progressRef.current[m.id]?.attempts || 0) > 0 || gamRef.current.completed.includes(m.id)));
  };
  const levelOpen = (level) => {
    const prev = LEVEL_ORDER[LEVEL_ORDER.indexOf(level) - 1];
    return !prev || (levelOpen(prev) && levelDone(prev));
  };
  const onLevelTab = (level) => {
    if (!levelOpen(level)) {
      const prev = LEVEL_ORDER[LEVEL_ORDER.indexOf(level) - 1];
      showToast(`Locked: submit every ${prev} question first to open ${level}.`, "error");
      return;
    }
    const first = missions.find((m) => levelOf(m) === level);
    if (first) loadMissionData(first.id);
  };

  const markMissionAttempted = () => {
    if (live.current.nodes.length && live.current.edges.length && !gamRef.current.attempted.includes(missionIdRef.current)) {
      commitGam({ ...gamRef.current, attempted: [...gamRef.current.attempted, missionIdRef.current] });
    }
  };

  // Finishing every question of a level moves the participant to the next one.
  const maybeAdvanceLevel = () => {
    const level = currentMissionLevel();
    const done = gamRef.current.completed;
    const inLevel = live.current.missions.filter((m) => levelOf(m) === level);
    if (!inLevel.length || !inLevel.every((m) => done.includes(m.id))) return;
    const nextLevel = LEVEL_ORDER[LEVEL_ORDER.indexOf(level) + 1];
    const nextQuestion = nextLevel && live.current.missions.find((m) => levelOf(m) === nextLevel && !done.includes(m.id));
    if (!nextQuestion) return;
    showToast(`${level} level complete! Moving to ${nextLevel}…`, "success");
    setTimeout(() => loadMissionData(nextQuestion.id), 1800);
  };

  const updateGamification = (res) => {
    if (res.progress) setProgressRecord(missionIdRef.current, res.progress);
    const state = { ...gamRef.current, bestScores: { ...gamRef.current.bestScores }, completed: [...gamRef.current.completed] };
    const id = missionIdRef.current;
    const score = res.credits || 0;
    const improvedBy = Math.max(0, score - (state.bestScores[id] || 0));
    if (!improvedBy) return;
    state.bestScores[id] = score;
    const solved = !!res.all_passed && (!res.progress || res.progress.status === "completed");
    const completedNow = solved && live.current.nodes.length > 0 && live.current.edges.length > 0 && !state.completed.includes(id);
    const xpAward = improvedBy * 3 + (completedNow ? 50 : 0);
    state.xp += xpAward;
    if (completedNow) {
      state.completed.push(id);
      state.streak += 1;
      showToast(`Mission complete · +${xpAward} XP`, "success");
    }
    commitGam(state);
    if (completedNow) maybeAdvanceLevel();
  };

  // ---- trials / hints ----
  const consumeMappingTrial = () => {
    const state = { ...trialRef.current };
    if (state.failed < MAX_MAPPING_TRIALS) state.failed += 1;
    commitTrial(state);
    if (state.failed === MAX_MAPPING_TRIALS && !state.hintUsed) {
      showToast("Out of mapping trials. Tap Hint to unlock step-by-step help (3 credits).", "error");
    }
  };

  const hintSteps = useMemo(() => {
    const guide = mission?.guide;
    return guide ? [
      { title: "Input block", text: "Enter the question input (shown in the left panel) into the Input node yourself." },
      ...(guide.mapping || []).map((step, i) => ({ title: `Mapping step ${i + 1}`, text: step })),
      { title: "Output check", text: guide.output }
    ].filter((step) => step.text) : [];
  }, [mission]);
  const revealed = Math.min(trial.hintStep || 0, hintSteps.length);

  const openHint = () => {
    if (!hintSteps.length) {
      showToast("No hint is available for this question.", "error");
      return;
    }
    setHintError("");
    setHintOpen(true);
  };
  const spendCreditsForHint = () => {
    if (loadEventCredits().credits < 3) {
      setHintError("Not enough credits to unlock a hint.");
      return;
    }
    spendEventCredits(3);
    // hintUsed also applies the 3-credit penalty to this question's score
    commitTrial({ ...trialRef.current, hintUsed: true, hintStep: Math.max(trialRef.current.hintStep || 0, 1) });
  };
  const revealNextHintStep = () => {
    if (!trialRef.current.hintUsed) return;
    commitTrial({ ...trialRef.current, hintStep: Math.min((trialRef.current.hintStep || 0) + 1, hintSteps.length) });
  };

  // ---- run / submit ----
  // The four checks are 1 (pass) / 0 (review); the score row shows the credits they earn.
  const applyBreakdownEvals = (breakdown) => {
    setEvals((prev) => {
      const next = { ...prev };
      Object.entries(breakdown || {}).forEach(([key, score]) => {
        if (!["mapping_flow", "logic_building", "sample_output", "output_check"].includes(key)) return;
        const passed = score >= 1;
        next[key] = { status: passed ? "PASS" : "REVIEW", cls: passed ? "pass" : "fail" };
      });
      return next;
    });
  };

  // Run flow only EVALUATES the mapping against the test cases (nothing is recorded);
  // Submit solution is what saves progress, awards the score and updates the leaderboard.
  const handleRunFlow = async () => {
    if (advancing.current) return;
    markMissionAttempted();
    setResult({ text: "Validating and executing graph...", error: false });
    try {
      const res = await API.runFlow(missionIdRef.current, live.current.nodes, live.current.edges, trialRef.current.hintUsed);
      if (!res.success) {
        showToast("mapping flow incorrect", "error");
        setResult({ text: typeof res.error === "string" ? res.error : `[${res.error.type}] ${res.error.message}`, error: true });
        setChartSrc("");
        if (res.denied || res.locked) return;
        consumeMappingTrial();
        return;
      }
      showToast("flow successfully mapped", "success");
      setResult({ text: res.is_chart ? (res.chart_summary || "Chart drawn.") : typeof res.output === "object" ? JSON.stringify(res.output, null, 2) : String(res.output), error: false });
      setChartSrc(res.is_chart ? res.output : "");
      applyBreakdownEvals(res.scoring_breakdown);
      const outputIncorrect = Object.entries(res.scoring_breakdown || {})
        .some(([key, score]) => ["sample_output", "output_check"].includes(key) && score < 1);
      if (outputIncorrect) consumeMappingTrial();
    } catch (err) {
      showToast("mapping flow incorrect", "error");
      setResult({ text: `Client execution error: ${err.message}`, error: true });
    }
  };

  const handleSubmit = async () => {
    try {
      const res = await API.submitSolution(getTeamId(), missionIdRef.current, live.current.nodes, live.current.edges, trialRef.current.hintUsed);
      // Browser alert() dialogs steal focus and drop the page out of full screen (a false
      // violation), so every message here is shown in the page itself.
      if (res.denied || res.locked) {
        setSubmitResult({ failed: true, message: res.error });
        return;
      }
      // The submitted score is recorded on the server (and the leaderboard); show it here.
      setScoring({ credits: res.credits || 0, max: res.mission_credits || 4, breakdown: res.scoring_breakdown || null });
      applyBreakdownEvals(res.scoring_breakdown);
      updateGamification(res);
      await loadParticipantProgress();
      setSubmitResult({ status: res.status, credits: res.credits, max: res.mission_credits ?? 4 });
    } catch (err) {
      setSubmitResult({ failed: true, message: `Submission failed: ${err.message}` });
    }
  };

  // ---- exit flow ----
  async function showExitSlide() {
    exitedRef.current = true;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    setExit({ open: true, view: "final", score: null });
    try {
      const data = await API.getScore(getTeamId());
      if (data.success) setExit({ open: true, view: "final", score: data });
    } catch (err) {
      console.error("Score load error:", err);
    }
  }
  // Log out: the server erases what this participant saved (unless they already exited the
  // event), then this browser forgets them and returns to the login screen.
  const confirmLogout = async () => {
    setLoggingOut(true);
    exitedRef.current = true; // stop heartbeats / violation monitoring
    try { await postJson("/api/participant/leave", { team_id: getTeamId() }); } catch (_) { /* best effort */ }
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (_) { /* ignore */ } }
    wipeLocalParticipantState();
    window.location.reload();
  };
  const finishIntro = async () => {
    try { localStorage.setItem(introKey, "1"); } catch (_) { /* ignore */ }
    setIntro({ step: null, first: false });
    // The agreement click is a user gesture, so full screen can be entered right away.
    if (!document.fullscreenElement) await lock.requestFullscreen();
  };
  const confirmExit = async () => {
    try { await saveFlowNow(false); } catch (_) { /* best effort */ }
    try { localStorage.setItem(EXIT_STORAGE_PREFIX + getTeamId(), "1"); } catch (_) { /* ignore */ }
    showExitSlide();
    beacon("/api/participant/exit", { team_id: getTeamId() });
  };

  return (
    <>
      <LockOverlay show={lock.needsOverlay} violation={lock.violation} superseded={lock.superseded} onEnterFullscreen={lock.requestFullscreen} />
      <ExitOverlay
        open={exit.open}
        view={exit.view}
        score={exit.score}
        onCancel={() => setExit((e) => ({ ...e, open: false }))}
        onConfirm={confirmExit}
        onLogout={confirmLogout}
      />

      <HeaderBar
        timer={timer}
        scoreCredits={scoring.credits}
        scoreMax={scoring.max}
        levelScore={levelScore}
        levelMax={LEVEL_SCORE[currentLevel] || 0}
        levelName={currentLevel[0].toUpperCase() + currentLevel.slice(1)}
        eventCredits={eventCredits}
        player={player}
        onExitEvent={() => setExit({ open: true, view: "confirm", score: null })}
        onLogout={() => setLogoutOpen(true)}
        onInstructions={() => setIntro({ step: "instructions", first: false })}
      />

      <main className="app-container app-gated">
        <ModuleSidebar missionInput={mission?.input} onTapAdd={onTapAdd} />
        <Canvas
          wrapperRef={wrapperRef}
          nodes={nodes}
          edges={edges}
          selectedNode={selectedNode}
          view={view}
          viewRef={viewRef}
          setView={setView}
          onDropType={onDropType}
          onSelect={onSelect}
          onMoveNode={onMoveNode}
          onDeleteNode={onDeleteNode}
          onConfig={onConfig}
          onConnect={onConnect}
          onDeleteEdge={onDeleteEdge}
          onAutoLayout={onAutoLayout}
        />
        <RightPanel
          mission={mission}
          currentLevel={currentLevel}
          questions={questions}
          missionId={missionId}
          currentIndex={currentIndex}
          isComplete={isComplete}
          questionStatus={questionStatus}
          evals={evals}
          scoring={scoring}
          result={result}
          chartSrc={chartSrc}
          gam={gam}
          totalMissions={missions.length}
          onHint={openHint}
          onLevelTab={onLevelTab}
          levelOpen={levelOpen}
          onSelectQuestion={loadMissionData}
          onNavigate={navigateQuestion}
          onExit={() => setExit({ open: true, view: "confirm", score: null })}
        />
      </main>

      <Footer
        trialsLeft={Math.max(0, MAX_MAPPING_TRIALS - trial.failed)}
        maxTrials={MAX_MAPPING_TRIALS}
        locked={Boolean(lockReason)}
        onClear={resetCanvasState}
        onRun={handleRunFlow}
        onSubmit={handleSubmit}
      />

      <div id="mapping-toast" className={`mapping-toast${toast.visible ? ` is-visible is-${toast.type}` : toast.type ? ` is-${toast.type}` : ""}`} role="status" aria-live="polite" aria-atomic="true">{toast.message}</div>

      <InstructionsModal
        open={intro.step === "instructions"}
        first={intro.first}
        onNext={() => setIntro((s) => ({ ...s, step: "rules" }))}
        onClose={() => setIntro({ step: null, first: false })}
      />
      <RulesModal
        open={intro.step === "rules"}
        first={intro.first}
        onBack={() => setIntro((s) => ({ ...s, step: "instructions" }))}
        onAgree={finishIntro}
        onClose={() => setIntro({ step: null, first: false })}
      />

      <TimeAlertModal alert={timeAlert} onClose={() => setTimeAlert(null)} />

      <LogoutModal open={logoutOpen} busy={loggingOut} onCancel={() => setLogoutOpen(false)} onConfirm={confirmLogout} />

      <SubmitResultModal result={submitResult} onClose={() => setSubmitResult(null)} />

      <HintModal
        open={hintOpen}
        paid={Boolean(trial.hintUsed)}
        steps={hintSteps}
        revealed={revealed}
        credits={eventCredits}
        error={hintError}
        onClose={() => setHintOpen(false)}
        onSpend={spendCreditsForHint}
        onNext={revealNextHintStep}
      />
    </>
  );
}
