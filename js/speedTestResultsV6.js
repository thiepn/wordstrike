import { getRecentSessions } from "./modeStorage.js";
import { getCurrentSpeedTest } from "./speedTest.js";
import { collectPerformanceV5Samples } from "./speedTestPerformanceV5.js";
import { finalizeCurrentSpeedTestWordProfile } from "./speedTestWordProfileV4.js";
import {
  activateTypingCoachPlan,
  buildTypingCoachV6,
  completeTypingCoachRetest,
  getTypingCoachCycleForRetestSession,
  loadActiveTypingCoachCycle,
  markTypingCoachPracticeCompleted,
  markTypingCoachPracticeStarted,
  markTypingCoachRetestRequested,
} from "./speedTestCoachV6.js";
import { createPracticeFeatureGate } from "./practiceLab/practiceFeatureGate.js";
import { createPracticeExperimentRegistry } from "./practiceLab/practiceExperimentRegistry.js";
import { createPracticeLabController } from "./practiceLab/practiceLabController.js";
import { createPracticeLabRoute, PRACTICE_LAB_ROUTES } from "./practiceLab/practiceLabRoutes.js";

const STYLE_HREF = "styles/screens/typing-coach-v6.css?v=20260911a";
const TAB_IDS = Object.freeze(["overview", "timeline", "words", "progress", "practice"]);
const TAB_LABELS = Object.freeze({
  overview: "Overview",
  timeline: "Timeline",
  words: "Words",
  progress: "Progress",
  practice: "Practice",
});
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const signed = (value, suffix = "") => {
  if (value == null) return "—";
  const number = finite(value);
  if (Math.abs(number) < 0.05) return `0${suffix}`;
  return `${number > 0 ? "+" : ""}${number.toFixed(suffix === " / word" ? 2 : 1)}${suffix}`;
};

let practiceOverlay = null;
let practiceController = null;
let practiceRegistry = null;
let practiceObserver = null;
let practiceAutoStartIssued = false;
let practiceTargetFilled = false;

function ensureStyles() {
  if (typeof document === "undefined") return null;
  const existing = document.querySelector("link[data-typing-coach-v6-style]");
  if (existing) return existing;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLE_HREF;
  link.dataset.typingCoachV6Style = "";
  document.head.append(link);
  return link;
}

function closePracticeOverlay() {
  practiceObserver?.disconnect?.();
  practiceObserver = null;
  practiceController?.unmount?.();
  practiceRegistry?.destroy?.();
  practiceController = null;
  practiceRegistry = null;
  practiceOverlay?.remove?.();
  practiceOverlay = null;
  practiceAutoStartIssued = false;
  practiceTargetFilled = false;
}

function dispatchInput(field, value) {
  if (!field) return false;
  const setter = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement?.prototype || {}, "value")?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function coachPracticeSelectors(drill) {
  if (drill.type === "weak-words") return {
    field: "[data-problem-word-target]",
    start: '[data-practice-action="start-problem-words"]',
  };
  if (drill.type === "mistake-patterns") return {
    field: "[data-weak-key-target]",
    start: '[data-practice-action="start-weak-keys"]',
  };
  return {
    field: "[data-accuracy-recovery-target]",
    start: '[data-practice-action="start-accuracy-recovery"]',
  };
}

function injectRetestAction(root, cycle) {
  if (!root || root.querySelector("[data-coach-practice-retest]") || root.querySelector('[data-practice-view$="-session"]')) return;
  const view = root.querySelector("[data-practice-view]");
  if (!view) return;
  if (String(view.dataset.practiceView || "").endsWith("-result")) markTypingCoachPracticeCompleted();
  const shell = root.querySelector(".practice-lab-shell") || view;
  const bar = document.createElement("aside");
  bar.className = "typing-coach-practice-context";
  bar.dataset.coachPracticeRetest = "";
  bar.innerHTML = `<div><span>Typing Coach V6</span><strong>${escapeHtml(cycle.drill.title)} · ${escapeHtml(cycle.drill.target)}</strong><small>Return to the exact original Typing Test when you are ready to measure the change.</small></div>
    <button type="button" data-coach-retest-original>RETEST ORIGINAL</button>`;
  shell.prepend(bar);
  bar.querySelector("[data-coach-retest-original]")?.addEventListener("click", () => {
    markTypingCoachRetestRequested();
    closePracticeOverlay();
    const retry = document.querySelector('#app .speed-results-screen [data-action="retry"]');
    retry?.click?.();
  });
}

