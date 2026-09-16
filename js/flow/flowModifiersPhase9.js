import {
  FLOW_MODIFIER_IDS,
  FLOW_MODIFIERS,
  getFlowModifierQueryValue,
  normalizeFlowModifierIds,
  toggleFlowModifier,
} from "./flowModifiers.js";

const params = new URLSearchParams(globalThis.location?.search || "");
const enabled = params.get("dev") === "1"
  && params.get("mode") === "flow"
  && params.get("flowRun") === "1"
  && params.get("flowUi") === "1"
  && params.get("flowUx") === "1"
  && params.get("flowModifiers") === "1";

let draftModifiers = normalizeFlowModifierIds(params.get("flowModifierIds") || "");
let decoratedScreen = null;
let statusTimer = null;

function controller() {
  return globalThis.window?.wordstrikeFlowPhase1 || null;
}

function uiController() {
  return globalThis.window?.wordstrikeFlowUiPhase7 || null;
}

function currentScreen() {
  return document.querySelector(".flow-phase1-screen[data-flow-ui-phase7='true']");
}

function plan() {
  return controller()?.getRunPlan?.() || null;
}

function modifiersChanged() {
  const current = normalizeFlowModifierIds(plan()?.modifiers || []);
  return current.join(",") !== draftModifiers.join(",");
}

function setupChanged() {
  const current = plan();
  const draft = uiController()?.getDraft?.();
  if (!current || !draft) return modifiersChanged();
  return modifiersChanged()
    || draft.sessionLength !== current.sessionLength
    || draft.category !== current.category
    || draft.difficulty !== current.difficulty;
}

function modifierButton(definition) {
  const selected = draftModifiers.includes(definition.id);
  const score = definition.scoreMultiplier === 1
    ? ""
    : definition.conditional
      ? `Perfect ×${definition.scoreMultiplier.toFixed(2)}`
      : `Score ×${definition.scoreMultiplier.toFixed(2)}`;
  return `
    <button
      type="button"
      class="flow-modifier-choice${selected ? " is-selected" : ""}"
      data-flow-modifier-id="${definition.id}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <span>${definition.name}</span>
      <small>${definition.description}</small>
      ${score ? `<em>${score}</em>` : ""}
    </button>`;
}

function modifierSetupMarkup() {
  return `
    <fieldset class="flow-modifier-setup" data-flow-modifier-setup>
      <legend>Modifiers <span>Optional</span></legend>
      <div class="flow-modifier-heading">
        <p>Shape the rules without changing the core typing model. Conflicting modifiers replace one another automatically.</p>
        <button type="button" class="flow-modifier-clear" data-flow-modifier-clear>CLEAR</button>
      </div>
      <div class="flow-modifier-grid">
        ${FLOW_MODIFIER_IDS.map((id) => modifierButton(FLOW_MODIFIERS[id])).join("")}
      </div>
      <div class="flow-modifier-selection" aria-live="polite" data-flow-modifier-selection></div>
    </fieldset>`;
}

