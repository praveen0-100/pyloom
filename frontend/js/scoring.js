/**
 * PYLOOM Client Scoring Renderer
 */
function updateScoringUI(credits, breakdown, questionCredits) {
  const maxCredits = questionCredits || 4;
  const creditsEl = document.getElementById("credits-display");
  if (creditsEl) {
    creditsEl.textContent = `${credits} / ${maxCredits}`;
  }

  const breakdownEl = document.getElementById("scoring-breakdown");
  if (!breakdownEl) return;
  if (!breakdown) {
    breakdownEl.innerHTML = '<p class="scoring-placeholder">Run flow to view credit evaluation.</p>';
    return;
  }

  const checks = [
    ["mapping_flow", "Mapping Flow"],
    ["logic_building", "Logic building"],
    ["sample_output", "Output compare with sample output"],
    ["output_check", "Output check"]
  ];
  const testScore = breakdown.test_cases ?? 0;
  const passedLabel = breakdown.tests_total ? `${breakdown.tests_passed}/${breakdown.tests_total} test cases passed` : "Test cases";
  const testRow = `<div class="scoring-row ${testScore >= maxCredits ? 'is-pass' : 'is-partial'}"><span>${passedLabel} (all ${maxCredits} · some ${maxCredits - 1} · one 1 · none 0)</span><strong>+${testScore}</strong></div>`;
  const checkRows = checks.map(([key, label]) => {
    const passed = (breakdown[key] ?? 0) >= 1;
    return `<div class="scoring-row ${passed ? 'is-pass' : 'is-partial'}"><span>${label}</span><strong>${passed ? 'PASS' : 'REVIEW'}</strong></div>`;
  }).join('');
  breakdownEl.innerHTML = `<div class="scoring-breakdown">${checkRows}${testRow}</div>`;
}
