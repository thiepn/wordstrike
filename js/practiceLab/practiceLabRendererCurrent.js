// Phase 8 canonical Practice renderer.
// Generated from the formerly versioned V20→V38 renderer stack without changing rendering behavior.
// New production code must import this module instead of a versioned renderer file.

import * as __r_v22_dep0 from "./practiceProblemWordsUi.js";
import * as __r_v27_dep0 from "./practiceBurstSprintsConstants.js";
import * as __r_v28_dep0 from "./practiceCommonWordsConstants.js";
import * as __r_v29_dep0 from "./practiceConsistencyConstants.js";
import * as __r_v29_dep1 from "./practiceEnduranceConstants.js";
import * as __r_v30_dep0 from "./practicePunctuationCapitalsConstants.js";
import * as __r_v30_dep1 from "./practiceNumbersSymbolsConstants.js";
import * as __r_v31_dep0 from "./practiceCustomTextConstants.js";
import * as __r_v36_dep0 from "./practicePhysicalTelemetryUi.js";
import * as __r_v37_dep0 from "./practiceWeaknessBossUi.js";
import * as __r_v38_dep0 from "./practiceResearchUi.js";

// practiceLabRenderer — consolidated feature renderer
const __renderer_base = (() => {
  
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const slug = (value = "") => String(value).replace(/[^a-z0-9-]/gi, "");
  const backButton = (label = "Back to Practice Lab", action = "back") => `<button type="button" class="screen-back-button" data-practice-action="${action}" aria-label="${escapeHtml(label)}">BACK</button>`;
  const number = (value, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "Not measured";
  const percentPoints = (value) => Number.isFinite(value) ? `${number(value, 1)}%` : "Not measured";
  const ratioPercent = (value) => Number.isFinite(value) ? `${number(value * 100, 1)}%` : "Not measured";
  
  function experimentCard(card) {
    return `<article class="practice-lab-experiment-card practice-lab-accent-${slug(card.category)}">
      <div class="practice-lab-card-meta"><span>${escapeHtml(card.categoryLabel)}</span><span>${escapeHtml(card.duration)}</span></div>
      <h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.description)}</p>
      <div class="practice-lab-card-footer"><span class="practice-lab-status" data-status="${slug(card.status)}">${escapeHtml(card.statusLabel ?? card.status)}</span>
        <button type="button" class="practice-lab-text-button" data-practice-action="open-experiment" data-experiment-id="${slug(card.id)}" aria-label="View ${escapeHtml(card.title)} details">VIEW DETAILS</button></div>
    </article>`;
  }
  
  function shell(content, { home = false } = {}) {
    return `<section class="screen practice-lab-screen" data-practice-view="${home ? "home" : "subpage"}">
      <div class="practice-lab-shell">${content}</div></section>`;
  }
  
  function renderHome(view) {
    return shell(`${backButton("Exit Practice Lab", "exit")}
      <header class="practice-lab-header"><div><div class="eyebrow">Focused training</div><h1 tabindex="-1" data-practice-heading>${escapeHtml(view.title)}</h1><p>${escapeHtml(view.subtitle)}</p></div>
        <div class="practice-lab-header-actions">${view.preview ? '<span class="practice-lab-preview">DEVELOPER MODE</span>' : ""}${view.dataManagementAvailable ? '<button type="button" data-practice-action="manage-data" aria-label="Manage Practice Lab data">DATA</button>' : ""}<button type="button" class="practice-lab-help" data-practice-action="help" aria-label="Practice Lab help"${view.helpAvailable ? "" : ' disabled aria-disabled="true" title="Practice Lab help is unavailable"'}>HELP</button></div></header>
      <main>
        <section class="practice-lab-feature-grid" aria-label="Practice overview">
          <article class="practice-lab-feature-card practice-lab-daily"><div class="eyebrow">Guided program</div><h2>${escapeHtml(view.dailyTraining.title)}</h2><p>${escapeHtml(view.dailyTraining.description)}</p><ul><li>${escapeHtml(view.dailyTraining.stateLabel)}</li><li>${escapeHtml(view.dailyTraining.duration)}</li></ul><button type="button" data-practice-action="navigate" data-route="daily-training">OPEN DAILY TRAINING</button></article>
          <article class="practice-lab-feature-card practice-lab-assessment"><div class="eyebrow">Measure your current typing</div><h2>${escapeHtml(view.assessment.title)}</h2><p>A structured battery combining protected natural text with fixed diagnostics. It reports what was measured, what the evidence suggests, and what remains unknown.</p><span>Quick ~4 min · Standard ~8 min · Deep ~12 min</span><button type="button" data-practice-action="open-experiment" data-experiment-id="full-assessment">VIEW ASSESSMENT</button></article>
        </section>
        <section class="practice-lab-empty-grid" aria-label="Personalized training status"><article><h2>${escapeHtml(view.profile.title)}</h2><p>${escapeHtml(view.profile.description)}</p></article><article><h2>${escapeHtml(view.recommendations.title)}</h2><p>${escapeHtml(view.recommendations.description)}</p></article></section>
        <section class="practice-lab-analysis" aria-labelledby="practice-analysis-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">Evidence</div><h2 id="practice-analysis-title">Analysis</h2></div></div><div class="practice-lab-analysis-grid">${view.analysis.map((item) => `<button type="button" data-practice-action="navigate" data-route="${slug(item.route)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span></button>`).join("")}</div></section>
        <section class="practice-lab-catalog" aria-labelledby="practice-catalog-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">Training catalog</div><h2 id="practice-catalog-title">Experiments</h2></div><p>Choose an available drill to configure and start focused practice.</p></div>
          ${view.categories.map((category) => `<section class="practice-lab-category" aria-labelledby="practice-category-${slug(category.id)}"><h3 id="practice-category-${slug(category.id)}">${escapeHtml(category.title)}</h3><div class="practice-lab-experiment-grid">${category.experiments.map(experimentCard).join("")}</div></section>`).join("")}</section>
      </main>`, { home: true });
  }
  
  function renderDetail(view) {
    if (view.kind === "not-found") return shell(`${backButton()}<main class="practice-lab-detail"><div class="eyebrow">Practice Lab</div><h1 tabindex="-1" data-practice-heading>${escapeHtml(view.title)}</h1><p>${escapeHtml(view.description)}</p></main>`);
    return shell(`${backButton(view.backLabel)}<main class="practice-lab-detail"><div class="eyebrow">${escapeHtml(view.category)}</div><h1 tabindex="-1" data-practice-heading>${escapeHtml(view.title)}</h1><p class="practice-lab-lead">${escapeHtml(view.description)}</p><p>${escapeHtml(view.longDescription)}</p>
      <dl><div><dt>Primary skill</dt><dd>${escapeHtml(view.primarySkill)}</dd></div><div><dt>Estimated duration</dt><dd>${escapeHtml(view.duration)}</dd></div><div><dt>Difficulty</dt><dd>${escapeHtml(view.difficulty)}</dd></div><div><dt>Prerequisites</dt><dd>${escapeHtml(view.prerequisites.length ? view.prerequisites.join(", ") : "None")}</dd></div><div><dt>Device support</dt><dd>${escapeHtml(view.deviceSupport.join(", "))}</dd></div><div><dt>Availability</dt><dd>${escapeHtml(view.statusLabel ?? view.status)}</dd></div>${view.maturityLabel ? `<div><dt>Maturity</dt><dd>${escapeHtml(view.maturityLabel)}</dd></div>` : ""}</dl>
      <div class="practice-lab-notice" role="status">${escapeHtml(view.unavailableMessage)}</div><button type="button" disabled aria-disabled="true">BEGIN UNAVAILABLE</button></main>`);
  }
  
  function depthCard(item) {
    const reason = item.reasons?.length ? item.reasons.join(" · ") : "Available";
    const recommendation = item.recommended ? '<span class="practice-lab-preview">RECOMMENDED</span>' : "";
    return `<article class="practice-lab-experiment-card" data-assessment-depth="${slug(item.depth)}">
      <div class="practice-lab-card-meta"><span>${escapeHtml(item.label)}</span><span>~${item.minutes} min</span></div>
      <h3>${escapeHtml(item.label)} ${recommendation}</h3>
      <p>${item.blockCount} standardized block${item.blockCount === 1 ? "" : "s"}. ${escapeHtml(reason)}</p>
      <button type="button" data-practice-action="start-assessment" data-assessment-depth="${slug(item.depth)}"${item.available ? "" : ' disabled aria-disabled="true"'}>${item.available ? `START ${escapeHtml(item.label).toUpperCase()}` : "UNAVAILABLE"}</button>
    </article>`;
  }
  
  function renderIntegrity(integrity) {
    if (!integrity || integrity.status === "standard") return "";
    const reasons = Array.isArray(integrity.reasons) && integrity.reasons.length
      ? `<ul>${integrity.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : "";
    return `<aside class="practice-lab-notice" role="status"><strong>Measurement integrity: ${escapeHtml(integrity.status)}</strong>${reasons}</aside>`;
  }
  
  function renderNaturalText(data) {
    const benchmark = data?.benchmark;
    const ability = data?.coldNaturalAbility;
    if (!benchmark && !ability) return "<p>Not measured in this assessment.</p>";
    return `<dl>
      <div><dt>Benchmark WPM</dt><dd>${number(benchmark?.wpm)}</dd></div>
      <div><dt>Adjusted WPM</dt><dd>${number(benchmark?.adjustedWpm)}</dd></div>
      <div><dt>Accuracy</dt><dd>${percentPoints(benchmark?.accuracy)}</dd></div>
      <div><dt>Benchmark freshness</dt><dd>${escapeHtml(benchmark?.freshness ?? "Unknown")}</dd></div>
      <div><dt>Cold-natural ability estimate</dt><dd>${number(ability?.estimateWpm)}</dd></div>
      <div><dt>Ability confidence</dt><dd>${escapeHtml(ability?.confidenceLevel ?? "Not measured")}</dd></div>
    </dl>`;
  }
  
  function renderControl(data) {
    if (!data) return "<p>Not measured in this assessment.</p>";
    return `<dl>
      <div><dt>First-pass accuracy</dt><dd>${ratioPercent(data.firstPassAccuracy)}</dd></div>
      <div><dt>Disfluency rate</dt><dd>${ratioPercent(data.disfluencyRate)}</dd></div>
      <div><dt>Correction inputs / 1000 chars</dt><dd>${number(data.correctionInputsPer1000)}</dd></div>
      <div><dt>Correction cost / 1000 chars</dt><dd>${number(data.correctionCostMsPer1000)}${Number.isFinite(data.correctionCostMsPer1000) ? " ms" : ""}</dd></div>
      <div><dt>Error episodes / 1000 chars</dt><dd>${number(data.errorEpisodesPer1000)}</dd></div>
    </dl>`;
  }
  
  function renderCoverage(data) {
    if (!data) return "<p>Not measured in this assessment.</p>";
    const blocks = Array.isArray(data.blocks) ? data.blocks : [];
    if (!blocks.length) return "<p>Coverage was not available for this assessment.</p>";
    return `<ul>${blocks.map((entry) => `<li>Blueprint coverage: ${ratioPercent(entry?.coverageRatio)}</li>`).join("")}</ul>`;
  }
  
  function renderLimiters(data) {
    if (!Array.isArray(data) || !data.length) return "<p>No limiter summary was established with the available evidence.</p>";
    return `<ol>${data.map((item) => `<li><strong>${escapeHtml(item.entityKey ?? item.entityType ?? "Limiter")}</strong> — ${escapeHtml(item.phenotype ?? "Mixed")} · confidence ${escapeHtml(item.evidenceConfidenceLevel ?? "unknown")}</li>`).join("")}</ol>`;
  }
  
  function renderTransfer(data) {
    if (!data?.available) return "<p>Not measured in this assessment.</p>";
    return `<dl>
      <div><dt>Cold-transfer WPM</dt><dd>${number(data.wpm)}</dd></div>
      <div><dt>Adjusted WPM</dt><dd>${number(data.adjustedWpm)}</dd></div>
      <div><dt>Accuracy</dt><dd>${percentPoints(data.accuracy)}</dd></div>
      <div><dt>Freshness</dt><dd>${escapeHtml(data.freshness ?? "Unknown")}</dd></div>
      <div><dt>Valid entity transfer evidence</dt><dd>${number(data.validTransferEvidenceEntityCount, 0)}</dd></div>
    </dl>`;
  }
  
  function renderMeasurementCoverage(data) {
    if (!data || typeof data !== "object") return "<p>No measurement coverage information is available.</p>";
    return `<ul>${Object.entries(data).map(([capability, status]) => `<li><strong>${escapeHtml(capability)}</strong>: ${escapeHtml(status)}</li>`).join("")}</ul>`;
  }
  
  function renderAssessmentSection(section) {
    let content = "";
    if (section.id === "natural-text") content = renderNaturalText(section.data);
    else if (section.id === "accuracy-control") content = renderControl(section.data);
    else if (section.id === "diagnostic-coverage") content = renderCoverage(section.data);
    else if (section.id === "main-limiters") content = renderLimiters(section.data);
    else if (section.id === "transfer") content = renderTransfer(section.data);
    else if (section.id === "measurement-coverage") content = renderMeasurementCoverage(section.data);
    return `<section class="practice-lab-empty-state" aria-labelledby="assessment-result-${slug(section.id)}"><h2 id="assessment-result-${slug(section.id)}">${escapeHtml(section.title)}</h2>${content}</section>`;
  }
  
  function renderAssessmentProgress(progress) {
    if (!progress) return "";
    return `<section class="practice-lab-empty-state" aria-live="polite"><div class="eyebrow">Assessment in progress</div><h2>Block ${progress.currentBlockNumber} of ${progress.totalBlockCount}</h2><p>${escapeHtml(progress.blockName ?? progress.blockId ?? "Next assessment block")}</p><p>${progress.completedBlockCount} completed · ${progress.terminalBlockCount} terminal</p>${progress.waitingBetweenBlocks ? '<button type="button" data-practice-action="start-assessment-block">START NEXT BLOCK</button>' : ""}</section>`;
  }
  
  function renderFullAssessment(view) {
    const results = view.results;
    return shell(`${backButton(view.backLabel)}<main class="practice-lab-detail">
      <div class="eyebrow">Structured measurement battery</div>
      <h1 tabindex="-1" data-practice-heading>${escapeHtml(view.title)}</h1>
      <p class="practice-lab-lead">${escapeHtml(view.description)}</p>
      <p>${escapeHtml(view.longDescription)}</p>
      <div class="practice-lab-notice" role="note"><strong>Assessment is optional.</strong> Deep is recommended only when fully available. Practice modes, Skill Map, Custom Text, and Daily Training are not gated on completing it.</div>
      ${renderAssessmentProgress(view.progress)}
      ${results ? `${renderIntegrity(results.integrity)}<section aria-labelledby="assessment-results-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">Evidence</div><h2 id="assessment-results-title">Assessment results</h2></div></div>${results.sections.map(renderAssessmentSection).join("")}</section>` : `<section aria-labelledby="assessment-depth-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">Choose depth</div><h2 id="assessment-depth-title">Quick, Standard, or Deep</h2></div><p>Each longer depth contains the complete shorter protocol as its prefix. Your explicit choice will not be escalated.</p></div><div class="practice-lab-experiment-grid">${view.depths.map(depthCard).join("")}</div></section>`}
      <section class="practice-lab-empty-state"><h2>What this assessment does not claim</h2><p>Full Assessment does not provide one universal typing score, grade, or rank. Controlled-speed, burst, common-word, and endurance abilities belong to their dedicated measurements and are not inferred from this battery.</p></section>
    </main>`);
  }
  
  function renderEmpty(view) {
    return shell(`${backButton(view.backLabel)}<main class="practice-lab-detail"><div class="eyebrow">Analysis</div><h1 tabindex="-1" data-practice-heading>${escapeHtml(view.title)}</h1><p class="practice-lab-lead">${escapeHtml(view.description)}</p><ul class="practice-lab-future-list">${view.futureItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><section class="practice-lab-empty-state"><h2>${escapeHtml(view.emptyTitle)}</h2><p>${escapeHtml(view.emptyDescription)}</p></section></main>`);
  }
  
  function renderPracticeLab(root, viewModel, { focusSelector = null } = {}) {
    if (!root || typeof root.innerHTML !== "string") throw new TypeError("Practice Lab renderer requires a root element");
    const previousAction = root.ownerDocument?.activeElement?.dataset?.practiceAction;
    root.innerHTML = viewModel.kind === "home" ? renderHome(viewModel)
      : viewModel.kind === "full-assessment-detail" ? renderFullAssessment(viewModel)
        : viewModel.kind === "experiment-detail" || viewModel.kind === "not-found" ? renderDetail(viewModel)
          : viewModel.kind === "unavailable" ? shell(`${backButton(viewModel.backLabel, "exit")}<main class="practice-lab-detail"><h1 tabindex="-1" data-practice-heading>${escapeHtml(viewModel.title)}</h1><p>${escapeHtml(viewModel.description)}</p></main>`)
            : renderEmpty(viewModel);
    const focusTarget = (focusSelector && root.querySelector?.(focusSelector))
      || (previousAction && root.querySelector?.(`[data-practice-action="${slug(previousAction)}"]`))
      || root.querySelector?.("[data-practice-heading]");
    focusTarget?.focus?.({ preventScroll: true });
    return root.querySelector?.(".practice-lab-screen") || null;
  }
  return Object.freeze({ renderPracticeLab });
})();

// practiceLabRendererV20 — consolidated feature renderer
const __renderer_v20 = (() => {
  const { renderPracticeLab: renderLegacyPracticeLab } = __renderer_base;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
  
  function statusNotice(view) {
    if (view.status === "preparing") return '<div class="practice-lab-notice" role="status"><strong>Checking approved training content…</strong><p>Building and validating the fixed five-phase plan.</p></div>';
    if (view.status === "limited-content") return `<div class="practice-lab-notice" role="status"><strong>Limited training content</strong><p>${escapeHtml(view.message)}</p><p>No weaker fallback plan will be substituted.</p></div>`;
    if (view.status === "unsupported" || view.status === "unavailable" || view.status === "error") return `<div class="practice-lab-notice" role="alert"><strong>Target unavailable</strong><p>${escapeHtml(view.message)}</p></div>`;
    if (view.status === "ready") return '<div class="practice-lab-notice" role="status"><strong>Plan ready.</strong><p>Starting the shared Practice session engine.</p></div>';
    return '<div class="practice-lab-notice"><strong>Target selection</strong><p>Choose one lowercase bigram or trigram. The target is validated against the approved training corpus before a session can start.</p></div>';
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
      <div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back" aria-label="${escapeHtml(view.backLabel)}">← ${escapeHtml(view.backLabel)}</button><span class="practice-lab-status is-preview">PRACTICE LAB</span></header>
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
  
  function renderPracticeLabV20(root, view, options = {}) {
    if (view?.kind === "combination-repair-detail") return renderCombinationRepair(root, view, options);
    return renderLegacyPracticeLab(root, view, options);
  }
  return Object.freeze({ renderPracticeLabV20 });
})();

// practiceLabRendererV21 — consolidated feature renderer
const __renderer_v21 = (() => {
  const { renderPracticeLabV20 } = __renderer_v20;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  
  function targetStatus(view) {
    if (view.status === "checking") return '<div class="practice-lab-notice" role="status"><strong>Checking this key…</strong><p>Only the selected key’s approved training index/content is loaded.</p></div>';
    if (view.status === "preparing") return '<div class="practice-lab-notice" role="status"><strong>Building the fixed plan…</strong><p>Verifying exact phase quotas, neutral Mix material, and matched probes.</p></div>';
    if (view.status === "ready") return '<div class="practice-lab-notice" role="status"><strong>Standard protocol available.</strong><p>The Start button will build a new immutable session plan.</p></div>';
    if (["limited-content", "unsupported", "unavailable", "error"].includes(view.status)) return `<div class="practice-lab-notice" role="${view.status === "limited-content" ? "status" : "alert"}"><strong>${view.status === "limited-content" ? "Limited training content" : "Key unavailable"}</strong><p>${escapeHtml(view.message)}</p>${view.status === "limited-content" ? "<p>No weaker protocol or protected-text fallback will be substituted.</p>" : ""}</div>`;
    return '<div class="practice-lab-notice"><strong>Target selection</strong><p>Choose one English letter. Uppercase input is normalized to lowercase; digits, punctuation, symbols, whitespace, and multi-letter targets are unsupported in v1.</p></div>';
  }
  
  function recommendationRows(view) {
    if (view.recommendationStatus === "loading") return '<p class="practice-lab-muted" role="status">Loading existing key-limiter evidence…</p>';
    if (view.recommendationStatus === "no-evidence") return '<p class="practice-lab-muted">No weak key is currently well-established. Manual practice remains possible.</p>';
    if (view.recommendationStatus === "unsupported") return '<p class="practice-lab-muted">Weak Keys recommendations are currently available for English v1 only. Manual unsupported-language training is not enabled.</p>';
    if (view.recommendationStatus === "unavailable") return `<div class="practice-lab-notice" role="status"><strong>Recommendations unavailable.</strong><p>Manual practice remains available.${view.recommendationErrorCode ? ` Diagnostic: ${escapeHtml(view.recommendationErrorCode)}.` : ""}</p></div>`;
    if (!view.recommendations.length) return '<p class="practice-lab-muted">Recommendations use existing limiter, learning, and performance evidence when available. They do not preload every key’s training content.</p>';
    return `<div class="practice-weak-key-recommendations">${view.recommendations.map((item) => {
      const downstream = Number(item.downstreamExplainedCount || 0);
      const countLabel = downstream > 9 ? "9+" : String(downstream);
      const downstreamText = downstream > 0 ? `<small>Also appears in ${countLabel} higher-level limiter explanation${downstream === 1 ? "" : "s"}.</small>` : "";
      const saturation = item.saturationDeemphasized ? '<small>Recent learning evidence de-emphasizes this recommendation.</small>' : "";
      return `<button type="button" data-practice-action="choose-weak-key" data-entity-key="${escapeHtml(item.entityKey)}" data-target-source="recommended"><strong>${escapeHtml(item.entityKey)}</strong><span>${escapeHtml(item.limiterPhenotype || "mixed")} · ${escapeHtml(item.limiterStatus || "possible")} · confidence ${Math.round(Number(item.evidenceConfidenceScore || 0))}%</span>${downstreamText}${saturation}</button>`;
    }).join("")}</div>`;
  }
  
  function phasePlan(view) {
    const copy = {
      "entry-probe": "8 uncued Baseline opportunities",
      focus: "24 high-density varied-word opportunities · strong cue",
      context: "20 broader position/transition opportunities · subtle cue",
      interleave: "20 target opportunities mixed with genuine target-free material · cue off",
      "exit-probe": "8 new matched Check opportunities · cue off",
    };
    return `<ol class="practice-weak-key-plan" aria-label="Fixed Weak Keys phase plan">${view.phases.map((phase) => `<li><span class="practice-weak-key-plan-index">${phase.ordinal}</span><div><strong>${escapeHtml(phase.label)}</strong><p>${escapeHtml(copy[phase.id])}</p></div><span>${phase.opportunityQuota}</span></li>`).join("")}</ol>`;
  }
  
  function renderWeakKeys(root, view, { focusSelector = null } = {}) {
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="weak-keys-detail">
      <div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back" aria-label="${escapeHtml(view.backLabel)}">← ${escapeHtml(view.backLabel)}</button><span class="practice-lab-status is-preview">PRACTICE LAB</span></header>
      <main class="practice-lab-detail practice-weak-key-detail">
        <div class="eyebrow">${escapeHtml(view.category)} · key intervention</div><h1>${escapeHtml(view.title)}</h1><p class="practice-lab-lead">${escapeHtml(view.description)}</p><p>${escapeHtml(view.longDescription)}</p>
        <section class="practice-lab-empty-state"><h2>Recommended keys</h2>${recommendationRows(view)}</section>
        <section class="practice-lab-empty-state"><div class="practice-lab-card-meta"><span>One key</span><span>80 direct opportunities · 1.0 dose</span></div><h2>Manual key</h2>
          <label class="practice-weak-key-target-field"><span>Letter</span><input data-weak-key-target type="text" value="${escapeHtml(view.targetValue)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" aria-describedby="weak-key-help"><small id="weak-key-help">One English letter a–z. Uppercase normalizes to lowercase. Weak Keys trains one letter at a time.</small></label>
          ${view.saturationWarning?.message ? `<div class="practice-lab-notice" role="status"><strong>Saturation note</strong><p>${escapeHtml(view.saturationWarning.message)}</p></div>` : ""}
          <button type="button" class="practice-lab-primary-action" data-practice-action="start-weak-keys" ${view.canStart && !view.preparing ? "" : "disabled"}>${view.preparing ? "BUILDING…" : "START WEAK KEYS"}</button>
          ${targetStatus(view)}
        </section>
        <section class="practice-lab-empty-state"><h2>What this mode does</h2><p>Weak Keys trains one measured letter across multiple words, word positions, and surrounding transitions. It does not prescribe a finger or enforce a touch-typing technique.</p><p>Where the active keyboard layout is known, keyboard geometry is used only to diversify observed transition contexts. Unknown layouts remain valid and are never treated as QWERTY.</p></section>
        <section class="practice-lab-empty-state"><h2>Session structure</h2><p>The fixed dose is never increased after errors and never shortened after a strong Baseline.</p>${phasePlan(view)}</section>
        <section class="practice-lab-empty-state"><h2>Evidence boundary</h2><p>Baseline and Check are both approved <code>training</code> material. The final Check is not transfer and one strong session does not mean “mastered,” “retained,” or “fixed forever.”</p><p>Transfer, benchmark, diagnostic, and research-holdout text are never used by this intervention.</p></section>
      </main></div>
    </section>`;
    const target = focusSelector ? root.querySelector?.(focusSelector) : null;
    (target ?? root.querySelector?.("[data-weak-key-target]") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
    return true;
  }
  
  function renderPracticeLabV21(root, view, options = {}) {
    if (view?.kind === "weak-keys-detail") return renderWeakKeys(root, view, options);
    return renderPracticeLabV20(root, view, options);
  }
  return Object.freeze({ renderPracticeLabV21 });
})();

// practiceLabRendererV22 — consolidated feature renderer
const __renderer_v22 = (() => {
  const { renderPracticeLabV21 } = __renderer_v21;
  const { buildPracticeProblemWordsDetailViewModel } = __r_v22_dep0;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const phenotype = (value) => ({ "launch-limited": "Slow start", slow: "Slow inside", inaccurate: "Inaccurate", hesitant: "Hesitant", "recovery-heavy": "Recovery-heavy", unstable: "Unstable", mixed: "Mixed" }[value] ?? "Mixed");
  function status(view) {
    if (view.status === "checking") return '<div class="practice-lab-notice" role="status"><strong>Checking this word…</strong><p>Only its approved training word index and bounded contexts are evaluated.</p></div>';
    if (view.status === "preparing") return '<div class="practice-lab-notice" role="status"><strong>Building the fixed plan…</strong><p>Verifying exact quotas, lexical target-free Mix material, and matched probes.</p></div>';
    if (view.status === "ready") return '<div class="practice-lab-notice" role="status"><strong>Standard protocol available.</strong><p>Start creates a new immutable 15-opportunity word session.</p></div>';
    if (["limited-content", "unsupported", "unavailable", "error"].includes(view.status)) return `<div class="practice-lab-notice" role="${view.status === "limited-content" ? "status" : "alert"}"><strong>${view.status === "limited-content" ? "Limited training content" : "Word unavailable"}</strong><p>${escapeHtml(view.message)}</p>${view.status === "limited-content" ? "<p>No weaker protocol or protected-text fallback will be substituted.</p>" : ""}</div>`;
    return '<div class="practice-lab-notice"><strong>Target selection</strong><p>Enter one English alphabetic word from 2 to 24 letters. Case is normalized to lowercase. Apostrophes, hyphens, digits, symbols, and multiple words are unsupported in v1.</p></div>';
  }
  function recommendations(view) {
    if (view.recommendationStatus === "loading") return '<p class="practice-lab-muted" role="status">Loading established word-limiter evidence…</p>';
    if (view.recommendationStatus === "no-evidence") return '<p class="practice-lab-muted">No problem word is currently well-established. Manual practice remains available.</p>';
    if (view.recommendationStatus === "unsupported") return '<p class="practice-lab-muted">Problem Words recommendations currently support English v1 only.</p>';
    if (view.recommendationStatus === "unavailable") return '<p class="practice-lab-muted">Recommendations are unavailable. Manual practice remains available.</p>';
    if (!view.recommendations.length) return '<p class="practice-lab-muted">Recommendations use existing limiter, learning, and performance evidence and do not preload every word shard.</p>';
    return `<div class="practice-weak-key-recommendations">${view.recommendations.map((item) => `<button type="button" data-practice-action="choose-problem-word" data-entity-key="${escapeHtml(item.entityKey)}" data-target-source="recommended"><strong>${escapeHtml(item.entityKey)}</strong><span>${escapeHtml(phenotype(item.limiterPhenotype))} · ${escapeHtml(item.limiterStatus)} · confidence ${Math.round(Number(item.evidenceConfidenceScore || 0))}%</span>${item.hierarchyDeemphasized ? '<small>May partly reflect lower-level key or combination issues.</small>' : ""}${item.saturationDeemphasized ? '<small>Recent similar practice appears to have low marginal gain.</small>' : ""}</button>`).join("")}</div>`;
  }
  function phases(view) {
    const copy = { "entry-probe": "3 uncued word opportunities", focus: "4 separated repetitions · strong whole-word cue", context: "3 varied natural contexts · subtle whole-word cue", interleave: "2 target opportunities mixed with target-free material · cue off", "exit-probe": "3 new matched word opportunities · cue off" };
    return `<ol class="practice-weak-key-plan" aria-label="Fixed Problem Words phase plan">${view.phases.map((phase) => `<li><span class="practice-weak-key-plan-index">${phase.ordinal}</span><div><strong>${escapeHtml(phase.label)}</strong><p>${escapeHtml(copy[phase.id])}</p></div><span>${phase.opportunityQuota}</span></li>`).join("")}</ol>`;
  }
  function renderPracticeProblemWordsDetail(root, view, { focusSelector = null } = {}) {
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="problem-words-detail"><div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← ${escapeHtml(view.backLabel)}</button><span class="practice-lab-status is-preview">PRACTICE LAB</span></header><main class="practice-lab-detail practice-weak-key-detail">
      <div class="eyebrow">${escapeHtml(view.category)} · lexical intervention</div><h1>${escapeHtml(view.title)}</h1><p class="practice-lab-lead">${escapeHtml(view.description)}</p><p>${escapeHtml(view.longDescription)}</p>
      <section class="practice-lab-empty-state"><h2>Recommended words</h2>${recommendations(view)}</section>
      <section class="practice-lab-empty-state"><div class="practice-lab-card-meta"><span>One word</span><span>15 direct opportunities · 1.0 dose</span></div><h2>Manual word</h2><label class="practice-weak-key-target-field"><span>Word</span><input data-problem-word-target type="text" value="${escapeHtml(view.targetValue)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="problem-word-help"><small id="problem-word-help">One English alphabetic word, 2–24 letters. Case normalizes to lowercase.</small></label>${view.warnings.map((warning) => `<div class="practice-lab-notice" role="status"><strong>${warning.kind === "saturation" ? "Saturation note" : "Hierarchy note"}</strong><p>${escapeHtml(warning.message)}</p></div>`).join("")}<button type="button" class="practice-lab-primary-action" data-practice-action="start-problem-words" ${view.canStart && !view.preparing ? "" : "disabled"}>${view.preparing ? "BUILDING…" : "START PROBLEM WORDS"}</button>${status(view)}</section>
      <section class="practice-lab-empty-state"><h2>What this mode trains</h2><p>Problem Words trains typing execution, not vocabulary or spelling recall. It keeps <strong>starting the word</strong>, <strong>inside the word</strong>, and <strong>whole-word first-pass accuracy</strong> as separate observations.</p><p>Constituent keys, bigrams, and trigrams can still contribute incidental Practice evidence but are never directly targeted or highlighted here.</p></section>
      <section class="practice-lab-empty-state"><h2>Session structure</h2><p>The fixed dose does not grow after errors or shrink after a strong Baseline.</p>${phases(view)}</section>
      <section class="practice-lab-empty-state"><h2>Evidence boundary</h2><p>All five phases use approved <code>training</code> material. Check is target-enriched same-session evidence, not cold transfer, retention, mastery, or a causal treatment claim.</p></section>
    </main></div></section>`;
    (focusSelector ? root.querySelector?.(focusSelector) : null ?? root.querySelector?.("[data-problem-word-target]") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
    return true;
  }
  
  function createPracticeLabRendererV22({ getProblemWordsState } = {}) {
    return function renderPracticeLabV22(root, view, options = {}) {
      if (view?.kind === "experiment-detail" && view?.title === "Problem Words") {
        const detail = buildPracticeProblemWordsDetailViewModel({ entry: view, resolved: { runnable: view.runnable }, state: getProblemWordsState?.() });
        return renderPracticeProblemWordsDetail(root, detail, options);
      }
      return renderPracticeLabV21(root, view, options);
    };
  }
  return Object.freeze({ renderPracticeProblemWordsDetail, createPracticeLabRendererV22 });
})();

// practiceLabRendererV23 — consolidated feature renderer
const __renderer_v23 = (() => {
  const { renderPracticeLabV21 } = __renderer_v21;
  const { renderPracticeProblemWordsDetail } = __renderer_v22;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const typeLabel = (type) => ({ key: "Key", bigram: "Bigram", trigram: "Trigram", word: "Word" })[type] ?? "Target";
  function recommendations(view) {
    if (view.recommendationStatus === "loading") return '<p class="practice-lab-muted">Loading evidence-based targets…</p>';
    if (!view.recommendations.length) return '<p class="practice-lab-muted">No accuracy or recovery limiter is currently well-established. Manual selection remains available.</p>';
    return `<div class="practice-combination-recommendations">${view.recommendations.map((item) => `<button type="button" data-practice-action="choose-accuracy-recovery-target" data-entity-type="${escapeHtml(item.entityType)}" data-entity-key="${escapeHtml(item.entityKey)}"><strong>${escapeHtml(item.entityKey)}</strong><span>${escapeHtml(typeLabel(item.entityType))} · ${escapeHtml(item.limiterPhenotype ?? "Mixed")}</span><small>${Math.round(item.evidenceConfidenceScore ?? 0)}% evidence confidence${item.hierarchyDeemphasized ? " · lower-level explanation present" : ""}${item.saturationDeemphasized ? " · recent similar practice may have low marginal gain" : ""}</small></button>`).join("")}</div>`;
  }
  function notice(view) {
    if (view.status === "checking" || view.status === "preparing") return `<div class="practice-lab-notice" role="status"><strong>${view.status === "preparing" ? "Building fixed intervention…" : "Checking approved training content…"}</strong></div>`;
    if (["limited-content", "unsupported", "unavailable"].includes(view.status)) return `<div class="practice-lab-notice" role="alert"><strong>Target unavailable</strong><p>${escapeHtml(view.message ?? view.reasonCode ?? "The full v1 protocol cannot be built for this target.")}</p></div>`;
    return "";
  }
  function warnings(view) { return view.warnings.length ? `<div class="practice-lab-notice" role="note">${view.warnings.map((warning) => `<p>${escapeHtml(warning.message)}</p>`).join("")}</div>` : ""; }
  function phases(view) { return `<ol class="practice-combination-plan">${view.phases.map((phase) => `<li><span class="practice-combination-plan-index">${phase.ordinal}</span><div><strong>${escapeHtml(phase.label)}</strong><p>${phase.id === "baseline" ? "Uncued pre-practice target observation" : phase.id === "control" ? "Manageable target-rich contexts; subtle cue" : phase.id === "repair" ? "Broader contexts; natural errors repaired normally" : phase.id === "mix" ? "Target-bearing + target-free material; no cue" : "Matched same-session check; no cue"}</p></div><span>${phase.opportunityQuota ?? "—"}</span></li>`).join("")}</ol>`; }
  
  function renderPracticeAccuracyRecoveryDetail(root, view, { focusSelector = null } = {}) {
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="accuracy-recovery-detail"><div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">PRACTICE LAB</span></header><main class="practice-lab-detail"><div class="eyebrow">Precision · control intervention</div><h1>Accuracy & Recovery</h1><p class="practice-lab-lead">Practice clean first-pass typing and more precise recovery when errors occur, without chasing an artificially slow perfect score.</p>
      <section class="practice-lab-empty-state"><h2>Recommended targets</h2>${recommendations(view)}</section>
      <section class="practice-lab-empty-state"><h2>Manual target</h2><p>Choose the entity family explicitly. The same text may represent different skills—for example, <code>the</code> can be a trigram or a word.</p><div class="practice-combination-type-toggle" role="group" aria-label="Target type"><button type="button" data-practice-action="set-accuracy-recovery-type" data-manual-type="key" aria-pressed="${view.manualType === "key"}">KEY</button><button type="button" data-practice-action="set-accuracy-recovery-type" data-manual-type="combination" aria-pressed="${view.manualType === "combination"}">COMBINATION</button><button type="button" data-practice-action="set-accuracy-recovery-type" data-manual-type="word" aria-pressed="${view.manualType === "word"}">WORD</button></div><label class="practice-combination-target-field"><span>Target</span><input data-accuracy-recovery-target type="text" value="${escapeHtml(view.targetValue)}" maxlength="24" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>${warnings(view)}${notice(view)}<button type="button" class="practice-lab-primary-action" data-practice-action="start-accuracy-recovery" ${view.canStart ? "" : "disabled"}>START ACCURACY & RECOVERY</button></section>
      <section class="practice-lab-empty-state"><h2>What this mode trains</h2><p>Aim for clean first-pass typing at a comfortable normal pace. If an error happens, repair it precisely and return to your rhythm.</p><p>No errors are injected, no 98% rule is imposed, and forward typing is never blocked until correction.</p></section>
      <section class="practice-lab-empty-state"><h2>Session structure${view.targetOpportunityBudget ? ` · ${view.targetOpportunityBudget} target opportunities` : ""}</h2>${phases(view)}<p>Recovery evidence is opportunistic. An error-free session can show strong first-pass control while recovery remains unobserved.</p></section>
    </main></div></section>`;
    (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-accuracy-recovery-target]") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
    return true;
  }
  function renderPracticeLabV23(root, view, options = {}) {
    if (view?.kind === "accuracy-recovery-detail") return renderPracticeAccuracyRecoveryDetail(root, view, options);
    if (view?.kind === "problem-words-detail") return renderPracticeProblemWordsDetail(root, view, options);
    return renderPracticeLabV21(root, view, options);
  }
  return Object.freeze({ renderPracticeAccuracyRecoveryDetail, renderPracticeLabV23 });
})();

// practiceLabRendererV24 — consolidated feature renderer
const __renderer_v24 = (() => {
  const { renderPracticeLabV23 } = __renderer_v23;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  
  function availabilityCopy(status, availability, kind) {
    if (status === "loading") return "Checking availability…";
    if (status === "ready") return kind === "cold" ? "Available" : "Ready";
    const reason = kind === "cold" ? availability?.reason : availability?.reasons?.[0];
    if (reason === "REAL_TEXT_COLD_TRANSFER_EXHAUSTED") return "No fresh Cold Transfer passage remains in this pool.";
    if (reason === "REAL_TEXT_COLD_TRANSFER_HISTORY_PARTIAL") return "Cold Transfer is unavailable because protected exposure history is not complete.";
    if (reason === "REAL_TEXT_POOL_NOT_READY") return "The approved Real Text training pool is not ready yet.";
    return reason ? String(reason).replaceAll("_", " ") : "Unavailable";
  }
  
  function renderPracticeRealTextDetail(root, view, { focusSelector = null } = {}) {
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="real-text-detail"><div class="practice-lab-shell">
      <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">PRACTICE LAB</span></header>
      <main class="practice-lab-detail"><div class="eyebrow">Real-world · broad context</div><h1>Real Text</h1><p class="practice-lab-lead">Practice broad natural text without target-specific cues, or run a protected Cold Transfer Check to measure generalization on fresh material.</p>
        <div class="practice-real-text-flow-grid">
          <section class="practice-lab-empty-state practice-real-text-flow is-primary"><div class="practice-lab-card-meta"><span>Natural Practice</span><span>Training partition</span></div><h2>Broad untargeted prose</h2><p>Repeatable natural-text training. No weak target, limiter, mastery state, or learning state is used to choose the text.</p>
            <div class="practice-combination-type-toggle" role="group" aria-label="Natural Practice duration">${view.durations.map((item) => `<button type="button" data-practice-action="set-real-text-duration" data-duration-ms="${item.durationMs}" aria-pressed="${view.durationMs === item.durationMs}" ${item.available ? "" : "disabled"}>${item.minutes} MIN</button>`).join("")}</div>
            <p class="practice-lab-muted">${escapeHtml(availabilityCopy(view.practiceStatus, view.practiceAvailability, "practice"))}</p>
            <button type="button" class="practice-lab-primary-action" data-practice-action="start-real-text-natural" ${view.naturalCanStart ? "" : "disabled"}>${view.starting === "natural" ? "STARTING…" : "START NATURAL PRACTICE"}</button>
          </section>
          <section class="practice-lab-empty-state practice-real-text-flow is-measurement"><div class="practice-lab-card-meta"><span>Cold Transfer Check</span><span>Protected transfer · 60 s</span></div><h2>Fresh protected natural text</h2><p>This is a measurement, not practice. Selection is independent of your current targets.</p><div class="practice-lab-notice" role="note">This uses one fresh protected passage. Once opened, that passage cannot be used as a cold check again.</div>
            <p class="practice-lab-muted">${escapeHtml(availabilityCopy(view.coldStatus, view.coldAvailability, "cold"))}</p>
            <button type="button" data-practice-action="start-real-text-cold" ${view.coldCanStart ? "" : "disabled"}>${view.starting === "cold" ? "RESERVING…" : "START COLD TRANSFER CHECK"}</button>
          </section>
        </div>
        <section class="practice-lab-empty-state"><h2>Why these are separate</h2><p><strong>Natural Practice</strong> contributes ordinary training evidence. <strong>Cold Transfer</strong> uses protected material and may contribute transfer and cold-natural ability evidence only when its integrity rules pass.</p><p>Neither flow contains target entities or resamples text to include a recently trained weakness.</p></section>
      </main></div></section>`;
    (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-real-text-natural']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
    return true;
  }
  
  function renderPracticeLabV24(root, view, options = {}) {
    if (view?.kind === "real-text-detail") return renderPracticeRealTextDetail(root, view, options);
    return renderPracticeLabV23(root, view, options);
  }
  return Object.freeze({ renderPracticeRealTextDetail, renderPracticeLabV24 });
})();

// practiceLabRendererV25 — consolidated feature renderer
const __renderer_v25 = (() => {
  const { renderPracticeLabV24 } = __renderer_v24;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const statusClass = (value) => String(value ?? "pending").replace(/[^a-z0-9-]/gi, "");
  const number = (value, digits = 2) => Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1") : "—";
  
  const COACH_ERROR_COPY = Object.freeze({
    PRACTICE_STORAGE_TRANSACTION_FAILED: "Practice could not complete a storage transaction. The plan has not been reported as saved. Your existing data has not been cleared; the technical details identify the failing operation.",
    PRACTICE_STORAGE_OPEN_FAILED: "WordStrike could not open the local Practice database. Try again; if the problem persists, reload WordStrike.",
    PRACTICE_STORAGE_RECOVERY_REQUIRED: "Your local Practice database needs a schema repair. Reload WordStrike once to complete the upgrade; do not clear site data.",
    PRACTICE_STORAGE_QUOTA_EXCEEDED: "Your browser could not allocate enough local storage for Practice. Free some site storage and try again.",
    PRACTICE_STORAGE_UNAVAILABLE: "Local browser storage is unavailable, so Daily Training cannot save its plan in this session.",
    PRACTICE_COACH_PLAN_FAILED: "Daily Training could not create today's plan. Try again.",
    PRACTICE_COACH_UNAVAILABLE: "Daily Training could not load its local Practice data. Try again.",
    PRACTICE_COACH_NO_AVAILABLE_BLOCKS: "No verified training block fits right now. Nothing was frozen or saved; you can try again later or choose a drill manually.",
    PRACTICE_COACH_BLOCK_START_FAILED: "The next block could not start. The frozen plan was recovered so you can continue with any remaining block.",
    PRACTICE_COACH_SKIP_FAILED: "This block could not be skipped. The frozen plan is unchanged.",
    PRACTICE_COACH_END_FAILED: "Daily Training could not end the frozen plan. Completed blocks remain saved.",
    PRACTICE_COACH_RECOVERY_FAILED: "The interrupted block could not be recovered automatically. If it is not open in another tab, reload WordStrike and try again.",
  });
  
  function coachErrorCopy(code) {
    return COACH_ERROR_COPY[code] ?? "Daily Training could not complete this action. Try again; if the problem persists, reload WordStrike.";
  }
  function coachErrorTitle(code) {
    if (code === "PRACTICE_COACH_NO_AVAILABLE_BLOCKS") return "No Daily Training block is available right now.";
    if (code === "PRACTICE_COACH_BLOCK_START_FAILED") return "A Daily Training block could not start.";
    if (code === "PRACTICE_COACH_SKIP_FAILED") return "The block could not be skipped.";
    if (code === "PRACTICE_COACH_END_FAILED") return "Daily Training could not end.";
    if (code === "PRACTICE_COACH_RECOVERY_FAILED") return "The interrupted block still needs recovery.";
    return "Daily Training could not save or load its local plan.";
  }
  
  function renderDurationChoices(view) {
    const locked = Boolean(view.plan) || view.status === "creating";
    return `<div class="practice-coach-duration" role="group" aria-label="Daily Training duration">${view.durationChoices.map((item) => `<button type="button" data-practice-action="set-coach-duration" data-coach-minutes="${item.minutes}" aria-pressed="${item.selected}" ${locked ? "disabled" : ""}>${item.minutes} MIN</button>`).join("")}</div>`;
  }
  
  function renderSuggestion(suggestion, type) {
    if (!suggestion) return "";
    if (type === "assessment") return `<article class="practice-coach-suggestion"><div class="eyebrow">Measurement suggestion</div><h3>Assessment recommended</h3><p>Your current-context assessment is missing or stale. A new assessment could improve future Coach decisions.</p><button type="button" data-practice-action="open-coach-assessment">VIEW ASSESSMENT</button></article>`;
    return `<article class="practice-coach-suggestion"><div class="eyebrow">Measurement suggestion</div><h3>Cold Transfer available</h3><p>A fresh Cold Transfer Check is available if you want protected generalization evidence.</p><button type="button" data-practice-action="open-coach-cold-transfer">VIEW REAL TEXT</button></article>`;
  }
  
  function renderBlock(block, view) {
    const target = block.target ? `<span class="practice-coach-target">${escapeHtml(block.target)}</span>` : "";
    const informed = block.responseInformed ? '<span class="practice-lab-status">Response-informed</span>' : "";
    const blocked = block.blockedReason ? `<p class="practice-lab-muted">${escapeHtml(block.blockedReason)}</p>` : "";
    const skip = block.canSkip && view.plan?.status !== "abandoned" && view.plan?.status !== "expired"
      ? `<button type="button" class="practice-lab-text-button" data-practice-action="skip-coach-block" data-coach-block-id="${escapeHtml(block.blockId)}">SKIP</button>` : "";
    return `<article class="practice-coach-block" data-coach-block-id="${escapeHtml(block.blockId)}" data-status="${statusClass(block.status)}">
      <div class="practice-coach-block-index">${block.ordinal}</div>
      <div class="practice-coach-block-copy"><div class="practice-lab-card-meta"><span>${escapeHtml(block.title)}</span><span>~${block.estimatedMinutes} min</span></div>
        <div class="practice-coach-block-title"><h3>${escapeHtml(block.title)}</h3>${target}${informed}</div>
        <p>${escapeHtml(block.reason)}</p>${blocked}</div>
      <div class="practice-coach-block-actions"><span class="practice-lab-status" data-status="${statusClass(block.status)}">${escapeHtml(block.statusLabel)}</span>${skip}</div>
    </article>`;
  }
  
  function renderOptionComparison(row) {
    const modifier = Number.isFinite(row.responseModifier) ? `${number(row.responseModifier)}×` : "—";
    return `<li><strong>${escapeHtml(row.experimentId ?? "unknown")}</strong> · base match ${number(row.baseInterventionMatch)} · modifier ${escapeHtml(modifier)} · personalized utility ${number(row.personalizedOptionUtility)}<br><span class="practice-lab-muted">${escapeHtml(row.sourceScope ?? "none")} · ${escapeHtml(row.evidenceDepth ?? "insufficient")} · ${escapeHtml(row.responsePattern ?? "insufficient")}</span></li>`;
  }
  
  function renderDeveloperDiagnostic(item) {
    const assignment = item.assignmentComposition
      ? `${Number(item.assignmentComposition.manual || 0)} manual · ${Number(item.assignmentComposition.coach || 0)} Coach`
      : "—";
    const options = item.optionComparisons?.length
      ? `<ul>${item.optionComparisons.map(renderOptionComparison).join("")}</ul>`
      : "<p class=\"practice-lab-muted\">No response-adjusted alternative comparison was stored.</p>";
    return `<article class="practice-lab-empty-state" data-coach-personalization-diagnostic="${escapeHtml(item.blockId)}">
      <div class="eyebrow">${escapeHtml(item.title)}${item.target ? ` · ${escapeHtml(item.target)}` : ""}</div>
      <p>Need utility <strong>${number(item.needUtility)}</strong> · base utility <strong>${number(item.baseUtilityScore)}</strong> · personalized utility <strong>${number(item.personalizedUtilityScore)}</strong> · response modifier <strong>${number(item.responseModifier)}×</strong></p>
      <p class="practice-lab-muted">${escapeHtml(item.sourceScope ?? "none")} evidence · ${escapeHtml(item.evidenceDepth ?? "insufficient")} depth · ${escapeHtml(item.responsePattern ?? "insufficient")} · ${Number(item.eligibleSampleCount || 0)} eligible samples · ${escapeHtml(item.freshnessBucket ?? "no freshness bucket")} · ${escapeHtml(assignment)} · ${escapeHtml(item.measurementGrade ?? "no measurement grade")}</p>
      ${options}
    </article>`;
  }
  
  function renderDeveloperDiagnostics(plan, view) {
    if (!view.preview || !plan.developerDiagnostics?.length) return "";
    return `<details class="practice-lab-empty-state" data-coach-personalization-diagnostics><summary><strong>Coach v2 diagnostics</strong></summary><p class="practice-lab-muted">Developer-only bounded audit data. Current need determines inclusion; response evidence can only adjust selection among compatible methods.</p>${plan.developerDiagnostics.map(renderDeveloperDiagnostic).join("")}</details>`;
  }
  
  function renderPracticeCoach(root, view, { focusSelector = null } = {}) {
    const plan = view.plan;
    const detail = view.errorDetail;
    const technical = detail
      ? [view.errorCode, detail.stage && `stage=${detail.stage}`, detail.operation && `operation=${detail.operation}`, detail.name && `error=${detail.name}`, detail.causeName && `cause=${detail.causeName}`, detail.causeMessage && `message=${detail.causeMessage}`].filter(Boolean).join(" · ")
      : String(view.errorCode ?? "");
    const planningRetry = !plan && ["PRACTICE_COACH_PLAN_FAILED", "PRACTICE_COACH_NO_AVAILABLE_BLOCKS"].includes(view.errorCode);
    const errorRole = view.errorCode === "PRACTICE_COACH_NO_AVAILABLE_BLOCKS" ? "status" : "alert";
    const errorRetry = view.errorCode && !planningRetry
      ? '<div><button type="button" data-practice-action="reload-coach">TRY AGAIN</button></div>'
      : "";
    const error = view.errorCode ? `<div class="practice-lab-notice is-warning practice-coach-error" role="${errorRole}"><strong>${escapeHtml(coachErrorTitle(view.errorCode))}</strong> <span>${escapeHtml(coachErrorCopy(view.errorCode))}</span>${errorRetry}${technical ? `<details><summary>Technical details</summary><code>${escapeHtml(technical)}</code></details>` : ""}</div>` : "";
    const createLabel = view.status === "creating"
      ? "CREATING PLAN…"
      : view.errorCode === "PRACTICE_COACH_NO_AVAILABLE_BLOCKS"
        ? "CHECK AGAIN"
        : view.errorCode === "PRACTICE_COACH_PLAN_FAILED"
          ? "TRY AGAIN"
          : "CREATE TODAY'S PLAN";
    const beforePlan = !plan ? `<section class="practice-coach-create">
        <div class="practice-lab-section-heading"><div><div class="eyebrow">Choose today's budget</div><h2>${view.requestedMinutes} minutes</h2></div><p>This sets a planning budget, not a quota. The Coach may intentionally underfill it when no useful block fits.</p></div>
        ${renderDurationChoices(view)}
        <button type="button" class="practice-lab-primary-action" data-practice-action="create-coach-plan" ${view.canCreate ? "" : "disabled"}>${createLabel}</button>
      </section>` : "";
    const recovery = plan?.recoveryAvailable ? `<div class="practice-lab-notice is-warning" role="status"><strong>An interrupted Daily Training block is still marked active.</strong><p>If that session is still open in another tab, continue it there. If this page was reloaded or the session crashed and no other tab is running it, recover the frozen plan.</p><button type="button" data-practice-action="recover-coach-active">RECOVER INTERRUPTED BLOCK</button></div>` : "";
    const planSection = plan ? `${recovery}<section class="practice-coach-plan" aria-labelledby="practice-coach-plan-title">
        <div class="practice-coach-plan-header"><div><div class="eyebrow">${escapeHtml(plan.statusLabel)}</div><h2 id="practice-coach-plan-title">~${plan.plannedMinutes} min · ${plan.blockCount} block${plan.blockCount === 1 ? "" : "s"}</h2><p>${escapeHtml(plan.budgetLabel)} · ${escapeHtml(plan.progress.label)} · ${escapeHtml(plan.coverageLabel ?? "")}</p></div>
          <div class="practice-coach-plan-actions">${plan.canStartNext ? `<button type="button" class="practice-lab-primary-action" data-practice-action="start-coach-next">START NEXT BLOCK</button>` : ""}${plan.canEndToday ? '<button type="button" data-practice-action="abandon-coach-plan">END FOR TODAY</button>' : ""}</div></div>
        <div class="practice-coach-blocks">${plan.blocks.map((block) => renderBlock(block, view)).join("")}</div>
      </section>
      <section class="practice-lab-empty-state"><h2>Why this plan?</h2>${plan.rationales.length ? `<ul>${plan.rationales.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : "<p>Broad practice is the best available use of today's budget.</p>"}<p class="practice-lab-muted">The plan is frozen when created and is not rewritten after individual block results.</p></section>
      ${renderDeveloperDiagnostics(plan, view)}
      ${(plan.suggestions?.assessmentSuggestion || plan.suggestions?.coldTransferSuggestion) ? `<section class="practice-coach-suggestions" aria-labelledby="practice-coach-suggestions-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">Separate measurements</div><h2 id="practice-coach-suggestions-title">Optional suggestions</h2></div><p>These are outside today's training block count and never start automatically.</p></div><div class="practice-coach-suggestion-grid">${renderSuggestion(plan.suggestions.assessmentSuggestion, "assessment")}${renderSuggestion(plan.suggestions.coldTransferSuggestion, "cold")}</div></section>` : ""}` : "";
  
    root.innerHTML = `<section class="screen practice-lab-screen practice-coach-screen" data-practice-view="daily-training"><div class="practice-lab-shell">
      <header class="practice-lab-header"><div><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><div class="eyebrow">Coach · orchestration</div><h1 tabindex="-1" data-practice-heading>${escapeHtml(view.title)}</h1><p>${escapeHtml(view.subtitle)}</p></div>${view.preview ? '<span class="practice-lab-status is-preview">PRACTICE LAB</span>' : ""}</header>
      <main>${error}${view.status === "loading" ? '<div class="practice-lab-empty-state" aria-busy="true"><h2>Loading today’s plan…</h2></div>' : ""}${beforePlan}${planSection}</main>
    </div></section>`;
    (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-coach-next']") ?? root.querySelector?.("[data-practice-action='create-coach-plan']") ?? root.querySelector?.("[data-practice-heading]"))?.focus?.({ preventScroll: true });
    return true;
  }
  
  function renderPracticeLabV25(root, view, options = {}) {
    if (view?.kind === "daily-training") return renderPracticeCoach(root, view, options);
    const rendered = renderPracticeLabV24(root, view, options);
    if (view?.kind === "home") {
      const card = root.querySelector?.(".practice-lab-daily");
      const button = card?.querySelector?.("button");
      if (button) {
        button.disabled = false;
        button.removeAttribute?.("aria-disabled");
        button.dataset.practiceAction = "navigate";
        button.dataset.route = "daily-training";
        button.textContent = "OPEN DAILY TRAINING";
      }
      const status = card?.querySelector?.("li");
      if (status) status.textContent = "Available";
    }
    return rendered;
  }
  return Object.freeze({ renderPracticeCoach, renderPracticeLabV25 });
})();

// practiceLabRendererV26 — consolidated feature renderer
const __renderer_v26 = (() => {
  const { renderPracticeLabV25 } = __renderer_v25;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
  function renderPracticePaceLadderDetail(root, view, { focusSelector = null } = {}) {
    const needsAnchor = view.availability?.mode === "user-selected-anchor-required";
    const measured = view.availability?.mode === "measured-anchor";
    const validManual = Number.isFinite(Number(view.userSelectedWpm)) && Number(view.userSelectedWpm) >= 5 && Number(view.userSelectedWpm) <= 400;
    const canStart = view.status === "ready" && !view.starting && (!needsAnchor || validManual);
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="pace-ladder-detail"><div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">PRACTICE LAB</span></header><main class="practice-lab-detail"><div class="eyebrow">Performance · diagnostic · ~3 min</div><h1>Pace Ladder</h1><p class="practice-lab-lead">Find the short-form pace where accuracy and control start to break down. This is target-free diagnostic text; the Control Frontier model owns the final inference.</p><section class="practice-lab-empty-state"><h2>Anchor</h2><p>${measured ? "A recent ordinary, target-free Real Text pace is available as the default anchor. You can explicitly override it below." : needsAnchor ? "No eligible ordinary-performance anchor is available. Choose a comfortable pace to run the diagnostic." : view.status === "loading" ? "Checking diagnostic prerequisites…" : "The diagnostic is currently unavailable."}</p><label for="pace-ladder-anchor"><strong>Comfortable pace (WPM)</strong></label><input id="pace-ladder-anchor" data-pace-anchor-input inputmode="numeric" type="number" min="5" max="400" step="1" value="${escapeHtml(view.userSelectedWpm)}" placeholder="Optional when a measured anchor exists" aria-describedby="pace-anchor-help"><p id="pace-anchor-help" class="practice-lab-muted">An explicit value always takes precedence. It is never inferred from targeted drills, Cold Transfer, Full Assessment, retention reviews, or burst observations.</p>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}<button type="button" class="practice-lab-primary-action" data-practice-action="start-pace-ladder" ${canStart ? "" : "disabled"}>${view.starting ? "STARTING…" : "START PACE LADDER"}</button></section><section class="practice-lab-empty-state"><h2>Fixed protocol</h2><div style="overflow-x:auto;max-width:100%"><table><thead><tr><th>Stage</th><th>Time</th><th>Target</th></tr></thead><tbody><tr><td>Reference</td><td>30 s</td><td>Comfortable anchor</td></tr><tr><td>1</td><td>20 s</td><td>75%</td></tr><tr><td>2</td><td>20 s</td><td>85%</td></tr><tr><td>3</td><td>20 s</td><td>95%</td></tr><tr><td>4</td><td>20 s</td><td>105%</td></tr><tr><td>5</td><td>20 s</td><td>115%</td></tr><tr><td>6</td><td>20 s</td><td>125%</td></tr><tr><td>7</td><td>20 s</td><td>110%</td></tr><tr><td>8</td><td>20 s</td><td>90%</td></tr></tbody></table></div><p>Total active time: <strong>190 seconds</strong>. The ladder never asks for more than 125% of the anchor.</p></section><section class="practice-lab-empty-state"><h2>Evidence boundary</h2><p>This diagnostic can support pace-control evidence. It does not estimate true maximum speed, endurance, latent ability, fatigue capacity, or coaching readiness.</p><p>Interrupting the run stops it immediately and prevents a Control Frontier update.</p></section></main></div></section>`;
    (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-pace-ladder']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true }); return true;
  }
  function renderPracticeLabV26(root, view, options = {}) { if (view?.kind === "pace-ladder-detail") return renderPracticePaceLadderDetail(root, view, options); return renderPracticeLabV25(root, view, options); }
  return Object.freeze({ renderPracticePaceLadderDetail, renderPracticeLabV26 });
})();

// practiceLabRendererV27 — consolidated feature renderer
const __renderer_v27 = (() => {
  const { renderPracticeLabV26 } = __renderer_v26;
  const { PRACTICE_BURST_RECOVERY_DURATION_MS, PRACTICE_BURST_SPRINT_COUNT, PRACTICE_BURST_SPRINT_DURATION_MS, PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS } = __r_v27_dep0;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  
  function renderPracticeBurstSprintsDetail(root, view, { focusSelector = null } = {}) {
    const canStart = view.status === "ready" && !view.starting;
    const sprintSeconds = PRACTICE_BURST_SPRINT_DURATION_MS / 1000;
    const recoverySeconds = PRACTICE_BURST_RECOVERY_DURATION_MS / 1000;
    const protocolSeconds = PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS / 1000;
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="burst-sprints-detail"><div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">PRACTICE LAB</span></header><main class="practice-lab-detail"><div class="eyebrow">Speed · diagnostic training · ~${Math.round(protocolSeconds / 60)} min</div><h1>Burst Sprints</h1><p class="practice-lab-lead">Measure and train short-form burst speed with six controlled ${sprintSeconds}-second bouts separated by full ${recoverySeconds}-second recovery intervals. The dedicated burst-ability model owns the resulting ability state.</p><section class="practice-lab-empty-state"><h2>Protocol</h2><div style="overflow-x:auto;max-width:100%"><table><thead><tr><th>Block</th><th>Duration</th><th>Instruction</th></tr></thead><tbody>${Array.from({ length: PRACTICE_BURST_SPRINT_COUNT }, (_, index) => `<tr><td>Sprint ${index + 1}</td><td>${sprintSeconds} s</td><td>Fast, but controlled</td></tr>${index < PRACTICE_BURST_SPRINT_COUNT - 1 ? `<tr><td>Recovery</td><td>${recoverySeconds} s</td><td>Hands off; fully reset</td></tr>` : ""}`).join("")}</tbody></table></div><p>Active typing time: <strong>60 seconds</strong>. Total protocol time: <strong>${protocolSeconds} seconds</strong>.</p></section><section class="practice-lab-empty-state"><h2>Measurement rule</h2><p>Each sprint must remain accurate enough to count. The session estimate uses the <strong>median of the three fastest eligible sprints</strong>, so one lucky spike cannot become your burst ability estimate.</p><p class="practice-lab-muted">The six bouts are one diagnostic dose. A valid run produces at most one burst-ability observation.</p></section><section class="practice-lab-empty-state"><h2>Evidence boundary</h2><p>Burst Sprints estimates short-form controlled burst speed. It does not claim a universal maximum WPM, endurance capacity, cold-transfer performance, or a Pace Ladder control frontier.</p><p>Stopping the run, hiding the page, or failing to produce at least three eligible sprints prevents a burst ability update.</p>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}<button type="button" class="practice-lab-primary-action" data-practice-action="start-burst-sprints" ${canStart ? "" : "disabled"}>${view.starting ? "STARTING…" : "START BURST SPRINTS"}</button></section></main></div></section>`;
    (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-burst-sprints']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
    return true;
  }
  
  function renderPracticeLabV27(root, view, options = {}) {
    if (view?.kind === "burst-sprints-detail") return renderPracticeBurstSprintsDetail(root, view, options);
    return renderPracticeLabV26(root, view, options);
  }
  return Object.freeze({ renderPracticeBurstSprintsDetail, renderPracticeLabV27 });
})();

// practiceLabRendererV28 — consolidated feature renderer
const __renderer_v28 = (() => {
  const { renderPracticeLabV27 } = __renderer_v27;
  const { PRACTICE_COMMON_WORD_BANDS, PRACTICE_COMMON_WORD_BAND_LABELS, PRACTICE_COMMON_WORD_PRACTICE_SIZES } = __r_v28_dep0;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const n = (value, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
  function breadthRows(snapshot) {
    return PRACTICE_COMMON_WORD_BANDS.map((band) => { const row = snapshot?.bands?.[band] ?? {}; return `<tr><th scope="row">${PRACTICE_COMMON_WORD_BAND_LABELS[band]}</th><td>${row.observedCount ?? 0} / ${row.totalWords ?? "—"}<br><small>${n(row.observedPercent)}%</small></td><td>${row.repeatedEvidenceCount ?? 0}<br><small>${n(row.repeatedEvidencePercent)}%</small></td><td>${row.automaticCount ?? 0}<br><small>${n(row.automaticPercent)}%</small></td></tr>`; }).join("");
  }
  function hasObservedBreadthEvidence(snapshot) {
    return Number(snapshot?.overall?.observedCount ?? 0) > 0;
  }
  
  function renderPracticeCommonWordsDetail(root, view, { focusSelector = null } = {}) {
    const availability = view.availability ?? {};
    const practiceAvailable = availability.practiceAvailable === true && !view.starting;
    const checkAvailable = availability.checkAvailable === true && !view.starting;
    const breadthContent = view.breadthSnapshot && hasObservedBreadthEvidence(view.breadthSnapshot)
      ? `<div style="overflow-x:auto"><table><thead><tr><th>Band</th><th>Measured</th><th>Repeated evidence</th><th>Automatic</th></tr></thead><tbody>${breadthRows(view.breadthSnapshot)}</tbody></table></div><p>WordStrike currently has repeated typing evidence for ${n(view.breadthSnapshot.overall?.repeatedEvidencePercent)}% of this 1,200-word common-word reference.</p>`
      : `<p>WordStrike has only limited typing evidence across the common-word reference so far.</p>`;
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="common-words-detail"><div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">PRACTICE LAB</span></header><main class="practice-lab-detail"><div class="eyebrow">Fluency · broad lexical execution</div><h1>Common Words</h1><p class="practice-lab-lead">Build fast, fluent execution across a broad range of frequently used words. Common Words is about typing breadth across a versioned reference bank—not a test of which English words you know.</p><section class="practice-lab-empty-state"><h2>Common Words Practice</h2><p>Practice a balanced mix of common words, prioritizing words with less typing evidence rather than only your weakest words.</p><fieldset><legend>Practice size</legend><div class="practice-lab-duration-grid">${PRACTICE_COMMON_WORD_PRACTICE_SIZES.map((size) => `<button type="button" data-practice-action="common-words-size" data-word-count="${size}" aria-pressed="${view.wordCount === size ? "true" : "false"}" ${availability.practiceSizes?.includes?.(size) ? "" : "disabled"}>${size} words</button>`).join("")}</div></fieldset><p class="practice-lab-muted">Every 20-word block contains 5 Core, 5 Frequent, 5 Common, and 5 Broad words. Live WPM, aggregate accuracy, PBs, leaderboards, metronome, and weakness targeting are off.</p><button type="button" class="practice-lab-primary-action" data-practice-action="start-common-words-practice" ${practiceAvailable ? "" : "disabled"}>${view.starting === "practice" ? "STARTING…" : `START ${view.wordCount ?? 160}-WORD PRACTICE`}</button></section><section class="practice-lab-empty-state"><div class="eyebrow">Standardized · 200 words · ~2–4 min</div><h2>Typing Breadth Check</h2><p>A standardized common-word form used to estimate your broad common-word typing ability.</p><p><strong>This check uses a fixed balanced sample. It does not adapt its words to your current weaknesses.</strong></p><p class="practice-lab-muted">200 words · 50 per frequency band · 10 balanced microblocks · corrections allowed · no live score.</p><button type="button" class="practice-lab-primary-action" data-practice-action="start-common-words-check" ${checkAvailable ? "" : "disabled"}>${view.starting === "check" ? "STARTING…" : "START TYPING BREADTH CHECK"}</button></section><section class="practice-lab-empty-state"><h2>Current typing breadth</h2>${breadthContent}<div class="practice-lab-notice" role="note">Typing breadth measures WordStrike's typing evidence across the common-word reference. It does not estimate how many English words you know.</div></section>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}</main></div></section>`;
    (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-common-words-practice']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
    return true;
  }
  
  function renderPracticeLabV28(root, view, options = {}) {
    if (view?.kind === "common-words-detail") return renderPracticeCommonWordsDetail(root, view, options);
    return renderPracticeLabV27(root, view, options);
  }
  return Object.freeze({ renderPracticeCommonWordsDetail, renderPracticeLabV28 });
})();

// practiceLabRendererV29 — consolidated feature renderer
const __renderer_v29 = (() => {
  const { renderPracticeLabV28 } = __renderer_v28;
  const { PRACTICE_CONSISTENCY_DURATIONS_MS } = __r_v29_dep0;
  const { PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS } = __r_v29_dep1;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const minutes = (ms) => Math.round(ms / 60_000);
  const durationButtons = (values, selected, action, enabledValues = values) => values.map((value) => `<button type="button" data-practice-action="${action}" data-duration-ms="${value}" aria-pressed="${selected === value ? "true" : "false"}" ${enabledValues.includes?.(value) ? "" : "disabled"}>${minutes(value)} min</button>`).join("");
  
  function renderPracticeConsistencyDetail(root, view, { focusSelector = null } = {}) {
    const available = view.availability?.available === true && !view.starting;
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="consistency-detail"><div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">PRACTICE LAB</span></header><main class="practice-lab-detail"><div class="eyebrow">Fluency · pace stability</div><h1>Consistency Trainer</h1><p class="practice-lab-lead">Practice steadier natural-text pacing with a gentle self-calibrated pace guide, while keeping short-term variation separate from longer drift.</p><section class="practice-lab-empty-state"><h2>Continuous natural text</h2><p>Type natural text at a comfortable pace. The first 30 seconds establishes your own reference. After calibration, a gentle guide says whether recent pace is slower, steady, or faster relative to that fixed reference.</p><fieldset><legend>Duration</legend><div class="practice-lab-duration-grid">${durationButtons(PRACTICE_CONSISTENCY_DURATIONS_MS, view.durationMs, "consistency-duration", view.availability?.supportedDurationsMs ?? [])}</div></fieldset><div class="practice-lab-notice" role="note">No target WPM, metronome, live numeric WPM, aggregate accuracy, PB, leaderboard, or 0–100 consistency score. Variation and directional drift are reported separately after the session.</div><button type="button" class="practice-lab-primary-action" data-practice-action="start-consistency" ${available ? "" : "disabled"}>${view.starting ? "STARTING…" : `START ${minutes(view.durationMs)}-MIN CONSISTENCY`}</button></section>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}</main></div></section>`;
    (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-consistency']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true }); return true;
  }
  
  function renderPracticeEnduranceDetail(root, view, { focusSelector = null } = {}) {
    const practiceAvailable = view.availability?.practiceAvailable === true && !view.starting; const checkAvailable = view.availability?.checkAvailable === true && !view.starting;
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="endurance-detail"><div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">PRACTICE LAB</span></header><main class="practice-lab-detail"><div class="eyebrow">Fluency · sustained performance</div><h1>Endurance</h1><p class="practice-lab-lead">Practice sustained natural-text typing for 5–20 minutes, or run a standardized 10-minute Endurance Check to measure how late-session performance compares with an earlier settled period.</p><section class="practice-lab-empty-state"><h2>Endurance Practice</h2><p>Repeatable long-form training with continuous target-blind natural prose. Practice is descriptive and does not update the standardized endurance-ability estimate.</p><fieldset><legend>Practice duration</legend><div class="practice-lab-duration-grid">${durationButtons(PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS, view.durationMs, "endurance-duration", view.availability?.practiceDurationsMs ?? [])}</div></fieldset><button type="button" class="practice-lab-primary-action" data-practice-action="start-endurance-practice" ${practiceAvailable ? "" : "disabled"}>${view.starting === "practice" ? "STARTING…" : `START ${minutes(view.durationMs)}-MIN PRACTICE`}</button></section><section class="practice-lab-empty-state"><div class="eyebrow">Standardized · 10 minutes</div><h2>Endurance Check</h2><p>A fixed diagnostic protocol: 60 seconds to settle in, followed by 18 measured 30-second windows. Endurance ability is based on robust adjusted first-pass effective pace during the final three measured minutes.</p><div class="practice-lab-notice" role="note">No live WPM, accuracy graph, decline warning, or pace correction. One valid completed Check can produce exactly one endurance-ability observation. Observed decline is not labeled as fatigue.</div><button type="button" class="practice-lab-primary-action" data-practice-action="start-endurance-check" ${checkAvailable ? "" : "disabled"}>${view.starting === "check" ? "STARTING…" : "START 10-MIN ENDURANCE CHECK"}</button></section>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}</main></div></section>`;
    (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-endurance-practice']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true }); return true;
  }
  
  function renderPracticeLabV29(root, view, options = {}) {
    if (view?.kind === "consistency-detail") return renderPracticeConsistencyDetail(root, view, options);
    if (view?.kind === "endurance-detail") return renderPracticeEnduranceDetail(root, view, options);
    return renderPracticeLabV28(root, view, options);
  }
  return Object.freeze({ renderPracticeConsistencyDetail, renderPracticeEnduranceDetail, renderPracticeLabV29 });
})();

// practiceLabRendererV30 — consolidated feature renderer
const __renderer_v30 = (() => {
  const { renderPracticeLabV29 } = __renderer_v29;
  const { PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS } = __r_v30_dep0;
  const { PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS } = __r_v30_dep1;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const minutes = (ms) => Math.round(ms / 60_000);
  const durationButtons = (values, selected, action, enabledValues = values) => values.map((value) => `<button type="button" data-practice-action="${action}" data-duration-ms="${value}" aria-pressed="${selected === value ? "true" : "false"}" ${enabledValues.includes?.(value) ? "" : "disabled"}>${minutes(value)} min</button>`).join("");
  
  function renderPracticePunctuationCapitalsDetail(root, view, { focusSelector = null } = {}) {
    const practiceAvailable = view.availability?.practiceAvailable === true && !view.starting;
    const checkAvailable = view.availability?.checkAvailable === true && !view.starting;
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="punctuation-capitals-detail"><div class="practice-lab-shell">
      <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">PRACTICE LAB</span></header>
      <main class="practice-lab-detail">
        <div class="eyebrow">Real-world · sentence mechanics</div><h1>Punctuation & Capitals</h1>
        <p class="practice-lab-lead">Practice reliable capitalization, sentence punctuation, quotes, separators, and punctuation boundaries in realistic typing contexts.</p>
        <section class="practice-lab-empty-state"><h2>Practice</h2><p>Practice capitalization and common punctuation across varied text without prescribing a particular Shift-key technique.</p>
          <fieldset><legend>Duration</legend><div class="practice-lab-duration-grid">${durationButtons(PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS, view.durationMs, "punctuation-capitals-duration", view.availability?.practiceDurationsMs ?? [])}</div></fieldset>
          <div class="practice-lab-notice">Training is balanced and target-blind. Live WPM and aggregate accuracy are hidden, and Practice does not update punctuation ability.</div>
          <button type="button" class="practice-lab-primary-action" data-practice-action="start-punctuation-capitals-practice" ${practiceAvailable ? "" : "disabled"}>${view.starting === "practice" ? "STARTING…" : `START ${minutes(view.durationMs)}-MIN PRACTICE`}</button>
        </section>
        <section class="practice-lab-empty-state"><div class="eyebrow">Standardized · ~3–6 min</div><h2>Punctuation & Capitals Check</h2>
          <p>The Check uses a fixed punctuation-rich form. It does not adapt its punctuation mix to your current weaknesses.</p>
          <div class="practice-lab-notice">The protocol scores expected textual output. Correct uppercase remains correct whether it came from Shift, Caps Lock, a software keyboard, accessibility input, or another valid input route.</div>
          <button type="button" class="practice-lab-primary-action" data-practice-action="start-punctuation-capitals-check" ${checkAvailable ? "" : "disabled"}>${view.starting === "check" ? "STARTING…" : "START STANDARDIZED CHECK"}</button>
        </section>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}
      </main></div></section>`;
    (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-punctuation-capitals-practice']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
    return true;
  }
  
  function renderPracticeNumbersSymbolsDetail(root, view, { focusSelector = null } = {}) {
    const practiceAvailable = view.availability?.practiceAvailable === true && !view.starting;
    const checkAvailable = view.availability?.checkAvailable === true && !view.starting;
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="numbers-symbols-detail"><div class="practice-lab-shell">
      <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">PRACTICE LAB</span></header>
      <main class="practice-lab-detail">
        <div class="eyebrow">Real-world · practical transcription</div><h1>Numbers & Symbols</h1>
        <p class="practice-lab-lead">Practice digits and common practical symbols in structured text without assuming one keyboard layout or physical key technique.</p>
        <section class="practice-lab-empty-state"><h2>Practice</h2><p>Practice digits and common practical symbols in structured transcription patterns.</p>
          <fieldset><legend>Duration</legend><div class="practice-lab-duration-grid">${durationButtons(PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS, view.durationMs, "numbers-symbols-duration", view.availability?.practiceDurationsMs ?? [])}</div></fieldset>
          <div class="practice-lab-notice">The visible values are transcription material. No arithmetic, memory task, target WPM, PB, or leaderboard is involved.</div>
          <button type="button" class="practice-lab-primary-action" data-practice-action="start-numbers-symbols-practice" ${practiceAvailable ? "" : "disabled"}>${view.starting === "practice" ? "STARTING…" : `START ${minutes(view.durationMs)}-MIN PRACTICE`}</button>
        </section>
        <section class="practice-lab-empty-state"><div class="eyebrow">Standardized · ~3–6 min</div><h2>Numbers & Symbols Check</h2>
          <p>A fixed engineering-matched form measures whole-protocol typing performance with guarded domain first-pass accuracy.</p>
          <div class="practice-lab-notice">The same expected symbol is correct whether a layout produces it through Shift, AltGr, a software keyboard, or another valid route. This is not a math-ability test.</div>
          <button type="button" class="practice-lab-primary-action" data-practice-action="start-numbers-symbols-check" ${checkAvailable ? "" : "disabled"}>${view.starting === "check" ? "STARTING…" : "START STANDARDIZED CHECK"}</button>
        </section>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}
      </main></div></section>`;
    (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-numbers-symbols-practice']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
    return true;
  }
  
  function renderPracticeLabV30(root, view, options = {}) {
    if (view?.kind === "punctuation-capitals-detail") return renderPracticePunctuationCapitalsDetail(root, view, options);
    if (view?.kind === "numbers-symbols-detail") return renderPracticeNumbersSymbolsDetail(root, view, options);
    return renderPracticeLabV29(root, view, options);
  }
  return Object.freeze({ renderPracticePunctuationCapitalsDetail, renderPracticeNumbersSymbolsDetail, renderPracticeLabV30 });
})();

// practiceLabRendererV31 — consolidated feature renderer
const __renderer_v31 = (() => {
  const { renderPracticeLabV30 } = __renderer_v30;
  const { PRACTICE_CUSTOM_TEXT_TIMED_DURATIONS_MS, PRACTICE_CUSTOM_TEXT_MIN_GRAPHEMES, requiredPracticeCustomTextTimedGraphemes } = __r_v31_dep0;
  const minutes = (ms) => Math.round(ms / 60_000);
  const modes = Object.freeze({
    "full-text": { title: "Full text", description: "Work through the entire passage." },
    selection: { title: "Selection", description: "Practice only the part you highlight." },
    timed: { title: "Timed", description: "Type steadily for a fixed duration." },
  });
  const messages = Object.freeze({
    CUSTOM_TEXT_EMPTY: "Paste or import a passage to begin. Use at least 20 characters.",
    CUSTOM_TEXT_TOO_SHORT: "Add more text. Your practice passage needs at least 20 characters.",
    CUSTOM_TEXT_TOO_LARGE: "This passage is too large. Keep it under 100,000 characters and 256 KB.",
    CUSTOM_TEXT_STORAGE_LIMIT: "Your local text library is full. Export and remove an unneeded saved text before saving another.",
    CUSTOM_TEXT_INVALID_CONTROL_CHARACTER: "This text contains an unsupported control character. Paste a plain-text version instead.",
    CUSTOM_TEXT_UNSUPPORTED_GRAPHEME: "This text contains an unsupported character sequence. Remove it or import a UTF-8 plain-text file.",
    CUSTOM_TEXT_LOCALE_MISMATCH: "This saved text uses a different Practice language. Use the language-rebind action before starting.",
    CUSTOM_TEXT_INVALID_ENCODING: "This file is not valid UTF-8. Save it as a UTF-8 .txt file and import it again.",
    CUSTOM_TEXT_TIMED_CAPACITY: "Add a longer passage, choose a shorter available duration, or switch to Full text. Timed practice does not loop the passage.",
    CUSTOM_TEXT_NOT_FOUND: "This saved text is no longer available. Reopen another text or paste a new passage.",
    CUSTOM_TEXT_REVISION_MISMATCH: "The saved text changed in another tab. Reopen it before starting.",
    CUSTOM_TEXT_CONFLICT: "This text changed in another tab. Export your draft before reopening the saved version.",
    CUSTOM_TEXT_HASH_MISMATCH: "The saved text could not be verified. Reopen it or paste a new copy.",
    CUSTOM_TEXT_UNAVAILABLE: "The local text workspace could not load. Your draft has not been cleared. Try loading the workspace again.",
    CUSTOM_TEXT_SAVE_FAILED: "The text could not be saved. Your draft is still here; export a copy or try saving again.",
    CUSTOM_TEXT_LOAD_FAILED: "The saved text could not be opened. Try again or import a copy.",
    CUSTOM_TEXT_DELETE_FAILED: "The text could not be deleted. Try again.",
    CUSTOM_TEXT_IMPORT_FAILED: "The file could not be imported. Choose a UTF-8 .txt file and try again.",
    CUSTOM_TEXT_EXPORT_FAILED: "The text could not be exported. Copy your passage or try again.",
    CUSTOM_TEXT_REBIND_FAILED: "The text's language could not be updated. Reopen it and try again.",
  });
  
  /** Presentation copy and readiness mirror the existing validation/capacity rules. */
  function practiceCustomEditorFeedback(view) {
    const code = view.errorCode ?? view.validationErrorCode;
    const blocked = Boolean(view.validationErrorCode || view.localeMismatch || !["ready", "editing"].includes(view.status) ||
      (view.sessionMode === "timed" && !view.timedAvailability?.some(row => row.durationMs === view.timedDurationMs && row.available)));
    if (code) {
      const message = view.errorCode === "CUSTOM_TEXT_TOO_SHORT" && view.sessionMode === "selection"
        ? "Highlight at least 20 characters in the editor, then try starting again."
        : Object.hasOwn(messages, code) ? messages[code] : "This action could not be completed. Check the passage and try again.";
      // An operation error explains a failed attempt; it must not lock out a valid retry.
      return { state: view.errorCode ? "error" : "waiting", message, blocked };
    }
    if (view.localeMismatch) return { state: "waiting", message: messages.CUSTOM_TEXT_LOCALE_MISMATCH, blocked: true };
    if (!["ready", "editing"].includes(view.status)) return { state: "waiting", message: view.status === "unavailable" ? messages.CUSTOM_TEXT_UNAVAILABLE : "Preparing your local workspace…", blocked: true };
    if (view.sessionMode === "timed" && !view.timedAvailability?.some(row => row.durationMs === view.timedDurationMs && row.available)) {
      const required = requiredPracticeCustomTextTimedGraphemes(view.timedDurationMs);
      const target = Number.isFinite(required) ? `at least ${required.toLocaleString("en")} practice characters` : "a longer passage";
      return { state: "waiting", message: `This duration needs ${target}. Choose an available duration or Full text. The passage will not repeat.`, blocked: true };
    }
    return { state: "ready", message: view.sessionMode === "selection" ? `Highlight at least ${PRACTICE_CUSTOM_TEXT_MIN_GRAPHEMES} characters in the passage, then start.` : "Ready to practice. Saving your passage is optional.", blocked: false };
  }
  
  /** Patch feedback only: never replace the editor, change its selection, or save text. */
  function updatePracticeCustomEditorUi(root, view) {
    const feedback = practiceCustomEditorFeedback(view);
    const count = root.querySelector?.("[data-custom-text-count]");
    if (count) count.textContent = `${Number(view.sourceGraphemeCount ?? 0).toLocaleString("en")} characters · ${view.contextDataLocale ?? "—"}`;
    const dirty = root.querySelector?.("[data-custom-text-dirty]");
    if (dirty) dirty.textContent = view.dirty ? "Unsaved changes" : (view.editor?.customTextId ? "Saved on this device" : "Not saved");
    const status = root.querySelector?.("[data-custom-text-error]");
    if (status) {
      status.textContent = feedback.message;
      status.setAttribute?.("data-state", feedback.state);
      status.setAttribute?.("role", feedback.state === "error" ? "alert" : "status");
    }
    const start = root.querySelector?.("[data-practice-action='custom-start']");
    if (start) start.disabled = Boolean(view.starting || feedback.blocked);
  }
  
  function renderPracticeCustomTextDetail(root, view, { focusSelector = null } = {}) {
    const startDisabled = Boolean(view.starting || practiceCustomEditorFeedback(view).blocked);
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="custom-text-detail"><div class="practice-lab-shell">
      <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">LOCAL ONLY</span></header>
      <main class="practice-lab-detail practice-custom-text-detail"><div class="eyebrow">Custom · user-selected material</div><h1>Custom Text</h1>
      <p class="practice-lab-lead">Bring a passage worth practicing. Set your session, then make it flow.</p>
      <div class="practice-lab-notice pl-custom-privacy"><strong>Local practice. No leaderboard.</strong><span>Pasting and importing never save automatically. Only an explicit Save writes source text to this device. Custom Text is excluded from PBs, standardized ability, transfer, benchmark, mastery, retention, and corpus statistics.</span></div>
      ${view.status === "unavailable" ? '<div class="practice-lab-notice is-warning" role="alert"><strong>Custom Text could not load.</strong><div><button type="button" data-practice-action="custom-retry">TRY AGAIN</button></div></div>' : ""}
      <div class="practice-custom-workspace">
        <section class="practice-custom-editor" aria-labelledby="pl-custom-editor-title">
          <header class="pl-custom-section-heading"><div><div class="eyebrow">01 / Your material</div><h2 id="pl-custom-editor-title">The passage</h2></div><button type="button" data-practice-action="custom-import">IMPORT .TXT</button><input type="file" accept=".txt,text/plain" data-custom-text-file hidden></header>
          <label>Title <span class="pl-field-optional">Optional</span><input type="text" maxlength="120" data-custom-text-title placeholder="Give this passage a name"></label>
          <label>Text<textarea data-custom-text-source rows="10" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" aria-describedby="pl-custom-source-help pl-custom-feedback" placeholder="Paste a passage, a page of notes, or an excerpt you want to practice…"></textarea></label>
          <div class="practice-custom-editor-meta"><span data-custom-text-count></span><span data-custom-text-dirty></span></div>
          <p id="pl-custom-source-help" class="pl-custom-hint">Plain text · At least 20 characters · Line breaks are supported</p>
          ${view.localeMismatch ? `<div class="practice-lab-notice is-warning">This saved text uses a different Practice locale. Rebind explicitly before practicing it in the active locale. <button type="button" data-practice-action="custom-rebind">REBIND TO CURRENT LOCALE</button></div>` : ""}
          <footer class="practice-custom-toolbar"><button type="button" data-practice-action="custom-save" ${view.saving || !view.dirty || view.localeMismatch ? "disabled" : ""}>${view.saving ? "SAVING…" : "SAVE LOCALLY"}</button><button type="button" data-practice-action="custom-export">EXPORT .TXT</button><button type="button" class="pl-custom-delete" data-practice-action="custom-delete" ${view.editor.customTextId ? "" : "disabled"}>DELETE</button></footer>
        </section>
        <aside class="pl-custom-sidebar" aria-label="Session settings and saved texts">
          <section class="pl-custom-configuration" aria-labelledby="pl-custom-session-title"><div class="eyebrow">02 / Your session</div><h2 id="pl-custom-session-title">Make it yours</h2>
            <fieldset class="pl-custom-modes"><legend>Practice mode</legend><div class="practice-lab-duration-grid">${Object.entries(modes).map(([mode, info]) => `<button type="button" data-practice-action="custom-mode" data-custom-mode="${mode}" aria-pressed="${view.sessionMode === mode}"><strong>${info.title}</strong><span>${info.description}</span></button>`).join("")}</div></fieldset>
            <p data-custom-selection-note class="pl-custom-hint" ${view.sessionMode === "selection" ? "" : "hidden"}>Highlight the part you want in the editor. Only that range will be practiced.</p>
            <fieldset data-custom-timed-options ${view.sessionMode === "timed" ? "" : "hidden"}><legend>Timed duration</legend><div class="practice-lab-duration-grid">${PRACTICE_CUSTOM_TEXT_TIMED_DURATIONS_MS.map(durationMs => `<button type="button" data-practice-action="custom-duration" data-duration-ms="${durationMs}" aria-pressed="${view.timedDurationMs === durationMs}" ${view.timedAvailability?.some(row => row.durationMs === durationMs && row.available) ? "" : "disabled"}>${minutes(durationMs)} min</button>`).join("")}</div></fieldset>
            <p id="pl-custom-feedback" data-custom-text-error role="status" aria-atomic="true"></p>
            <button type="button" class="practice-lab-primary-action" data-practice-action="custom-start" ${startDisabled ? "disabled" : ""}>${view.starting ? "STARTING…" : "START CUSTOM PRACTICE"}</button>
          </section>
          <section class="practice-custom-library" aria-labelledby="pl-custom-library-title"><div class="practice-custom-library-head"><h2 id="pl-custom-library-title">Saved texts</h2><button type="button" data-practice-action="custom-new">NEW</button></div><div data-custom-text-library></div></section>
        </aside>
      </div></main></div></section>`;
    const title = root.querySelector?.("[data-custom-text-title]");
    const source = root.querySelector?.("[data-custom-text-source]");
    if (title) title.value = view.editor.title ?? "";
    if (source) source.value = view.editor.sourceText ?? "";
    updatePracticeCustomEditorUi(root, view);
    const library = root.querySelector?.("[data-custom-text-library]");
    const document = library?.ownerDocument;
    if (library && document?.createElement) {
      if (!view.texts?.length) {
        const empty = document.createElement("p"); empty.className = "pl-custom-hint";
        empty.textContent = "Your saved passages will appear here. You can practice without saving."; library.append(empty);
      }
      for (const item of view.texts ?? []) {
        const button = document.createElement("button"); button.type = "button"; button.className = "practice-custom-library-item";
        button.dataset.practiceAction = "custom-open"; button.dataset.customTextId = item.customTextId;
        if (item.customTextId === view.editor.customTextId) button.setAttribute("aria-current", "true");
        const strong = document.createElement("strong"); strong.textContent = item.title;
        const meta = document.createElement("span"); meta.textContent = `${item.sourceGraphemeCount} characters${item.lastPractisedAt ? " · practiced" : ""}`;
        button.append(strong, meta); library.append(button);
      }
    }
    (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-custom-text-source]") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
    return true;
  }
  
  function renderPracticeLabV31(root, view, options = {}) {
    if (view?.kind === "custom-text-detail") return renderPracticeCustomTextDetail(root, view, options);
    return renderPracticeLabV30(root, view, options);
  }
  return Object.freeze({ practiceCustomEditorFeedback, updatePracticeCustomEditorUi, renderPracticeCustomTextDetail, renderPracticeLabV31 });
})();

// practiceLabRendererV32 — consolidated feature renderer
const __renderer_v32 = (() => {
  const { renderPracticeLabV31 } = __renderer_v31;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const dateLabel = (value) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
  };
  
  function responseCard(card) {
    const assignment = card.manualCount || card.coachCount
      ? `${card.manualCount} manual · ${card.coachCount} Coach`
      : "No eligible samples";
    const caveat = card.hybridOnly
      ? `<p class="practice-lab-muted">Hybrid measurement only · evidence depth is capped at Medium.</p>`
      : "";
    return `<article class="practice-lab-empty-state" data-treatment-response-card="${escapeHtml(card.id)}">
      <div class="eyebrow">${escapeHtml(card.outcomeLabel)} · ${escapeHtml(card.delayLabel)}</div>
      <h2>${escapeHtml(card.treatmentTitle)}</h2>
      <p>${escapeHtml(card.targetLabel)}${card.protocolVariant ? ` · ${escapeHtml(card.protocolVariant)}` : ""}</p>
      <div class="practice-lab-notice"><strong>${escapeHtml(card.patternLabel)}</strong><br>${escapeHtml(card.medianLabel)} median response · ${card.sampleCount} eligible sample${card.sampleCount === 1 ? "" : "s"}</div>
      <p>Evidence depth: <strong>${escapeHtml(card.evidenceDepthLabel)}</strong> · ${card.distinctDays} day${card.distinctDays === 1 ? "" : "s"} · ${escapeHtml(assignment)}</p>
      ${card.targetEntityType && card.distinctTargets ? `<p>${card.distinctTargets} distinct target${card.distinctTargets === 1 ? "" : "s"}</p>` : ""}
      ${card.contaminatedEpisodeCount ? `<p class="practice-lab-muted">${card.contaminatedEpisodeCount} contaminated episode${card.contaminatedEpisodeCount === 1 ? "" : "s"} excluded from primary aggregation.</p>` : ""}
      ${caveat}
      <p class="practice-lab-muted">Updated ${escapeHtml(dateLabel(card.updatedAt))}</p>
    </article>`;
  }
  
  function episodeRow(row) {
    return `<li><strong>${escapeHtml(row.treatmentTitle)}</strong> · ${escapeHtml(row.targetLabel)} · ${escapeHtml(row.status)} · ${escapeHtml(row.assignmentKind)}<br><span class="practice-lab-muted">${escapeHtml(dateLabel(row.completedAt))} · ${row.observed} observed · ${row.contaminated} contaminated · ${row.pending} pending</span></li>`;
  }
  
  function renderPracticeTreatmentResponseProgress(root, view, { focusSelector = null } = {}) {
    const loading = view.status === "loading";
    const unavailable = view.status === "unavailable";
    const body = loading
      ? `<section class="practice-lab-empty-state"><h2>Loading observed response…</h2><p>Reading local longitudinal Practice evidence.</p></section>`
      : unavailable
        ? `<section class="practice-lab-empty-state"><h2>Observed response unavailable</h2><p>Local response tracking could not be read. Existing Practice evidence is unaffected.</p>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}</section>`
        : view.hasEvidence
          ? `<div class="practice-lab-category-grid">${view.cards.map(responseCard).join("")}</div>`
          : `<section class="practice-lab-empty-state"><h2>${escapeHtml(view.emptyTitle)}</h2><p>${escapeHtml(view.emptyDescription)}</p></section>`;
    const recent = !loading && !unavailable && view.recentEpisodes?.length
      ? `<section class="practice-lab-empty-state"><div class="eyebrow">Prospective episode log</div><h2>Recent tracked treatments</h2><p>These rows show tracking state only. They are not effectiveness rankings.</p><ul>${view.recentEpisodes.map(episodeRow).join("")}</ul></section>`
      : "";
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="treatment-response-progress"><div class="practice-lab-shell">
      <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← ${escapeHtml(view.backLabel ?? "Back to Practice Lab")}</button><span class="practice-lab-status">PROGRESS</span></header>
      <main class="practice-lab-detail">
        <div class="eyebrow">Progress · longitudinal observation</div><h1>Progress</h1>
        <p class="practice-lab-lead">See your Practice history together with cautious observations from compatible later measurements.</p>
        <h2>${escapeHtml(view.sectionTitle ?? "Observed Response")}</h2>
        <div class="practice-lab-notice">${escapeHtml(view.doctrine ?? "Observed response patterns do not establish causation.")}</div>
        <div class="practice-lab-actions"><button type="button" data-practice-action="treatment-response-refresh" ${loading ? "disabled" : ""}>${loading ? "REFRESHING…" : "REFRESH LOCAL EVIDENCE"}</button>${view.trackingCount ? `<span>${view.trackingCount} treatment${view.trackingCount === 1 ? "" : "s"} awaiting later outcomes</span>` : ""}</div>
        ${body}${recent}
      </main></div></section>`;
    (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='treatment-response-refresh']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
    return true;
  }
  
  function renderPracticeLabV32(root, view, options = {}) {
    if (view?.kind === "treatment-response-progress") return renderPracticeTreatmentResponseProgress(root, view, options);
    return renderPracticeLabV31(root, view, options);
  }
  return Object.freeze({ renderPracticeTreatmentResponseProgress, renderPracticeLabV32 });
})();

// practiceLabRendererV36 — consolidated feature renderer
const __renderer_v36 = (() => {
  const { renderPracticeLabV32 } = __renderer_v32;
  const { renderPracticePhysicalTelemetryPanel, renderPracticePhysicalTelemetrySetting } = __r_v36_dep0;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  
  function renderPracticePhysicalKeyboardPage(root, view, { focusSelector = null } = {}) {
    if (!root || typeof root.innerHTML !== "string") throw new TypeError("Physical Keyboard renderer requires a root element");
    const loading = view?.status === "loading";
    const unavailable = view?.status === "unavailable";
    const body = loading
      ? `<section class="practice-lab-empty-state" aria-live="polite"><h2>Loading Physical Keyboard telemetry…</h2><p>Reading local aggregate telemetry from this browser.</p></section>`
      : unavailable
        ? `<section class="practice-lab-empty-state" role="status"><h2>Physical Keyboard telemetry unavailable</h2><p>Local telemetry could not be read. Existing Practice evidence is unaffected.</p>${view?.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}<button type="button" data-practice-action="physical-retry">TRY AGAIN</button></section>`
        : `${renderPracticePhysicalTelemetryPanel({ availability: view.availability, snapshot: view.snapshot, hasStoredData: view.hasStoredData })}
          <section class="practice-lab-empty-state" aria-labelledby="practice-physical-settings-title"><div class="eyebrow">Advanced</div><h2 id="practice-physical-settings-title">Physical keyboard telemetry</h2>${renderPracticePhysicalTelemetrySetting({ enabled: view.availability?.enabled === true, hasStoredData: false })}</section>`;
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="physical-keyboard"><div class="practice-lab-shell">
      <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status">ADVANCED · LOCAL</span></header>
      <main class="practice-lab-detail"><div class="eyebrow">Progress · Advanced</div>${body}</main>
    </div></section>`;
    const target = (focusSelector && root.querySelector?.(focusSelector))
      || root.querySelector?.("[data-practice-physical-toggle]")
      || root.querySelector?.("[data-practice-heading]")
      || root.querySelector?.("button");
    target?.focus?.({ preventScroll: true });
    return root.querySelector?.(".practice-lab-screen") ?? true;
  }
  
  function renderPracticeLabV36(root, view, options = {}) {
    if (view?.kind === "physical-keyboard") return renderPracticePhysicalKeyboardPage(root, view, options);
    return renderPracticeLabV32(root, view, options);
  }
  return Object.freeze({ renderPracticePhysicalKeyboardPage, renderPracticeLabV36 });
})();

// practiceLabRendererV37 — consolidated feature renderer
const __renderer_v37 = (() => {
  const { renderPracticeLabV36 } = __renderer_v36;
  const { renderPracticeWeaknessBossDetail } = __r_v37_dep0;
  function renderPracticeLabV37(root, view, options = {}) {
    if (view?.kind === "weakness-boss-detail") return renderPracticeWeaknessBossDetail(root, view, options);
    return renderPracticeLabV36(root, view, options);
  }
  return Object.freeze({ renderPracticeLabV37 });
})();

// practiceLabRendererV38 — consolidated feature renderer
const __renderer_v38 = (() => {
  const { renderPracticeLabV37 } = __renderer_v37;
  const { renderPracticeResearchPage } = __r_v38_dep0;
  function renderPracticeLabV38(root, view, options = {}) {
    if (view?.kind === "research") return renderPracticeResearchPage(root, view, options);
    return renderPracticeLabV37(root, view, options);
  }
  return Object.freeze({ renderPracticeLabV38 });
})();

export const renderPracticeLab = __renderer_base.renderPracticeLab;
export const renderPracticeLabV20 = __renderer_v20.renderPracticeLabV20;
export const renderPracticeLabV21 = __renderer_v21.renderPracticeLabV21;
export const renderPracticeProblemWordsDetail = __renderer_v22.renderPracticeProblemWordsDetail;
export const createPracticeLabRendererV22 = __renderer_v22.createPracticeLabRendererV22;
export const renderPracticeAccuracyRecoveryDetail = __renderer_v23.renderPracticeAccuracyRecoveryDetail;
export const renderPracticeLabV23 = __renderer_v23.renderPracticeLabV23;
export const renderPracticeRealTextDetail = __renderer_v24.renderPracticeRealTextDetail;
export const renderPracticeLabV24 = __renderer_v24.renderPracticeLabV24;
export const renderPracticeCoach = __renderer_v25.renderPracticeCoach;
export const renderPracticeLabV25 = __renderer_v25.renderPracticeLabV25;
export const renderPracticePaceLadderDetail = __renderer_v26.renderPracticePaceLadderDetail;
export const renderPracticeLabV26 = __renderer_v26.renderPracticeLabV26;
export const renderPracticeBurstSprintsDetail = __renderer_v27.renderPracticeBurstSprintsDetail;
export const renderPracticeLabV27 = __renderer_v27.renderPracticeLabV27;
export const renderPracticeCommonWordsDetail = __renderer_v28.renderPracticeCommonWordsDetail;
export const renderPracticeLabV28 = __renderer_v28.renderPracticeLabV28;
export const renderPracticeConsistencyDetail = __renderer_v29.renderPracticeConsistencyDetail;
export const renderPracticeEnduranceDetail = __renderer_v29.renderPracticeEnduranceDetail;
export const renderPracticeLabV29 = __renderer_v29.renderPracticeLabV29;
export const renderPracticePunctuationCapitalsDetail = __renderer_v30.renderPracticePunctuationCapitalsDetail;
export const renderPracticeNumbersSymbolsDetail = __renderer_v30.renderPracticeNumbersSymbolsDetail;
export const renderPracticeLabV30 = __renderer_v30.renderPracticeLabV30;
export const practiceCustomEditorFeedback = __renderer_v31.practiceCustomEditorFeedback;
export const updatePracticeCustomEditorUi = __renderer_v31.updatePracticeCustomEditorUi;
export const renderPracticeCustomTextDetail = __renderer_v31.renderPracticeCustomTextDetail;
export const renderPracticeLabV31 = __renderer_v31.renderPracticeLabV31;
export const renderPracticeTreatmentResponseProgress = __renderer_v32.renderPracticeTreatmentResponseProgress;
export const renderPracticeLabV32 = __renderer_v32.renderPracticeLabV32;
export const renderPracticePhysicalKeyboardPage = __renderer_v36.renderPracticePhysicalKeyboardPage;
export const renderPracticeLabV36 = __renderer_v36.renderPracticeLabV36;
export const renderPracticeLabV37 = __renderer_v37.renderPracticeLabV37;
export const renderPracticeLabV38 = __renderer_v38.renderPracticeLabV38;
export const renderPracticeLabCurrent = __renderer_v38.renderPracticeLabV38;
