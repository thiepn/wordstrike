import { getRecentSessions } from "./modeStorage.js";
import { getCurrentSpeedTest } from "./speedTest.js";
import { collectPerformanceV5Samples } from "./speedTestPerformanceV5.js";
import { finalizeCurrentSpeedTestWordProfile } from "./speedTestWordProfileV4.js";
import {
  buildTypingCoachV6,
  getTypingCoachCycleForRetestSession,
  loadActiveTypingCoachCycle,
  markTypingCoachRetestRequested,
} from "./speedTestCoachV6.js";
import {
  completeTypingCoachV7Retest,
  ensureTypingCoachV7Plan,
  getTypingCoachV7Progress,
  isTypingCoachV7StepAvailable,
  loadTypingCoachV7Plan,
  markTypingCoachV7PracticeCompleted,
  markTypingCoachV7RetestRequested,
  markTypingCoachV7StepStarted,
  skipTypingCoachV7Step,
} from "./speedTestCoachV7.js";

const STYLE_HREF = "styles/screens/typing-coach-v7.css?v=20260911a";
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const signed = (value, suffix = "") => {
  if (value == null) return "—";
  const number = finite(value);
  if (Math.abs(number) < 0.05) return `0${suffix}`;
  return `${number > 0 ? "+" : ""}${number.toFixed(suffix === " / word" ? 2 : 1)}${suffix}`;
};

let observer = null;
let scheduled = false;

function ensureStyles() {
  if (typeof document === "undefined") return null;
  const existing = document.querySelector("link[data-typing-coach-v7-style]");
  if (existing) return existing;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLE_HREF;
  link.dataset.typingCoachV7Style = "";
  document.head.append(link);
  return link;
}

function profileSummary(profile = {}) {
  const words = Array.isArray(profile?.words) ? profile.words.filter(Boolean) : [];
  if (!words.length) return { cleanPercent: null, correctionsPerWord: null };
  const clean = words.filter((word) => word.clean === true).length;
  const corrections = words.reduce((sum, word) => (
    sum + Math.max(0, finite(word?.backspaces)) + Math.max(0, finite(word?.wordDeletes))
  ), 0);
  return {
    cleanPercent: round((clean / words.length) * 100),
    correctionsPerWord: round(corrections / words.length, 2),
  };
}

function fallbackRetestCycle(plan, result, profile) {
  if (!plan?.retestRequestedAt || !result?.sessionId || result.sessionId === plan.sourceSessionId) return null;
  if (plan.configId && result.modeData?.configId !== plan.configId) return null;
  if (plan.wordSetId && result.modeData?.wordSetId && result.modeData.wordSetId !== plan.wordSetId) return null;
  const summary = profileSummary(profile);
  return {
    sourceSessionId: plan.sourceSessionId,
    after: { sessionId: result.sessionId },
    comparison: {
      wpmDelta: round(finite(result.wpm) - finite(plan.snapshot?.wpm)),
      accuracyDelta: round(finite(result.accuracy) - finite(plan.snapshot?.accuracy)),
      cleanDelta: summary.cleanPercent == null || plan.snapshot?.cleanPercent == null
        ? null : round(summary.cleanPercent - finite(plan.snapshot.cleanPercent)),
      correctionsDelta: summary.correctionsPerWord == null || plan.snapshot?.correctionsPerWord == null
        ? null : round(summary.correctionsPerWord - finite(plan.snapshot.correctionsPerWord), 2),
    },
  };
}

