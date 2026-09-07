import { renderPracticeLab as renderLegacyPracticeLab } from "./practiceLabRenderer.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);

function statusNotice(view) {
  if (view.status === "preparing") return '<div class="practice-lab-notice" role="status"><strong>Checking approved training content…</strong><p>Building and validating the fixed five-phase plan.</p></div>';
  if (view.status === "limited-content") return `<div class="practice-lab-notice" role="status"><strong>Limited training content</strong><p>${escapeHtml(view.message)}</p><p>No weaker fallback plan will be substituted.</p></div>`;
  if (view.status === "unsupported" || view.status === "unavailable" || view.status === "error") return `<div class="practice-lab-notice" role="alert"><strong>Target unavailable</strong><p>${escapeHtml(view.message)}</p></div>`;
  if (view.status === "ready") return '<div class="practice-lab-notice" role="status"><strong>Plan ready.</strong><p>Starting the shared Practice session engine.</p></div>';
  return '<div class="practice-lab-notice"><strong>Developer preview</strong><p>Choose one lowercase bigram or trigram. The target is validated against the approved training corpus before a session can start.</p></div>';
}

function recommendationList(view) {
  if (view.recommendationStatus === "loading") return '<p class="practice-lab-muted" role="status">Loading evidence-based recommendations…</p>';
  if (view.recommendationStatus === "unavailable") return `<div class="practice-lab-notice" role="status"><strong>Recommendations unavailable.</strong><p>Manual targeting still works and does not require an assessment.${view.recommendationErrorCode ? ` Diagnostic: ${escapeHtml(view.recommendationErrorCode)}.` : ""}</p></div>`;
  if (view.recommendationStatus === "no-evidence") return '<p class="practice-lab-muted">No current bigram or trigram weakness evidence is strong enough to recommend a target. Manual targeting remains available.</p>';
  if (!view.recommendations.length) return '<p class="practice-lab-muted">Recommendations load from existing Practice evidence when this screen opens. Manual targeting remains available and does not require an assessment.</p>';
  return `<div class="practice-combination-recommendations">${view.recommendations.map((item) => `<button type="button" data-practice-action="choose-combination-target" data-entity-type="${escapeHtml(item.entityType)}" data-entity-key="${escapeHtml(item.entityKey)}" data-target-source="recommended"><strong>${escapeHtml(item.entityKey)}</strong><span>${escapeHtml(item.entityType)} · evidence ${Number(item.evidenceConfidenceScore ?? 0).toFixed(0)}%</span></button>`).join("")}</div>`;
}

function phaseTable(view) {
  return `<ol class="practice-combination-plan" aria-label="Fixed Combination Repair phase plan">${view.phases.map((phase) => `<li><span class="practice-combination-plan-index">${phase.ordinal}</span><div><strong>${escapeHtml(phase.label)}</strong><p>${phase.id === "entry-probe" ? "Uncued baseline" : phase.id === "acquire" ? "Strong target cue" : phase.id === "integrate" ? "Subtle context cue" : phase.id === "interleave" ? "Uncued mixed practice" : "Uncued same-session check"}</p></div><span>${phase.opportunityQuota} opportunities</span></li>`).join("")}</ol>`;
}

function renderCombinationRepair(root, view, { focusSelector = null } = {}) {
  const expectedLength = view.entityType === "bigram" ? 2 : 3;
  const typeLabel = view.entityType === "bigram" ? "Bigram" : "Trigram";
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="combination-repair-detail">
    <div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back" aria-label="${escapeHtml(view.backLabel)}">← ${escapeHtml(view.backLabel)}</button><span class="practice-lab-status is-preview">DEVELOPER PREVIEW</span></header>
    <main class="practice-lab-detail practice-combination-detail">
      <div class="eyebrow">${escapeHtml(view.category)} · precision intervention</div><h1>${escapeHtml(view.title)}</h1><p class="practice-lab-lead">${escapeHtml(view.description)}</p><p>${escapeHtml(view.longDescription)}</p>
      <section class="practice-lab-empty-state"><div class="practice-lab-card-meta"><span>Fixed dose</span><span>${view.totalOpportunityCount} target opportunities</span></div><h2>Target one combination</h2><p>One session trains exactly one lowercase bigram or trigram. Assessment is optional; a manual target is allowed.</p>
        <div class="practice-combination-type-toggle" role="group" aria-label="Combination length"><button type="button" data-practice-action="set-combination-type" data-entity-type="bigram" aria-pressed="${view.entityType === "bigram"}">BIGRAM · 2</button><button type="button" data-practice-action="set-combination-type" data-entity-type="trigram" aria-pressed="${view.entityType === "trigram"}">TRIGRAM · 3</button></div>
        <label class="practice-combination-target-field"><span>${typeLabel} target</span><input data-combination-target type="text" value="${escapeHtml(view.targetValue)}" maxlength="${expectedLength}" minlength="${expectedLength}" pattern="[a-z]{${expectedLength}}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="combination-target-help"><small id="combination-target-help">Exactly ${expectedLength} lowercase letters. No spaces, punctuation, or uppercase aliases.</small></label>
        <button type="button" class="practice-lab-primary-action" data-practice-action="prepare-combination-repair" ${view.canPrepare ? "" : "disabled"}>${view.preparationPending ? "CHECKING…" : "START COMBINATION REPAIR"}</button>
        ${statusNotice(view)}
      </section>
      <section class="practice-lab-empty-state"><h2>Recommended targets</h2>${recommendationList(view)}</section>
      <section class="practice-lab-empty-state"><h2>Five fixed phases</h2><p>The dose does not adapt mid-session. Cues fade before the final check.</p>${phaseTable(view)}</section>
      <section class="practice-lab-empty-state"><h2>Interpretation boundary</h2><p>The final Check is only an immediate same-session comparison. It does not establish mastery, retention, transfer, or causal improvement.</p><p>All displayed text must come from the approved <code>training</code> partition. Protected benchmark, transfer, diagnostic, and research-holdout material is never used for this intervention.</p></section>
    </main></div>
  </section>`;
  const target = focusSelector ? root.querySelector?.(focusSelector) : null;
  (target ?? root.querySelector?.("[data-combination-target]") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
  return true;
}

export function renderPracticeLabV20(root, view, options = {}) {
  if (view?.kind === "combination-repair-detail") return renderCombinationRepair(root, view, options);
  return renderLegacyPracticeLab(root, view, options);
}
