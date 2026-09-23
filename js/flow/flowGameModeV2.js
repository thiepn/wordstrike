import { FLOW_SESSION_LENGTHS } from "./flowConfig.js";

const params = new URLSearchParams(globalThis.location?.search || "");
const enabled = params.get("dev") === "1"
  && params.get("mode") === "flow"
  && params.get("flowRelease") === "1";

const LENGTH_ORDER = Object.freeze(["quick", "standard", "long"]);
const LENGTH_COPY = Object.freeze({
  quick: Object.freeze({ label: "Quick", detail: "~3 min" }),
  standard: Object.freeze({ label: "Standard", detail: "~6 min" }),
  long: Object.freeze({ label: "Long", detail: "~10 min" }),
});

let selectedLength = null;
let decorating = false;

function controller() {
  return globalThis.window?.wordstrikeFlowPhase1 || null;
}

function appRoot() {
  return document.querySelector("#app");
}

function currentScreen() {
  return document.querySelector(".flow-phase1-screen");
}

function freshSeed() {
  const stamp = Date.now().toString(36);
  try {
    const values = new Uint32Array(2);
    globalThis.crypto?.getRandomValues?.(values);
    if (values[0] || values[1]) {
      return `flow-v2-${stamp}-${values[0].toString(36)}${values[1].toString(36)}`;
    }
  } catch {
    // The Date + Math.random fallback preserves a fresh run on older browsers.
  }
  return `flow-v2-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeLength(value) {
  return Object.hasOwn(FLOW_SESSION_LENGTHS, value) ? value : "standard";
}

function publicRunUrl({ length = selectedLength, newSeed = false } = {}) {
  const url = new URL(globalThis.location.href);
  url.searchParams.set("mode", "flow");
  url.searchParams.set("flowRelease", "1");
  url.searchParams.set("flowRun", "1");
  url.searchParams.set("flowUi", "1");
  url.searchParams.set("flowUx", "1");
  url.searchParams.set("flowModifiers", "0");
  url.searchParams.set("flowAdaptive", "0");
  url.searchParams.set("flowIntegration", "1");
  url.searchParams.set("flowLength", normalizeLength(length));

  for (const key of [
    "flowCategory",
    "flowDifficulty",
    "flowModifierIds",
    "flowWeaknesses",
    "flowResumeAdaptive",
    "flowUiStart",
    "flowCatalog",
    "flowPassage",
  ]) {
    url.searchParams.delete(key);
  }
  if (newSeed || !url.searchParams.get("flowSeed")) url.searchParams.set("flowSeed", freshSeed());
  return url;
}

function syncLengthButtons(home) {
  for (const button of home.querySelectorAll("[data-flow-game-length]")) {
    const selected = button.dataset.flowGameLength === selectedLength;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
  }
}

function startSelectedRun({ newSeed = false } = {}) {
  const next = publicRunUrl({ newSeed });
  globalThis.history?.replaceState?.(null, "", next.href);
  controller()?.refreshPlanFromLocation?.();
  return controller()?.startCurrentRun?.() === true;
}

function lengthButtonsMarkup() {
  return LENGTH_ORDER.map((value) => {
    const meta = LENGTH_COPY[value];
    const selected = value === selectedLength;
    return `
      <button
        type="button"
        class="flow-game-v2-length${selected ? " is-selected" : ""}"
        data-flow-game-length="${value}"
        aria-pressed="${selected ? "true" : "false"}"
        tabindex="${selected ? "0" : "-1"}"
      >
        <strong>${meta.label}</strong>
        <span>${meta.detail}</span>
      </button>`;
  }).join("");
}

function decorateReady(screen) {
  if (screen.dataset.flowGameModeV2 === "true") return;
  const plan = controller()?.getRunPlan?.();
  if (!plan) return;
  selectedLength = normalizeLength(plan.sessionLength);
  screen.dataset.flowGameModeV2 = "true";

  const shell = screen.querySelector(".flow-phase1-shell");
  if (!shell) return;

  const kicker = screen.querySelector(".flow-phase1-kicker");
  if (kicker) kicker.textContent = "LONGFORM SCORE ATTACK";
  const lead = screen.querySelector(".flow-phase1-lead");
  if (lead) {
    lead.textContent = "The game picks the text. Type the full run as fast and cleanly as you can, then chase a higher score.";
  }

  const start = appRoot()?.querySelector('[data-flow-action="start"]');
  const actionDock = appRoot()?.querySelector("[data-flow-ux='setup-action-dock']");
  screen.querySelector("[data-flow-ui='setup']")?.remove();
  screen.querySelector(".flow-phase1-brief")?.remove();
  for (const note of screen.querySelectorAll(".flow-phase1-note")) note.remove();

  const home = document.createElement("section");
  home.className = "flow-game-v2-home";
  home.dataset.flowGameHome = "true";
  home.setAttribute("aria-label", "Flow game setup");
  home.innerHTML = `
    <div class="flow-game-v2-lengths" role="group" aria-label="Run length">
      ${lengthButtonsMarkup()}
    </div>
    <p class="flow-game-v2-auto">Text, topic, difficulty, and seed are chosen automatically.</p>
    <div class="flow-game-v2-play"></div>`;

  const playSlot = home.querySelector(".flow-game-v2-play");
  if (start && playSlot) {
    start.textContent = "PLAY";
    start.classList.add("flow-game-v2-play-button");
    playSlot.append(start);
    start.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      startSelectedRun();
    }, true);
  }
  actionDock?.remove();

  if (lead) lead.insertAdjacentElement("afterend", home);
  else shell.append(home);

  home.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-flow-game-length]");
    if (!button) return;
    selectedLength = normalizeLength(button.dataset.flowGameLength);
    syncLengthButtons(home);
  });
  home.addEventListener("keydown", (event) => {
    const button = event.target.closest?.("[data-flow-game-length]");
    if (!button || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const current = LENGTH_ORDER.indexOf(button.dataset.flowGameLength);
    const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
    selectedLength = LENGTH_ORDER[(current + direction + LENGTH_ORDER.length) % LENGTH_ORDER.length];
    syncLengthButtons(home);
    home.querySelector(`[data-flow-game-length="${selectedLength}"]`)?.focus?.({ preventScroll: true });
  });

  syncLengthButtons(home);
}

function decorateRun(screen) {
  screen.dataset.flowGameModeV2 = "true";
  screen.querySelector("[data-flow-ui='session-rail']")?.remove();
  const strip = screen.querySelector(".flow-chapter-strip");
  if (strip) strip.hidden = true;
}

function decorateChapter(screen) {
  screen.dataset.flowGameModeV2 = "true";
  screen.querySelector("[data-flow-ui='session-rail']")?.remove();
}

function decorateComplete(screen) {
  if (screen.dataset.flowGameModeV2 === "true") return;
  screen.dataset.flowGameModeV2 = "true";
  screen.querySelector("[data-flow-ui='session-rail']")?.remove();
  screen.querySelector("[data-flow-ui-action='setup']")?.remove();
  screen.querySelector(".flow-natural-analysis")?.remove();
  screen.querySelector(".flow-score-breakdown")?.remove();

  const kicker = screen.querySelector(".flow-phase1-kicker");
  if (kicker) kicker.textContent = "LONGFORM RUN COMPLETE";
  const lead = screen.querySelector(".flow-phase1-lead");
  if (lead) lead.textContent = "Run complete. Keep the speed, accuracy, and rhythm together, then beat the score.";

  const restart = screen.querySelector('[data-flow-action="restart"]');
  if (restart) {
    restart.textContent = "PLAY AGAIN";
    restart.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      startSelectedRun({ newSeed: true });
    }, true);
  }
}

function decorate() {
  if (!enabled || decorating) return;
  const screen = currentScreen();
  if (!screen) return;
  decorating = true;
  try {
    const view = screen.dataset.flowView;
    if (view === "ready") decorateReady(screen);
    else if (view === "run") decorateRun(screen);
    else if (view === "chapter") decorateChapter(screen);
    else if (view === "complete") decorateComplete(screen);
  } finally {
    decorating = false;
  }
}

if (enabled) {
  const app = appRoot();
  if (app) new MutationObserver(() => queueMicrotask(decorate)).observe(app, { childList: true });
  document.addEventListener("wordstrike:flow-ui7-decorated", () => queueMicrotask(decorate));
  queueMicrotask(decorate);
}

if (globalThis.window) {
  window.wordstrikeFlowGameModeV2 = Object.freeze({
    enabled,
    getSelectedLength: () => selectedLength,
    buildPublicRunUrl: ({ length = selectedLength, newSeed = false } = {}) => publicRunUrl({ length, newSeed }).href,
  });
}
