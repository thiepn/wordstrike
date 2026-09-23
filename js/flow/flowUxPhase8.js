const params = new URLSearchParams(globalThis.location?.search || "");
const enabled = params.get("dev") === "1"
  && params.get("mode") === "flow"
  && params.get("flowRun") === "1"
  && params.get("flowUi") === "1"
  && params.get("flowUx") === "1";

let scheduledCaretCheck = false;
let decoratedScreen = null;
let setupObserver = null;

function controller() {
  return globalThis.window?.wordstrikeFlowPhase1 || null;
}

function uiController() {
  return globalThis.window?.wordstrikeFlowUiPhase7 || null;
}

function titleCase(value) {
  return String(value || "")
    .split("-")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(" ");
}

function currentScreen() {
  return document.querySelector(".flow-phase1-screen[data-flow-ui-phase7='true']");
}

function syncRovingTabindex(screen) {
  if (!screen?.matches?.('[data-flow-view="ready"]')) return;
  for (const group of ["sessionLength", "category", "difficulty"]) {
    const buttons = [...screen.querySelectorAll(`[data-flow-choice-group="${group}"]`)];
    if (!buttons.length) continue;
    const selected = buttons.find((button) => button.getAttribute("aria-pressed") === "true") || buttons[0];
    for (const button of buttons) button.tabIndex = button === selected ? 0 : -1;
  }
}

function selectedSetupSummary() {
  const draft = uiController()?.getDraft?.();
  if (!draft) return "Current Flow setup";
  return `${titleCase(draft.sessionLength)} · ${titleCase(draft.category)} · ${titleCase(draft.difficulty)}`;
}

function setupDraftChanged() {
  const plan = controller()?.getRunPlan?.();
  const draft = uiController()?.getDraft?.();
  if (!plan || !draft) return false;
  return draft.sessionLength !== plan.sessionLength
    || draft.category !== plan.category
    || draft.difficulty !== plan.difficulty;
}

function setupDock(screen) {
  return screen?.parentElement?.querySelector?.('[data-flow-ux="setup-action-dock"]') || null;
}

function inheritFlowTokens(screen, dock) {
  const style = getComputedStyle(screen);
  for (const name of [
    "--flow-line-strong",
    "--flow-line",
    "--flow-bg-deep",
    "--flow-signal",
    "--flow-signal-faint",
    "--flow-signal-soft",
    "--flow-ink",
    "--flow-ink-soft",
    "--flow-ink-muted",
    "--flow-data-face",
    "--flow-ui-face",
  ]) {
    const value = style.getPropertyValue(name);
    if (value) dock.style.setProperty(name, value);
  }
}

function moveStartIntoActionDock(screen) {
  const start = screen.querySelector('[data-flow-action="start"]');
  if (!start || setupDock(screen)) return;

  const dock = document.createElement("div");
  dock.className = "flow-phase1-screen flow-ux-setup-action-dock";
  dock.dataset.flowUx = "setup-action-dock";
  dock.setAttribute("role", "region");
  dock.setAttribute("aria-label", "Start Flow session");
  inheritFlowTokens(screen, dock);

  const copy = document.createElement("div");
  copy.className = "flow-ux-setup-action-copy";
  copy.innerHTML = `<span>Ready</span><strong data-flow-ux-setup-selection>${selectedSetupSummary()}</strong>`;
  dock.append(copy, start);

  // Keep the fixed dock outside Flow's transformed/revealed screen. A fixed
  // descendant of a transformed ancestor uses that ancestor as its containing
  // block and can end up below a long setup page instead of at the viewport.
  screen.parentElement?.append(dock);
}

function syncSetupDock(screen) {
  const dock = setupDock(screen);
  const label = dock?.querySelector("[data-flow-ux-setup-selection]");
  if (label) label.textContent = selectedSetupSummary();

  // Phase 7 normally owns this label, but the dock relocates the same button
  // outside the ready screen. Keep its presentation synchronized here while
  // preserving Phase 7's already-attached click listener and handoff logic.
  const start = dock?.querySelector('[data-flow-action="start"]');
  if (start) {
    const changed = setupDraftChanged();
    start.textContent = changed ? "START UPDATED RUN" : "START FLOW";
    start.dataset.flowSetupChanged = changed ? "true" : "false";
  }

  const summary = screen.querySelector(".flow-phase1-brief");
  if (summary) {
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", "polite");
    summary.setAttribute("aria-atomic", "true");
  }
}