function currentCoachContext() {
  const screen = document.querySelector("#app .speed-results-screen");
  const shell = screen?.querySelector("[data-speed-results-v6]");
  const practicePanel = shell?.querySelector('[data-v6-panel="practice"]');
  const state = getCurrentSpeedTest();
  const result = state?.result;
  if (!screen || !shell || !practicePanel || !result?.sessionId) return null;
  const profile = finalizeCurrentSpeedTestWordProfile(state);
  if (!profile?.words?.length) return null;
  const samples = collectPerformanceV5Samples({
    recentSessions: getRecentSessions(),
    result,
    currentProfile: profile,
    currentTimeline: result.modeData?.performanceTimeline,
  });
  const v6Plan = buildTypingCoachV6({ samples, result, profile });
  if (!v6Plan) return null;

  const current = loadTypingCoachV7Plan();
  if (current?.retestRequestedAt) {
    const completedCycle = getTypingCoachCycleForRetestSession(result.sessionId)
      || fallbackRetestCycle(current, result, profile);
    if (completedCycle) completeTypingCoachV7Retest(result, completedCycle);
  }
  const plan = ensureTypingCoachV7Plan(v6Plan);
  if (!plan) return null;
  return { screen, shell, practicePanel, result, profile, v6Plan, plan };
}

function snapshotMarkup(plan) {
  const snapshot = plan.snapshot || {};
  return `<section class="typing-coach-v7-snapshot" aria-label="Current skill snapshot">
    <div><span>Baseline WPM</span><strong>${finite(snapshot.wpm).toFixed(1)}</strong></div>
    <div><span>Accuracy</span><strong>${finite(snapshot.accuracy).toFixed(1)}%</strong></div>
    <div><span>Clean words</span><strong>${snapshot.cleanPercent == null ? "—" : `${finite(snapshot.cleanPercent).toFixed(0)}%`}</strong></div>
    <div><span>Consistency</span><strong>${escapeHtml(snapshot.consistency || "Building")}</strong><small>${Math.max(0, Math.round(finite(snapshot.sameTestRuns)))} matching runs</small></div>
  </section>`;
}

function comparisonMarkup(plan) {
  if (plan.status !== "completed") return "";
  const comparison = plan.comparison;
  if (!comparison) {
    return `<section class="typing-coach-v7-complete" data-typing-coach-v7-complete><span>Training block complete</span><strong>Retest recorded</strong><p>Your targeted block is complete. A fresh Typing Test can build the next plan.</p></section>`;
  }
  return `<section class="typing-coach-v7-complete" data-typing-coach-v7-complete>
    <div class="typing-coach-v7-complete-head"><div><span>Training block complete</span><strong>Baseline → retest</strong></div><small>local-only</small></div>
    <div class="typing-coach-v7-comparison-grid">
      <div><span>WPM</span><strong>${signed(comparison.wpmDelta, " WPM")}</strong></div>
      <div><span>Accuracy</span><strong>${signed(comparison.accuracyDelta, " pp")}</strong></div>
      <div><span>Clean words</span><strong>${signed(comparison.cleanDelta, " pp")}</strong></div>
      <div><span>Corrections</span><strong>${signed(comparison.correctionsDelta, " / word")}</strong></div>
    </div>
    <p>Complete a fresh Typing Test when you want WordStrike to build the next adaptive plan.</p>
  </section>`;
}

function stepStatus(plan, step) {
  if (step.status === "complete") return { label: "Complete", state: "complete" };
  if (step.status === "skipped") return { label: "Skipped", state: "skipped" };
  if (step.status === "requested") return { label: "Retesting", state: "active" };
  if (isTypingCoachV7StepAvailable(plan, step.id)) return { label: step.status === "active" ? "In progress" : "Next", state: "next" };
  return { label: "Locked", state: "locked" };
}