function driveCoachPractice() {
  const cycle = loadActiveTypingCoachCycle();
  const root = practiceOverlay?.querySelector("[data-coach-practice-root]");
  if (!cycle || !root) return;
  const sessionView = root.querySelector('[data-practice-view$="-session"]');
  if (sessionView) {
    markTypingCoachPracticeStarted();
    return;
  }

  injectRetestAction(root, cycle);
  const selectors = coachPracticeSelectors(cycle.drill);
  if (cycle.drill.type === "accuracy-recovery" && !practiceTargetFilled) {
    root.querySelector('[data-practice-action="set-accuracy-recovery-type"][data-manual-type="word"]')?.click?.();
  }
  const field = root.querySelector(selectors.field);
  if (field && !practiceTargetFilled) {
    practiceTargetFilled = dispatchInput(field, cycle.drill.target);
    return;
  }
  const start = root.querySelector(selectors.start);
  if (!practiceAutoStartIssued && start && !start.disabled && start.getAttribute("aria-disabled") !== "true") {
    practiceAutoStartIssued = true;
    markTypingCoachPracticeStarted();
    start.click();
  }
}

function openCoachPractice(plan, drillType) {
  const cycle = activateTypingCoachPlan(plan, drillType);
  if (!cycle) return false;
  closePracticeOverlay();
  ensureStyles();
  const overlay = document.createElement("div");
  overlay.className = "typing-coach-practice-overlay";
  overlay.dataset.typingCoachPracticeOverlay = "";
  overlay.innerHTML = `<div class="typing-coach-practice-chrome">
      <div><span>WORDSTRIKE / TYPING COACH</span><strong>${escapeHtml(cycle.drill.title)}</strong></div>
      <div class="typing-coach-practice-chrome-actions">
        <button type="button" data-coach-retest-original>RETEST ORIGINAL</button>
        <button type="button" data-coach-close-practice aria-label="Close targeted practice">CLOSE</button>
      </div>
    </div>
    <div class="typing-coach-practice-root" data-coach-practice-root></div>`;
  document.body.append(overlay);
  practiceOverlay = overlay;
  overlay.addEventListener("click", (event) => event.stopPropagation());
  overlay.addEventListener("keydown", (event) => event.stopPropagation());
  overlay.querySelector("[data-coach-close-practice]")?.addEventListener("click", closePracticeOverlay);
  overlay.querySelector("[data-coach-retest-original]")?.addEventListener("click", () => {
    markTypingCoachRetestRequested();
    closePracticeOverlay();
    document.querySelector('#app .speed-results-screen [data-action="retry"]')?.click?.();
  });

  const root = overlay.querySelector("[data-coach-practice-root]");
  const featureGate = createPracticeFeatureGate({ publicEnabled: true });
  practiceRegistry = createPracticeExperimentRegistry({ featureGate });
  practiceController = createPracticeLabController({
    root,
    featureGate,
    experimentRegistry: practiceRegistry,
    appNavigation: { exit: closePracticeOverlay },
  });
  practiceAutoStartIssued = false;
  practiceTargetFilled = false;
  practiceObserver = new MutationObserver(driveCoachPractice);
  practiceObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled"] });
  practiceController.mount(createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, {
    experimentId: cycle.drill.experimentId,
  }));
  driveCoachPractice();
  return true;
}

function comparisonMarkup(cycle) {
  if (!cycle?.comparison) return "";
  const comparison = cycle.comparison;
  return `<section class="typing-coach-comparison" data-typing-coach-comparison>
    <div class="typing-coach-card-head"><div><span>Coach cycle result</span><strong>Before → retest</strong></div><small>${cycle.practiceCompletedAt ? "practice completed" : "targeted practice opened"}</small></div>
    <div class="typing-coach-comparison-grid">
      <div><span>WPM</span><strong>${cycle.baseline.wpm.toFixed(1)} → ${cycle.after.wpm.toFixed(1)}</strong><small>${signed(comparison.wpmDelta, " WPM")}</small></div>
      <div><span>Accuracy</span><strong>${cycle.baseline.accuracy.toFixed(1)}% → ${cycle.after.accuracy.toFixed(1)}%</strong><small>${signed(comparison.accuracyDelta, " pp")}</small></div>
      <div><span>Clean words</span><strong>${cycle.baseline.cleanPercent == null ? "—" : `${cycle.baseline.cleanPercent.toFixed(0)}%`} → ${cycle.after.cleanPercent == null ? "—" : `${cycle.after.cleanPercent.toFixed(0)}%`}</strong><small>${signed(comparison.cleanDelta, " pp")}</small></div>
      <div><span>Corrections / word</span><strong>${cycle.baseline.correctionsPerWord == null ? "—" : cycle.baseline.correctionsPerWord.toFixed(2)} → ${cycle.after.correctionsPerWord == null ? "—" : cycle.after.correctionsPerWord.toFixed(2)}</strong><small>${signed(comparison.correctionsDelta, " / word")}</small></div>
    </div>
  </section>`;
}

