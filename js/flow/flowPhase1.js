import {
  backspaceFlowText,
  createFlowTypingRun,
  getFlowCharacterView,
  getFlowTypingSnapshot,
  insertFlowText,
} from "./flowEngine.js";
import { getFlowPhase1Passage } from "./flowPassages.js";
import { FLOW_PHASES } from "./flowState.js";

const root = () => document.querySelector("#app");
const now = () => globalThis.performance?.now?.() ?? Date.now();

let active = false;
let view = "idle";
let storedModeSelectNodes = [];
let run = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function preserveModeSelect() {
  const app = root();
  if (!app) return false;
  storedModeSelectNodes = [...app.childNodes];
  return storedModeSelectNodes.length > 0;
}

function restoreModeSelect() {
  const app = root();
  if (!app) return;
  active = false;
  view = "idle";
  run = null;
  if (storedModeSelectNodes.length) app.replaceChildren(...storedModeSelectNodes);
  storedModeSelectNodes = [];
  app.querySelector('[data-mode-id="flow"]')?.focus?.({ preventScroll: true });
}

function renderReady() {
  const app = root();
  if (!app) return;
  const passage = getFlowPhase1Passage();
  app.innerHTML = `
    <section class="screen flow-phase1-screen flow-ready-screen" data-flow-view="ready">
      <main class="flow-phase1-shell">
        <button type="button" class="screen-back-button" data-flow-action="back">BACK</button>
        <div class="flow-phase1-kicker">Natural typing engine · Phase 1</div>
        <h1>FLOW</h1>
        <p class="flow-phase1-lead">Type complete text exactly as written. Spaces, capitals, punctuation, apostrophes, quotation marks, numbers and corrections are all part of the run.</p>
        <div class="flow-phase1-brief" aria-label="Phase 1 session details">
          <span><strong>${passage.text.length}</strong> characters</span>
          <span><strong>1</strong> validation passage</span>
          <span><strong>No score</strong> in Phase 1</span>
        </div>
        <button type="button" class="ui-button ui-button--primary flow-phase1-start" data-flow-action="start">START FLOW</button>
        <p class="flow-phase1-note">This phase validates the typing engine only. Flow scoring, rhythm analysis and progression come later.</p>
      </main>
    </section>`;
  app.querySelector('[data-flow-action="back"]')?.addEventListener("click", restoreModeSelect);
  app.querySelector('[data-flow-action="start"]')?.addEventListener("click", startRun);
  app.querySelector('[data-flow-action="start"]')?.focus?.({ preventScroll: true });
}

function charMarkup(character) {
  const shown = character.actual ?? character.expected;
  const classes = ["flow-char", `flow-char--${character.status}`];
  if (character.current) classes.push("flow-char--current");
  return `<span class="${classes.join(" ")}" data-flow-char="${character.index}" data-status="${character.status}" aria-hidden="true">${escapeHtml(shown)}</span>`;
}

function renderRun() {
  const app = root();
  if (!app || !run) return;
  app.innerHTML = `
    <section class="screen flow-phase1-screen flow-run-screen" data-flow-view="run">
      <main class="flow-run-shell">
        <header class="flow-run-header">
          <button type="button" class="screen-back-button" data-flow-action="back">BACK</button>
          <div><span>FLOW</span><strong data-flow-progress>0 / ${run.passage.length}</strong></div>
        </header>
        <div class="flow-run-copy">
          <p>Type the passage naturally. Backspace removes the most recent character.</p>
          <div class="flow-passages" aria-label="Typing passage">
            <div class="flow-passage" data-flow-passage aria-label="${escapeHtml(run.passage)}">${getFlowCharacterView(run).map(charMarkup).join("")}</div>
          </div>
        </div>
        <div class="flow-run-diagnostics" aria-live="polite">
          <span>Corrected <strong data-flow-corrected>0</strong></span>
          <span>Unresolved <strong data-flow-unresolved>0</strong></span>
        </div>
        <textarea class="flow-input-capture" data-flow-input aria-label="Flow typing input" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>
      </main>
    </section>`;
  app.querySelector('[data-flow-action="back"]')?.addEventListener("click", restoreModeSelect);
  const input = app.querySelector("[data-flow-input]");
  input?.addEventListener("beforeinput", handleBeforeInput);
  input?.addEventListener("input", () => { input.value = ""; });
  app.querySelector("[data-flow-passage]")?.addEventListener("pointerdown", () => input?.focus?.({ preventScroll: true }));
  input?.focus?.({ preventScroll: true });
  updateRunView();
}

