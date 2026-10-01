/** PYLOOM API client (talks to the Flask backend over /api). */
import { getTeamId } from "./player";

const json = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

export const flowPayload = (nodes, edges) => ({
  nodes: nodes.map((n) => ({ id: n.id, type: n.type, config: n.config, x: n.x, y: n.y })),
  edges: edges.map((e) => ({ from: e.from, to: e.to }))
});

export const API = {
  async getMissions() {
    return (await fetch("/api/missions")).json();
  },
  async getMission(missionId) {
    return (await fetch(`/api/mission/${missionId}`)).json();
  },
  async runFlow(missionId, nodes, edges, hintUsed) {
    const res = await fetch("/api/run-flow", json({
      mission_id: missionId,
      flow: flowPayload(nodes, edges),
      hint_used: Boolean(hintUsed),
      team_id: getTeamId() || "TEAM_07"
    }));
    return res.json();
  },
  async submitSolution(teamId, missionId, nodes, edges, hintUsed) {
    const res = await fetch("/api/submit", json({
      team_id: teamId,
      mission_id: missionId,
      flow: flowPayload(nodes, edges),
      hint_used: Boolean(hintUsed)
    }));
    return res.json();
  },
  async getProgress(teamId) {
    return (await fetch(`/api/progress/${encodeURIComponent(teamId)}`)).json();
  },
  async getScore(teamId) {
    return (await fetch(`/api/participant/score/${encodeURIComponent(teamId)}`)).json();
  }
};

export const postJson = (url, body, extra = {}) => fetch(url, { ...json(body), ...extra });
export const beacon = (url, body) =>
  navigator.sendBeacon?.(url, new Blob([JSON.stringify(body)], { type: "application/json" }));
