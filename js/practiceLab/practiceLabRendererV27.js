import { renderPracticeLabV26 } from "./practiceLabRendererV26.js";
import {
  PRACTICE_BURST_RECOVERY_DURATION_MS,
  PRACTICE_BURST_SPRINT_COUNT,
  PRACTICE_BURST_SPRINT_DURATION_MS,
  PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS,
} from "./practiceBurstSprintsConstants.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

export function renderPracticeBurstSprintsDetail(root, view, { focusSelector = null } = {}) {
  const canStart = view.status === "ready" && !view.starting;
  const sprintSeconds = PRACTICE_BURST_SPRINT_DURATION_MS / 1000;
  const recoverySeconds = PRACTICE_BURST_RECOVERY_DURATION_MS / 1000;
  const protocolSeconds = PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS / 1000;
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="burst-sprints-detail"><div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">DEVELOPER PREVIEW</span></header><main class="practice-lab-detail"><div class="eyebrow">Speed · diagnostic training · ~${Math.round(protocolSeconds / 60)} min</div><h1>Burst Sprints</h1><p class="practice-lab-lead">Measure and train short-form burst speed with six controlled ${sprintSeconds}-second bouts separated by full ${recoverySeconds}-second recovery intervals. PL13 remains the canonical owner of the resulting <code>burst</code> ability state.</p><section class="practice-lab-empty-state"><h2>Protocol</h2><div style="overflow-x:auto;max-width:100%"><table><thead><tr><th>Block</th><th>Duration</th><th>Instruction</th></tr></thead><tbody>${Array.from({ length: PRACTICE_BURST_SPRINT_COUNT }, (_, index) => `<tr><td>Sprint ${index + 1}</td><td>${sprintSeconds} s</td><td>Fast, but controlled</td></tr>${index < PRACTICE_BURST_SPRINT_COUNT - 1 ? `<tr><td>Recovery</td><td>${recoverySeconds} s</td><td>Hands off; fully reset</td></tr>` : ""}`).join("")}</tbody></table></div><p>Active typing time: <strong>60 seconds</strong>. Total protocol time: <strong>${protocolSeconds} seconds</strong>.</p></section><section class="practice-lab-empty-state"><h2>Measurement rule</h2><p>Each sprint must remain accurate enough to count. The session estimate uses the <strong>median of the three fastest eligible sprints</strong>, so one lucky spike cannot become your burst ability estimate.</p><p class="practice-lab-muted">The six bouts are one diagnostic dose. A valid run produces at most one PL13 <code>burst</code> observation.</p></section><section class="practice-lab-empty-state"><h2>Evidence boundary</h2><p>Burst Sprints estimates short-form controlled burst speed. It does not claim a universal maximum WPM, endurance capacity, cold-transfer performance, or a Pace Ladder control frontier.</p><p>Stopping the run, hiding the page, or failing to produce at least three eligible sprints prevents a burst ability update.</p>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}<button type="button" class="practice-lab-primary-action" data-practice-action="start-burst-sprints" ${canStart ? "" : "disabled"}>${view.starting ? "STARTING…" : "START BURST SPRINTS"}</button></section></main></div></section>`;
  (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-burst-sprints']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
  return true;
}

export function renderPracticeLabV27(root, view, options = {}) {
  if (view?.kind === "burst-sprints-detail") return renderPracticeBurstSprintsDetail(root, view, options);
  return renderPracticeLabV26(root, view, options);
}
