/**
 * PYLOOM API Fetch Client
 */
const API = {
  async getMissions() {
    const res = await fetch("/api/missions");
    return await res.json();
  },

  async getMission(missionId) {
    const res = await fetch(`/api/mission/${missionId}`);
    return await res.json();
  },

  async runFlow(missionId, flowState) {
    const payload = {
      mission_id: missionId,
      flow: {
        nodes: flowState.nodes.map(n => ({
          id: n.id,
          type: n.type,
          config: n.config,
          x: n.x,
          y: n.y
        })),
        edges: flowState.edges.map(e => ({
          from: e.from,
          to: e.to
        }))
      },
      hint_used: Boolean(flowState.hintUsed),
      team_id: "TEAM_07"
    };
    const res = await fetch("/api/run-flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async submitSolution(teamId, missionId, flowState) {
    const payload = {
      team_id: teamId,
      mission_id: missionId,
      flow: {
        nodes: flowState.nodes.map(n => ({
          id: n.id,
          type: n.type,
          config: n.config,
          x: n.x,
          y: n.y
        })),
        edges: flowState.edges.map(e => ({
          from: e.from,
          to: e.to
        }))
      },
      hint_used: Boolean(flowState.hintUsed)
    };
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async getProgress(teamId) {
    const res = await fetch(`/api/progress/${encodeURIComponent(teamId)}`);
    return await res.json();
  },

  async getAdminSubmissions() {
    const res = await fetch("/api/admin/submissions");
    return await res.json();
  }
};
