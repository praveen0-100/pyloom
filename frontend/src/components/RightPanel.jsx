import { QUESTIONS_PER_LEVEL, formatMissionValue } from "../lib/storage";

const EVALUATIONS = [
  ["mapping_flow", "Mapping Flow"],
  ["logic_building", "Logic building"],
  ["sample_output", "Output compare with sample output"],
  ["output_check", "Output check"]
];
const CHECKS = EVALUATIONS.slice(0, 4);

function ScoringBreakdown({ scoring }) {
  if (!scoring.breakdown) {
    return <p className="scoring-placeholder">Run flow to view credit evaluation.</p>;
  }
  const b = scoring.breakdown;
  const max = scoring.max || 4;
  const testScore = b.score ?? 0;
  const share = (fraction) => Math.floor(max * fraction + 0.5);
  return (
    <div className="scoring-breakdown">
      {CHECKS.map(([key, label]) => {
        const passed = (b[key] ?? 0) >= 1;
        return (
          <div key={key} className={`scoring-row ${passed ? "is-pass" : "is-partial"}`}>
            <span>{label}</span><strong>{passed ? "PASS" : "REVIEW"}</strong>
          </div>
        );
      })}
      <div className={`scoring-row ${testScore >= max ? "is-pass" : "is-partial"}`}>
        <span>{b.checks_passed ?? 0}/4 checks passed (4 → {max} · 3 → {share(0.75)} · 2 → {share(0.5)} · 1 → {share(0.25)} · 0 → 0)</span><strong>+{testScore}</strong>
      </div>
    </div>
  );
}

