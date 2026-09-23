import {
  buildFlowWeaknessProfile,
  serializeFlowWeaknessProfile,
} from "./flowAdaptive.js";

const params = new URLSearchParams(globalThis.location?.search || "");
const enabled = params.get("dev") === "1"
  && params.get("mode") === "flow"
  && params.get("flowRun") === "1"
  && params.get("flowUi") === "1"
  && params.get("flowUx") === "1"
  && params.get("flowAdaptive") === "1";

let decoratedScreen = null;

function controller() {
  return globalThis.window?.wordstrikeFlowPhase1 || null;
}

function currentScreen() {
  return document.querySelector(".flow-phase1-screen[data-flow-ui-phase7='true']");
}

function currentPlan() {
  return controller()?.getRunPlan?.() || null;
}

function activeSegment() {
  const plan = currentPlan();
  const index = Number(controller()?.getActiveSegmentIndex?.());
  return plan?.segments?.[Number.isInteger(index) ? index : 0] || null;
}

function weaknessPills(weaknesses) {
  return weaknesses.map((weakness) => `
    <span class="flow-adaptive-weakness" data-flow-weakness="${weakness.key}">
      <strong>${weakness.label}</strong><small>${weakness.score}</small>
    </span>`).join("");
}

function decorateReady(screen) {
  const plan = currentPlan();
  if (!plan) return false;
  const setup = screen.querySelector("[data-flow-ui='setup']");
  if (!setup) return false;
  const adaptive = plan.adaptive;
  const section = document.createElement("section");
  section.className = "flow-adaptive-ready";
  section.dataset.flowAdaptive = "ready";
  if (adaptive?.enabled) {
    section.innerHTML = `
      <div class="flow-adaptive-heading">
        <span>Adaptive focus</span>
        <strong>${adaptive.targetedPassageCount} / ${plan.passageCount} passages</strong>
      </div>
      <p>Most of this run stays natural. Focus passages quietly increase exposure to the weaknesses measured in the previous run.</p>
      <div class="flow-adaptive-weaknesses">${weaknessPills(adaptive.weaknesses)}</div>`;
  } else {
    section.innerHTML = `
      <div class="flow-adaptive-heading"><span>Adaptive calibration</span><strong>Balanced run</strong></div>
      <p>Complete this run normally. Flow will use real timing and error evidence to build a weakness profile for the next session.</p>`;
  }
  const itinerary = setup.querySelector("[data-flow-setup-itinerary]");
  itinerary?.insertAdjacentElement("beforebegin", section);
  return true;
}

function decorateRun(screen) {
  const segment = activeSegment();
  if (!segment?.adaptiveFocus) return true;
  const focus = segment.adaptiveFocus;
  const marker = document.createElement("div");
  marker.className = "flow-adaptive-focus-strip";
  marker.dataset.flowAdaptive = "focus-strip";
  marker.innerHTML = `<span>Focus passage</span><strong>${focus.label}</strong><small>target ${focus.score}</small>`;
  const modifierStrip = screen.querySelector("[data-flow-modifier-strip]");
  const rail = screen.querySelector("[data-flow-ui='session-rail']");
  const anchor = modifierStrip || rail || screen.querySelector(".flow-run-header");
  anchor?.insertAdjacentElement("afterend", marker);
  return true;
}

function decorateChapter(screen) {
  const plan = currentPlan();
  const activeIndex = Number(controller()?.getActiveSegmentIndex?.());
  const next = plan?.segments?.[Number.isInteger(activeIndex) ? activeIndex : 0];
  if (!next?.adaptiveFocus) return true;
  const marker = document.createElement("p");
  marker.className = "flow-adaptive-chapter-note";
  marker.dataset.flowAdaptive = "chapter-note";
  marker.textContent = `The next passage adds extra ${next.adaptiveFocus.label.toLowerCase()} practice.`;
  screen.querySelector("[data-flow-ux='chapter-actions']")?.insertAdjacentElement("beforebegin", marker);
  return true;
}

function resultWeaknessRow(weakness) {
  const evidence = weakness.evidence?.[0] || "Measured weakness";
  return `
    <li data-flow-weakness="${weakness.key}">
      <div><strong>${weakness.label}</strong><span>${evidence}</span></div>
      <em>${weakness.score}</em>
    </li>`;
}

function launchAdaptiveNextRun(profile) {
  const value = serializeFlowWeaknessProfile(profile);
  if (!value) return;
  const url = new URL(globalThis.location.href);
  url.searchParams.set("flowAdaptive", "1");
  url.searchParams.set("flowWeaknesses", value);
  url.searchParams.set("flowUiStart", "1");
  url.searchParams.set("flowSeed", `${currentPlan()?.seed || "flow"}-adaptive`);
  globalThis.location.replace(url.href);
}

function decorateComplete(screen) {
  const primary = screen.querySelector("[data-flow-ux='primary-results']");
  const actions = screen.querySelector(".flow-complete-actions");
  if (!primary || !actions) return false;
  const snapshot = controller()?.getSnapshot?.();
  if (!snapshot) return false;
  const profile = buildFlowWeaknessProfile(snapshot);
  const plan = currentPlan();
  const section = document.createElement("section");
  section.className = "flow-adaptive-results";
  section.dataset.flowAdaptive = "results";

  if (profile.weaknesses.length) {
    section.innerHTML = `
      <div class="flow-adaptive-heading">
        <span>Adaptive training</span>
        <strong>${profile.weaknesses.length} measured weakness${profile.weaknesses.length === 1 ? "" : "es"}</strong>
      </div>
      <p>The next run can keep normal Flow as the majority while targeting these patterns in roughly one passage out of five.</p>
      <ol>${profile.weaknesses.map(resultWeaknessRow).join("")}</ol>
      <button type="button" class="ui-button" data-flow-adaptive-next>TRAIN THESE NEXT</button>`;
    section.querySelector("[data-flow-adaptive-next]")?.addEventListener("click", () => launchAdaptiveNextRun(profile));
  } else {
    section.innerHTML = `
      <div class="flow-adaptive-heading"><span>Adaptive training</span><strong>Balanced profile</strong></div>
      <p>No weakness met the confidence threshold in this run. One isolated typo or hesitation will not redirect future training.</p>`;
  }

  if (plan?.adaptive?.enabled) {
    const coverage = document.createElement("small");
    coverage.className = "flow-adaptive-coverage";
    coverage.textContent = `${plan.adaptive.targetedPassageCount} of ${plan.passageCount} passages in this run were weakness-focused.`;
    section.append(coverage);
  }
  actions.insertAdjacentElement("afterend", section);
  return true;
}

function decorate() {
  if (!enabled) return;
  const screen = currentScreen();
  if (!screen) return;
  if (screen !== decoratedScreen) decoratedScreen = screen;
  if (screen.dataset.flowAdaptivePhase10 === "true") return;
  const view = screen.dataset.flowView;
  let complete = false;
  if (view === "ready") complete = decorateReady(screen);
  else if (view === "run") complete = decorateRun(screen);
  else if (view === "chapter") complete = decorateChapter(screen);
  else if (view === "complete") complete = decorateComplete(screen);
  if (complete) screen.dataset.flowAdaptivePhase10 = "true";
}

if (enabled) {
  const app = document.querySelector("#app");
  if (app) new MutationObserver(() => queueMicrotask(decorate)).observe(app, { childList: true });
  queueMicrotask(decorate);
}

if (globalThis.window) {
  window.wordstrikeFlowAdaptivePhase10 = Object.freeze({
    enabled,
    buildProfile: () => buildFlowWeaknessProfile(controller()?.getSnapshot?.()),
  });
}
