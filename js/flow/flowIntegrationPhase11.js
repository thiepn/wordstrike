import { serializeFlowWeaknessProfile } from "./flowAdaptive.js";
import {
  FLOW_MILESTONES,
  getFlowIntegrationSummary,
  hasSeenFlowOnboarding,
  markFlowOnboardingSeen,
  recordFlowSession,
  saveFlowLastSetup,
} from "./flowProgression.js?v=20260923a";

const params = new URLSearchParams(globalThis.location?.search || "");
const enabled = params.get("dev") === "1"
  && params.get("mode") === "flow"
  && params.get("flowRun") === "1"
  && params.get("flowUi") === "1"
  && params.get("flowUx") === "1"
  && params.get("flowIntegration") === "1";

let decoratedScreen = null;
let trackedStartedAt = null;
let currentSessionId = null;
let completion = null;

function controller() {
  return globalThis.window?.wordstrikeFlowPhase1 || null;
}

function currentScreen() {
  return document.querySelector(".flow-phase1-screen[data-flow-ui-phase7='true']");
}

function plan() {
  return controller()?.getRunPlan?.() || null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function titleCase(value) {
  return String(value || "")
    .split("-")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(" ");
}

function formatTime(ms) {
  const minutes = Math.round((Number(ms) || 0) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function makeSessionId() {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `flow-${Date.now().toString(36)}-${random}`;
}

function ensureRunIdentity() {
  const snapshot = controller()?.getSnapshot?.();
  if (!snapshot || snapshot.startedAt == null) return null;
  if (snapshot.startedAt !== trackedStartedAt) {
    trackedStartedAt = snapshot.startedAt;
    currentSessionId = controller()?.getPublicSessionId?.() || makeSessionId();
    completion = null;
    const currentPlan = plan();
    saveFlowLastSetup({
      sessionLength: currentPlan?.sessionLength || snapshot.sessionLength,
      category: currentPlan?.category || snapshot.category,
      difficulty: currentPlan?.difficulty || snapshot.difficulty,
      modifiers: currentPlan?.modifiers || snapshot.modifiers || [],
    });
  }
  return currentSessionId;
}

function onboardingMarkup() {
  return `
    <details class="flow-integration-onboarding" data-flow-integration-onboarding open>
      <summary>How Flow works</summary>
      <div>
        <p><strong>Flow</strong> rewards sustained correct progress, not short speed bursts.</p>
        <p><strong>Momentum</strong> grows through clean forward typing and recovers after mistakes.</p>
        <p><strong>Cadence</strong> compares rhythm with your own baseline rather than another player's speed.</p>
        <p><strong>Corrections</strong> are allowed, but raw errors still remain part of accuracy and analysis.</p>
        <button type="button" class="ui-button" data-flow-integration-onboarding-done>GOT IT</button>
      </div>
    </details>`;
}

function historyMarkup(history) {
  if (!history.length) return '<p class="flow-integration-empty">Complete a run to begin your Flow history.</p>';
  return `
    <ol class="flow-integration-history">
      ${history.slice(0, 3).map((item) => `
        <li>
          <span>${titleCase(item.sessionLength)} · ${titleCase(item.difficulty)}</span>
          <strong>${Math.round(item.wpm)} WPM</strong>
          <small>${item.accuracy.toFixed(1)}% · ${item.score.toLocaleString("en-US")} pts${item.cadence == null ? "" : ` · C${Math.round(item.cadence)}`}</small>
        </li>`).join("")}
    </ol>`;
}

function progressionMarkup(summary) {
  const progress = summary.progress;
  const earned = Object.keys(progress.milestones).length;
  const weakness = progress.lastWeaknessProfile || [];
  return `
    <section class="flow-integration-profile" data-flow-integration-profile aria-label="Your Flow progression">
      <div class="flow-integration-heading">
        <span>Your Flow</span>
        <strong>${earned}/${FLOW_MILESTONES.length} milestones</strong>
      </div>
      <div class="flow-integration-metrics">
        <div><span>Runs</span><strong>${progress.completedRuns}</strong></div>
        <div><span>Best score</span><strong>${Math.round(progress.best.score).toLocaleString("en-US")}</strong></div>
        <div><span>Best WPM</span><strong>${progress.best.wpm.toFixed(1)}</strong></div>
        <div><span>Best cadence</span><strong>${progress.best.cadence ? Math.round(progress.best.cadence) : "—"}</strong></div>
        <div><span>Practice time</span><strong>${formatTime(progress.totalActiveMs)}</strong></div>
      </div>
      ${historyMarkup(progress.history)}
      ${weakness.length ? `<button type="button" class="flow-integration-resume" data-flow-integration-resume>CONTINUE TARGETED TRAINING <span>${escapeHtml(weakness[0].label)}</span></button>` : ""}
    </section>`;
}

function resumeAdaptive() {
  const progress = getFlowIntegrationSummary().progress;
  if (!progress.lastWeaknessProfile?.length) return;
  const url = new URL(globalThis.location.href);
  url.searchParams.set("flowAdaptive", "1");
  url.searchParams.set("flowWeaknesses", serializeFlowWeaknessProfile({
    version: 1,
    weaknesses: progress.lastWeaknessProfile,
  }));
  url.searchParams.delete("flowUiStart");
  url.searchParams.delete("flowResumeAdaptive");
  globalThis.location.replace(url.href);
}

function decorateReady(screen) {
  const setup = screen.querySelector("[data-flow-ui='setup']");
  if (!setup) return false;
  if (!hasSeenFlowOnboarding() && !screen.querySelector("[data-flow-integration-onboarding]")) {
    setup.insertAdjacentHTML("afterbegin", onboardingMarkup());
    screen.querySelector("[data-flow-integration-onboarding-done]")?.addEventListener("click", () => {
      markFlowOnboardingSeen();
      screen.querySelector("[data-flow-integration-onboarding]")?.remove();
    });
  }
  if (!screen.querySelector("[data-flow-integration-profile]")) {
    const itinerary = screen.querySelector("[data-flow-setup-itinerary]");
    itinerary?.insertAdjacentHTML("beforebegin", progressionMarkup(getFlowIntegrationSummary()));
    screen.querySelector("[data-flow-integration-resume]")?.addEventListener("click", resumeAdaptive);
  }
  screen.dataset.flowIntegrationPhase11 = "true";
  return true;
}

function decorateRun(screen) {
  ensureRunIdentity();
  screen.dataset.flowIntegrationPhase11 = "true";
  return true;
}

function decorateChapter(screen) {
  ensureRunIdentity();
  screen.dataset.flowIntegrationPhase11 = "true";
  return true;
}

function recordCompletion() {
  const snapshot = controller()?.getSnapshot?.();
  if (!snapshot || snapshot.phase !== "complete") return null;
  ensureRunIdentity();
  if (!currentSessionId) currentSessionId = makeSessionId();
  if (!completion) {
    completion = recordFlowSession({
      sessionId: currentSessionId,
      endedAt: Date.now(),
      snapshot,
      plan: plan(),
    });
  }
  return completion;
}

function completionMarkup(result) {
  const progress = result.progress;
  const milestones = result.newlyEarned || [];
  return `
    <section class="flow-integration-complete" data-flow-integration-complete aria-label="Flow progression update">
      <div class="flow-integration-heading">
        <span>Progress saved</span>
        <strong>Run ${progress.completedRuns}</strong>
      </div>
      <div class="flow-integration-complete-grid">
        <span><strong>${Math.round(progress.best.score).toLocaleString("en-US")}</strong> best score</span>
        <span><strong>${progress.best.wpm.toFixed(1)}</strong> best WPM</span>
        <span><strong>${progress.best.cadence ? Math.round(progress.best.cadence) : "—"}</strong> best cadence</span>
        <span><strong>${Object.keys(progress.milestones).length}/${FLOW_MILESTONES.length}</strong> milestones</span>
      </div>
      ${milestones.length ? `<div class="flow-integration-earned"><span>New milestone${milestones.length === 1 ? "" : "s"}</span>${milestones.map((item) => `<strong>${escapeHtml(item.name)}</strong>`).join("")}</div>` : '<p class="flow-integration-empty">Run added to your Flow history.</p>'}
    </section>`;
}

function decorateComplete(screen) {
  const result = recordCompletion();
  if (!result) return false;
  const publicScoreV2 = screen.matches?.('[data-flow-score-v2="true"]');
  if (!publicScoreV2 && !screen.querySelector("[data-flow-integration-complete]")) {
    const actions = screen.querySelector(".flow-complete-actions");
    actions?.insertAdjacentHTML("afterend", completionMarkup(result));
  }
  screen.dataset.flowIntegrationPhase11 = "true";
  return true;
}

function decorate() {
  if (!enabled) return;
  const screen = currentScreen();
  if (!screen) return;
  if (screen !== decoratedScreen) decoratedScreen = screen;
  if (screen.dataset.flowIntegrationPhase11 === "true") return;
  const view = screen.dataset.flowView;
  if (view === "ready") decorateReady(screen);
  else if (view === "run") decorateRun(screen);
  else if (view === "chapter") decorateChapter(screen);
  else if (view === "complete") decorateComplete(screen);
}

if (enabled) {
  const app = document.querySelector("#app");
  if (app) new MutationObserver(() => queueMicrotask(decorate)).observe(app, { childList: true });
  queueMicrotask(decorate);
}

if (globalThis.window) {
  window.wordstrikeFlowIntegrationPhase11 = Object.freeze({
    enabled,
    getSummary: getFlowIntegrationSummary,
    getSessionId: () => currentSessionId,
    resumeAdaptive,
  });
}