function decorateSetup(screen) {
  screen.dataset.flowUxPhase8 = "true";
  const kicker = screen.querySelector(".flow-phase1-kicker");
  if (kicker) kicker.textContent = "Flow setup";
  const lead = screen.querySelector(".flow-phase1-lead");
  if (lead) lead.textContent = "Choose a session length, text style, and complexity. You can change any of them again after the run.";

  syncRovingTabindex(screen);
  moveStartIntoActionDock(screen);
  syncSetupDock(screen);

  setupObserver?.disconnect();
  setupObserver = new MutationObserver((records) => {
    // Phase 8 owns only the duration/category/difficulty choice groups. Later
    // phases may add independent aria-pressed controls to the same ready
    // screen; those must not reset Phase 8's Start-state presentation.
    const ownsChange = records.some((record) => (
      record.type === "attributes"
      && record.attributeName === "aria-pressed"
      && record.target?.matches?.("[data-flow-choice-group]")
    ));
    if (!ownsChange) return;
    queueMicrotask(() => {
      syncRovingTabindex(screen);
      syncSetupDock(screen);
    });
  });
  setupObserver.observe(screen, {
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-pressed"],
  });
}

function focusCapture(screen) {
  return screen.querySelector("[data-flow-input]");
}

function setTypingFocusState(screen) {
  const input = focusCapture(screen);
  const hint = screen.querySelector("[data-flow-ux='focus-hint']");
  if (!input || !hint) return;
  const focused = document.activeElement === input;
  screen.dataset.typingFocus = focused ? "active" : "inactive";
  hint.hidden = focused;
}

function focusTypingInput(screen) {
  const input = focusCapture(screen);
  input?.focus?.({ preventScroll: true });
  queueMicrotask(() => setTypingFocusState(screen));
}

