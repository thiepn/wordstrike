import {
  backspaceFlowText,
  createFlowTypingRun,
  getFlowCharacterView,
  getFlowTypingSnapshot,
  insertFlowText,
} from "./flowEngine.js";
import { resolveFlowSelection } from "./flowSelection.js";
import { FLOW_PHASES } from "./flowState.js";

const root = () => document.querySelector("#app");
const now = () => globalThis.performance?.now?.() ?? Date.now();
const search = new URLSearchParams(globalThis.location?.search || "");
const developerFlowRequested = search.get("dev") === "1" && search.get("mode") === "flow";
const resolvedSelection = resolveFlowSelection(search);

let active = false;
let dismissed = false;
let view = "idle";
let storedReturnNodes = [];
let run = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function preserveReturnSurface() {
  const app = root();
  if (!app) return false;
  storedReturnNodes = [...app.childNodes];
  return storedReturnNodes.length > 0;
}

function restoreReturnSurface() {
  const app = root();
  if (!app) return;
  dismissed = true;
  active = false;
  view = "idle";
  run = null;
  if (storedReturnNodes.length) app.replaceChildren(...storedReturnNodes);
  storedReturnNodes = [];
}

function renderMissingSelection() {
  const app = root();
  if (!app) return;
  app.innerHTML = `
    <section class="screen flow-phase1-screen flow-ready-screen" data-flow-view="missing">
      <main class="flow-phase1-shell">
        <button type="button" class="screen-back-button" data-flow-action="back">BACK</button>
        <div class="flow-phase1-kicker">Flow content system · Phase 2</div>
        <h1>NO PASSAGE</h1>
        <p class="flow-phase1-lead">The requested passage id does not exist in the validated Flow catalog.</p>
      </main>
    </section>`;
  app.querySelector('[data-flow-action="back"]')?.addEventListener("click", restoreReturnSurface);
}

function renderReady() {
  const app = root();
  if (!app) return;
  if (!resolvedSelection?.passage) {
    renderMissingSelection();
    return;
  }
  const { passage, source, category, difficulty, matchCount } = resolvedSelection;
  app.innerHTML = `
    <section class="screen flow-phase1-screen flow-ready-screen" data-flow-view="ready">
      <main class="flow-phase1-shell">
        <button type="button" class="screen-back-button" data-flow-action="back">BACK</button>
        <div class="flow-phase1-kicker">Natural typing content engine · Phase 2 developer route</div>
        <h1>FLOW</h1>
        <p class="flow-phase1-lead">Type complete text exactly as written. Phase 2 now selects from a validated passage catalog by category and difficulty.</p>
        <div class="flow-phase1-brief" aria-label="Phase 2 session details">
          <span><strong>${passage.characters ?? passage.text.length}</strong> characters</span>
          <span><strong>${escapeHtml(category)}</strong> category</span>
          <span><strong>${escapeHtml(difficulty)}</strong> difficulty</span>
          <span><strong>${matchCount}</strong> matching passage${matchCount === 1 ? "" : "s"}</span>
        </div>
        <p class="flow-phase1-note" data-flow-passage-id>${escapeHtml(passage.id)}</p>
        <button type="button" class="ui-button ui-button--primary flow-phase1-start" data-flow-action="start">START FLOW</button>
        <p class="flow-phase1-note">Source: ${escapeHtml(source)}. Public launch, scoring, rhythm analysis and progression remain intentionally out of scope.</p>
      </main>
    </section>`;
  app.querySelector('[data-flow-action="back"]')?.addEventListener("click", restoreReturnSurface);
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
          <div><span>FLOW · ${escapeHtml(resolvedSelection?.passage?.id || "passage")}</span><strong data-flow-progress>0 / ${run.passage.length}</strong></div>
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
  app.querySelector('[data-flow-action="back"]')?.addEventListener("click", restoreReturnSurface);
  const input = app.querySelector("[data-flow-input]");
  input?.addEventListener("beforeinput", handleBeforeInput);
  input?.addEventListener("input", () => { input.value = ""; });
  app.querySelector("[data-flow-passage]")?.addEventListener("pointerdown", () => input?.focus?.({ preventScroll: true }));
  input?.focus?.({ preventScroll: true });
  updateRunView();
}

function startRun() {
  const passage = resolvedSelection?.passage;
  if (!passage) return;
  run = createFlowTypingRun(passage.text, {
    category: passage.category,
    difficulty: passage.difficulty,
    sessionLength: "quick",
  });
  run.passageId = passage.id;
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
        <div class="flow-phase1-kicker">Content-engine validation complete</div>
        <h1>PASSAGE COMPLETE</h1>
        <p class="flow-phase1-lead">The selected catalog passage reached the terminal state. Timing and correction telemetry remain separate from future Flow scoring.</p>
        <div class="flow-phase1-brief">
          <span><strong>${run.passage.length}</strong> characters</span>
          <span><strong>${run.correctedErrors}</strong> corrected errors</span>
          <span><strong>${run.uncorrectedErrors}</strong> unresolved errors</span>
          <span><strong>${seconds}s</strong> elapsed</span>
        </div>
        <div class="flow-complete-actions">
          <button type="button" class="ui-button ui-button--primary" data-flow-action="restart">TYPE AGAIN</button>
          <button type="button" class="ui-button" data-flow-action="back">BACK</button>
        </div>
      </main>
    </section>`;
  app.querySelector('[data-flow-action="restart"]')?.addEventListener("click", startRun);
  app.querySelector('[data-flow-action="back"]')?.addEventListener("click", restoreReturnSurface);
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

function handleDocumentKeydown(event) {
  if (!active) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    restoreReturnSurface();
    return;
  }
  if (view === "ready" || view === "complete") {
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

function tryLaunchDeveloperFlow() {
  if (!developerFlowRequested || active || dismissed) return;
  const app = root();
  if (!app || app.childNodes.length === 0) return;
  preserveReturnSurface();
  active = true;
  view = "ready";
  renderReady();
}

document.addEventListener("keydown", handleDocumentKeydown, true);
if (developerFlowRequested) {
  const app = root();
  if (app) new MutationObserver(() => queueMicrotask(tryLaunchDeveloperFlow)).observe(app, { childList: true });
  queueMicrotask(tryLaunchDeveloperFlow);
}

if (globalThis.window) {
  window.wordstrikeFlowPhase1 = Object.freeze({
    getSnapshot: () => getFlowTypingSnapshot(run),
    getSelection: () => resolvedSelection,
    isActive: () => active,
    developerRouteEnabled: developerFlowRequested,
  });
}