function overviewMarkup(plan, result, comparisonCycle) {
  const primary = plan.primaryDrill;
  const delta = plan.performance?.runCount > 1
    ? finite(result.wpm) - finite(plan.performance.recentAverageWpm)
    : null;
  return `<div class="typing-coach-overview" data-coach-overview>
    <div class="typing-coach-overview-metrics">
      <div><span>WPM</span><strong>${finite(result.wpm).toFixed(1)}</strong><small>${delta == null ? "first local baseline" : `${signed(delta, "")} vs recent average`}</small></div>
      <div><span>Accuracy</span><strong>${finite(result.accuracy).toFixed(1)}%</strong><small>final result</small></div>
      <div><span>Raw</span><strong>${finite(result.modeData?.rawWpm).toFixed(1)}</strong><small>WPM</small></div>
      <div><span>Coach focus</span><strong>${escapeHtml(primary.title)}</strong><small>${escapeHtml(primary.target)}</small></div>
    </div>
    <section class="typing-coach-priority-card">
      <div class="typing-coach-priority-copy"><span>Recommended next step</span><h4>${escapeHtml(primary.title)}</h4><p>${escapeHtml(primary.rationale)}</p></div>
      <button type="button" data-coach-practice-type="${primary.type}">PRACTICE NOW</button>
    </section>
    <div class="typing-coach-observations">${plan.observations.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</div>
    ${comparisonMarkup(comparisonCycle)}
  </div>`;
}

function practiceMarkup(plan, comparisonCycle) {
  return `<div class="typing-coach-practice" data-coach-practice>
    <div class="typing-coach-card-head"><div><span>Personalized training</span><strong>Turn analysis into practice</strong></div><small>deterministic · local-only</small></div>
    <p class="typing-coach-practice-lead">WordStrike selected these drills from your word friction, recurring mistakes, and correction behavior. Each drill uses Practice Lab's real-word training material.</p>
    <div class="typing-coach-drill-grid">${plan.drills.map((drill) => {
      const primary = drill.type === plan.primaryDrillType;
      return `<article class="typing-coach-drill-card${primary ? " is-primary" : "}">
        <div><span>${primary ? "Recommended" : "Alternative"}</span><h4>${escapeHtml(drill.title)}</h4><p>${escapeHtml(drill.rationale)}</p></div>
        <div class="typing-coach-drill-target"><small>Target</small><strong>${escapeHtml(drill.target)}</strong></div>
        <button type="button" data-coach-practice-type="${drill.type}">${primary ? "PRACTICE NOW" : "OPEN DRILL"}</button>
      </article>`;
    }).join("")}</div>
    ${plan.focusWords.length ? `<div class="typing-coach-focus-set"><span>Focus set</span><strong>${plan.focusWords.map(escapeHtml).join(" · ")}</strong><small>${plan.estimatedMinutes} minute targeted block</small></div>` : ""}
    ${comparisonMarkup(comparisonCycle)}
  </div>`;
}

function tabShellMarkup(plan, result, comparisonCycle) {
  return `<section class="speed-results-v6" data-speed-results-v6 data-performance-version="6">
    <header class="speed-results-v6-heading"><div><p>Typing Coach</p><h3>Results 2.0</h3></div><span>V6</span></header>
    <div class="speed-results-v6-tabs" role="tablist" aria-label="Typing Test result sections">
      ${TAB_IDS.map((id, index) => `<button type="button" role="tab" id="speed-results-v6-tab-${id}" aria-controls="speed-results-v6-panel-${id}" aria-selected="${index === 0 ? "true" : "false"}" tabindex="${index === 0 ? "0" : "-1"}" data-v6-tab="${id}">${TAB_LABELS[id]}</button>`).join("")}
    </div>
    <div class="speed-results-v6-panel" role="tabpanel" id="speed-results-v6-panel-overview" aria-labelledby="speed-results-v6-tab-overview" data-v6-panel="overview">${overviewMarkup(plan, result, comparisonCycle)}</div>
    <div class="speed-results-v6-panel" role="tabpanel" id="speed-results-v6-panel-timeline" aria-labelledby="speed-results-v6-tab-timeline" data-v6-panel="timeline" hidden></div>
    <div class="speed-results-v6-panel" role="tabpanel" id="speed-results-v6-panel-words" aria-labelledby="speed-results-v6-tab-words" data-v6-panel="words" hidden></div>
    <div class="speed-results-v6-panel" role="tabpanel" id="speed-results-v6-panel-progress" aria-labelledby="speed-results-v6-tab-progress" data-v6-panel="progress" hidden></div>
    <div class="speed-results-v6-panel" role="tabpanel" id="speed-results-v6-panel-practice" aria-labelledby="speed-results-v6-tab-practice" data-v6-panel="practice" hidden>${practiceMarkup(plan, comparisonCycle)}</div>
  </section>`;
}

