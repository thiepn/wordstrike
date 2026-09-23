const params = new URLSearchParams(globalThis.location?.search || "");
const enabled = params.get("dev") === "1"
  && params.get("mode") === "flow"
  && params.get("flowRun") === "1"
  && params.get("flowUi") === "1";

const LENGTH_PRESENTATION = Object.freeze({
  quick: Object.freeze({ summary: "~2 min · 1 long section", labels: Object.freeze(["Flow"]) }),
  standard: Object.freeze({ summary: "~5 min · 3 connected sections", labels: Object.freeze(["Opening", "Middle", "Finish"]) }),
  long: Object.freeze({ summary: "~8 min · 5 connected sections", labels: Object.freeze(["Opening", "Build", "Develop", "Deep Flow", "Finish"]) }),
});

function controller() {
  return globalThis.window?.wordstrikeFlowPhase1 || null;
}

function selectedLength() {
  return document.querySelector('[data-flow-choice-group="sessionLength"].is-selected')?.dataset.flowChoiceValue
    || controller()?.getRunPlan?.()?.sessionLength
    || "standard";
}

function previousWordDeleteCount(passage, currentIndex) {
  const text = String(passage || "");
  const start = Math.max(0, Math.min(Number(currentIndex) || 0, text.length));
  let cursor = start;
  while (cursor > 0 && /\s/.test(text[cursor - 1])) cursor -= 1;
  while (cursor > 0 && !/[A-Za-z0-9']/.test(text[cursor - 1]) && !/\s/.test(text[cursor - 1])) cursor -= 1;
  while (cursor > 0 && /[A-Za-z0-9']/.test(text[cursor - 1])) cursor -= 1;
  return Math.max(0, start - cursor);
}

function dispatchBackspaces(count) {
  const input = document.querySelector("[data-flow-input]");
  if (!(input instanceof HTMLElement) || count <= 0) return false;
  for (let index = 0; index < count; index += 1) {
    input.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteContentBackward",
      data: null,
    }));
  }
  return true;
}

function handleWordBackspace(event) {
  if (event.key !== "Backspace" || !(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return false;
  const snapshot = controller()?.getSnapshot?.();
  if (!snapshot || snapshot.phase === "complete" || snapshot.currentIndex <= 0) return false;
  const count = snapshot.modifiers?.includes("no-backspace")
    ? 1
    : previousWordDeleteCount(snapshot.passage, snapshot.currentIndex);
  if (!count) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  dispatchBackspaces(count);
  return true;
}

function setTextIfChanged(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function trackMarkup(labels, activeIndex = -1, complete = false) {
  return labels.map((label, index) => {
    const state = complete || index < activeIndex ? "complete" : index === activeIndex ? "current" : "upcoming";
    return `
      <li class="flow-itinerary-step" data-state="${state}"${state === "current" ? ' aria-current="step"' : ""}>
        <span class="flow-itinerary-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="flow-itinerary-name">${label}</span>
      </li>`;
  }).join("");
}

function updateTrack(track, labels, activeIndex = -1, complete = false) {
  if (!(track instanceof HTMLElement)) return;
  const signature = `${labels.join("|")}:${activeIndex}:${complete}`;
  if (track.dataset.flowPostreleaseSignature === signature) return;
  track.dataset.flowPostreleaseSignature = signature;
  track.innerHTML = trackMarkup(labels, activeIndex, complete);
}

function decorateSetup() {
  const setup = document.querySelector('[data-flow-ui="setup"]');
  if (!(setup instanceof HTMLElement)) return;
  const length = selectedLength();
  const presentation = LENGTH_PRESENTATION[length] || LENGTH_PRESENTATION.standard;
  setTextIfChanged(setup.querySelector("[data-flow-setup-summary]"), presentation.summary);
  const lead = document.querySelector('.flow-ready-screen .flow-phase1-lead');
  if (lead && !lead.dataset.flowPostreleaseCopy) {
    lead.dataset.flowPostreleaseCopy = "true";
    setTextIfChanged(lead, "Choose the shape of the session. Default Flow now uses longer connected prose, while category and complexity options let you target a specific kind of practice.");
  }
  updateTrack(setup.querySelector(".flow-itinerary-track"), presentation.labels);
}

function actualSegmentLabels(plan) {
  return plan.segments.map((segment, index) => (
    segment.title
    || plan.chapters?.[segment.chapterIndex]?.title
    || `Section ${index + 1}`
  ));
}

function decorateRunRail() {
  const plan = controller()?.getRunPlan?.();
  if (!plan?.segments?.length) return;
  const segmentIndex = Math.max(0, Math.min(
    controller()?.getActiveSegmentIndex?.() ?? 0,
    plan.segments.length - 1,
  ));
  const screen = document.querySelector(".flow-phase1-screen");
  if (!(screen instanceof HTMLElement)) return;
  const complete = screen.dataset.flowView === "complete";
  const labels = actualSegmentLabels(plan);
  const rail = screen.querySelector('[data-flow-ui="session-rail"]');
  if (!(rail instanceof HTMLElement)) return;

  updateTrack(rail.querySelector(".flow-itinerary-track"), labels, complete ? labels.length : segmentIndex, complete);
  const copy = rail.querySelector(".flow-session-rail-copy");
  if (!copy) return;
  const eyebrow = copy.querySelector("span");
  const heading = copy.querySelector("strong");
  const detail = copy.querySelector("small");
  setTextIfChanged(
    eyebrow,
    complete ? "Run complete" : `Section ${segmentIndex + 1} of ${plan.passageCount}`,
  );
  setTextIfChanged(
    heading,
    plan.coherent
      ? plan.seriesTitle || "Connected Flow"
      : plan.chapters?.[plan.segments[segmentIndex]?.chapterIndex]?.title || "Flow",
  );
  setTextIfChanged(
    detail,
    complete
      ? `${plan.passageCount} section${plan.passageCount === 1 ? "" : "s"} complete`
      : labels[segmentIndex],
  );
}

function decorateStructure() {
  decorateSetup();
  decorateRunRail();
}

if (enabled) {
  globalThis.window?.addEventListener("keydown", (event) => {
    if (handleWordBackspace(event)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement)) return;
    const phase7Control = focused.matches("[data-flow-choice-group], [data-flow-ui-action='setup']");
    if (!phase7Control) return;

    // Flow's legacy developer controller treats Enter on READY/COMPLETE as a
    // global start/restart shortcut. Dedicated Phase 7 controls must own Enter
    // while focused so keyboard users do not accidentally launch a run.
    event.preventDefault();
    event.stopImmediatePropagation();
    focused.click();
  }, true);

  const app = document.querySelector("#app");
  if (app) {
    new MutationObserver(() => queueMicrotask(decorateStructure)).observe(app, { childList: true });
  }
  const setupControl = (target) => target?.closest?.("[data-flow-choice-group]");
  document.addEventListener("wordstrike:flow-ui7-decorated", () => queueMicrotask(decorateStructure));
  document.addEventListener("click", (event) => {
    if (setupControl(event.target)) queueMicrotask(decorateStructure);
  });
  document.addEventListener("keydown", (event) => {
    if (setupControl(event.target) && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(event.key)) {
      queueMicrotask(decorateStructure);
    }
  });
  queueMicrotask(decorateStructure);
}

export { previousWordDeleteCount, decorateStructure as refreshFlowUiGuard };
