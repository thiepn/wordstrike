const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const slug = (value = "") => String(value).replace(/[^a-z0-9-]/gi, "");
const backButton = (label = "Back to Practice Lab", action = "back") => `<button type="button" class="screen-back-button" data-practice-action="${action}" aria-label="${escapeHtml(label)}">BACK</button>`;

function experimentCard(card) {
  return `<article class="practice-lab-experiment-card practice-lab-accent-${slug(card.category)}">
    <div class="practice-lab-card-meta"><span>${escapeHtml(card.categoryLabel)}</span><span>${escapeHtml(card.duration)}</span></div>
    <h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.description)}</p>
    <div class="practice-lab-card-footer"><span class="practice-lab-status" data-status="${slug(card.status)}">${escapeHtml(card.status)}</span>
      <button type="button" class="practice-lab-text-button" data-practice-action="open-experiment" data-experiment-id="${slug(card.id)}" aria-label="View ${escapeHtml(card.title)} details">VIEW DETAILS</button></div>
  </article>`;
}

function shell(content, { home = false, preview = false } = {}) {
  return `<section class="screen practice-lab-screen" data-practice-view="${home ? "home" : "subpage"}">
    <div class="practice-lab-shell">${content}</div></section>`;
}

function renderHome(view) {
  return shell(`${backButton("Exit Practice Lab", "exit")}
    <header class="practice-lab-header"><div><div class="eyebrow">Focused training</div><h1>${escapeHtml(view.title)}</h1><p>${escapeHtml(view.subtitle)}</p></div>
      <div class="practice-lab-header-actions">${view.preview ? '<span class="practice-lab-preview">DEVELOPER PREVIEW</span>' : ""}<button type="button" class="practice-lab-help" data-practice-action="help" aria-label="Practice Lab help">HELP</button></div></header>
    <main>
      <section class="practice-lab-feature-grid" aria-label="Practice overview">
        <article class="practice-lab-feature-card practice-lab-daily"><div class="eyebrow">Guided program</div><h2>${escapeHtml(view.dailyTraining.title)}</h2><p>${escapeHtml(view.dailyTraining.description)}</p><ul><li>${escapeHtml(view.dailyTraining.stateLabel)}</li><li>${escapeHtml(view.dailyTraining.duration)}</li></ul><button type="button" disabled aria-disabled="true">NOT AVAILABLE YET</button></article>
        <article class="practice-lab-feature-card practice-lab-assessment"><div class="eyebrow">Build your skill profile</div><h2>${escapeHtml(view.assessment.title)}</h2><p>A structured assessment will measure sustainable speed, burst speed, accuracy, consistency, weak keys, slow combinations, problem words, and real-text performance.</p><span>Estimated time: 4 minutes</span><button type="button" data-practice-action="open-experiment" data-experiment-id="full-assessment">VIEW ASSESSMENT</button></article>
      </section>
      <section class="practice-lab-empty-grid" aria-label="Personalized training status"><article><h2>${escapeHtml(view.profile.title)}</h2><p>${escapeHtml(view.profile.description)}</p></article><article><h2>${escapeHtml(view.recommendations.title)}</h2><p>${escapeHtml(view.recommendations.description)}</p></article></section>
      <section class="practice-lab-analysis" aria-labelledby="practice-analysis-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">Evidence</div><h2 id="practice-analysis-title">Analysis</h2></div></div><div class="practice-lab-analysis-grid">${view.analysis.map((item) => `<button type="button" data-practice-action="navigate" data-route="${slug(item.route)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span></button>`).join("")}</div></section>
      <section class="practice-lab-catalog" aria-labelledby="practice-catalog-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">Training catalog</div><h2 id="practice-catalog-title">Experiments</h2></div><p>Explore planned training tools. Detail pages are previews only.</p></div>
        ${view.categories.map((category) => `<section class="practice-lab-category" aria-labelledby="practice-category-${slug(category.id)}"><h3 id="practice-category-${slug(category.id)}">${escapeHtml(category.title)}</h3><div class="practice-lab-experiment-grid">${category.experiments.map(experimentCard).join("")}</div></section>`).join("")}</section>
    </main>`, { home: true, preview: view.preview });
}

function renderDetail(view) {
  if (view.kind === "not-found") return shell(`${backButton()}<main class="practice-lab-detail"><div class="eyebrow">Practice Lab</div><h1>${escapeHtml(view.title)}</h1><p>${escapeHtml(view.description)}</p></main>`);
  return shell(`${backButton(view.backLabel)}<main class="practice-lab-detail"><div class="eyebrow">${escapeHtml(view.category)}</div><h1>${escapeHtml(view.title)}</h1><p class="practice-lab-lead">${escapeHtml(view.description)}</p><p>${escapeHtml(view.longDescription)}</p>
    <dl><div><dt>Primary skill</dt><dd>${escapeHtml(view.primarySkill)}</dd></div><div><dt>Estimated duration</dt><dd>${escapeHtml(view.duration)}</dd></div><div><dt>Difficulty</dt><dd>${escapeHtml(view.difficulty)}</dd></div><div><dt>Prerequisites</dt><dd>${escapeHtml(view.prerequisites.length ? view.prerequisites.join(", ") : "None planned")}</dd></div><div><dt>Device support</dt><dd>${escapeHtml(view.deviceSupport.join(", "))}</dd></div><div><dt>Availability</dt><dd>${escapeHtml(view.status)}</dd></div></dl>
    <div class="practice-lab-notice" role="status">${escapeHtml(view.unavailableMessage)}</div><button type="button" disabled aria-disabled="true">BEGIN UNAVAILABLE</button></main>`);
}

function renderEmpty(view) {
  return shell(`${backButton(view.backLabel)}<main class="practice-lab-detail"><div class="eyebrow">Analysis</div><h1>${escapeHtml(view.title)}</h1><p class="practice-lab-lead">${escapeHtml(view.description)}</p><ul class="practice-lab-future-list">${view.futureItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><section class="practice-lab-empty-state"><h2>${escapeHtml(view.emptyTitle)}</h2><p>${escapeHtml(view.emptyDescription)}</p></section></main>`);
}

export function renderPracticeLab(root, viewModel) {
  if (!root || typeof root.innerHTML !== "string") throw new TypeError("Practice Lab renderer requires a root element");
  const previousAction = root.ownerDocument?.activeElement?.dataset?.practiceAction;
  root.innerHTML = viewModel.kind === "home" ? renderHome(viewModel)
    : viewModel.kind === "experiment-detail" || viewModel.kind === "not-found" ? renderDetail(viewModel)
      : viewModel.kind === "unavailable" ? shell(`${backButton(viewModel.backLabel, "exit")}<main class="practice-lab-detail"><h1>${escapeHtml(viewModel.title)}</h1><p>${escapeHtml(viewModel.description)}</p></main>`)
        : renderEmpty(viewModel);
  if (previousAction) root.querySelector?.(`[data-practice-action="${slug(previousAction)}"]`)?.focus?.({ preventScroll: true });
  return root.querySelector?.(".practice-lab-screen") || null;
}