function stepMarkup(plan, step, index) {
  const state = stepStatus(plan, step);
  const available = isTypingCoachV7StepAvailable(plan, step.id);
  const drill = step.drill;
  const target = drill?.target ? `<div class="typing-coach-v7-target"><span>Target</span><strong>${escapeHtml(drill.target)}</strong></div>` : "";
  const practiceActions = step.kind === "practice"
    ? `<div class="typing-coach-v7-step-actions"><button type="button" data-v7-start-step="${escapeHtml(step.id)}"${available ? "" : " disabled"}>${step.status === "active" ? "RESUME DRILL" : "START DRILL"}</button><button type="button" class="is-quiet" data-v7-skip-step="${escapeHtml(step.id)}"${available ? "" : " disabled"}>SKIP</button></div>`
    : `<div class="typing-coach-v7-step-actions"><button type="button" data-v7-retest${available ? "" : " disabled"}>RETEST ORIGINAL</button></div>`;
  return `<article class="typing-coach-v7-step is-${state.state}" data-v7-step="${escapeHtml(step.id)}">
    <div class="typing-coach-v7-step-index">${index + 1}</div>
    <div class="typing-coach-v7-step-copy"><div class="typing-coach-v7-step-meta"><span>${escapeHtml(step.stage)}</span><small>${state.label}</small></div><h4>${escapeHtml(step.title)}</h4><p>${escapeHtml(step.description)}</p>${target}</div>
    ${practiceActions}
  </article>`;
}

function planMarkup(plan) {
  const progress = getTypingCoachV7Progress(plan);
  const progressText = plan.status === "completed" ? "Complete" : `${progress.completed}/${progress.total} steps`;
  return `<section class="typing-coach-v7" data-typing-coach-v7 data-coach-version="7">
    <header class="typing-coach-v7-head"><div><span>Typing Coach V7</span><h3>Adaptive Training Plan</h3><p>A short, ordered block built from this result. Finish the focused work first, then verify it on the exact original test.</p></div><div class="typing-coach-v7-budget"><strong>${plan.estimatedMinutes}</strong><span>min target</span></div></header>
    <div class="typing-coach-v7-progress"><div><span>Today's plan</span><strong>${progressText}</strong></div><div class="typing-coach-v7-progress-track" aria-hidden="true"><i style="width:${progress.percent}%"></i></div></div>
    ${snapshotMarkup(plan)}
    ${comparisonMarkup(plan)}
    ${plan.status === "completed" ? "" : `<div class="typing-coach-v7-steps">${plan.steps.map((step, index) => stepMarkup(plan, step, index)).join("")}</div>`}
    ${plan.focusWords?.length ? `<div class="typing-coach-v7-focus"><span>Focus set</span><strong>${plan.focusWords.map(escapeHtml).join(" · ")}</strong></div>` : ""}
    <footer class="typing-coach-v7-foot">Adaptive plan data stays in this browser and does not affect ranked scores or leaderboards.</footer>
  </section>`;
}

function renderPlan(context = currentCoachContext()) {
  if (!context) return false;
  ensureStyles();
  const { shell, practicePanel, result, plan } = context;
  let underlay = practicePanel.querySelector("[data-v7-v6-underlay]");
  if (!underlay) {
    const original = practicePanel.querySelector("[data-coach-practice]");
    if (original) {
      underlay = document.createElement("div");
      underlay.hidden = true;
      underlay.dataset.v7V6Underlay = "";
      original.replaceWith(underlay);
      underlay.append(original);
    }
  }
  const renderKey = `${result.sessionId}:${plan.updatedAt}:${plan.status}:${plan.steps.map((step) => step.status).join(",")}`;
  const root = practicePanel.querySelector("[data-typing-coach-v7]");
  if (root?.dataset.renderKey === renderKey) return true;
  const template = document.createElement("template");
  template.innerHTML = planMarkup(plan).trim();
  const next = template.content.firstElementChild;
  if (!next) return false;
  next.dataset.renderKey = renderKey;
  if (root) root.replaceWith(next);
  else practicePanel.prepend(next);

  const overviewButton = shell.querySelector('[data-v6-panel="overview"] [data-coach-practice-type]');
  if (overviewButton && !overviewButton.dataset.v7OpenPlan) {
    overviewButton.removeAttribute("data-coach-practice-type");
    overviewButton.dataset.v7OpenPlan = "";
    overviewButton.textContent = "OPEN TRAINING PLAN";
  }
  return true;
}

