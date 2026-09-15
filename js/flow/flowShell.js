import { FLOW_DEFAULTS, FLOW_MODE_ID, normalizeFlowOptions } from "./flowConfig.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

export function renderFlowReadyShell(root, options = {}) {
  if (!root) return false;
  const config = normalizeFlowOptions(options);
  root.innerHTML = `
    <section class="screen flow-ready-screen" data-mode="${FLOW_MODE_ID}">
      <main class="flow-ready-panel">
        <button type="button" class="screen-back-button" data-flow-action="back" aria-label="Go back">BACK</button>
        <div class="eyebrow">Natural typing</div>
        <h1>FLOW</h1>
        <p>Continuous, real-world text built around rhythm, accuracy, punctuation, and clean correction.</p>
        <dl class="flow-foundation-summary">
          <div><dt>Category</dt><dd>${escapeHtml(config.category)}</dd></div>
          <div><dt>Difficulty</dt><dd>${escapeHtml(config.difficulty)}</dd></div>
          <div><dt>Session</dt><dd>${escapeHtml(config.sessionLength)}</dd></div>
        </dl>
        <button type="button" class="arcade-button" disabled aria-disabled="true">START FLOW</button>
      </main>
    </section>`;

  root.querySelector('[data-flow-action="back"]')?.addEventListener("click", () => {
    options.onBack?.();
  });
  return true;
}

export function createFlowReadyModel(options = FLOW_DEFAULTS) {
  return Object.freeze({ mode: FLOW_MODE_ID, ...normalizeFlowOptions(options) });
}