function selectTab(shell, id, { focus = false } = {}) {
  if (!TAB_IDS.includes(id)) return;
  shell.querySelectorAll("[data-v6-tab]").forEach((tab) => {
    const active = tab.dataset.v6Tab === id;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus({ preventScroll: true });
  });
  shell.querySelectorAll("[data-v6-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.v6Panel !== id;
  });
}

function bindResultInteractions(shell, plan) {
  shell.addEventListener("click", (event) => {
    const tab = event.target.closest?.("[data-v6-tab]");
    if (tab) {
      selectTab(shell, tab.dataset.v6Tab);
      return;
    }
    const practice = event.target.closest?.("[data-coach-practice-type]");
    if (practice) openCoachPractice(plan, practice.dataset.coachPracticeType);
  });
  shell.querySelector("[role=tablist]")?.addEventListener("keydown", (event) => {
    const tab = event.target.closest?.("[data-v6-tab]");
    if (!tab) return;
    let index = TAB_IDS.indexOf(tab.dataset.v6Tab);
    if (event.key === "ArrowRight") index = (index + 1) % TAB_IDS.length;
    else if (event.key === "ArrowLeft") index = (index - 1 + TAB_IDS.length) % TAB_IDS.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = TAB_IDS.length - 1;
    else return;
    event.preventDefault();
    selectTab(shell, TAB_IDS[index], { focus: true });
  });
}

function enhanceResultsV6() {
  const screen = document.querySelector("#app .speed-results-screen");
  const base = screen?.querySelector("[data-speed-performance]");
  const v5 = screen?.querySelector("[data-speed-performance-v5]");
  if (!screen || !base || !v5 || base.dataset.performanceV6 === "true") return;
  const state = getCurrentSpeedTest();
  const result = state?.result;
  if (!result?.sessionId) return;
  const profile = finalizeCurrentSpeedTestWordProfile(state);
  if (!profile?.words?.length) return;
  const samples = collectPerformanceV5Samples({
    recentSessions: getRecentSessions(),
    result,
    currentProfile: profile,
    currentTimeline: result.modeData?.performanceTimeline,
  });
  const plan = buildTypingCoachV6({ samples, result, profile });
  if (!plan) return;
  const completedNow = completeTypingCoachRetest(result, profile);
  const comparisonCycle = completedNow || getTypingCoachCycleForRetestSession(result.sessionId);

  ensureStyles();
  const template = document.createElement("template");
  template.innerHTML = tabShellMarkup(plan, result, comparisonCycle).trim();
  const shell = template.content.firstElementChild;
  if (!shell) return;
  base.insertAdjacentElement("beforebegin", shell);

  const v2 = screen.querySelector("[data-speed-performance-v2]");
  const v3 = screen.querySelector("[data-speed-performance-v3]");
  const v4 = screen.querySelector("[data-speed-performance-v4]");
  const timelinePanel = shell.querySelector('[data-v6-panel="timeline"]');
  const wordsPanel = shell.querySelector('[data-v6-panel="words"]');
  const progressPanel = shell.querySelector('[data-v6-panel="progress"]');
  [base, v2].filter(Boolean).forEach((node) => timelinePanel.append(node));
  if (v4) wordsPanel.append(v4);
  [v3, v5].filter(Boolean).forEach((node) => progressPanel.append(node));
  if (!wordsPanel.children.length) wordsPanel.innerHTML = '<p class="typing-coach-empty">Word-level data is not available for this run.</p>';
  if (!progressPanel.children.length) progressPanel.innerHTML = '<p class="typing-coach-empty">Complete more matching tests to build a progress baseline.</p>';
  bindResultInteractions(shell, plan);
  base.dataset.performanceV6 = "true";
}

function install() {
  const root = document.querySelector("#app");
  if (!root) return;
  enhanceResultsV6();
  const observer = new MutationObserver(enhanceResultsV6);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("pagehide", closePracticeOverlay, { once: true });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
