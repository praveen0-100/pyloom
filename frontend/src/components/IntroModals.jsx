/**
 * Two separate pop-ups shown right after login (and reopened with the header's "Instructions"
 * button): 1) event instructions, 2) rules and regulations.
 */
const Shell = ({ id, title, open, children, footer, onClose }) => (
  <div className={`modal-overlay intro-overlay${open ? " active" : ""}`} id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
    <div className="modal-content intro-content">
      <div className="modal-header">
        <h3 className="modal-title" id={`${id}-title`}>{title}</h3>
        {onClose && <button type="button" className="node-btn" aria-label="Close" onClick={onClose}>×</button>}
      </div>
      <div className="modal-body intro-body">{children}</div>
      <div className="hint-modal-actions">{footer}</div>
    </div>
  </div>
);

export function InstructionsModal({ open, first, onNext, onClose }) {
  return (
    <Shell
      id="instructions-modal"
      title="Event instructions"
      open={open}
      onClose={first ? undefined : onClose}
      footer={
        <>
          {!first && <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}
          <button type="button" className="btn btn-primary" id="instructions-next-btn" onClick={onNext}>
            {first ? "Next: rules & regulations" : "View rules & regulations"}
          </button>
        </>
      }
    >
      <p>Welcome to PYLOOM. You solve each question by <strong>dragging nodes onto the canvas, connecting them and typing the question&apos;s input</strong>, so the flow produces the expected output.</p>
      <h4>How the event works</h4>
      <ul>
        <li><strong>3 levels, 10 questions:</strong> Easy (5 questions), Medium (3) and Hard (2). Medium and Hard open after you have submitted every question of the level before.</li>
        <li><strong>Timers:</strong> a main timer of 45 minutes, and a level timer of 20 min (Easy), 15 min (Medium) and 10 min (Hard). Everyone sees the same time, started and paused only by the admin.</li>
        <li><strong>Build a flow:</strong> drag nodes from the left list, type the question input into the Input node, set each node&apos;s fields, then click an output dot and an input dot to connect. Double-click a connection to unlink it.</li>
        <li><strong>Run flow</strong> only checks your mapping against the test cases (Testing evaluation). Nothing is saved or scored.</li>
        <li><strong>Submit solution</strong> records your progress and score and updates the leaderboard. Your best score per question is kept.</li>
        <li><strong>Mapping trials:</strong> you have 3 wrong runs per question; after that the Hint button helps step by step.</li>
      </ul>
      <h4>Score and credits</h4>
      <ul>
        <li><strong>Score (100 in total):</strong> Easy 4 per question (20), Medium 10 per question (30), Hard 25 per question (50). Passing only some test cases earns part of the question&apos;s score.</li>
        <li><strong>Credits</strong> are used for hints. You start with 10 credits; each hint costs 3. Finish every question of a level and enter the next one to get +10 credits.</li>
      </ul>
    </Shell>
  );
}

export function RulesModal({ open, first, onAgree, onBack, onClose }) {
  return (
    <Shell
      id="rules-modal"
      title="Rules and regulations"
      open={open}
      onClose={first ? undefined : onClose}
      footer={
        first ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={onBack}>Back</button>
            <button type="button" className="btn btn-primary" id="rules-agree-btn" onClick={onAgree}>I agree &amp; enter full screen</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={onBack}>Back to instructions</button>
            <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
          </>
        )
      }
    >
      <ul>
        <li><strong>Admin permission:</strong> you can only take part in the canvas while the admin has allowed you in. The admin can remove access at any time.</li>
        <li><strong>Full screen is mandatory.</strong> Stay in full screen the whole time. Leaving full screen, switching tabs or windows, splitting the screen or losing focus locks your session and is reported to the admin, who must unlock you.</li>
        <li><strong>One tab only:</strong> keep a single canvas open. Opening it in another tab or window locks the older one.</li>
        <li><strong>No outside help:</strong> developer tools, view-source, saving, printing and the right-click menu are disabled. Work on your own (a team works together).</li>
        <li><strong>Log out erases your work:</strong> logging out deletes your saved mappings and scores unless you have already pressed Exit event. Use the same ID to log in again, with the admin&apos;s approval.</li>
        <li><strong>Time limits:</strong> when the main timer ends everything is locked. When a level timer ends you can no longer submit in that level, and you move on to the next level.</li>
        <li><strong>Exit event:</strong> press Exit event when you finish. Your final score out of 100 is shown at the end and cannot be changed afterwards.</li>
        <li><strong>Fair play:</strong> the admin&apos;s decision on scores, violations and access is final.</li>
      </ul>
    </Shell>
  );
}
