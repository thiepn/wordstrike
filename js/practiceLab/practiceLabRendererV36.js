import { renderPracticeLabV32 } from "./practiceLabRendererV32.js";
import {
  renderPracticePhysicalTelemetryPanel,
  renderPracticePhysicalTelemetrySetting,
} from "./practicePhysicalTelemetryUi.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

export function renderPracticePhysicalKeyboardPage(root, view, { focusSelector = null } = {}) {
  if (!root || typeof root.innerHTML !== "string") throw new TypeError("Physical Keyboard renderer requires a root element");
  const loading = view?.status === "loading";
  const unavailable = view?.status === "unavailable";
  const body = loading
    ? `<section class="practice-lab-empty-state" aria-live="polite"><h2>Loading Physical Keyboard telemetry…</h2><p>Reading local aggregate telemetry from this browser.</p></section>`
    : unavailable
      ? `<section class="practice-lab-empty-state" role="status"><h2>Physical Keyboard telemetry unavailable</h2><p>Local telemetry could not be read. Existing Practice evidence is unaffected.</p>${view?.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}</section>`
      : `${renderPracticePhysicalTelemetryPanel({ availability: view.availability, snapshot: view.snapshot, hasStoredData: view.hasStoredData })}
        <section class="practice-lab-empty-state" aria-labelledby="practice-physical-settings-title"><div class="eyebrow">Advanced</div><h2 id="practice-physical-settings-title">Physical keyboard telemetry</h2>${renderPracticePhysicalTelemetrySetting({ enabled: view.availability?.enabled === true, hasStoredData: false })}</section>`;
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="physical-keyboard"><div class="practice-lab-shell">
    <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">DEVELOPER PREVIEW</span></header>
    <main class="practice-lab-detail"><div class="eyebrow">Progress · Advanced</div>${body}</main>
  </div></section>`;
  const target = (focusSelector && root.querySelector?.(focusSelector))
    || root.querySelector?.("[data-practice-physical-toggle]")
    || root.querySelector?.("[data-practice-heading]")
    || root.querySelector?.("button");
  target?.focus?.({ preventScroll: true });
  return root.querySelector?.(".practice-lab-screen") ?? true;
}

export function renderPracticeLabV36(root, view, options = {}) {
  if (view?.kind === "physical-keyboard") return renderPracticePhysicalKeyboardPage(root, view, options);
  return renderPracticeLabV32(root, view, options);
}
