import { renderPracticeLabV20 } from "./practiceLabRendererV20.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

function targetStatus(view) {
  if (view.status === "checking") return '<div class="practice-lab-notice" role="status"><strong>Checking this key…</strong><p>Only the selected key’s approved training index/content is loaded.</p></div>';
  if (view.status === "preparing") return '<div class="practice-lab-notice" role="status"><strong>Building the fixed plan…</strong><p>Verifying exact phase quotas, neutral Mix material, and matched probes.</p></div>';
  if (view.status === "ready") return '<div class="practice-lab-notice" role="status"><strong>Standard protocol available.</strong><p>The Start button will build a new immutable session plan.</p></div>';
  if (["limited-content", "unsupported", "unavailable", "error"].includes(view.status)) return `<div class="practice-lab-notice" role="${view.status === "limited-content" ? "status" : "alert"}"><strong>${view.status === "limited-content" ? "Limited training content" : "Key unavailable"}</strong><p>${escapeHtml(view.message)}</p>${view.status === "limited-content" ? "<p>No weaker protocol or protected-text fallback will be substituted.</p>" : ""}</div>`;
  return '<div class="practice-lab-notice"><strong>Developer preview</strong><p>Choose one English letter. Uppercase input is normalized to lowercase; digits, punctuation, symbols, whitespace, and multi-letter targets are unsupported in v1.</p></div>';
}

function recommendationRows(view) {
  if (view.recommendationStatus === "loading") return '<p class="practice-lab-muted" role="status">Loading existing key-limiter evidence…</p>';
  if (view.recommendationStatus === "no-evidence") return '<p class="practice-lab-muted">No weak key is currently well-established. Manual practice remains possible.</p>';
  if (view.recommendationStatus === "unsupported") return '<p class="practice-lab-muted">Weak Keys recommendations are currently available for English v1 only. Manual unsupported-language training is not enabled.</p>';
  if (view.recommendationStatus === "unavailable") return `<div class="practice-lab-notice" role="status"><strong>Recommendations unavailable.</strong><p>Manual practice remains available.${view.recommendationErrorCode ? ` Diagnostic: ${escapeHtml(view.recommendationErrorCode)}.` : ""}</p></div>`;
  if (!view.recommendations.length) return '<p class="practice-lab-muted">Recommendations use existing PL12/PL15/PL16 evidence when available. They do not preload every key’s training content.</p>';
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
    <div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back" aria-label="${escapeHtml(view.backLabel)}">← ${escapeHtml(view.backLabel)}</button><span class="practice-lab-status is-preview">DEVELOPER PREVIEW</span></header>
    <main class="practice-lab-detail practice-weak-key-detail">
      <div class="eyebrow">${escapeHtml(view.category)} · key intervention</div><h1>${escapeHtml(view.title)}</h1><p class="practice-lab-lead">${escapeHtml(view.description)}</p><p>${escapeHtml(view.longDescription)}</p>
      <section class="practice-lab-empty-state"><h2>Recommended keys</h2>${recommendationRows(view)}</section>
      <section class="practice-lab-empty-state"><div class="practice-lab-card-meta"><span>One key</span><span>80 direct opportunities · 1.0 dose</span></div><h2>Manual key</h2>
        <label class="practice-weak-key-target-field"><span>Letter</span><input data-weak-key-target type="text" value="${escapeHtml(view.targetValue)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" aria-describedby="weak-key-help"><small id="weak-key-help">One English letter a–z. Uppercase normalizes to lowercase. Weak Keys trains one letter at a time.</small></label>
        ${view.saturationWarning?.message ? `<div class="practice-lab-notice" role="status"><strong>Saturation note</strong><p>${escapeHtml(view.saturationWarning.message)}</p></div>` : ""}
        <button type="button" class="practice-lab-primary-action" data-practice-action="start-weak-keys" ${view.canStart && !view.preparing ? "" : "disabled"}>${view.preparing ? "BUILDING…" : "START WEAK KEYS"}</button>
        ${targetStatus(view)}
      </section>
      <section class="practice-lab-empty-state"><h2>What this mode does</h2><p>Weak Keys trains one PL11 expected-character key across multiple words, word positions, and surrounding transitions. It does not prescribe a finger or enforce a touch-typing technique.</p><p>Where the active keyboard layout is known, PL10 geometry is used only to diversify observed transition contexts. Unknown layouts remain valid and are never treated as QWERTY.</p></section>
      <section class="practice-lab-empty-state"><h2>Session structure</h2><p>The fixed dose is never increased after errors and never shortened after a strong Baseline.</p>${phasePlan(view)}</section>
      <section class="practice-lab-empty-state"><h2>Evidence boundary</h2><p>Baseline and Check are both approved <code>training</code> material. The final Check is not transfer and one strong session does not mean “mastered,” “retained,” or “fixed forever.”</p><p>Transfer, benchmark, diagnostic, and research-holdout text are never used by this intervention.</p></section>
    </main></div>
  </section>`;
  const target = focusSelector ? root.querySelector?.(focusSelector) : null;
  (target ?? root.querySelector?.("[data-weak-key-target]") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
  return true;
}

export function renderPracticeLabV21(root, view, options = {}) {
  if (view?.kind === "weak-keys-detail") return renderWeakKeys(root, view, options);
  return renderPracticeLabV20(root, view, options);
}