function clickUnderlyingDrill(panel, drillType) {
  const button = panel.querySelector(`[data-v7-v6-underlay] [data-coach-practice-type="${CSS.escape(drillType)}"]`);
  if (!button) return false;
  button.click();
  return true;
}

function startStep(stepId) {
  const context = currentCoachContext();
  if (!context) return;
  const step = context.plan.steps.find((item) => item.id === stepId);
  if (!step?.drill || !isTypingCoachV7StepAvailable(context.plan, step.id)) return;
  markTypingCoachV7StepStarted(step.id);
  renderPlan(currentCoachContext());
  clickUnderlyingDrill(context.practicePanel, step.drill.type);
}

function prepareRetest({ skipRemaining = false } = {}) {
  let plan = loadTypingCoachV7Plan();
  if (!plan) return null;
  if (skipRemaining) {
    for (const step of plan.steps) {
      if (step.kind === "retest") break;
      if (isTypingCoachV7StepAvailable(plan, step.id)) plan = skipTypingCoachV7Step(step.id) || plan;
    }
  }
  plan = markTypingCoachV7RetestRequested();
  return plan?.retestRequestedAt ? plan : null;
}

function requestRetest(options = {}) {
  const plan = prepareRetest(options);
  if (!plan) return false;
  markTypingCoachRetestRequested();
  document.querySelector('#app .speed-results-screen [data-action="retry"]')?.click?.();
  return true;
}

function syncPracticeCompletion() {
  const overlay = document.querySelector("[data-typing-coach-practice-overlay]");
  const resultView = overlay?.querySelector('[data-practice-view$="-result"]');
  if (!resultView) return false;
  const cycle = loadActiveTypingCoachCycle();
  if (!cycle?.drill) return false;
  const before = loadTypingCoachV7Plan()?.updatedAt;
  const next = markTypingCoachV7PracticeCompleted({
    sourceSessionId: cycle.sourceSessionId,
    drillType: cycle.drill.type,
    target: cycle.drill.target,
  });
  if (next?.updatedAt && next.updatedAt !== before) {
    renderPlan(currentCoachContext());
    return true;
  }
  return false;
}

function onShellClick(event) {
  const shell = event.currentTarget;
  const open = event.target.closest?.("[data-v7-open-plan]");
  if (open) {
    event.preventDefault();
    shell.querySelector('[data-v6-tab="practice"]')?.click?.();
    return;
  }
  const start = event.target.closest?.("[data-v7-start-step]");
  if (start) {
    event.preventDefault();
    startStep(start.dataset.v7StartStep);
    return;
  }
  const skip = event.target.closest?.("[data-v7-skip-step]");
  if (skip) {
    event.preventDefault();
    skipTypingCoachV7Step(skip.dataset.v7SkipStep);
    renderPlan(currentCoachContext());
    return;
  }
  if (event.target.closest?.("[data-v7-retest]")) {
    event.preventDefault();
    requestRetest();
  }
}

function enhanceResultsV7() {
  const context = currentCoachContext();
  if (!context) return;
  if (!context.shell.dataset.v7Bound) {
    context.shell.dataset.v7Bound = "true";
    context.shell.addEventListener("click", onShellClick);
  }
  renderPlan(context);
  syncPracticeCompletion();
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    enhanceResultsV7();
  });
}

function onDocumentClickCapture(event) {
  if (!event.target.closest?.("[data-coach-retest-original]")) return;
  const plan = loadTypingCoachV7Plan();
  const cycle = loadActiveTypingCoachCycle();
  if (!plan || !cycle || cycle.sourceSessionId !== plan.sourceSessionId) return;
  prepareRetest({ skipRemaining: true });
  scheduleEnhance();
}

function install() {
  const root = document.querySelector("#app");
  if (!root) return;
  enhanceResultsV7();
  observer = new MutationObserver(() => {
    syncPracticeCompletion();
    scheduleEnhance();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-practice-view"] });
  document.addEventListener("click", onDocumentClickCapture, true);
  window.addEventListener("pagehide", () => observer?.disconnect?.(), { once: true });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