function startRun() {
  const passage = getFlowPhase1Passage();
  run = createFlowTypingRun(passage.text, {
    category: passage.category,
    difficulty: passage.difficulty,
    sessionLength: "quick",
  });
  active = true;
  view = "run";
  renderRun();
}

function updateRunView() {
  if (!run || view !== "run") return;
  const app = root();
  if (!app) return;
  const characters = getFlowCharacterView(run);
  for (const character of characters) {
    const node = app.querySelector(`[data-flow-char="${character.index}"]`);
    if (!node) continue;
    node.textContent = character.actual ?? character.expected;
    node.dataset.status = character.status;
    node.className = `flow-char flow-char--${character.status}${character.current ? " flow-char--current" : ""}`;
  }
  const progress = app.querySelector("[data-flow-progress]");
  if (progress) progress.textContent = `${run.currentIndex} / ${run.passage.length}`;
  const corrected = app.querySelector("[data-flow-corrected]");
  if (corrected) corrected.textContent = String(run.correctedErrors);
  const unresolved = app.querySelector("[data-flow-unresolved]");
  if (unresolved) unresolved.textContent = String(run.uncorrectedErrors);
  if (run.phase === FLOW_PHASES.COMPLETE) renderComplete();
}

function renderComplete() {
  const app = root();
  if (!app || !run) return;
  view = "complete";
  const durationMs = Math.max(0, (run.completedAt ?? now()) - (run.startedAt ?? run.completedAt ?? now()));
  const seconds = (durationMs / 1000).toFixed(1);
  app.innerHTML = `
    <section class="screen flow-phase1-screen flow-complete-screen" data-flow-view="complete">
      <main class="flow-phase1-shell flow-complete-shell">
        <div class="flow-phase1-kicker">Engine validation complete</div>
        <h1>PASSAGE COMPLETE</h1>
        <p class="flow-phase1-lead">The full passage reached the terminal state. Phase 1 records timing and correction telemetry but intentionally does not calculate a Flow score.</p>
        <div class="flow-phase1-brief">
          <span><strong>${run.passage.length}</strong> characters</span>
          <span><strong>${run.correctedErrors}</strong> corrected errors</span>
          <span><strong>${run.uncorrectedErrors}</strong> unresolved errors</span>
          <span><strong>${seconds}s</strong> elapsed</span>
        </div>
        <div class="flow-complete-actions">
          <button type="button" class="ui-button ui-button--primary" data-flow-action="restart">TYPE AGAIN</button>
          <button type="button" class="ui-button" data-flow-action="back">MODE SELECT</button>
        </div>
      </main>
    </section>`;
  app.querySelector('[data-flow-action="restart"]')?.addEventListener("click", startRun);
  app.querySelector('[data-flow-action="back"]')?.addEventListener("click", restoreModeSelect);
  app.querySelector('[data-flow-action="restart"]')?.focus?.({ preventScroll: true });
}

function handleBeforeInput(event) {
  if (!active || view !== "run" || !run) return;
  if (event.inputType === "deleteContentBackward") {
    event.preventDefault();
    backspaceFlowText(run, now());
    updateRunView();
    return;
  }
  if (event.inputType?.startsWith("insert") && typeof event.data === "string" && event.data.length) {
    event.preventDefault();
    insertFlowText(run, event.data, now());
    updateRunView();
  }
}

function launchFromModeSelect(event) {
  const flowTarget = event.target?.closest?.('[data-mode-id="flow"]');
  if (!flowTarget || !root()?.querySelector(".mode-select-screen")) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  preserveModeSelect();
  active = true;
  view = "ready";
  renderReady();
  return true;
}

function handleDocumentClick(event) {
  if (!active) launchFromModeSelect(event);
}

function handleDocumentKeydown(event) {
  if (!active) {
    if (event.key === "Enter" && document.activeElement?.matches?.('[data-mode-id="flow"]')) {
      launchFromModeSelect(event);
    }
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    restoreModeSelect();
    return;
  }

  if (view === "ready") {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      startRun();
    }
    return;
  }

  if (view === "complete") {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      startRun();
    }
    return;
  }

  if (view !== "run" || !run) return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (event.key === "Backspace") {
    event.preventDefault();
    event.stopImmediatePropagation();
    backspaceFlowText(run, now());
    updateRunView();
    return;
  }
  if (event.key.length === 1) {
    event.preventDefault();
    event.stopImmediatePropagation();
    insertFlowText(run, event.key, now());
    updateRunView();
  }
}

document.addEventListener("click", handleDocumentClick, true);
document.addEventListener("keydown", handleDocumentKeydown, true);

if (globalThis.window) {
  window.wordstrikeFlowPhase1 = Object.freeze({
    getSnapshot: () => getFlowTypingSnapshot(run),
    isActive: () => active,
  });
}