export default function RightPanel({
  mission, currentLevel, questions, missionId, currentIndex, isComplete, questionStatus,
  evals, scoring, result, chartSrc, gam, totalMissions,
  onHint, onLevelTab, levelOpen, onSelectQuestion, onNavigate, onExit
}) {
  const badges = [];
  if (gam.completed.length >= 1) badges.push("First solve");
  if (gam.completed.length >= 3) badges.push("Flow builder");
  if (gam.completed.length >= 5) badges.push("PYLOOM master");
  if (gam.streak >= 3) badges.push("On fire");
  const levelXp = gam.xp % 250;
  const expectedHidden = Boolean(mission?.expected_output_is_image && mission?.image);

  return (
    <aside className="sidebar-right">
      <div className="panel-header">
        <span>Mission and output</span>
        <button type="button" className="hint-panel-btn" id="open-hint-btn" aria-label="Open mapping hint" onClick={onHint}>Hint</button>
      </div>
      <div className="level-navigation" aria-label="Choose difficulty level">
        <div className="level-tabs" role="tablist">
          {["easy", "medium", "hard"].map((level) => (
            <button
              key={level}
              type="button"
              className={`level-tab${currentLevel === level ? " is-active" : ""}${levelOpen && !levelOpen(level) ? " is-locked" : ""}`}
              aria-disabled={levelOpen && !levelOpen(level) ? "true" : undefined}
              data-level={level}
              role="tab"
              aria-selected={currentLevel === level ? "true" : "false"}
              onClick={() => onLevelTab(level)}
            >
              {levelOpen && !levelOpen(level) ? "🔒 " : ""}{level[0].toUpperCase() + level.slice(1)} <span className="level-count">{QUESTIONS_PER_LEVEL[level]}</span>
            </button>
          ))}
        </div>
        <div id="question-selector" className="question-selector" aria-label="Choose question" data-level={currentLevel}>
          {questions.map((m, index) => {
            const done = isComplete(m.id);
            const active = m.id === missionId;
            return (
              <button
                key={m.id}
                type="button"
                className={`question-chip${active ? " is-current" : ""}${done ? " is-complete" : ` ${questionStatus(m.id)}`}`}
                data-mission-id={m.id}
                aria-current={active ? "true" : "false"}
                onClick={() => onSelectQuestion(m.id)}
              >
                {done ? "✓ " : ""}Question {index + 1}
              </button>
            );
          })}
        </div>
        <div className="question-navigation">
          <button type="button" className="question-nav-btn" id="prev-question-btn" disabled={currentIndex <= 0} onClick={() => onNavigate(-1)}>← Prev Ques</button>
          <span id="question-position" className="question-position" aria-live="polite">{currentIndex >= 0 ? `${currentIndex + 1} / ${questions.length}` : ""}</span>
          <button type="button" className="question-nav-btn" id="next-question-btn" disabled={currentIndex < 0 || currentIndex >= questions.length - 1} onClick={() => onNavigate(1)}>Next Ques →</button>
          <button type="button" className="question-nav-btn exit-event-btn" id="exit-event-btn" hidden={!(currentIndex >= 0 && currentIndex === questions.length - 1)} onClick={onExit}>Exit event</button>
        </div>
      </div>

      <div className="output-content">
        <div className="output-block">
          <div className="block-title">
            <span id="mission-title">{mission ? mission.title : "Student Result Analyzer"}</span>
          </div>
          <p id="mission-desc" className="mission-desc">{mission ? mission.description : "Calculate the average of student marks."}</p>
          <div className="mission-details">
            <div><span>Operation (code)</span><pre id="mission-operation" className="mission-operation-code">{mission?.operation || "—"}</pre></div>
            <div>
              <span>Expected output</span>
              <pre id="mission-expected" hidden={expectedHidden}>{formatMissionValue(mission?.expected_output)}</pre>
              <img id="mission-reference-image" className="mission-reference-image" alt={`${mission?.title || "Question"} reference image`} hidden={!mission?.image} src={mission?.image || undefined} />
            </div>
          </div>
        </div>

        <div className="output-block">
          <div className="block-title">Execution output</div>
          <div id="execution-result" className={`result-view${result.error ? " is-error" : ""}`}>{result.text}</div>
          <img id="chart-preview" className="chart-preview-img" style={{ display: chartSrc ? "block" : "none" }} alt="Chart output" src={chartSrc || undefined} />
        </div>

        <div className="output-block">
          <div className="block-title">Testing evaluation</div>
          <div className="test-list" id="test-list">
            {EVALUATIONS.map(([key, label]) => {
              const e = evals[key] || { status: "PENDING", cls: "" };
              return (
                <div key={key} className={`test-item${e.cls ? ` ${e.cls}` : ""}`} id={`evaluation-item-${key}`} title={e.title || undefined}>
                  <span>{label}</span>
                  <span className={`test-status${e.cls ? ` ${e.cls}` : ""}`} id={`evaluation-status-${key}`}>{e.status}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="output-block">
          <div className="block-title">Credit breakdown</div>
          <div id="scoring-breakdown"><ScoringBreakdown scoring={scoring} /></div>
        </div>

        <div className="output-block player-progress-card">
          <div className="progress-heading">
            <div className="block-title">Player progress</div>
            <span id="streak-display" className="streak-badge">{gam.streak} streak</span>
          </div>
          <div className="xp-summary"><strong id="xp-display">{gam.xp} XP</strong><span id="xp-next-display">{250 - levelXp} XP to next level</span></div>
          <div className="xp-track"><div id="xp-bar" className="xp-bar" style={{ width: `${Math.min(100, (levelXp / 250) * 100)}%` }}></div></div>
          <div className="mission-progress-label"><span>Mission mastery</span><strong id="mission-progress-display">{gam.completed.length} / {totalMissions || 10}</strong></div>
          <div className="mission-progress-track"><div id="mission-progress-bar" className="mission-progress-bar" style={{ width: `${Math.min(100, (gam.completed.length / (totalMissions || 10)) * 100)}%` }}></div></div>
          <div id="badges-list" className="badges-list">
            {badges.length
              ? badges.map((b) => <span className="badge-chip" key={b}>★ {b}</span>)
              : <span className="badge-chip is-locked">Complete a mission to earn badges</span>}
          </div>
        </div>
      </div>
    </aside>
  );
}
