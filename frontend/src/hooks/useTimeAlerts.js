import { useEffect, useRef } from "react";

// Remaining seconds at which an alert fires. Level alerts follow the level being played.
export const MAIN_ALERTS = [20 * 60];
export const LEVEL_ALERTS = { easy: [10 * 60, 10], medium: [5 * 60, 10], hard: [5 * 60, 2 * 60, 10] };

function describe(seconds) {
  return seconds >= 60 ? `${Math.round(seconds / 60)} minute${seconds >= 120 ? "s" : ""}` : `${seconds} seconds`;
}

/**
 * Watches the shared timers and calls `onAlert({ title, message, urgent })` once each time a
 * countdown crosses an alert threshold. An alert re-arms when the clock goes back above its
 * threshold (admin restart), and never fires for a threshold that was already passed when the
 * page loaded.
 */
export function useTimeAlerts(timer, onAlert) {
  const handler = useRef(onAlert);
  handler.current = onAlert;
  useEffect(() => {
    const previous = {};
    const check = (key, remaining, thresholds, build) => {
      thresholds.forEach((limit) => {
        const id = `${key}:${limit}`;
        const before = previous[id];
        if (before !== undefined && before > limit && remaining <= limit && remaining > 0) handler.current(build(limit));
        previous[id] = remaining;
      });
    };
    const id = setInterval(() => {
      const t = timer.getState();
      if (!t || !t.started) return;
      const v = timer.displayed();
      if (!v) return;
      check("main", v.main, MAIN_ALERTS, (limit) => ({
        title: "Main timer", message: `${describe(limit)} left in the event.`, urgent: false
      }));
      if (t.level_entered && LEVEL_ALERTS[t.level]) {
        const name = t.level[0].toUpperCase() + t.level.slice(1);
        check(`level-${t.level}`, v.level, LEVEL_ALERTS[t.level], (limit) => ({
          title: `${name} level timer`, message: `Only ${describe(limit)} left in the ${name} level!`, urgent: limit <= 10
        }));
      }
    }, 250);
    return () => clearInterval(id);
  }, [timer]);
}
