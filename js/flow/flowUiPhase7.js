import {
  FLOW_CATEGORIES,
  FLOW_DIFFICULTIES,
  FLOW_SESSION_LENGTHS,
} from "./flowConfig.js";

const CATEGORY_LABELS = Object.freeze({
  mixed: "Mixed",
  everyday: "Everyday",
  stories: "Stories",
  dialogue: "Dialogue",
  professional: "Professional",
  academic: "Academic",
  quotes: "Quotes",
  "numbers-symbols": "Numbers & Symbols",
});

const DIFFICULTY_COPY = Object.freeze({
  smooth: "Common language and forgiving punctuation.",
  natural: "Real-world prose with normal punctuation.",
  advanced: "Denser syntax and more precise transitions.",
  expert: "The highest punctuation and structure ceiling.",
});

const LENGTH_COPY = Object.freeze({
  quick: "~3 min · 3 chapters · 6 passages",
  standard: "~6 min · 6 chapters · 12 passages",
  long: "~10 min · 6 chapters · 24 passages",
});

const QUICK_CHAPTERS = Object.freeze(["Settle In", "Precision", "Final Flow"]);
const FULL_CHAPTERS = Object.freeze(["Settle In", "Momentum", "Precision", "Complexity", "Pressure", "Final Flow"]);
const params = new URLSearchParams(globalThis.location?.search || "");
const phase7Requested = params.get("dev") === "1" && params.get("mode") === "flow" && params.get("flowRun") === "1";
const autostartRequested = params.get("flowUiStart") === "1";

let draft = null;
let lastPlanId = null;
let autoStartConsumed = false;
let decorating = false;

function controller() {
  return globalThis.window?.wordstrikeFlowPhase1 || null;
}

function titleCase(value) {
  return String(value || "")
    .split("-")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(" ");
}

function currentPlan() {
  return controller()?.getRunPlan?.() || null;
}

function ensureDraft() {
  const plan = currentPlan();
  if (!plan) return null;
  if (!draft || lastPlanId !== plan.id) {
    draft = {
      sessionLength: plan.sessionLength,
      category: plan.category,
      difficulty: plan.difficulty,
      seed: plan.seed,
    };
    lastPlanId = plan.id;
  }
  return draft;
}

function chapterNamesFor(length) {
  return length === "quick" ? QUICK_CHAPTERS : FULL_CHAPTERS;
}

function setupChanged() {
  const plan = currentPlan();
  if (!plan || !draft) return false;
  return draft.sessionLength !== plan.sessionLength
    || draft.category !== plan.category
    || draft.difficulty !== plan.difficulty;
}

function optionButton(group, value, label, detail = "") {
  const selected = draft?.[group] === value;
  return `
    <button
      type="button"
      class="flow-choice${selected ? " is-selected" : ""}"
      data-flow-choice-group="${group}"
      data-flow-choice-value="${value}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <span>${label}</span>
      ${detail ? `<small>${detail}</small>` : ""}
    </button>`;
}

function itineraryMarkup(length, activeIndex = -1, complete = false) {
  const chapters = chapterNamesFor(length);
  return `
    <ol class="flow-itinerary-track" aria-label="Flow chapter itinerary">
      ${chapters.map((name, index) => {
        const state = complete || index < activeIndex ? "complete" : index === activeIndex ? "current" : "upcoming";
        return `
          <li class="flow-itinerary-step" data-state="${state}"${state === "current" ? ' aria-current="step"' : ""}>
            <span class="flow-itinerary-index">${String(index + 1).padStart(2, "0")}</span>
            <span class="flow-itinerary-name">${name}</span>
          </li>`;
      }).join("")}
    </ol>`;
}

function setupMarkup() {
  const lengths = Object.keys(FLOW_SESSION_LENGTHS);
  return `
    <section class="flow-setup" data-flow-ui="setup" aria-label="Flow run setup">
      <div class="flow-setup-heading">
        <span>Shape the session</span>
        <strong data-flow-setup-summary>${LENGTH_COPY[draft.sessionLength]}</strong>
      </div>

      <fieldset class="flow-choice-group" data-flow-group="sessionLength">
        <legend>Duration</legend>
        <div class="flow-choice-row flow-choice-row--length">
          ${lengths.map((value) => optionButton("sessionLength", value, titleCase(value), `${FLOW_SESSION_LENGTHS[value].targetMinutes} min`)).join("")}
        </div>
      </fieldset>

      <fieldset class="flow-choice-group" data-flow-group="category">
        <legend>Text</legend>
        <div class="flow-choice-row flow-choice-row--categories">
          ${FLOW_CATEGORIES.map((value) => optionButton("category", value, CATEGORY_LABELS[value] || titleCase(value))).join("")}
        </div>
      </fieldset>

      <fieldset class="flow-choice-group" data-flow-group="difficulty">
        <legend>Complexity</legend>
        <div class="flow-choice-row flow-choice-row--difficulty">
          ${FLOW_DIFFICULTIES.map((value) => optionButton("difficulty", value, titleCase(value), DIFFICULTY_COPY[value])).join("")}
        </div>
      </fieldset>

      <div class="flow-setup-itinerary" data-flow-setup-itinerary>
        <div class="flow-setup-itinerary-heading">
          <span>Run arc</span>
          <small data-flow-setup-focus>${CATEGORY_LABELS[draft.category]} · ${titleCase(draft.difficulty)}</small>
        </div>
        ${itineraryMarkup(draft.sessionLength)}
      </div>
    </section>`;
}

