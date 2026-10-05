import { useCallback, useEffect, useRef, useState } from "react";
import ThemeToggle from "../components/ThemeToggle";
import Avatar from "../components/Avatar";
import { postJson } from "../lib/api";

const formatClock = (seconds) => {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};
const LIVE_POLL_INTERVAL_MS = 3000;
const EMPTY_SUMMARY = { participants: { canvas: 0, active: 0, pending: 0 }, levels: {}, questions: {}, participant_records: [] };

function AdminLogin({ onSignedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const result = await (await postJson("/api/admin/login", { username, password })).json();
    if (!result.success) {
      setError(result.error || "Unable to sign in.");
      return;
    }
    onSignedIn();
  };

  return (
    <section className="admin-login" id="admin-login" aria-labelledby="admin-login-title">
      <div className="admin-login-card">
        <div className="brand-name">PYLOOM</div>
        <h1 id="admin-login-title">Admin sign in</h1>
        <p>Sign in to read submissions and manage participant access.</p>
        <form id="admin-login-form" onSubmit={submit}>
          <label htmlFor="admin-username">Username</label>
          <input id="admin-username" type="text" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} />
          <label htmlFor="admin-password">Password</label>
          <input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="btn btn-primary">Open admin panel</button>
          <div id="admin-login-error" className="admin-login-error" role="alert">{error}</div>
        </form>
      </div>
    </section>
  );
}

