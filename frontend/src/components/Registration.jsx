import { useEffect, useState } from "react";
import { PLAYER_STORAGE_KEY, forceParticipantLogout, getRegisteredPlayer, wipeLocalParticipantState } from "../lib/player";
import { postJson } from "../lib/api";
import Avatar from "./Avatar";

const EMPTY = {
  // team login
  teamName: "", teamCode: "", member1: "", member2: "", teamCollege: "", teamYear: "",
  // solo login
  playerName: "", teamId: "", college: "", yearOfStudy: ""
};

// What the server expects for a stored player (solo or team).
const registerPayload = (player, login) => ({
  ...(login ? { login: true } : {}),
  mode: player.mode || "solo",
  team_id: player.teamId,
  player_name: player.playerName,
  members: player.members || [],
  avatar: player.avatar || "",
  college: player.college,
  year_of_study: player.yearOfStudy
});

/**
 * Participant login gate: Team login (team name + code + two members) or Solo login (name + ID).
 * Calls onApproved() once the admin has activated the participant (status is polled every 2s);
 * a removed participant is logged out.
 */
export default function Registration({ onApproved }) {
  const [player, setPlayer] = useState(getRegisteredPlayer);
  const [mode, setMode] = useState("team");
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [avatars, setAvatars] = useState([]);
  const [avatar, setAvatar] = useState("");

  // The avatar choices are the images in the avatar folder.
  useEffect(() => {
    if (player) return;
    fetch("/api/avatars").then((r) => r.json()).then((d) => setAvatars(d.avatars || [])).catch(() => {});
  }, [player]);

  // With a registered participant: re-announce them to the server (so they show on the admin
  // panel) and wait for approval.
  useEffect(() => {
    if (!player) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await postJson("/api/participant/register", registerPayload(player, false));
        const result = await res.json();
        if (result.removed) return forceParticipantLogout("This participant was removed by the admin.");
      } catch (err) { /* retried by the polling loop below */ }
      while (!cancelled) {
        try {
          const result = await (await fetch(`/api/participant/status/${encodeURIComponent(player.teamId)}`)).json();
          if (result.status === "active") { if (!cancelled) onApproved(); return; }
          if (result.status === "removed") return forceParticipantLogout("This participant was removed by the admin.");
        } catch (err) { /* server unreachable: keep waiting */ }
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();
    return () => { cancelled = true; };
  }, [player, onApproved]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const next = mode === "team"
      ? {
          mode: "team", avatar,
          playerName: form.teamName.trim(), teamId: form.teamCode.trim(),
          members: [form.member1.trim(), form.member2.trim()],
          college: form.teamCollege.trim(), yearOfStudy: form.teamYear.trim()
        }
      : {
          mode: "solo", avatar,
          playerName: form.playerName.trim(), teamId: form.teamId.trim(), members: [],
          college: form.college.trim(), yearOfStudy: form.yearOfStudy.trim()
        };
    if (!next.playerName || !next.teamId || !next.college || !next.yearOfStudy || (mode === "team" && next.members.some((m) => !m))) {
      setError("Please fill in every field.");
      return;
    }
    if (!avatar) {
      setError("Please choose an avatar.");
      return;
    }
    setBusy(true);
    try {
      const res = await postJson("/api/participant/register", registerPayload(next, true));
      const result = await res.json();
      if (!result.success) {
        setError(result.error || "Registration failed. Please try again.");
        setBusy(false);
        return;
      }
      // A new login always starts from scratch (the server erased any earlier data for this ID).
      wipeLocalParticipantState();
      localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(next));
      setPlayer(next);
    } catch (err) {
      console.error("Participant registration error:", err);
      setError("Could not reach the server. Please try again.");
      setBusy(false);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const switchMode = (next) => { setMode(next); setError(""); };

  return (
    <section className="admin-login" id="participant-register" aria-labelledby="participant-register-title">
      <div className="admin-login-card">
        <div className="brand-name">PYLOOM</div>
        <h1 id="participant-register-title">Participant registration</h1>
        {player ? (
          <p id="participant-approval">
            <Avatar file={player.avatar} name={player.playerName} size={40} />{" "}
            Waiting for admin to allow {player.playerName}{player.mode === "team" && player.members?.length ? ` (${player.members.join(", ")})` : ""} (#{player.teamId}). This page will open automatically.
          </p>
        ) : (
          <>
            <p>Register once to start the mission. Your {mode === "team" ? "Team code" : "Player ID"} identifies your submissions on the leaderboard.</p>
            <div className="level-tabs" role="tablist" aria-label="Login type" style={{ marginBottom: 12 }}>
              <button type="button" role="tab" aria-selected={mode === "team"} className={`level-tab${mode === "team" ? " is-active" : ""}`} id="team-login-tab" onClick={() => switchMode("team")}>Team login</button>
              <button type="button" role="tab" aria-selected={mode === "solo"} className={`level-tab${mode === "solo" ? " is-active" : ""}`} id="solo-login-tab" onClick={() => switchMode("solo")}>Solo login</button>
            </div>

            <div className="avatar-picker" role="radiogroup" aria-label="Choose your avatar">
              <div className="avatar-picker-title">Choose your {mode === "team" ? "team" : ""} avatar</div>
              <div className="avatar-grid">
                {avatars.map((a) => (
                  <button
                    key={a.file}
                    type="button"
                    role="radio"
                    aria-checked={avatar === a.file}
                    className={`avatar-option${avatar === a.file ? " is-selected" : ""}`}
                    title={a.file}
                    onClick={() => { setAvatar(a.file); setError(""); }}
                  >
                    <Avatar file={a.file} size={52} />
                  </button>
                ))}
                {!avatars.length && <span className="avatar-picker-empty">Loading avatars…</span>}
              </div>
            </div>

            {mode === "team" ? (
              <form id="team-register-form" onSubmit={submit}>
                <label htmlFor="reg-team-name">Team name</label>
                <input id="reg-team-name" type="text" autoComplete="off" placeholder="e.g. Code Weavers" required value={form.teamName} onChange={set("teamName")} />
                <label htmlFor="reg-team-code">Team code</label>
                <input id="reg-team-code" type="text" autoComplete="off" placeholder="TEAM_01" required value={form.teamCode} onChange={set("teamCode")} />
                <label>Team members</label>
                <label htmlFor="reg-member-1">Member 1 name</label>
                <input id="reg-member-1" type="text" autoComplete="off" placeholder="e.g. Arun Kumar" required value={form.member1} onChange={set("member1")} />
                <label htmlFor="reg-member-2">Member 2 name</label>
                <input id="reg-member-2" type="text" autoComplete="off" placeholder="e.g. Priya Sharma" required value={form.member2} onChange={set("member2")} />
                <label htmlFor="reg-team-college">College name</label>
                <input id="reg-team-college" type="text" autoComplete="organization" placeholder="e.g. ABC Institute of Technology" required value={form.teamCollege} onChange={set("teamCollege")} />
                <label htmlFor="reg-team-year">Year of study</label>
                <input id="reg-team-year" type="text" autoComplete="off" placeholder="e.g. 2nd year" required value={form.teamYear} onChange={set("teamYear")} />
                <button type="submit" className="btn btn-primary" disabled={busy}>Enter competition as a team</button>
                <div id="participant-register-error" className="admin-login-error" role="alert">{error}</div>
              </form>
            ) : (
              <form id="participant-register-form" onSubmit={submit}>
                <label htmlFor="reg-player-name">Player name</label>
                <input id="reg-player-name" type="text" autoComplete="name" placeholder="e.g. Arun Kumar" required value={form.playerName} onChange={set("playerName")} />
                <label htmlFor="reg-player-id">Player ID</label>
                <input id="reg-player-id" type="text" autoComplete="off" placeholder="PLAYER_01" required value={form.teamId} onChange={set("teamId")} />
                <label htmlFor="reg-player-college">Player college</label>
                <input id="reg-player-college" type="text" autoComplete="organization" placeholder="e.g. ABC Institute of Technology" required value={form.college} onChange={set("college")} />
                <label htmlFor="reg-player-year">Player year of study</label>
                <input id="reg-player-year" type="text" autoComplete="off" placeholder="e.g. YEAR OF STUDY" required value={form.yearOfStudy} onChange={set("yearOfStudy")} />
                <button type="submit" className="btn btn-primary" disabled={busy}>Enter competition</button>
                <div id="participant-register-error" className="admin-login-error" role="alert">{error}</div>
              </form>
            )}
          </>
        )}
      </div>
    </section>
  );
}
