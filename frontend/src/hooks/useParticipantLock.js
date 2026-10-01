import { useCallback, useEffect, useRef, useState } from "react";
import { getTeamId, forceParticipantLogout } from "../lib/player";
import { beacon, postJson } from "../lib/api";

// Identifies this tab/window. The newest console opened for a participant wins; older ones are
// told they were superseded by the server.
const SESSION_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
const SESSION_STARTED = Date.now();

/**
 * Strict participant mode. Once the participant has entered full screen, leaving it, switching
 * tab/window, splitting the screen or losing focus locks THEIR session (reported to the admin)
 * until the admin unlocks it. Only one console per participant can be open at a time. Nobody
 * else is affected.
 *
 * `getMissionId` returns the open question (reported in the heartbeat); `exitedRef.current`
 * switches the restrictions off once the participant has left the event.
 */
export function useParticipantLock({ active, getMissionId, exitedRef, onRevoked }) {
  const onRevokedRef = useRef(onRevoked);
  onRevokedRef.current = onRevoked;
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const r = useRef({
    violation: false, superseded: false, armed: false,
    reported: false, reportedAt: 0, transitionUntil: 0
  }).current;
  const getMissionIdRef = useRef(getMissionId);
  getMissionIdRef.current = getMissionId;

  const setViolation = useCallback((violation) => {
    r.violation = Boolean(violation);
    if (!r.violation) {
      r.reported = false;
      r.armed = Boolean(document.fullscreenElement);
    }
    rerender();
  }, [rerender, r]);

  const monitor = useCallback(() => {
    if (exitedRef.current || r.superseded || r.violation) return;
    // Armed only after the participant has been in full screen once (so the entry prompt itself is never a violation).
    if (!r.armed) return;
    if (Date.now() < r.transitionUntil) return;
    const changed = document.visibilityState === "hidden" || !document.fullscreenElement || !document.hasFocus();
    if (!changed || r.reported) return;
    r.reported = true;
    r.reportedAt = Date.now();
    r.violation = true;
    rerender();
    // keepalive: still delivered when the participant has switched away / is going inactive.
    postJson("/api/participant/lock-violation", {
      team_id: getTeamId(),
      reason: document.visibilityState === "hidden"
        ? "Participant switched tab or window"
        : !document.fullscreenElement ? "Participant exited browser full screen" : "Participant left the canvas window (split screen / other window)"
    }, { keepalive: true }).catch(() => {});
  }, [exitedRef, rerender, r]);

  useEffect(() => {
    if (!active) return undefined;
    if (document.fullscreenElement) r.armed = true;
    const onFullscreen = () => {
      if (document.fullscreenElement) r.armed = true;
      monitor();
      rerender();
    };
    const onVisibility = () => { monitor(); rerender(); };
    const block = (e) => {
      if (exitedRef.current) return;
      const key = (e.key || "").toLowerCase();
      // Best-effort: no dev tools / view-source / print / save shortcuts while taking part.
      if (key === "f12" || (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(key)) || (e.ctrlKey && ["u", "s", "p"].includes(key))) {
        e.preventDefault();
      }
    };
    const noMenu = (e) => { if (!exitedRef.current) e.preventDefault(); };
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", monitor);
    window.addEventListener("resize", monitor);
    window.addEventListener("focus", rerender);
    document.addEventListener("keydown", block, true);
    document.addEventListener("contextmenu", noMenu);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", monitor);
      window.removeEventListener("resize", monitor);
      window.removeEventListener("focus", rerender);
      document.removeEventListener("keydown", block, true);
      document.removeEventListener("contextmenu", noMenu);
    };
  }, [active, exitedRef, monitor, rerender, r]);

  // Heartbeat: tells the server this participant is online (and on which question), keeps the
  // single-session rule, and brings back this participant's own lock state.
  useEffect(() => {
    if (!active) return undefined;
    const applyAdminReset = (serverEpoch) => {
      if (serverEpoch === undefined) return;
      const EPOCH_KEY = "pyloom-reset-epoch";
      try {
        const seen = localStorage.getItem(EPOCH_KEY) || "0";
        if (seen === String(serverEpoch)) return;
        const keep = new Set(["pyloom-player", "pyloom-color-mode", EPOCH_KEY]);
        Object.keys(localStorage)
          .filter((k) => k.startsWith("pyloom-") && !keep.has(k))
          .forEach((k) => localStorage.removeItem(k));
        localStorage.setItem(EPOCH_KEY, String(serverEpoch));
        location.reload();
      } catch (_) { /* ignore */ }
    };
    const beat = () => {
      if (exitedRef.current) return;
      postJson("/api/participant/heartbeat", {
        team_id: getTeamId(),
        mission_id: getMissionIdRef.current() || "",
        visible: document.visibilityState === "visible",
        fullscreen: Boolean(document.fullscreenElement),
        armed: r.armed,
        session_id: SESSION_ID,
        session_started: SESSION_STARTED
      }).then(async (res) => {
        const result = await res.json().catch(() => ({}));
        if (res.status === 403) {
          if (result.removed) forceParticipantLogout("This participant was removed by the admin.");
          // Admin deactivated this participant while they are on the canvas: back to the approval gate.
          else onRevokedRef.current?.();
          return;
        }
        applyAdminReset(result.reset_epoch);
        const superseded = Boolean(result.superseded);
        if (superseded !== r.superseded) { r.superseded = superseded; rerender(); }
        if (superseded) return;
        if (result.violation !== undefined && Boolean(result.violation) !== r.violation) {
          // Ignore a "no violation" answer that raced our own just-sent report.
          if (!result.violation && Date.now() - r.reportedAt < 4000) return;
          setViolation(Boolean(result.violation));
        }
      }).catch(() => {});
    };
    let interval;
    // Staggered start + 6s cadence so a room of participants doesn't hit the server in lock-step.
    const start = setTimeout(() => { beat(); interval = setInterval(beat, 6000); }, Math.random() * 3000);
    const onPageHide = () => beacon("/api/participant/logout", { team_id: getTeamId() });
    document.addEventListener("fullscreenchange", beat);
    document.addEventListener("visibilitychange", beat);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
      document.removeEventListener("fullscreenchange", beat);
      document.removeEventListener("visibilitychange", beat);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [active, exitedRef, rerender, setViolation, r]);

  const requestFullscreen = useCallback(async () => {
    r.transitionUntil = Date.now() + 1500;
    try {
      await document.documentElement.requestFullscreen();
      r.armed = true;
    } catch (error) {
      console.warn("Fullscreen permission was not granted:", error);
    }
    rerender();
  }, [rerender, r]);

  const exited = exitedRef.current;
  const needsOverlay = !exited && (r.superseded || r.violation || (!document.fullscreenElement && document.visibilityState === "visible"));
  return { violation: r.violation, superseded: r.superseded, needsOverlay, requestFullscreen };
}