function syncChoiceState(screen) {
  if (!draft) return;

  // Clear presentation state first so each semantic group can never retain a
  // stale visual selection after the draft changes rapidly through click or
  // keyboard input.
  const buttons = [...screen.querySelectorAll("[data-flow-choice-group]")];
  for (const button of buttons) {
    button.classList.remove("is-selected");
    button.setAttribute("aria-pressed", "false");
  }
  for (const group of ["sessionLength", "category", "difficulty"]) {
    const value = draft[group];
    const selected = screen.querySelector(`[data-flow-choice-group="${group}"][data-flow-choice-value="${value}"]`);
    if (!selected) continue;
    selected.classList.add("is-selected");
    selected.setAttribute("aria-pressed", "true");
  }

  const summary = screen.querySelector("[data-flow-setup-summary]");
  if (summary) summary.textContent = LENGTH_COPY[draft.sessionLength];
  const focus = screen.querySelector("[data-flow-setup-focus]");
  if (focus) focus.textContent = `${CATEGORY_LABELS[draft.category]} · ${titleCase(draft.difficulty)}`;
  const itinerary = screen.querySelector("[data-flow-setup-itinerary]");
  if (itinerary) {
    const heading = itinerary.querySelector(".flow-setup-itinerary-heading");
    itinerary.innerHTML = "";
    if (heading) itinerary.append(heading);
    itinerary.insertAdjacentHTML("beforeend", itineraryMarkup(draft.sessionLength));
  }
  const start = screen.querySelector('[data-flow-action="start"]');
  if (start) {
    start.textContent = setupChanged() ? "START UPDATED RUN" : "START FLOW";
    start.dataset.flowSetupChanged = setupChanged() ? "true" : "false";
  }
}

function selectChoice(screen, group, value, focus = false) {
  if (!draft || !(group in draft)) return;
  const allowed = group === "sessionLength"
    ? Object.keys(FLOW_SESSION_LENGTHS)
    : group === "category"
      ? FLOW_CATEGORIES
      : FLOW_DIFFICULTIES;
  if (!allowed.includes(value)) return;
  draft[group] = value;
  syncChoiceState(screen);
  if (focus) {
    screen.querySelector(`[data-flow-choice-group="${group}"][data-flow-choice-value="${value}"]`)?.focus?.({ preventScroll: true });
  }
}

function handleChoiceKeydown(event, screen) {
  const button = event.target.closest?.("[data-flow-choice-group]");
  if (!button) return;
  const direction = ["ArrowRight", "ArrowDown"].includes(event.key)
    ? 1
    : ["ArrowLeft", "ArrowUp"].includes(event.key)
      ? -1
      : 0;
  if (!direction) return;
  const group = button.dataset.flowChoiceGroup;
  const buttons = [...screen.querySelectorAll(`[data-flow-choice-group="${group}"]`)];
  const current = buttons.indexOf(button);
  if (current < 0) return;
  event.preventDefault();
  const next = (current + direction + buttons.length) % buttons.length;
  selectChoice(screen, group, buttons[next].dataset.flowChoiceValue, true);
}

function launchDraft() {
  const plan = currentPlan();
  if (!plan || !draft) return;
  const url = new URL(globalThis.location.href);
  url.searchParams.set("flowRun", "1");
  url.searchParams.set("flowLength", draft.sessionLength);
  url.searchParams.set("flowCategory", draft.category);
  url.searchParams.set("flowDifficulty", draft.difficulty);
  url.searchParams.set("flowSeed", plan.seed || draft.seed || "phase7-ui");
  url.searchParams.set("flowUiStart", "1");
  globalThis.location.replace(url.href);
}

function returnToSetup() {
  const url = new URL(globalThis.location.href);
  url.searchParams.delete("flowUiStart");
  globalThis.location.replace(url.href);
}

