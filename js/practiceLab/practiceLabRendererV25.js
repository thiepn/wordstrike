import { renderPracticeLabV24 } from "./practiceLabRendererV24.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const statusClass = (value) => String(value ?? "pending").replace(/[^a-z0-9-]/gi, "");

function renderDurationChoices(view) {
  return `<div class="practice-coach-duration" role="group" aria-label="Daily Training duration">${view.durationChoices.map((item) => `<button type="button" data-practice-action="set-coach-duration" data-coach-minutes="${item.minutes}" aria-pressed="${item.selected}" ${view.plan ? "disabled" : ""}>${item.minutes} MIN</button>`).join("")}</div>`;
}

function renderSuggestion(suggestion, type) {
  if (!suggestion) return "";
  if (type === "assessment") return `<article class="practice-coach-suggestion"><div class="eyebrow">Measurement suggestion</div><h3>Assessment recommended</h3><p>Your current-context assessment is missing or stale. A new assessment could improve future Coach decisions.</p><button type="button" data-practice-action="open-coach-assessment">VIEW ASSESSMENT</button></article>`;
  return `<article class="practice-coach-suggestion"><div class="eyebrow">Measurement suggestion</div><h3>Cold Transfer available</h3><p>A fresh Cold Transfer Check is available if you want protected generalization evidence.</p><button type="button" data-practice-action="open-coach-cold-transfer">VIEW REAL TEXT</button></article>`;
}

function renderBlock(block, view) {
  const target = block.target ? `<span class="practice-coach-target">${escapeHtml(block.target)}</span>` : "";
  const blocked = block.blockedReason ? `<p class="practice-lab-muted">${escapeHtml(block.blockedReason)}</p>` : "";
  const skip = block.canSkip && view.plan?.status !== "abandoned" && view.plan?.status !== "expired"
    ? `<button type="button" class="practice-lab-text-button" data-practice-action="skip-coach-block" data-coach-block-id="${escapeHtml(block.blockId)}">SKIP</button>` : "";
  return `<article class="practice-coach-block" data-coach-block-id="${escapeHtml(block.blockId)}" data-status="${statusClass(block.status)}">
    <div class="practice-coach-block-index">${block.ordinal}</div>
    <div class="practice-coach-block-copy"><div class="practice-lab-card-meta"><span>${escapeHtml(block.title)}</span><span>~${block.estimatedMinutes} min</span></div>
      <div class="practice-coach-block-title"><h3>${escapeHtml(block.title)}</h3>${target}</div>
      <p>${escapeHtml(block.reason)}</p>${blocked}</div>
    <div class="practice-coach-block-actions"><span class="practice-lab-status" data-status="${statusClass(block.status)}">${escapeHtml(block.statusLabel)}</span>${skip}</div>
  </article>`;
}

export function renderPracticeCoach(root, view, { focusSelector = null } = {}) {
  const plan = view.plan;
  const error = view.errorCode ? `<div class="practice-lab-notice" role="alert">${escapeHtml(String(view.errorCode).replaceAll("_", " "))}</div>` : "";
  const beforePlan = !plan ? `<section class="practice-coach-create">
      <div class="practice-lab-section-heading"><div><div class="eyebrow">Choose today's budget</div><h2>${view.requestedMinutes} minutes</h2></div><p>This sets a planning budget, not a quota. The Coach may intentionally underfill it when no useful block fits.</p></div>
      ${renderDurationChoices(view)}
      <button type="button" class="practice-lab-primary-action" data-practice-action="create-coach-plan" ${view.canCreate ? "" : "disabled"}>${view.status === "creating" ? "CREATING PLAN…" : "CREATE TODAY'S PLAN"}</button>
    </section>` : "";
  const planSection = plan ? `<section class="practice-coach-plan" aria-labelledby="practice-coach-plan-title">
      <div class="practice-coach-plan-header"><div><div class="eyebrow">${escapeHtml(plan.statusLabel)}</div><h2 id="practice-coach-plan-title">~${plan.plannedMinutes} min · ${plan.blockCount} block${plan.blockCount === 1 ? "" : "s"}</h2><p>${escapeHtml(plan.progress.label)} · ${escapeHtml(plan.coverageLabel ?? "")}</p></div>
        <div class="practice-coach-plan-actions">${plan.canStartNext ? `<button type="button" class="practice-lab-primary-action" data-practice-action="start-coach-next">START NEXT BLOCK</button>` : ""}${plan.canEndToday ? '<button type="button" data-practice-action="abandon-coach-plan">END FOR TODAY</button>' : ""}</div></div>
      <div class="practice-coach-blocks">${plan.blocks.map((block) => renderBlock(block, view)).join("")}</div>
    </section>
    <section class="practice-lab-empty-state"><h2>Why this plan?</h2>${plan.rationales.length ? `<ul>${plan.rationales.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : "<p>Broad practice is the best available use of today's budget.</p>"}<p class="practice-lab-muted">The plan is frozen when created and is not rewritten after individual block results.</p></section>
    ${(plan.suggestions?.assessmentSuggestion || plan.suggestions?.coldTransferSuggestion) ? `<section class="practice-coach-suggestions" aria-labelledby="practice-coach-suggestions-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">Separate measurements</div><h2 id="practice-coach-suggestions-title">Optional suggestions</h2></div><p>These are outside today's training block count and never start automatically.</p></div><div class="practice-coach-suggestion-grid">${renderSuggestion(plan.suggestions.assessmentSuggestion, "assessment")}${renderSuggestion(plan.suggestions.coldTransferSuggestion, "cold")}</div></section>` : ""}` : "";

  root.innerHTML = `<section class="screen practice-lab-screen practice-coach-screen" data-practice-view="daily-training"><div class="practice-lab-shell">
    <header class="practice-lab-header"><div><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><div class="eyebrow">Coach · orchestration</div><h1 tabindex="-1" data-practice-heading>${escapeHtml(view.title)}</h1><p>${escapeHtml(view.subtitle)}</p></div>${view.preview ? '<span class="practice-lab-status is-preview">DEVELOPER PREVIEW</span>' : ""}</header>
    <main>${error}${view.status === "loading" ? '<div class="practice-lab-empty-state" aria-busy="true"><h2>Loading today’s plan…</h2></div>' : ""}${beforePlan}${planSection}</main>
  </div></section>`;
  (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-coach-next']") ?? root.querySelector?.("[data-practice-action='create-coach-plan']") ?? root.querySelector?.("[data-practice-heading]"))?.focus?.({ preventScroll: true });
  return true;
}

export function renderPracticeLabV25(root, view, options = {}) {
  if (view?.kind === "daily-training") return renderPracticeCoach(root, view, options);
  const rendered = renderPracticeLabV24(root, view, options);
  if (view?.kind === "home") {
    const card = root.querySelector?.(".practice-lab-daily");
    const button = card?.querySelector?.("button");
    if (button) {
      button.disabled = false;
      button.removeAttribute?.("aria-disabled");
      button.dataset.practiceAction = "open-daily-training";
      button.textContent = "OPEN DAILY TRAINING";
    }
    const status = card?.querySelector?.("li");
    if (status) status.textContent = "Available in developer preview";
  }
  return rendered;
}