// A participant row in "Participant access": Activate / Deactivate / Delete with in-flight state.
function ParticipantRow({ record, onChanged, onRemoved }) {
  const [busy, setBusy] = useState("");
  const teamId = record.team_id;
  const act = async (action) => {
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/participants/${encodeURIComponent(teamId)}/${action}`, { method: "POST" });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Failed");
    } catch (err) {
      setBusy(`${action}-failed`);
      return;
    }
    setBusy("");
    onChanged();
  };
  const unlock = async () => {
    setBusy("unlock");
    try {
      const res = await postJson(`/api/admin/participants/${encodeURIComponent(teamId)}/fullscreen`, { action: "enable" });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Failed");
    } catch (err) { /* shown again on the next poll */ }
    setBusy("");
    onChanged();
  };
  // Delete is two clicks on the button itself (no modal dialog): the second click must come within 4s.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const retry = () => act("retry");
  const remove = async () => {
    if (!armed) { setArmed(true); return; }
    setArmed(false);
    setBusy("delete");
    try {
      const res = await fetch(`/api/admin/participants/${encodeURIComponent(teamId)}`, { method: "DELETE" });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Failed");
    } catch (err) {
      setBusy("delete-failed");
      return;
    }
    setBusy("");
    onRemoved(teamId);
    onChanged();
  };

  return (
    <div className="participant-row">
      <Avatar file={record.avatar} name={record.player_name} size={26} />
      <span title={record.members?.length ? `Members: ${record.members.join(", ")}` : undefined}>{teamId}{record.player_name ? ` — ${record.player_name}` : ""}{record.mode === "team" ? ` (team: ${(record.members || []).join(", ")})` : ""}</span>
      {record.violation && (
        <>
          <span className="status-badge status-rejected" title={record.violation.reason}>FULL SCREEN VIOLATION</span>
          <button type="button" className="btn btn-secondary" disabled={busy === "unlock"} onClick={unlock}>
            {busy === "unlock" ? "Unlocking…" : "Unlock"}
          </button>
        </>
      )}
      {record.status === "pending" ? (
        <button type="button" className="btn btn-primary allow-participant" disabled={busy === "allow"} onClick={() => act("allow")}>
          {busy === "allow" ? "Activating…" : busy === "allow-failed" ? "Retry" : "Activate"}
        </button>
      ) : (
        <>
          <span className={`status-badge ${record.online ? "status-accepted" : "status-rejected"}`}>{record.online ? "ACTIVE" : "INACTIVE"}</span>
          <button type="button" className="btn btn-secondary allow-participant" disabled={busy === "revoke"} onClick={() => act("revoke")}>
            {busy === "revoke" ? "Deactivating…" : busy === "revoke-failed" ? "Retry" : "Deactivate"}
          </button>
        </>
      )}
      <button type="button" className="btn btn-secondary retry-participant" disabled={busy === "retry"} onClick={retry} title="Erase this player's answers, scores and trials so they can start again (they stay logged in)">
        {busy === "retry" ? "Resetting…" : busy === "retry-failed" ? "Retry failed – try again" : "Reset for retry"}
      </button>
      <button type="button" className="btn btn-danger delete-participant" disabled={busy === "delete"} onClick={remove}>
        {busy === "delete" ? "Deleting…" : busy === "delete-failed" ? "Retry delete" : armed ? "Click again to delete" : "Delete"}
      </button>
    </div>
  );
}

function Dashboard({ onSignedOut }) {
  const [data, setData] = useState(null);
  const [timerMsg, setTimerMsg] = useState("");
  const [lockMsg, setLockMsg] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [, force] = useState(0);
  const [alerts, setAlerts] = useState([]);
  // Deleted participants disappear from the lists immediately (no waiting for the next poll).
  const [removedIds, setRemovedIds] = useState([]);
  const onRemoved = useCallback((teamId) => setRemovedIds((ids) => [...ids, teamId]), []);
  const seenViolations = useRef(new Set());
  const inFlight = useRef(false);
  const timerBase = useRef({ timer: null, at: 0 });

  const pollLive = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/admin/live");
      if (res.status === 401) {
        // Session ended (signed out or another admin took over): back to sign-in.
        onSignedOut();
        return;
      }
      const next = await res.json();
      if (!next.success) return;
      timerBase.current = { timer: next.timer, at: performance.now() };
      setData(next);
    } catch (err) {
      console.error("Live poll error:", err);
    } finally {
      inFlight.current = false;
    }
  }, [onSignedOut]);

  // One round trip per tick for the whole dashboard; paused while the tab is hidden.
  useEffect(() => {
    pollLive();
    const poll = setInterval(() => { if (document.visibilityState === "visible") pollLive(); }, LIVE_POLL_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") pollLive(); };
    document.addEventListener("visibilitychange", onVisible);
    // Smooth countdown between polls.
    const tick = setInterval(() => force((n) => n + 1), 250);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollLive]);

  // Notify the admin of every new full-screen violation (also from inactive / offline players).
  useEffect(() => {
    const violations = data?.violations || {};
    const fresh = [];
    Object.entries(violations).forEach(([teamId, v]) => {
      const key = `${teamId}:${v.time}`;
      if (!seenViolations.current.has(key)) {
        seenViolations.current.add(key);
        const player = (data.summary?.participant_records || []).find((p) => p.team_id === teamId);
        fresh.push({ key, teamId, name: player?.player_name, reason: v.reason, offline: player ? !player.online : false });
      }
    });
    setAlerts((current) => {
      // Alerts disappear once the violation is released/cleared on the server.
      const kept = current.filter((a) => violations[a.teamId] && `${a.teamId}:${violations[a.teamId].time}` === a.key);
      return fresh.length || kept.length !== current.length ? [...kept, ...fresh] : current;
    });
    if (fresh.length) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.frequency.value = 880;
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } catch (_) { /* sound is optional */ }
    }
  }, [data]);

  useEffect(() => {
    const listed = new Set((data?.summary?.participant_records || []).map((p) => p.team_id));
    setRemovedIds((ids) => (ids.some((id) => !listed.has(id)) ? ids.filter((id) => listed.has(id)) : ids));
  }, [data]);

  useEffect(() => {
    document.title = alerts.length ? `(${alerts.length}) Violation - PYLOOM Admin` : "PYLOOM Admin";
  }, [alerts.length]);

  const controlTimer = async (timer, action) => {
    try {
      const result = await (await postJson("/api/admin/timer/control", { timer, action })).json();
      if (!result.success) throw new Error(result.error || "Timer update failed");
      timerBase.current = { timer: result.timer, at: performance.now() };
      setData((d) => (d ? { ...d, timer: result.timer } : d));
      const label = action === "restart" ? "restarted" : `${action}${action.endsWith("e") ? "d" : "ed"}`;
      setTimerMsg(action === "start" ? "Both timers started." : `${timer === "main" ? "Main timer" : timer === "level" ? "Level timer" : "Both timers"} ${label}.`);
    } catch (error) {
      setTimerMsg(error.message);
    }
  };

  const controlParticipantLock = useCallback(async (action) => {
    try {
      const result = await (await postJson("/api/admin/participant-control", { action })).json();
      if (!result.success) throw new Error(result.error || "Participant control failed");
      setData((d) => (d ? { ...d, timer: { ...d.timer, participant_lock_enabled: result.participant_lock_enabled, participant_violation: false } } : d));
      setLockMsg(action === "enable" ? "Participant full screen enabled." : "Participant full screen released.");
    } catch (error) {
      setLockMsg(error.message);
    }
  }, []);

  // Shortcuts: Ctrl+D enable, Ctrl+R release.
  useEffect(() => {
    const onKey = (event) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "d" || key === "r") {
        event.preventDefault();
        controlParticipantLock(key === "d" ? "enable" : "release");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [controlParticipantLock]);

  const resetQuestions = async () => {
    if (!window.confirm("Reset ALL progress and submissions for every team? This cannot be undone.")) return;
    try {
      const result = await (await fetch("/api/admin/reset-questions", { method: "POST" })).json();
      if (!result.success) throw new Error(result.error || "Reset failed");
      setResetMsg("All progress and submissions cleared.");
    } catch (error) {
      setResetMsg(error.message);
    }
  };

  const deleteAllUsers = async () => {
    if (!window.confirm("Delete ALL users and their progress, scores and submissions? Use this when the event is complete. This cannot be undone.")) return;
    if (!window.confirm("Are you sure? Every participant will be logged out and the leaderboard will be cleared.")) return;
    try {
      const result = await (await postJson("/api/admin/delete-all-users", {})).json();
      if (!result.success) throw new Error(result.error || "Delete failed");
      setResetMsg(`Event complete: ${result.deleted} user(s) and all their progress deleted.`);
      pollLive();
    } catch (error) {
      setResetMsg(error.message);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    onSignedOut(true);
  };

  // Terminate is two clicks (no modal dialog): the second must come within 4s.
  const [termArmed, setTermArmed] = useState("");
  useEffect(() => {
    if (!termArmed) return undefined;
    const t = setTimeout(() => setTermArmed(""), 4000);
    return () => clearTimeout(t);
  }, [termArmed]);
  const onlineAction = async (event, p, kill) => {
    if (kill) {
      if (termArmed !== p.team_id) { setTermArmed(p.team_id); return; }
      setTermArmed("");
    }
    const url = `/api/admin/participants/${encodeURIComponent(p.team_id)}`;
    event.currentTarget.disabled = true;
    try {
      const res = kill
        ? await fetch(url, { method: "DELETE" })
        : await postJson(`${url}/fullscreen`, { action: p.forced_fullscreen ? "release" : "enable" });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Failed");
      if (kill) onRemoved(p.team_id);
    } catch (err) {
      setLockMsg(err.message);
    }
    pollLive();
  };

  const summary = data?.summary || EMPTY_SUMMARY;
  const gone = (id) => removedIds.includes(id);
  const timer = data?.timer;
  const online = (data?.online_participants || []).filter((p) => !gone(p.team_id));
  const leaderboard = data?.leaderboard?.filter((row) => !gone(row.player_id));
  const submissions = data?.submissions || [];

  // Timer readouts
  const started = Boolean(timer?.started);
  const allPaused = Boolean(timer?.main_paused && timer?.level_paused);
  const elapsed = timer && started ? (performance.now() - timerBase.current.at) / 1000 : 0;
  const mainShown = timer ? (timer.main_paused ? timer.main_remaining_seconds : Math.max(0, timer.main_remaining_seconds - elapsed)) : 45 * 60;
  const levelShown = timer ? (timer.level_paused || !started ? timer.level_run_seconds : timer.level_run_seconds + elapsed) : 0;
  const stateLabel = (paused) => (!started ? "Not started" : paused ? "Paused" : "Running");
  const violation = Boolean(timer?.participant_violation);
  const lockOn = Boolean(timer?.participant_lock_enabled);

  const records = [...(summary.participant_records || [])].filter((p) => !gone(p.team_id)).sort((a, b) => {
    const rank = (p) => (p.status === "pending" ? 0 : p.online ? 1 : 2);
    return rank(a) - rank(b);
  });

  return (
    <div className="admin-container" id="admin-dashboard">
      <div className="admin-header">
        <div>
          <h1>Competition monitor</h1>
          <p>Live team submissions and credit audit for PYLOOM missions.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="btn btn-secondary" id="admin-logout-btn" onClick={logout}>Log out</button>
          <ThemeToggle />
          <a href="/" className="btn btn-secondary">← Back to editor</a>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="admin-alerts" role="alert" style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {alerts.map((a) => (
            <div key={a.key} className="table-card" style={{ borderColor: "#ff0072", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px" }}>
              <span>
                <strong>⚠ Full screen violation:</strong> {a.teamId}{a.name ? ` (${a.name})` : ""} — {a.reason}
                {a.offline ? " · participant is now inactive/offline" : ""}
              </span>
              <button type="button" className="btn btn-secondary" onClick={() => setAlerts((list) => list.filter((x) => x.key !== a.key))}>Dismiss</button>
            </div>
          ))}
        </div>
      )}

      <div className="stats-row">
        <div className="stat-card"><div className="stat-val" id="stat-online">{online.length}</div><div className="stat-lbl">Online now</div></div>
        <div className="stat-card"><div className="stat-val" id="stat-submitted">{data?.total_submissions ?? submissions.length}</div><div className="stat-lbl">Total submissions received</div></div>
      </div>

      <div className="table-card admin-timer-card">
        <div className="admin-timer-heading">
          <div>
            <h3>Timer control</h3>
            <p>Start and pause both timers here. The main timer (45 min) and the level timer (Easy 20, Medium 15, Hard 10 min) are shared: every participant sees the same time, and logging out or back in never changes it. Use Restart level timer to give everyone a fresh clock for the next level.</p>
          </div>
          <span id="timer-status" className={`status-badge ${started && !allPaused ? "status-accepted" : "status-rejected"}`}>
            {!started ? "Not started" : allPaused ? "Both paused" : "Running"}
          </span>
        </div>
        <div className="admin-timer-readouts">
          <div><span>Main timer</span><strong id="admin-main-timer">{formatClock(mainShown)}</strong><small id="admin-main-status">{stateLabel(timer?.main_paused)}</small></div>
          <div><span>Level clock</span><strong id="admin-level-timer">{formatClock(Math.floor(levelShown))}</strong><small id="admin-level-status">{stateLabel(timer?.level_paused)}</small></div>
        </div>
        <div className="admin-timer-actions">
          <button type="button" className="btn btn-primary" id="start-timers-btn" onClick={() => controlTimer("both", "start")}>{started ? "Restart both timers" : "Start both timers"}</button>
          <button type="button" className="btn btn-secondary" id="pause-both-timers-btn" disabled={!started || (timer.main_paused && timer.level_paused)} onClick={() => controlTimer("both", "pause")}>Pause both timers</button>
          <button type="button" className="btn btn-primary" id="resume-both-timers-btn" disabled={!started || (!timer.main_paused && !timer.level_paused)} onClick={() => controlTimer("both", "resume")}>Resume both timers</button>
          <button type="button" className="btn btn-secondary" id="pause-main-timer-btn" disabled={!started || timer.main_paused} onClick={() => controlTimer("main", "pause")}>Pause main timer</button>
          <button type="button" className="btn btn-primary" id="resume-main-timer-btn" disabled={!started || !timer.main_paused} onClick={() => controlTimer("main", "resume")}>Resume main timer</button>
          <button type="button" className="btn btn-secondary" id="pause-level-timer-btn" disabled={!started || timer.level_paused} onClick={() => controlTimer("level", "pause")}>Pause level timer</button>
          <button type="button" className="btn btn-primary" id="resume-level-timer-btn" disabled={!started || !timer.level_paused} onClick={() => controlTimer("level", "resume")}>Resume level timer</button>
          <button type="button" className="btn btn-secondary" id="restart-level-timer-btn" disabled={!started} onClick={() => controlTimer("level", "restart")}>Restart level timer</button>
        </div>
        <div id="timer-control-message" className="admin-login-error" role="status">{timerMsg}</div>
      </div>

      <div className="table-card admin-timer-card">
        <div className="admin-timer-heading">
          <div>
            <h3>Participant full screen</h3>
            <p>Strict mode is always on: every participant must stay in full screen on the canvas (leaving full screen, switching tabs or windows, or a split screen locks their session and alerts you here). Use Unlock on a participant to let them continue; Ctrl+R unlocks everyone.</p>
          </div>
          <span id="participant-lock-status" className={`status-badge ${violation ? "status-rejected" : lockOn ? "status-accepted" : "status-rejected"}`}>
            {violation ? "VIOLATION" : lockOn ? "Full screen ON" : "Released"}
          </span>
        </div>
        <div className="admin-timer-actions">
          <button type="button" className="btn btn-primary" id="enable-participant-lock-btn" disabled={violation ? false : lockOn} onClick={() => controlParticipantLock("enable")}>Full screen ON</button>
          <button type="button" className="btn btn-secondary" id="release-participant-lock-btn" disabled={violation ? false : !lockOn} onClick={() => controlParticipantLock("release")}>Release</button>
        </div>
        <div id="participant-lock-message" className="admin-login-error" role="status">{lockMsg}</div>
      </div>

      <div className="admin-timer-actions">
        <button type="button" className="btn btn-danger" id="reset-questions-btn" onClick={resetQuestions}>Reset questions (clear progress &amp; submissions)</button>
        <button type="button" className="btn btn-danger" id="delete-all-users-btn" onClick={deleteAllUsers}>Delete all users (event complete)</button>
        <span id="reset-questions-message" className="admin-login-error" role="status">{resetMsg}</span>
      </div>

      <div className="admin-section-grid">
        <div className="table-card">
          <h3>Participant access</h3>
          <p style={{ color: "var(--text-dim)", marginTop: -4 }}>Players appear here when they log in to the participant console. Click Activate to let them in; Deactivate sends them back to waiting.</p>
          <div className="metric-list">
            <div><span>Participants (solo or team)</span><strong id="stat-canvas">{summary.participants.canvas} / {summary.participants.max ?? 50}</strong></div>
            <div><span>Active participants</span><strong id="stat-active">{summary.participants.active}</strong></div>
            <div><span>Pending participants</span><strong id="stat-pending">{summary.participants.pending}</strong></div>
          </div>
          <div id="participant-list" className="participant-list">
            {records.length
              ? records.map((p) => <ParticipantRow key={p.team_id} record={p} onChanged={pollLive} onRemoved={onRemoved} />)
              : <div className="participant-row"><span style={{ color: "var(--text-dim)" }}>No players have logged in yet.</span></div>}
          </div>
        </div>

        <div className="table-card">
          <h3>Levels</h3>
          <div className="level-grid">
            {["easy", "medium", "hard"].map((level) => {
              const info = summary.levels[level] || { completed: 0, total: 0 };
              return (
                <div className="level-card" data-level={level} key={level}>
                  <strong>{level[0].toUpperCase() + level.slice(1)}</strong>
                  <span id={`level-${level}`}>{info.completed} completed / {info.total} questions</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="table-card question-summary-card">
        <h3>Question progress</h3>
        <div className="question-grid">
          {[["completed", "Successfully completed"], ["tried", "Tried"], ["wrong", "Wrong"], ["incomplete", "Incomplete"]].map(([key, label]) => (
            <div key={key}><strong id={`questions-${key}`}>{summary.questions[key] ?? 0}</strong><span>{label}</span></div>
          ))}
        </div>
      </div>

      <div className="table-card">
        <h3>Live active participants</h3>
        <p style={{ color: "var(--text-dim)", marginTop: -4 }}>Participants currently logged in with the console open.</p>
        <table className="admin-table">
          <thead><tr><th>Player ID</th><th>Player name</th><th>College</th><th>Current question</th><th>Full screen</th><th>Last seen</th><th>Actions</th></tr></thead>
          <tbody id="online-tbody">
            {online.length ? online.map((p) => (
              <tr key={p.team_id}>
                <td className="cell-team"><Avatar file={p.avatar} name={p.player_name} size={24} /> {p.team_id}</td>
                <td>{p.player_name}</td>
                <td>{p.college}</td>
                <td>{p.mission}</td>
                <td>
                  <span className={`status-badge ${p.fullscreen && !p.violation ? "status-accepted" : "status-rejected"}`} title={p.violation?.reason}>
                    {p.violation ? "VIOLATION" : p.fullscreen ? "FULL SCREEN" : "NOT FULL SCREEN"}
                  </span>
                </td>
                <td><span className="status-badge status-accepted">ONLINE</span> {p.seconds_since_seen}s ago</td>
                <td className="cell-actions">
                  <button type="button" className="btn btn-secondary online-fullscreen" onClick={(e) => onlineAction(e, p, false)}>{p.violation ? "Unlock session" : p.forced_fullscreen ? "Release full screen" : "Full screen"}</button>
                  <button type="button" className="btn btn-danger online-terminate" onClick={(e) => onlineAction(e, p, true)}>{termArmed === p.team_id ? "Click again to terminate" : "Terminate"}</button>
                </td>
              </tr>
            )) : <tr><td colSpan="7" style={{ color: "var(--text-dim)", textAlign: "center" }}>No participants online.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="table-card">
        <h3>Participant leaderboard</h3>
        <p style={{ color: "var(--text-dim)", marginTop: -4 }}>Admin-only ranking of every participant by total score.</p>
        <table className="admin-table">
          <thead><tr><th>Rank</th><th>Player ID / Team code</th><th>Player / Team name</th><th>College</th><th>Year of study</th><th>Score</th></tr></thead>
          <tbody id="leaderboard-tbody">
            {!leaderboard ? (
              <tr><td colSpan="7" style={{ color: "var(--text-dim)", textAlign: "center" }}>Loading leaderboard…</td></tr>
            ) : !leaderboard.length ? (
              <tr><td colSpan="7" style={{ color: "var(--text-dim)", textAlign: "center" }}>No participants yet.</td></tr>
            ) : leaderboard.map((row) => (
              <tr key={row.player_id} className={row.rank <= 3 ? `leaderboard-row-rank-${row.rank}` : ""}>
                <td><span className={`rank-badge${row.rank <= 3 ? ` rank-badge-${row.rank}` : ""}`}>{row.rank}</span></td>
                <td className="cell-team"><Avatar file={row.avatar} name={row.player_name} size={24} /> {row.player_id}</td>
                <td>{row.player_name}{row.mode === "team" && row.members?.length ? <small style={{ display: "block", color: "var(--text-dim)" }}>{row.members.join(", ")}</small> : null}</td>
                <td>{row.college}</td>
                <td>{row.year_of_study}</td>
                <td className="cell-credits">{row.score} / {row.max_score ?? 100}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-card">
        <h3>Live submissions log</h3>
        <table className="admin-table">
          <thead><tr><th>Team ID</th><th>Mission</th><th>Round</th><th>Credits</th><th>Status</th></tr></thead>
          <tbody id="submissions-tbody">
            {!data ? (
              <tr><td colSpan="5" style={{ color: "var(--text-dim)", textAlign: "center" }}>Loading submissions…</td></tr>
            ) : !submissions.length ? (
              <tr><td colSpan="5" style={{ color: "var(--text-dim)", textAlign: "center" }}>No submissions recorded yet.</td></tr>
            ) : submissions.map((s, i) => (
              <tr key={i}>
                <td className="cell-team">{s.team_id}</td>
                <td>{s.mission_title}</td>
                <td>Round {s.round}</td>
                <td className="cell-credits">{s.credits} / {s.mission_credits ?? 4}</td>
                <td><span className={`status-badge status-${s.status}`}>{s.status.toUpperCase()}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    document.body.classList.add("admin-page");
    document.title = "PYLOOM Admin";
    fetch("/api/admin/session").then((r) => r.json()).then((result) => { if (result.authenticated) setSignedIn(true); });
    return () => document.body.classList.remove("admin-page");
  }, []);

  const onSignedOut = useCallback(() => setSignedIn(false), []);
  return signedIn ? <Dashboard onSignedOut={onSignedOut} /> : <AdminLogin onSignedIn={() => setSignedIn(true)} />;
}
