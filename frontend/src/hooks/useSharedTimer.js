import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTeamId } from "../lib/player";

export function formatTimer(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * Shared timer client. The Flask server is authoritative; the browser only renders its
 * state. Between polls the display counts down from the local clock, and a fresh poll only
 * corrects drift (> 1.5s) or a run/pause change, so the digits never jump.
 *
 * handlers: { onLevelExpired, onMainExpired, onLockChange(enabled) } (always the latest ones).
 */
export function useSharedTimer(handlers) {
  const listeners = useRef(new Set());
  const notify = useCallback(() => listeners.current.forEach((fn) => fn()), []);
  const stateRef = useRef(null);
  const baseAtRef = useRef(0);
  const levelRef = useRef(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const displayed = useCallback(() => {
    const t = stateRef.current;
    if (!t) return null;
    const elapsed = t.started ? Math.max(0, (performance.now() - baseAtRef.current) / 1000) : 0;
    return {
      main: t.main_paused ? t.main_remaining_seconds : Math.max(0, t.main_remaining_seconds - elapsed),
      level: t.level_paused || !t.level_entered ? t.level_remaining_seconds : Math.max(0, t.level_remaining_seconds - elapsed)
    };
  }, []);

  // `observedAt` is when the server computed `next` (midpoint of the request), so a slow
  // response (e.g. while the server is busy running a flow) doesn't make the clock jump back.
  const apply = useCallback((next, observedAt) => {
    const previous = stateRef.current;
    const now = performance.now();
    const age = Math.max(0, (now - observedAt) / 1000);
    // What the server's numbers are worth right now.
    const mainNow = next.main_paused || !next.started ? next.main_remaining_seconds : Math.max(0, next.main_remaining_seconds - age);
    const levelNow = next.level_paused || !next.level_entered || !next.started ? next.level_remaining_seconds : Math.max(0, next.level_remaining_seconds - age);
    let keepBase = false;
    if (previous && previous.started === next.started && previous.main_paused === next.main_paused &&
        previous.level_paused === next.level_paused && previous.level_entered === next.level_entered &&
        previous.level_total_seconds === next.level_total_seconds) {
      const shown = displayed();
      keepBase = Math.abs(shown.main - mainNow) < 1.5 && Math.abs(shown.level - levelNow) < 1.5;
    }
    if (keepBase) {
      stateRef.current = { ...next, main_remaining_seconds: previous.main_remaining_seconds, level_remaining_seconds: previous.level_remaining_seconds };
    } else {
      stateRef.current = { ...next };
      baseAtRef.current = observedAt;
    }
    const h = handlersRef.current;
    if ((!previous || previous.participant_lock_enabled !== next.participant_lock_enabled) && h.onLockChange) {
      h.onLockChange(next.participant_lock_enabled);
    }
    if (previous && previous.main_remaining_seconds > 0 && mainNow <= 0) h.onMainExpired?.();
    if (previous && previous.level_remaining_seconds > 0 && levelNow <= 0) h.onLevelExpired?.();
    notify();
  }, [displayed, notify]);

  // Responses can arrive out of order (a slow poll finishing after a newer one); only the
  // newest request is ever applied.
  const sentSeq = useRef(0);
  const appliedSeq = useRef(0);
  const request = useCallback(async (url, options) => {
    const seq = ++sentSeq.current;
    const sent = performance.now();
    const result = await (await fetch(url, options)).json();
    if (!result.success || seq < appliedSeq.current) return;
    appliedSeq.current = seq;
    apply(result.timer, (sent + performance.now()) / 2);
  }, [apply]);

  const poll = useCallback(async () => {
    try {
      const team = encodeURIComponent(getTeamId());
      const level = encodeURIComponent(levelRef.current || "easy");
      await request(`/api/timer/state?team_id=${team}&level=${level}`);
    } catch (error) {
      console.error("Unable to poll shared timer:", error);
    }
  }, [request]);

  // Tells the server which level this participant is on (the displayed level clock follows it).
  const setLevel = useCallback(async (level) => {
    levelRef.current = level;
    try {
      await request("/api/timer/level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: getTeamId(), level })
      });
    } catch (error) {
      console.error("Unable to enter level timer:", error);
    }
  }, [request]);

  useEffect(() => {
    poll();
    // Polling is paused while the tab is hidden and catches up the moment it is visible again.
    const poller = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, 3000 + Math.floor(Math.random() * 1000));
    const onVisible = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poller);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  const getState = useCallback(() => stateRef.current, []);
  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);
  return useMemo(() => ({ getState, displayed, setLevel, subscribe }), [getState, displayed, setLevel, subscribe]);
}

/**
 * Re-renders ONLY the calling component (the header clock) on a poll and ~5x/second while the
 * countdown runs, so the rest of the console (canvas, panels) is never re-rendered by the timer.
 */
export function useTimerTick(timer) {
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    const unsubscribe = timer.subscribe(rerender);
    const tick = setInterval(rerender, 200);
    return () => { unsubscribe(); clearInterval(tick); };
  }, [timer]);
  const state = timer.getState();
  return { timerState: state, timerValues: state ? timer.displayed() : null };
}