function syncSetup(screen) {
  for (const button of screen.querySelectorAll("[data-flow-modifier-id]")) {
    const selected = draftModifiers.includes(button.dataset.flowModifierId);
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  const summary = screen.querySelector("[data-flow-modifier-selection]");
  if (summary) {
    summary.textContent = draftModifiers.length
      ? `${draftModifiers.length} active · ${draftModifiers.map((id) => FLOW_MODIFIERS[id].name).join(" · ")}`
      : "No modifiers active";
  }
  const dock = document.querySelector("[data-flow-ux='setup-action-dock']");
  let modifierLabel = dock?.querySelector("[data-flow-modifier-dock]");
  if (dock && !modifierLabel) {
    modifierLabel = document.createElement("small");
    modifierLabel.dataset.flowModifierDock = "";
    dock.querySelector(".flow-ux-setup-action-copy")?.append(modifierLabel);
  }
  if (modifierLabel) modifierLabel.textContent = draftModifiers.length ? `${draftModifiers.length} modifier${draftModifiers.length === 1 ? "" : "s"}` : "Base rules";
  const start = dock?.querySelector('[data-flow-action="start"]') || screen.querySelector('[data-flow-action="start"]');
  if (start && setupChanged()) {
    start.textContent = "START UPDATED RUN";
    start.dataset.flowSetupChanged = "true";
  }
}

function selectModifier(screen, id) {
  draftModifiers = toggleFlowModifier(draftModifiers, id);
  syncSetup(screen);
}

function decorateReady(screen) {
  if (screen.querySelector("[data-flow-modifier-setup]")) {
    syncSetup(screen);
    return;
  }
  const itinerary = screen.querySelector("[data-flow-setup-itinerary]");
  itinerary?.insertAdjacentHTML("beforebegin", modifierSetupMarkup());
  screen.querySelector("[data-flow-modifier-setup]")?.addEventListener("click", (event) => {
    const choice = event.target.closest?.("[data-flow-modifier-id]");
    if (choice) {
      selectModifier(screen, choice.dataset.flowModifierId);
      return;
    }
    if (event.target.closest?.("[data-flow-modifier-clear]")) {
      draftModifiers = Object.freeze([]);
      syncSetup(screen);
    }
  });
  syncSetup(screen);
}

function activeModifierIds() {
  return normalizeFlowModifierIds(controller()?.getSnapshot?.()?.modifiers || plan()?.modifiers || []);
}

function stripMarkup(modifierIds, extra = "") {
  if (!modifierIds.length) return "";
  return `
    <div class="flow-modifier-strip" data-flow-modifier-strip>
      <span>Modifiers</span>
      <div>${modifierIds.map((id) => `<strong data-modifier="${id}">${FLOW_MODIFIERS[id].name}</strong>`).join("")}</div>
      ${extra}
    </div>`;
}

function decorateRun(screen) {
  if (screen.querySelector("[data-flow-modifier-strip]")) return;
  const modifierIds = activeModifierIds();
  if (!modifierIds.length) return;
  const rail = screen.querySelector("[data-flow-ui='session-rail']");
  const anchor = rail || screen.querySelector(".flow-run-header");
  anchor?.insertAdjacentHTML("afterend", stripMarkup(modifierIds, '<small data-flow-modifier-status aria-live="polite"></small>'));
}

function decorateChapter(screen) {
  if (screen.querySelector("[data-flow-modifier-strip]")) return;
  const modifierIds = activeModifierIds();
  const rail = screen.querySelector("[data-flow-ui='session-rail']");
  rail?.insertAdjacentHTML("afterend", stripMarkup(modifierIds));
}

function decorateComplete(screen) {
  if (screen.querySelector("[data-flow-modifier-results]")) return;
  const snapshot = controller()?.getSnapshot?.();
  const modifierIds = normalizeFlowModifierIds(snapshot?.modifiers || []);
  if (!modifierIds.length) return;
  const breakdown = snapshot?.gameplay?.scoreBreakdown;
  const entries = breakdown?.modifierEntries || [];
  const rows = entries.map((entry) => {
    const state = entry.id === "clean-run" ? (entry.achieved ? "earned" : "lost") : "applied";
    return `<li><span>${entry.name}</span><strong>×${entry.appliedMultiplier.toFixed(2)}</strong><small>${state}</small></li>`;
  }).join("");
  const section = `
    <section class="flow-modifier-results" data-flow-modifier-results aria-label="Flow modifier results">
      <div><span>Modifiers</span><strong>×${(breakdown?.modifierMultiplier ?? 1).toFixed(3)}</strong></div>
      <ul>${rows}</ul>
    </section>`;
  const primary = screen.querySelector("[data-flow-ux='primary-results']");
  primary?.insertAdjacentHTML("afterend", section);
  const scoreBreakdown = screen.querySelector(".flow-score-breakdown");
  if (scoreBreakdown && !scoreBreakdown.querySelector("[data-flow-modifier-score-line]")) {
    scoreBreakdown.insertAdjacentHTML("beforeend", `<span data-flow-modifier-score-line>× ${(breakdown?.modifierMultiplier ?? 1).toFixed(3)} modifiers</span>`);
  }
}

function decorate() {
  if (!enabled) return;
  const screen = currentScreen();
  if (!screen) return;
  if (screen !== decoratedScreen) decoratedScreen = screen;
  const view = screen.dataset.flowView;
  if (view === "ready") decorateReady(screen);
  else if (view === "run") decorateRun(screen);
  else if (view === "chapter") decorateChapter(screen);
  else if (view === "complete") decorateComplete(screen);
}

function launchConfiguredRun(event) {
  if (!enabled || !event.target?.closest?.('[data-flow-action="start"]')) return;
  const screen = currentScreen();
  if (!screen?.matches?.('[data-flow-view="ready"]') || !setupChanged()) return;
  const current = plan();
  const draft = uiController()?.getDraft?.();
  if (!current || !draft) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const url = new URL(globalThis.location.href);
  url.searchParams.set("flowRun", "1");
  url.searchParams.set("flowLength", draft.sessionLength);
  url.searchParams.set("flowCategory", draft.category);
  url.searchParams.set("flowDifficulty", draft.difficulty);
  url.searchParams.set("flowSeed", current.seed || draft.seed || "phase9-modifiers");
  const value = getFlowModifierQueryValue(draftModifiers);
  if (value) url.searchParams.set("flowModifierIds", value);
  else url.searchParams.delete("flowModifierIds");
  url.searchParams.set("flowUiStart", "1");
  globalThis.location.replace(url.href);
}

function showNoBackspaceStatus() {
  const status = document.querySelector("[data-flow-modifier-status]");
  if (!status) return;
  status.textContent = "Backspace disabled";
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { status.textContent = ""; }, 1200);
}

if (enabled) {
  const app = document.querySelector("#app");
  if (app) new MutationObserver(() => queueMicrotask(decorate)).observe(app, { childList: true, subtree: true });
  document.addEventListener("click", launchConfiguredRun, true);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" && currentScreen()?.matches?.('[data-flow-view="run"]') && activeModifierIds().includes("no-backspace")) {
      showNoBackspaceStatus();
    }
  }, true);
  queueMicrotask(decorate);
}

if (globalThis.window) {
  window.wordstrikeFlowModifiersPhase9 = Object.freeze({
    enabled,
    getDraft: () => [...draftModifiers],
    getActive: activeModifierIds,
  });
}
