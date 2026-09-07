const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const slug = (value = "") => String(value).replace(/[^a-z0-9-]/gi, "");
const backButton = (label = "Back to Practice Lab", action = "back") => `<button type="button" class="screen-back-button" data-practice-action="${action}" aria-label="${escapeHtml(label)}">BACK</button>`;
const number = (value, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "Not measured";
const percent = (value) => Number.isFinite(value) ? `${number(value <= 1 ? value * 100 : value, 1)}%` : "Not measured";

function experimentCard(card) {
  return `<article class="practice-lab-experiment-card practice-lab-accent-${slug(card.category)}">
    <div class="practice-lab-card-meta"><span>${escapeHtml(card.categoryLabel)}</span><span>${escapeHtml(card.duration)}</span></div>
    <h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.description)}</p>
    <div class="practice-lab-card-footer"><span class="practice-lab-status" data-status="${slug(card.status)}">${escapeHtml(card.status)}</span>
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
      <div class="practice-lab-header-actions">${view.preview ? '<span class="practice-lab-preview">DEVELOPER PREVIEW</span>' : ""}<button type="button" class="practice-lab-help" data-practice-action="help" aria-label="Practice Lab help"${view.helpAvailable ? "" : ' disabled aria-disabled="true" title="Practice Lab help is not available yet"'}>HELP</button></div></header>
    <main>
      <section class="practice-lab-feature-grid" aria-label="Practice overview">
        <article class="practice-lab-feature-card practice-lab-daily"><div class="eyebrow">Guided program</div><h2>${escapeHtml(view.dailyTraining.title)}</h2><p>${escapeHtml(view.dailyTraining.description)}</p><ul><li>${escapeHtml(view.dailyTraining.stateLabel)}</li><li>${escapeHtml(view.dailyTraining.duration)}</li></ul><button type="button" disabled aria-disabled="true">NOT AVAILABLE YET</button></article>
        <article class="practice-lab-feature-card practice-lab-assessment"><div class="eyebrow">Measure your current typing</div><h2>${escapeHtml(view.assessment.title)}</h2><p>A structured battery combining protected natural text with fixed diagnostics. It reports what was measured, what the evidence suggests, and what remains unknown.</p><span>Quick ~4 min · Standard ~8 min · Deep ~12 min</span><button type="button" data-practice-action="open-experiment" data-experiment-id="full-assessment">VIEW ASSESSMENT</button></article>
      </section>
      <section class="practice-lab-empty-grid" aria-label="Personalized training status"><article><h2>${escapeHtml(view.profile.title)}</h2><p>${escapeHtml(view.profile.description)}</p></article><article><h2>${escapeHtml(view.recommendations.title)}</h2><p>${escapeHtml(view.recommendations.description)}</p></article></section>
      <section class="practice-lab-analysis" aria-labelledby="practice-analysis-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">Evidence</div><h2 id="practice-analysis-title">Analysis</h2></div></div><div class="practice-lab-analysis-grid">${view.analysis.map((item) => `<button type="button" data-practice-action="navigate" data-route="${slug(item.route)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span></button>`).join("")}</div></section>
      <section class="practice-lab-catalog" aria-labelledby="practice-catalog-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">Training catalog</div><h2 id="practice-catalog-title">Experiments</h2></div><p>Explore planned training tools. Detail pages are previews only.</p></div>
        ${view.categories.map((category) => `<section class="practice-lab-category" aria-labelledby="practice-category-${slug(category.id)}"><h3 id="practice-category-${slug(category.id)}">${escapeHtml(category.title)}</h3><div class="practice-lab-experiment-grid">${category.experiments.map(experimentCard).join("")}</div></section>`).join("")}</section>
    </main>`, { home: true });
}

function renderDetail(view) {
  if (view.kind === "not-found") return shell(`${backButton()}<main class="practice-lab-detail"><div class="eyebrow">Practice Lab</div><h1 tabindex="-1" data-practice-heading>${escapeHtml(view.title)}</h1><p>${escapeHtml(view.description)}</p></main>`);
  return shell(`${backButton(view.backLabel)}<main class="practice-lab-detail"><div class="eyebrow">${escapeHtml(view.category)}</div><h1 tabindex="-1" data-practice-heading>${escapeHtml(view.title)}</h1><p class="practice-lab-lead">${escapeHtml(view.description)}</p><p>${escapeHtml(view.longDescription)}</p>
    <dl><div><dt>Primary skill</dt><dd>${escapeHtml(view.primarySkill)}</dd></div><div><dt>Estimated duration</dt><dd>${escapeHtml(view.duration)}</dd></div><div><dt>Difficulty</dt><dd>${escapeHtml(view.difficulty)}</dd></div><div><dt>Prerequisites</dt><dd>${escapeHtml(view.prerequisites.length ? view.prerequisites.join(", ") : "None")}</dd></div><div><dt>Device support</dt><dd>${escapeHtml(view.deviceSupport.join(", "))}</dd></div><div><dt>Availability</dt><dd>${escapeHtml(view.status)}</dd></div></dl>
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
    <div><dt>Accuracy</dt><dd>${percent(benchmark?.accuracy)}</dd></div>
    <div><dt>Benchmark freshness</dt><dd>${escapeHtml(benchmark?.freshness ?? "Unknown")}</dd></div>
    <div><dt>Cold-natural ability estimate</dt><dd>${number(ability?.estimateWpm)}</dd></div>
    <div><dt>Ability confidence</dt><dd>${escapeHtml(ability?.confidenceLevel ?? "Not measured")}</dd></div>
  </dl>`;
}

function renderControl(data) {
  if (!data) return "<p>Not measured in this assessment.</p>";
  return `<dl>
    <div><dt>First-pass accuracy</dt><dd>${percent(data.firstPassAccuracy)}</dd></div>
    <div><dt>Disfluency rate</dt><dd>${percent(data.disfluencyRate)}</dd></div>
    <div><dt>Correction inputs / 1000 chars</dt><dd>${number(data.correctionInputsPer1000)}</dd></div>
    <div><dt>Correction cost / 1000 chars</dt><dd>${number(data.correctionCostMsPer1000)}${Number.isFinite(data.correctionCostMsPer1000) ? " ms" : ""}</dd></div>
    <div><dt>Error episodes / 1000 chars</dt><dd>${number(data.errorEpisodesPer1000)}</dd></div>
  </dl>`;
}

function renderCoverage(data) {
  if (!data) return "<p>Not measured in this assessment.</p>";
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  if (!blocks.length) return "<p>Coverage was not available for this assessment.</p>";
  return `<ul>${blocks.map((entry) => `<li>Blueprint coverage: ${percent(entry?.coverageRatio)}</li>`).join("")}</ul>`;
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
    <div><dt>Accuracy</dt><dd>${percent(data.accuracy)}</dd></div>
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
    <div class="practice-lab-notice" role="note"><strong>Assessment is optional.</strong> Deep is recommended only when fully available. Practice modes, Skill Map, Custom Text, and future training are not gated on completing it.</div>
    ${renderAssessmentProgress(view.progress)}
    ${results ? `${renderIntegrity(results.integrity)}<section aria-labelledby="assessment-results-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">Evidence</div><h2 id="assessment-results-title">Assessment results</h2></div></div>${results.sections.map(renderAssessmentSection).join("")}</section>` : `<section aria-labelledby="assessment-depth-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">Choose depth</div><h2 id="assessment-depth-title">Quick, Standard, or Deep</h2></div><p>Each longer depth contains the complete shorter protocol as its prefix. Your explicit choice will not be escalated.</p></div><div class="practice-lab-experiment-grid">${view.depths.map(depthCard).join("")}</div></section>`}
    <section class="practice-lab-empty-state"><h2>What this assessment does not claim</h2><p>PL19 does not provide a universal typing score, grade, rank, controlled-speed ability, burst ability, common-word ability, or endurance ability. Those remain unmeasured until their dedicated protocols exist.</p></section>
  </main>`);
}

function renderEmpty(view) {
  return shell(`${backButton(view.backLabel)}<main class="practice-lab-detail"><div class="eyebrow">Analysis</div><h1 tabindex="-1" data-practice-heading>${escapeHtml(view.title)}</h1><p class="practice-lab-lead">${escapeHtml(view.description)}</p><ul class="practice-lab-future-list">${view.futureItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><section class="practice-lab-empty-state"><h2>${escapeHtml(view.emptyTitle)}</h2><p>${escapeHtml(view.emptyDescription)}</p></section></main>`);
}

export function renderPracticeLab(root, viewModel, { focusSelector = null } = {}) {
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