function decorateReady(screen) {
  if (screen.dataset.flowUiPhase7 === "true") return;
  const plan = currentPlan();
  if (!plan || !ensureDraft()) return;
  screen.dataset.flowUiPhase7 = "true";

  const kicker = screen.querySelector(".flow-phase1-kicker");
  if (kicker) kicker.textContent = "Flow setup · Phase 7 developer route";
  const lead = screen.querySelector(".flow-phase1-lead");
  if (lead) lead.textContent = "Choose the shape of the session before you enter it. Duration changes the chapter arc; text focus and complexity define what the run asks from you.";

  const brief = screen.querySelector(".flow-phase1-brief");
  brief?.insertAdjacentHTML("beforebegin", setupMarkup());

  const start = screen.querySelector('[data-flow-action="start"]');
  start?.addEventListener("click", (event) => {
    if (!setupChanged()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    launchDraft();
  }, true);

  screen.addEventListener("click", (event) => {
    const choice = event.target.closest?.("[data-flow-choice-group]");
    if (!choice) return;
    selectChoice(screen, choice.dataset.flowChoiceGroup, choice.dataset.flowChoiceValue);
  });
  screen.addEventListener("keydown", (event) => handleChoiceKeydown(event, screen));
  syncChoiceState(screen);

  if (autostartRequested && !autoStartConsumed) {
    autoStartConsumed = true;
    const cleanUrl = new URL(globalThis.location.href);
    cleanUrl.searchParams.delete("flowUiStart");
    globalThis.history.replaceState(null, "", cleanUrl.href);
    queueMicrotask(() => start?.click());
  }
}

function activeChapterIndex(plan, segmentIndex) {
  return plan?.segments?.[segmentIndex]?.chapterIndex ?? 0;
}

function sessionRailMarkup(plan, segmentIndex, { complete = false } = {}) {
  const segment = plan.segments[segmentIndex] || plan.segments.at(-1);
  const chapterIndex = complete ? plan.chapterCount : activeChapterIndex(plan, segmentIndex);
  const chapter = complete ? plan.chapters.at(-1) : plan.chapters[chapterIndex];
  const passageLabel = complete
    ? `${plan.passageCount} passages complete`
    : `Passage ${(segment?.passageIndex ?? 0) + 1} of ${chapter?.passages?.length ?? 1}`;
  return `
    <nav class="flow-session-rail" data-flow-ui="session-rail" aria-label="Flow session progress">
      <div class="flow-session-rail-copy">
        <span>${complete ? "Run complete" : `Chapter ${chapterIndex + 1} of ${plan.chapterCount}`}</span>
        <strong>${complete ? "Full arc" : chapter?.title || "Flow"}</strong>
        <small>${passageLabel}</small>
      </div>
      ${itineraryMarkup(plan.sessionLength, chapterIndex, complete)}
    </nav>`;
}

function decorateRun(screen) {
  if (screen.dataset.flowUiPhase7 === "true") return;
  const plan = currentPlan();
  if (!plan) return;
  screen.dataset.flowUiPhase7 = "true";
  const segmentIndex = controller()?.getActiveSegmentIndex?.() ?? 0;
  const header = screen.querySelector(".flow-run-header");
  header?.insertAdjacentHTML("afterend", sessionRailMarkup(plan, segmentIndex));
  const strip = screen.querySelector(".flow-chapter-strip");
  if (strip) strip.hidden = true;
}

function decorateChapter(screen) {
  if (screen.dataset.flowUiPhase7 === "true") return;
  const plan = currentPlan();
  if (!plan) return;
  screen.dataset.flowUiPhase7 = "true";
  const segmentIndex = controller()?.getActiveSegmentIndex?.() ?? 0;
  const shell = screen.querySelector(".flow-chapter-transition");
  shell?.insertAdjacentHTML("afterbegin", sessionRailMarkup(plan, segmentIndex));
}

function decorateComplete(screen) {
  if (screen.dataset.flowUiPhase7 === "true") return;
  const plan = currentPlan();
  if (!plan) return;
  screen.dataset.flowUiPhase7 = "true";
  const lead = screen.querySelector(".flow-phase1-lead");
  lead?.insertAdjacentHTML("afterend", sessionRailMarkup(plan, Math.max(0, plan.segments.length - 1), { complete: true }));

  const restart = screen.querySelector('[data-flow-action="restart"]');
  if (restart) restart.textContent = "RUN AGAIN";
  const actions = screen.querySelector(".flow-complete-actions");
  if (actions && !actions.querySelector('[data-flow-ui-action="setup"]')) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ui-button";
    button.dataset.flowUiAction = "setup";
    button.textContent = "CHANGE SETUP";
    button.addEventListener("click", returnToSetup);
    actions.insertBefore(button, actions.lastElementChild);
  }
}

function decorateScreen() {
  if (!phase7Requested || decorating) return;
  const screen = document.querySelector(".flow-phase1-screen[data-flow-visual='quiet-signal']");
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

if (phase7Requested) {
  const app = document.querySelector("#app");
  if (app) new MutationObserver(() => queueMicrotask(decorateScreen)).observe(app, { childList: true, subtree: true });
  queueMicrotask(decorateScreen);
}

if (globalThis.window) {
  window.wordstrikeFlowUiPhase7 = Object.freeze({
    enabled: phase7Requested,
    getDraft: () => draft ? { ...draft } : null,
    returnToSetup,
  });
}
