import { renderPracticeLabV31 } from "./practiceLabRendererV31.js";

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

export function renderPracticeTreatmentResponseProgress(root, view, { focusSelector = null } = {}) {
  const loading = view.status === "loading";
  const unavailable = view.status === "unavailable";
  const body = loading
    ? `<section class="practice-lab-empty-state"><h2>Loading Treatment Response…</h2><p>Reading local longitudinal Practice evidence.</p></section>`
    : unavailable
      ? `<section class="practice-lab-empty-state"><h2>Treatment Response unavailable</h2><p>Local response tracking could not be read. Existing Practice evidence is unaffected.</p>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}</section>`
      : view.hasEvidence
        ? `<div class="practice-lab-category-grid">${view.cards.map(responseCard).join("")}</div>`
        : `<section class="practice-lab-empty-state"><h2>${escapeHtml(view.emptyTitle)}</h2><p>${escapeHtml(view.emptyDescription)}</p></section>`;
  const recent = !loading && !unavailable && view.recentEpisodes?.length
    ? `<section class="practice-lab-empty-state"><div class="eyebrow">Prospective episode log</div><h2>Recent tracked treatments</h2><p>These rows show tracking state only. They are not effectiveness rankings.</p><ul>${view.recentEpisodes.map(episodeRow).join("")}</ul></section>`
    : "";
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="treatment-response-progress"><div class="practice-lab-shell">
    <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← ${escapeHtml(view.backLabel ?? "Back to Practice Lab")}</button><span class="practice-lab-status is-preview">DEVELOPER PREVIEW</span></header>
    <main class="practice-lab-detail">
      <div class="eyebrow">Progress · longitudinal observation</div><h1>${escapeHtml(view.sectionTitle ?? "Treatment Response")}</h1>
      <p class="practice-lab-lead">See how later compatible measurements have differed after specific Practice treatments.</p>
      <div class="practice-lab-notice">${escapeHtml(view.doctrine ?? "Observed response patterns do not establish causation.")}</div>
      <div class="practice-lab-actions"><button type="button" data-practice-action="treatment-response-refresh" ${loading ? "disabled" : ""}>${loading ? "REFRESHING…" : "REFRESH LOCAL EVIDENCE"}</button>${view.trackingCount ? `<span>${view.trackingCount} treatment${view.trackingCount === 1 ? "" : "s"} awaiting later outcomes</span>` : ""}</div>
      ${body}${recent}
    </main></div></section>`;
  (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='treatment-response-refresh']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
  return true;
}

export function renderPracticeLabV32(root, view, options = {}) {
  if (view?.kind === "treatment-response-progress") return renderPracticeTreatmentResponseProgress(root, view, options);
  return renderPracticeLabV31(root, view, options);
}
