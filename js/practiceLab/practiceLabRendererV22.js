import { renderPracticeLabV21 } from "./practiceLabRendererV21.js";
import { buildPracticeProblemWordsDetailViewModel } from "./practiceProblemWordsUi.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const phenotype = (value) => ({ "launch-limited": "Slow start", slow: "Slow inside", inaccurate: "Inaccurate", hesitant: "Hesitant", "recovery-heavy": "Recovery-heavy", unstable: "Unstable", mixed: "Mixed" }[value] ?? "Mixed");
function status(view) {
  if (view.status === "checking") return '<div class="practice-lab-notice" role="status"><strong>Checking this word…</strong><p>Only its approved training word index and bounded contexts are evaluated.</p></div>';
  if (view.status === "preparing") return '<div class="practice-lab-notice" role="status"><strong>Building the fixed plan…</strong><p>Verifying exact quotas, lexical target-free Mix material, and matched probes.</p></div>';
  if (view.status === "ready") return '<div class="practice-lab-notice" role="status"><strong>Standard protocol available.</strong><p>Start creates a new immutable 15-opportunity word session.</p></div>';
  if (["limited-content", "unsupported", "unavailable", "error"].includes(view.status)) return `<div class="practice-lab-notice" role="${view.status === "limited-content" ? "status" : "alert"}"><strong>${view.status === "limited-content" ? "Limited training content" : "Word unavailable"}</strong><p>${escapeHtml(view.message)}</p>${view.status === "limited-content" ? "<p>No weaker protocol or protected-text fallback will be substituted.</p>" : ""}</div>`;
  return '<div class="practice-lab-notice"><strong>Developer preview</strong><p>Enter one English alphabetic word from 2 to 24 letters. Case is normalized to lowercase. Apostrophes, hyphens, digits, symbols, and multiple words are unsupported in v1.</p></div>';
}
function recommendations(view) {
  if (view.recommendationStatus === "loading") return '<p class="practice-lab-muted" role="status">Loading established word-limiter evidence…</p>';
  if (view.recommendationStatus === "no-evidence") return '<p class="practice-lab-muted">No problem word is currently well-established. Manual practice remains available.</p>';
  if (view.recommendationStatus === "unsupported") return '<p class="practice-lab-muted">Problem Words recommendations currently support English v1 only.</p>';
  if (view.recommendationStatus === "unavailable") return '<p class="practice-lab-muted">Recommendations are unavailable. Manual practice remains available.</p>';
  if (!view.recommendations.length) return '<p class="practice-lab-muted">Recommendations use existing PL12/PL15/PL16 evidence and do not preload every word shard.</p>';
  return `<div class="practice-weak-key-recommendations">${view.recommendations.map((item) => `<button type="button" data-practice-action="choose-problem-word" data-entity-key="${escapeHtml(item.entityKey)}" data-target-source="recommended"><strong>${escapeHtml(item.entityKey)}</strong><span>${escapeHtml(phenotype(item.limiterPhenotype))} · ${escapeHtml(item.limiterStatus)} · confidence ${Math.round(Number(item.evidenceConfidenceScore || 0))}%</span>${item.hierarchyDeemphasized ? '<small>May partly reflect lower-level key or combination issues.</small>' : ""}${item.saturationDeemphasized ? '<small>Recent similar practice appears to have low marginal gain.</small>' : ""}</button>`).join("")}</div>`;
}
function phases(view) {
  const copy = { "entry-probe": "3 uncued word opportunities", focus: "4 separated repetitions · strong whole-word cue", context: "3 varied natural contexts · subtle whole-word cue", interleave: "2 target opportunities mixed with target-free material · cue off", "exit-probe": "3 new matched word opportunities · cue off" };
  return `<ol class="practice-weak-key-plan" aria-label="Fixed Problem Words phase plan">${view.phases.map((phase) => `<li><span class="practice-weak-key-plan-index">${phase.ordinal}</span><div><strong>${escapeHtml(phase.label)}</strong><p>${escapeHtml(copy[phase.id])}</p></div><span>${phase.opportunityQuota}</span></li>`).join("")}</ol>`;
}
export function renderPracticeProblemWordsDetail(root, view, { focusSelector = null } = {}) {
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="problem-words-detail"><div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← ${escapeHtml(view.backLabel)}</button><span class="practice-lab-status is-preview">DEVELOPER PREVIEW</span></header><main class="practice-lab-detail practice-weak-key-detail">
    <div class="eyebrow">${escapeHtml(view.category)} · lexical intervention</div><h1>${escapeHtml(view.title)}</h1><p class="practice-lab-lead">${escapeHtml(view.description)}</p><p>${escapeHtml(view.longDescription)}</p>
    <section class="practice-lab-empty-state"><h2>Recommended words</h2>${recommendations(view)}</section>
    <section class="practice-lab-empty-state"><div class="practice-lab-card-meta"><span>One word</span><span>15 direct opportunities · 1.0 dose</span></div><h2>Manual word</h2><label class="practice-weak-key-target-field"><span>Word</span><input data-problem-word-target type="text" value="${escapeHtml(view.targetValue)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="problem-word-help"><small id="problem-word-help">One English alphabetic word, 2–24 letters. Case normalizes to lowercase.</small></label>${view.warnings.map((warning) => `<div class="practice-lab-notice" role="status"><strong>${warning.kind === "saturation" ? "Saturation note" : "Hierarchy note"}</strong><p>${escapeHtml(warning.message)}</p></div>`).join("")}<button type="button" class="practice-lab-primary-action" data-practice-action="start-problem-words" ${view.canStart && !view.preparing ? "" : "disabled"}>${view.preparing ? "BUILDING…" : "START PROBLEM WORDS"}</button>${status(view)}</section>
    <section class="practice-lab-empty-state"><h2>What this mode trains</h2><p>Problem Words trains typing execution, not vocabulary or spelling recall. It keeps <strong>starting the word</strong>, <strong>inside the word</strong>, and <strong>whole-word first-pass accuracy</strong> as separate observations.</p><p>Constituent keys, bigrams, and trigrams still contribute incidental PL11 evidence but are never directly targeted or highlighted here.</p></section>
    <section class="practice-lab-empty-state"><h2>Session structure</h2><p>The fixed dose does not grow after errors or shrink after a strong Baseline.</p>${phases(view)}</section>
    <section class="practice-lab-empty-state"><h2>Evidence boundary</h2><p>All five phases use approved <code>training</code> material. Check is target-enriched same-session evidence, not cold transfer, retention, mastery, or a causal treatment claim.</p></section>
  </main></div></section>`;
  (focusSelector ? root.querySelector?.(focusSelector) : null ?? root.querySelector?.("[data-problem-word-target]") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
  return true;
}

export function createPracticeLabRendererV22({ getProblemWordsState } = {}) {
  return function renderPracticeLabV22(root, view, options = {}) {
    if (view?.kind === "experiment-detail" && view?.title === "Problem Words") {
      const detail = buildPracticeProblemWordsDetailViewModel({ entry: view, resolved: { runnable: view.runnable }, state: getProblemWordsState?.() });
      return renderPracticeProblemWordsDetail(root, detail, options);
    }
    return renderPracticeLabV21(root, view, options);
  };
}
