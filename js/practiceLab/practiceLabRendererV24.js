import { renderPracticeLabV23 } from "./practiceLabRendererV23.js";

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

export function renderPracticeRealTextDetail(root, view, { focusSelector = null } = {}) {
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="real-text-detail"><div class="practice-lab-shell">
    <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">DEVELOPER PREVIEW</span></header>
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
      <section class="practice-lab-empty-state"><h2>Why these are separate</h2><p><strong>Natural Practice</strong> contributes ordinary training evidence. <strong>Cold Transfer</strong> uses PL18 protected material and may contribute transfer and cold-natural ability evidence only when its integrity rules pass.</p><p>Neither flow contains target entities or resamples text to include a recently trained weakness.</p></section>
    </main></div></section>`;
  (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-real-text-natural']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
  return true;
}

export function renderPracticeLabV24(root, view, options = {}) {
  if (view?.kind === "real-text-detail") return renderPracticeRealTextDetail(root, view, options);
  return renderPracticeLabV23(root, view, options);
}