function ensureCaretVisible() {
  scheduledCaretCheck = false;
  const screen = currentScreen();
  if (!screen?.matches?.('[data-flow-view="run"]')) return;
  const current = screen.querySelector(".flow-char--current");
  if (!current) return;
  const rect = current.getBoundingClientRect();
  const topSafe = globalThis.innerHeight * 0.24;
  const bottomSafe = globalThis.innerHeight * 0.72;
  if (rect.top >= topSafe && rect.bottom <= bottomSafe) return;
  current.scrollIntoView({
    block: "center",
    inline: "nearest",
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

function scheduleCaretVisibility() {
  if (scheduledCaretCheck) return;
  scheduledCaretCheck = true;
  requestAnimationFrame(ensureCaretVisible);
}

function decorateRun(screen) {
  screen.dataset.flowUxPhase8 = "true";
  const copy = screen.querySelector(".flow-run-copy");
  if (copy && !copy.querySelector("[data-flow-ux='focus-hint']")) {
    const hint = document.createElement("p");
    hint.className = "flow-ux-focus-hint";
    hint.dataset.flowUx = "focus-hint";
    hint.hidden = true;
    hint.textContent = "Click the passage to resume typing";
    copy.prepend(hint);
  }

  for (const target of [screen.querySelector(".flow-run-copy"), screen.querySelector("[data-flow-passage]")]) {
    target?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      focusTypingInput(screen);
    });
  }
  const input = focusCapture(screen);
  input?.addEventListener("focus", () => setTypingFocusState(screen));
  input?.addEventListener("blur", () => queueMicrotask(() => setTypingFocusState(screen)));
  setTypingFocusState(screen);

  // Character progress calls scheduleCaretVisibility() directly from Phase 1.
  // No live subtree observer is needed on the passage hot path.
  scheduleCaretVisibility();
}

function decorateChapter(screen) {
  screen.dataset.flowUxPhase8 = "true";
  const shell = screen.querySelector(".flow-chapter-transition");
  const button = screen.querySelector('[data-flow-action="continue-chapter"]');
  if (!shell || !button || shell.querySelector("[data-flow-ux='chapter-actions']")) return;

  const actions = document.createElement("div");
  actions.className = "flow-ux-chapter-actions";
  actions.dataset.flowUx = "chapter-actions";
  const hint = document.createElement("span");
  hint.className = "flow-ux-key-hint";
  hint.textContent = "Enter to continue";
  button.parentNode?.insertBefore(actions, button);
  actions.append(button, hint);

  const note = shell.querySelector(".flow-phase1-note");
  if (note) actions.append(note);
}

function metric(label, value) {
  return `<div class="flow-ux-primary-metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function decorateResults(screen) {
  if (screen.querySelector("[data-flow-ux='primary-results']")) {
    screen.dataset.flowUxPhase8 = "true";
    return;
  }
  const snapshot = controller()?.getSnapshot?.();
  if (!snapshot?.gameplay || !snapshot?.cadence) return;

  const gameplay = snapshot.gameplay;
  const cadence = snapshot.cadence;
  const finalScore = screen.querySelector(".flow-final-score");
  const actions = screen.querySelector(".flow-complete-actions");
  if (!finalScore || !actions) return;

  const primary = document.createElement("section");
  primary.className = "flow-ux-primary-results";
  primary.dataset.flowUx = "primary-results";
  primary.setAttribute("aria-label", "Primary Flow results");
  primary.innerHTML = [
    metric("WPM", cadence.finalWpm.toFixed(1)),
    metric("Accuracy", `${gameplay.accuracyPercent.toFixed(1)}%`),
    metric("Cadence", cadence.cadenceScore == null ? "—" : String(cadence.cadenceScore)),
    metric("Avg Flow", gameplay.averageFlow.toFixed(1)),
  ].join("");
  finalScore.insertAdjacentElement("afterend", primary);
  primary.insertAdjacentElement("afterend", actions);

  const secondary = [
    screen.querySelector(".flow-result-metrics"),
    screen.querySelector(".flow-natural-analysis"),
    screen.querySelector(".flow-score-breakdown"),
  ].filter(Boolean);

  if (secondary.length) {
    const details = document.createElement("details");
    details.className = "flow-ux-details";
    details.dataset.flowUx = "details";
    const summary = document.createElement("summary");
    summary.textContent = "Detailed analysis";
    const body = document.createElement("div");
    body.className = "flow-ux-details-body";
    for (const node of secondary) body.append(node);
    details.append(summary, body);
    actions.insertAdjacentElement("afterend", details);
  }
  screen.dataset.flowUxPhase8 = "true";
}

function decorate() {
  if (!enabled) return;
  const screen = currentScreen();
  if (!screen) return;
  if (screen !== decoratedScreen) {
    decoratedScreen = screen;
    setupObserver?.disconnect();
  }
  if (screen.dataset.flowUxPhase8 === "true") return;
  const view = screen.dataset.flowView;
  if (view === "ready") decorateSetup(screen);
  else if (view === "run") decorateRun(screen);
  else if (view === "chapter") decorateChapter(screen);
  else if (view === "complete") decorateResults(screen);
}

if (enabled) {
  const app = document.querySelector("#app");
  if (app) new MutationObserver(() => queueMicrotask(decorate)).observe(app, { childList: true });
  document.addEventListener("keydown", (event) => {
    if (currentScreen()?.matches?.('[data-flow-view="run"]') && event.key.length === 1) scheduleCaretVisibility();
  }, true);
  window.addEventListener("resize", scheduleCaretVisibility);
  queueMicrotask(decorate);
}

if (globalThis.window) {
  window.wordstrikeFlowUxPhase8 = Object.freeze({
    enabled,
    ensureCaretVisible,
    scheduleCaretVisibility,
    syncRovingTabindex: () => syncRovingTabindex(currentScreen()),
  });
}
