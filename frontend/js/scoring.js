/**
 * PYLOOM Client Scoring Renderer
 */
function updateScoringUI(credits, breakdown) {
  const creditsEl = document.getElementById("credits-display");
  if (creditsEl) {
    creditsEl.textContent = `${credits} / 40`;
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
  breakdownEl.innerHTML = `<div class="scoring-breakdown">${checks.map(([key, label]) => {
    const score = breakdown[key] || 5;
    return `<div class="scoring-row ${score === 10 ? 'is-pass' : 'is-partial'}"><span>${label}</span><strong>+${score}</strong></div>`;
  }).join('')}</div>`;
}
