import {
  backspaceFlowText,
  createFlowTypingRun,
  getFlowTypingSnapshot,
  insertFlowText,
} from "./flowEngine.js";
import {
  analyzeFlowCadence,
  analyzeFlowCadenceLive,
  FLOW_LIVE_CADENCE_EVENT_WINDOW,
} from "./flowCadence.js?v=20260924b";
import { resolveFlowRunPlan } from "./flowRunPlan.js?v=20260923e";
import {
  FLOW_V3_THEME_IDS,
  normalizeFlowV3Theme,
  resolveFlowStreamPlanV3,
} from "./flowStreamPlanV3.js?v=20260923b";
import {
  formatFlowThemeLabel,
  getFlowStreamIdentity,
  savePreferredFlowTheme,
} from "./flowIdentityV1.js?v=20260924b";
import { resolveFlowSelection } from "./flowSelection.js";
import {
  calculateFlowScoreV2,
  createFlowScoreV2Result,
} from "./flowScoreV2.js?v=20260923f";
import { recordFlowResultV2 } from "./flowRecordsV2.js?v=20260923f";
import {
  calculateFlowScoreV3,
  createFlowScoreV3Result,
} from "./flowScoreV3.js?v=20260923a";
import {
  getFlowPersonalBestV3,
  loadFlowRecordsV3,
  recordFlowResultV3,
} from "./flowRecordsV3.js?v=20260923a";
import {
  getFlowProgressionSummaryV4,
  loadFlowProgressionV4,
  recordFlowProgressionV4,
} from "./flowProgressionV4.js?v=20260924a";
import {
  createFlowSessionV4,
  formatFlowSessionDurationV4,
  getFlowSessionLiveSummaryV4,
  recordFlowSessionRunV4,
} from "./flowSessionV4.js?v=20260924a";
import { recordFlowCorpusRun } from "./flowCorpusHistory.js?v=20260923a";
import { FLOW_PHASES } from "./flowState.js";
import {
  getAuthState,
  signInWithGoogle,
  subscribeToAuth,
} from "../authService.js";
import {
  getLeaderboardProfileState,
  initializeLeaderboardProfile,
  subscribeToLeaderboardProfile,
} from "../leaderboardProfileService.js";
import {
  clearSubmissionState,
  createLeaderboardSubmissionService,
  getSubmissionState,
  prepareResultSubmission,
  refreshSubmissionEligibility,
  retryCurrentSubmission,
  submitCurrentResult,
  subscribeToSubmissions,
} from "../leaderboardSubmissionService.js";
import { savePendingResultSubmission } from "../pendingResultSubmission.js";
import {
  leaderboardReturnStateForBoard,
  saveLeaderboardReturnState,
} from "../leaderboardReturnState.js";

const root = () => document.querySelector("#app");
const now = () => globalThis.performance?.now?.() ?? Date.now();
let developerFlowRequested = false;
let publicFlowRequested = false;
let resolvedRunPlan = null;
let resolvedSelection = null;
const LIVE_CADENCE_INTERVAL_MS = 180;

function refreshFlowPlanFromLocation(locationLike = globalThis.location) {
  const params = new URLSearchParams(locationLike?.search || "");
  resolvedRunPlan = params.get("flowRelease") === "1"
    ? resolveFlowStreamPlanV3(params)
    : resolveFlowRunPlan(params);
  resolvedSelection = resolvedRunPlan ? null : resolveFlowSelection(params);
  return resolvedRunPlan || resolvedSelection;
}

function resolveFlowRouteState(locationLike = globalThis.location) {
  const params = new URLSearchParams(locationLike?.search || "");
  developerFlowRequested = params.get("dev") === "1" && params.get("mode") === "flow";
  publicFlowRequested = params.get("flowRelease") === "1" && params.get("mode") === "flow";
  refreshFlowPlanFromLocation(locationLike);
  return developerFlowRequested || publicFlowRequested;
}

resolveFlowRouteState();

let active = false;
let dismissed = false;
let view = "idle";
let storedReturnNodes = [];
let run = null;
let activeSegmentIndex = 0;
let chapterPauseStartedAt = null;
let visibilityPauseStartedAt = null;
let visibilityPausedRun = null;
let mountedCharacterNodes = new Map();
let mountedRunHud = null;
let cadenceRefreshTimer = null;
let launchObserver = null;
let lastCadenceRefreshAt = -Infinity;
let publicRunSessionId = null;
let lastPublicResult = null;
let lastPublicRecordState = null;
let flowSessionV4 = null;
let pendingMicroResultV4 = null;
let microResultTimer = null;
let flowAutomaticSubmissionSessionId = null;
let performanceStats = createPerformanceStats();

function createPerformanceStats() {
  return {
    characterNodeUpdates: 0,
    cadenceRefreshes: 0,
    lastCadenceWindowEvents: 0,
    maxCadenceWindowEvents: 0,
  };
}

function createPublicRunSessionId() {
  const random = globalThis.crypto?.randomUUID?.()
    || Math.random().toString(36).slice(2, 12);
  return `session-flow-v3-${Date.now().toString(36)}-${random}`;
}

function createPublicFlowSeed() {
  const stamp = Date.now().toString(36);
  try {
    const values = new Uint32Array(2);
    globalThis.crypto?.getRandomValues?.(values);
    if (values[0] || values[1]) {
      return `flow-v3-${stamp}-${values[0].toString(36)}${values[1].toString(36)}`;
    }
  } catch {
    // Date + random fallback keeps rerolls fresh on older browsers.
  }
  return `flow-v3-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
}

function updatePublicFlowUrl({ theme = resolvedRunPlan?.theme || "mixed", newSeed = true } = {}) {
  const normalizedTheme = normalizeFlowV3Theme(theme);
  const url = new URL(globalThis.location.href);
  url.searchParams.set("mode", "flow");
  url.searchParams.set("flowRelease", "1");
  url.searchParams.set("flowRun", "1");
  url.searchParams.set("flowTheme", normalizedTheme);
  savePreferredFlowTheme(normalizedTheme);
  if (newSeed || !url.searchParams.get("flowSeed")) url.searchParams.set("flowSeed", createPublicFlowSeed());
  globalThis.history?.replaceState?.(null, "", url.href);
  refreshFlowPlanFromLocation(url);
  return resolvedRunPlan;
}

function formatRunDuration(ms) {
  const totalSeconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setTextIfChanged(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function preserveReturnSurface() {
  const app = root();
  if (!app) return false;
  storedReturnNodes = [...app.childNodes];
  return storedReturnNodes.length > 0;
}

function clearCadenceRefresh() {
  if (cadenceRefreshTimer != null) globalThis.clearTimeout?.(cadenceRefreshTimer);
  cadenceRefreshTimer = null;
}

function clearMicroResultTimer() {
  if (microResultTimer != null) globalThis.clearTimeout?.(microResultTimer);
  microResultTimer = null;
}

function ensurePublicFlowSessionV4() {
  if (!flowSessionV4) {
    flowSessionV4 = createFlowSessionV4({
      startedAt: Date.now(),
      personalBest: getFlowPersonalBestV3(),
    });
  }
  return flowSessionV4;
}

function resetPublicFlowSessionV4() {
  clearMicroResultTimer();
  flowSessionV4 = null;
  pendingMicroResultV4 = null;
}

function setPendingMicroResultV4(feedback) {
  if (!feedback) return;
  pendingMicroResultV4 = Object.freeze({
    ...feedback,
    expiresAt: Date.now() + (feedback.progressionReward ? 4400 : 2600),
  });
}

function getActiveMicroResultV4() {
  if (!pendingMicroResultV4) return null;
  if (pendingMicroResultV4.expiresAt <= Date.now()) {
    pendingMicroResultV4 = null;
    return null;
  }
  return pendingMicroResultV4;
}

function signedScore(value) {
  const score = Math.round(Number(value) || 0);
  if (score === 0) return "±0";
  return `${score > 0 ? "+" : "−"}${Math.abs(score).toLocaleString("en-US")}`;
}

function publicSessionStripMarkup() {
  if (!isPublicStreamRun()) return "";
  const summary = getFlowSessionLiveSummaryV4(ensurePublicFlowSessionV4());
  return `<section class="flow-v4-session-strip" data-flow-session-strip aria-label="Flow session totals">
    <div><span>Run</span><strong data-flow-session-run>${summary.currentRunNumber}</strong></div>
    <div><span>Session words</span><strong data-flow-session-words>${summary.totalWords.toLocaleString("en-US")}</strong></div>
    <div><span>Session score</span><strong data-flow-session-score>${summary.totalScore.toLocaleString("en-US")}</strong></div>
    <div><span>Session best</span><strong data-flow-session-best>${summary.bestScore.toLocaleString("en-US")}</strong></div>
    <div><span>Active time</span><strong data-flow-session-time>${formatFlowSessionDurationV4(summary.activeDurationMs)}</strong></div>
  </section>`;
}

function publicProgressionStripMarkup() {
  if (!isPublicStreamRun()) return "";
  const progression = loadFlowProgressionV4({ sourceRecords: loadFlowRecordsV3() });
  const summary = getFlowProgressionSummaryV4(progression);
  const next = summary.nextMilestone;
  const percent = next ? Math.max(0, Math.min(100, Math.round(next.ratio * 100))) : 100;
  const nextCopy = next
    ? `NEXT · ${next.name.toUpperCase()} · ${next.currentLabel} / ${next.targetLabel}`
    : "ALL MILESTONES COMPLETE";
  return `<section class="flow-v4-progression-strip" data-flow-progression data-flow-reward-tier="${escapeHtml(summary.tier.id)}" aria-label="Flow long-term progression">
    <div class="flow-v4-progression-title">
      <span>Flow title</span>
      <strong data-flow-progression-title>${escapeHtml(summary.tier.name)}</strong>
    </div>
    <div class="flow-v4-progression-track">
      <div class="flow-v4-progression-heading">
        <span>Milestones</span>
        <strong data-flow-progression-count>${summary.earnedCount} / ${summary.totalMilestones}</strong>
      </div>
      <div class="flow-v4-progression-bar" role="progressbar" aria-label="${escapeHtml(next?.name || "Flow milestones")}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
        <span style="width:${percent}%"></span>
      </div>
      <small data-flow-progression-next>${escapeHtml(nextCopy)}</small>
    </div>
  </section>`;
}

function progressionRewardFromUpdate(update) {
  if (!update?.newlyEarned?.length) return null;
  const names = update.newlyEarned.map((milestone) => milestone.name);
  return Object.freeze({
    count: names.length,
    primaryName: names[0],
    extraCount: Math.max(0, names.length - 1),
    tierUnlocked: update.tierUnlocked === true,
    tierName: update.rewardTier?.name || null,
  });
}

function microResultSecondaryCopy(feedback) {
  const base = feedback.isPersonalBest && feedback.personalBestDelta != null
    ? `PB ${signedScore(feedback.personalBestDelta)}`
    : feedback.isPersonalBest
      ? "FIRST PB"
      : feedback.scoreDelta > 0
        ? `MOMENTUM ${signedScore(feedback.scoreDelta)}${feedback.momentumStreak > 1 ? ` · ${feedback.momentumStreak} UP` : ""}`
        : `SESSION ${feedback.runNumber}`;
  if (Number.isInteger(feedback.globalRank) && feedback.globalRank > 0) {
    return `${base} · GLOBAL #${feedback.globalRank}`;
  }
  if (["submitted", "already-submitted"].includes(feedback.submissionStatus)) {
    return `${base} · SCORE SUBMITTED`;
  }
  if (feedback.submissionStatus === "retry-saved") {
    return `${base} · GLOBAL RETRY SAVED`;
  }
  return base;
}

function publicMicroResultMarkup() {
  const feedback = getActiveMicroResultV4();
  if (!feedback || !isPublicStreamRun()) return "";
  const secondary = microResultSecondaryCopy(feedback);
  const reward = feedback.progressionReward;
  const rewardMarkup = reward
    ? `<div class="flow-v4-milestone-reward" data-flow-milestone-reward>
        <span>${reward.count > 1 ? "MILESTONES" : "MILESTONE"} UNLOCKED</span>
        <strong>${escapeHtml(reward.primaryName)}${reward.extraCount ? ` +${reward.extraCount}` : ""}</strong>
        ${reward.tierUnlocked && reward.tierName ? `<em>TITLE · ${escapeHtml(reward.tierName)}</em>` : ""}
      </div>`
    : "";
  return `<aside class="flow-v4-micro-result is-${feedback.tone}${reward ? " has-reward" : ""}" data-flow-micro-result data-flow-feedback-id="${escapeHtml(feedback.id)}" role="status" aria-live="polite">
    <div class="flow-v4-micro-result-title"><strong>${escapeHtml(feedback.title)}</strong><span data-flow-micro-secondary>${escapeHtml(secondary)}</span></div>
    <div class="flow-v4-micro-result-score">${feedback.score.toLocaleString("en-US")} <small>PTS</small></div>
    <div class="flow-v4-micro-result-metrics">
      <span>${feedback.wpm.toFixed(1)} WPM</span>
      <span>${feedback.accuracy.toFixed(1)}%</span>
      <span>${feedback.words.toLocaleString("en-US")} WORDS</span>
    </div>
    ${rewardMarkup}
  </aside>`;
}

function scheduleMicroResultDismiss(app) {
  clearMicroResultTimer();
  const feedback = getActiveMicroResultV4();
  const toast = app?.querySelector?.("[data-flow-micro-result]");
  if (!feedback || !toast) return;
  const remaining = Math.max(0, feedback.expiresAt - Date.now());
  microResultTimer = globalThis.setTimeout?.(() => {
    microResultTimer = null;
    const current = app.querySelector?.("[data-flow-micro-result]");
    if (current?.dataset?.flowFeedbackId === feedback.id) {
      current.classList.add("is-leaving");
      globalThis.setTimeout?.(() => current.remove(), 180);
    }
    if (pendingMicroResultV4?.id === feedback.id) pendingMicroResultV4 = null;
  }, remaining) ?? null;
}

function syncMicroResultSubmissionV4(sessionId, submissionState) {
  if (!pendingMicroResultV4 || pendingMicroResultV4.id !== sessionId) return;
  const status = String(submissionState?.status || "");
  const rank = Number(submissionState?.rank);
  const successful = status === "submitted" || status === "already-submitted";
  const retrySaved = ["offline", "error"].includes(status) && submissionState?.retryPersisted === true;
  if (!successful && !retrySaved) return;

  pendingMicroResultV4 = Object.freeze({
    ...pendingMicroResultV4,
    globalRank: successful && Number.isSafeInteger(rank) && rank > 0 ? rank : null,
    submissionStatus: retrySaved ? "retry-saved" : status,
    expiresAt: Math.max(pendingMicroResultV4.expiresAt, Date.now() + 2200),
  });

  const app = root();
  const toast = app?.querySelector?.("[data-flow-micro-result]");
  if (toast?.dataset?.flowFeedbackId === sessionId) {
    setTextIfChanged(
      toast.querySelector("[data-flow-micro-secondary]"),
      microResultSecondaryCopy(pendingMicroResultV4),
    );
    scheduleMicroResultDismiss(app);
  }
}

function resetVisibilityPause() {
  visibilityPauseStartedAt = null;
  visibilityPausedRun = null;
}

function beginVisibilityPause(at = now()) {
  if (
    !active
    || view !== "run"
    || !run
    || run.phase !== FLOW_PHASES.RUNNING
    || visibilityPauseStartedAt != null
  ) return false;
  visibilityPauseStartedAt = at;
  visibilityPausedRun = run;
  clearCadenceRefresh();
  return true;
}

function endVisibilityPause(at = now()) {
  if (visibilityPauseStartedAt == null) return false;
  const startAt = visibilityPauseStartedAt;
  const pausedRun = visibilityPausedRun;
  resetVisibilityPause();
  if (pausedRun !== run || !pausedRun || !Number.isFinite(at) || at <= startAt) return false;
  pausedRun.pauses ||= [];
  pausedRun.pauses.push(Object.freeze({
    reason: "visibility-hidden",
    startAt,
    endAt: at,
  }));
  return true;
}

function handleFlowVisibilityChange() {
  if (document.hidden === true) beginVisibilityPause();
  else endVisibilityPause();
}

function resetMountedCharacterNodes() {
  mountedCharacterNodes = new Map();
  mountedRunHud = null;
}

function restoreReturnSurface() {
  const app = root();
  if (!app) return;
  clearCadenceRefresh();
  clearMicroResultTimer();
  resetMountedCharacterNodes();
  dismissed = true;
  active = false;
  view = "idle";
  run = null;
  publicRunSessionId = null;
  lastPublicResult = null;
  lastPublicRecordState = null;
  resetPublicFlowSessionV4();
  activeSegmentIndex = 0;
  chapterPauseStartedAt = null;
  resetVisibilityPause();
  if (storedReturnNodes.length) app.replaceChildren(...storedReturnNodes);
  storedReturnNodes = [];
}

function currentSegment() {
  return resolvedRunPlan?.segments?.[activeSegmentIndex] || null;
}

function currentChapter() {
  const segment = currentSegment();
  return segment ? resolvedRunPlan.chapters[segment.chapterIndex] : null;
}

function isPublicStreamRun() {
  return publicFlowRequested
    && resolvedRunPlan?.gameplayVersion === 3
    && resolvedRunPlan?.structure === "continuous-stream";
}

function isPublicLongformRun() {
  return publicFlowRequested
    && (
      (resolvedRunPlan?.gameplayVersion === 2 && resolvedRunPlan?.structure === "continuous-longform")
      || isPublicStreamRun()
    );
}

function publicLongformMarkup() {
  if (!run || !isPublicLongformRun()) return "";
  if (isPublicStreamRun()) {
    return resolvedRunPlan.segments.slice(activeSegmentIndex, activeSegmentIndex + 3).map((segment) => {
      const characters = [];
      for (let index = segment.startIndex; index <= segment.endIndex; index += 1) {
        const character = flowCharacterAt(index);
        if (character) characters.push(charMarkup(character));
      }
      if (segment.separatorIndex != null) {
        const separator = flowCharacterAt(segment.separatorIndex);
        if (separator) characters.push(charMarkup(separator, { paragraphBreak: true }));
      }
      return `<p class="flow-longform-paragraph" data-flow-paragraph="${segment.index}">${characters.join("")}</p>`;
    }).join("");
  }
  const documents = resolvedRunPlan.documents || [];
  return documents.map((document, documentIndex) => {
    const segments = resolvedRunPlan.segments.filter((segment) => segment.documentIndex === documentIndex);
    const paragraphs = segments.map((segment) => {
      const characters = [];
      for (let index = segment.startIndex; index <= segment.endIndex; index += 1) {
        const character = flowCharacterAt(index);
        if (character) characters.push(charMarkup(character));
      }
      if (segment.separatorIndex != null) {
        const separator = flowCharacterAt(segment.separatorIndex);
        if (separator) characters.push(charMarkup(separator, { paragraphBreak: true }));
      }
      return `<p class="flow-longform-paragraph" data-flow-paragraph="${segment.index}">${characters.join("")}</p>`;
    }).join("");
    const label = documents.length > 1
      ? `<div class="flow-longform-document-label"><span>TEXT ${documentIndex + 1} / ${documents.length}</span><strong>${escapeHtml(document.title)}</strong></div>`
      : "";
    return `<section class="flow-longform-document" data-flow-document="${documentIndex}">${label}${paragraphs}</section>`;
  }).join("");
}

function syncPublicSegmentIndex() {
  if (!run || !isPublicLongformRun()) return;
  while (
    activeSegmentIndex < resolvedRunPlan.segments.length - 1
    && run.currentIndex > (resolvedRunPlan.segments[activeSegmentIndex]?.separatorIndex
      ?? resolvedRunPlan.segments[activeSegmentIndex]?.endIndex
      ?? Infinity)
  ) {
    activeSegmentIndex += 1;
  }
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

function renderRunPlanReady(app) {
  const plan = resolvedRunPlan;
  const repeatNote = plan.repeatedPassageCount > 0
    ? `${plan.repeatedPassageCount} passage repeat${plan.repeatedPassageCount === 1 ? "" : "s"} required by the current seed catalog.`
    : "No passage repeats in this run.";
  app.innerHTML = `
    <section class="screen flow-phase1-screen flow-ready-screen" data-flow-view="ready">
      <main class="flow-phase1-shell">
        <button type="button" class="screen-back-button" data-flow-action="back">BACK</button>
        <div class="flow-phase1-kicker">Run structure · Phase 5 developer route</div>
        <h1>FLOW</h1>
        <p class="flow-phase1-lead">A complete Flow run now escalates through chapters instead of ending after one passage. Flow, Momentum, score, and Cadence continue across the entire session.</p>
        <div class="flow-phase1-brief" aria-label="Phase 5 run details">
          <span><strong>~${plan.targetMinutes} min</strong> ${escapeHtml(plan.sessionLength)} run</span>
          <span><strong>${plan.chapterCount}</strong> chapters</span>
          <span><strong>${plan.passageCount}</strong> passages</span>
          <span><strong>${plan.wordCount}</strong> words</span>
          <span><strong>${escapeHtml(plan.difficulty)}</strong> ceiling</span>
        </div>
        <p class="flow-phase1-note" data-flow-run-id>${escapeHtml(plan.id)}</p>
        <button type="button" class="ui-button ui-button--primary flow-phase1-start" data-flow-action="start">START FLOW</button>
        <p class="flow-phase1-note">Category focus: ${escapeHtml(plan.category)} · ${escapeHtml(repeatNote)} Chapter transitions are excluded from Cadence and WPM timing.</p>
      </main>
    </section>`;
}

function renderReady() {
  const app = root();
  if (!app) return;
  clearCadenceRefresh();
  resetMountedCharacterNodes();
  if (resolvedRunPlan) {
    renderRunPlanReady(app);
  } else {
    if (!resolvedSelection?.passage) {
      renderMissingSelection();
      return;
    }
    const { passage, source, category, difficulty, matchCount } = resolvedSelection;
    app.innerHTML = `
      <section class="screen flow-phase1-screen flow-ready-screen" data-flow-view="ready">
        <main class="flow-phase1-shell">
          <button type="button" class="screen-back-button" data-flow-action="back">BACK</button>
          <div class="flow-phase1-kicker">Natural typing analysis · Phase 4 developer route</div>
          <h1>FLOW</h1>
          <p class="flow-phase1-lead">Maintain quality through complete text. Phase 4 measures typing rhythm relative to your own baseline, separating pauses, bursts, hesitation patterns, and correction cost.</p>
          <div class="flow-phase1-brief" aria-label="Phase 4 session details">
            <span><strong>${passage.characters ?? passage.text.length}</strong> characters</span>
            <span><strong>${escapeHtml(category)}</strong> category</span>
            <span><strong>${escapeHtml(difficulty)}</strong> difficulty</span>
            <span><strong>${matchCount}</strong> matching passage${matchCount === 1 ? "" : "s"}</span>
          </div>
          <p class="flow-phase1-note" data-flow-passage-id>${escapeHtml(passage.id)}</p>
          <button type="button" class="ui-button ui-button--primary flow-phase1-start" data-flow-action="start">START FLOW</button>
          <p class="flow-phase1-note">Source: ${escapeHtml(source)}. Cadence remains independent of Flow Score.</p>
        </main>
      </section>`;
  }
  app.querySelector('[data-flow-action="back"]')?.addEventListener("click", restoreReturnSurface);
  app.querySelector('[data-flow-action="start"]')?.addEventListener("click", startRun);
  app.querySelector('[data-flow-action="start"]')?.focus?.({ preventScroll: true });
}

function flowCharacterAt(index) {
  if (!run?.passage || index < 0 || index >= run.passage.length) return null;
  const expected = run.passage[index];
  const typed = run.typedCharacters[index];
  return {
    index,
    expected,
    actual: typed?.actual ?? null,
    status: typed ? (typed.correct ? "correct" : "incorrect") : "pending",
    current: index === run.currentIndex && run.phase !== FLOW_PHASES.COMPLETE,
  };
}

function charMarkup(character, { paragraphBreak = false } = {}) {
  const shown = character.actual ?? character.expected;
  const classes = ["flow-char", `flow-char--${character.status}`];
  if (character.current) classes.push("flow-char--current");
  const paragraphBreakAttribute = paragraphBreak ? ' data-flow-paragraph-break="true"' : "";
  return `<span class="${classes.join(" ")}" data-flow-char="${character.index}" data-status="${character.status}"${paragraphBreakAttribute} aria-hidden="true">${escapeHtml(shown)}</span>`;
}

function visibleCharacterView() {
  if (!run?.passage) return [];
  const segment = currentSegment();
  const startIndex = segment?.startIndex ?? 0;
  const endIndex = segment?.endIndex ?? (run.passage.length - 1);
  const characters = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const character = flowCharacterAt(index);
    if (character) characters.push(character);
  }
  return characters;
}

function rebuildMountedCharacterNodes(app) {
  mountedCharacterNodes = new Map();
  for (const node of app.querySelectorAll("[data-flow-char]")) {
    const index = Number(node.dataset.flowChar);
    if (Number.isInteger(index)) mountedCharacterNodes.set(index, node);
  }
}

function updateCharacterNode(index) {
  const node = mountedCharacterNodes.get(index);
  const character = flowCharacterAt(index);
  if (!node || !character) return;
  const shown = character.actual ?? character.expected;
  const className = `flow-char flow-char--${character.status}${character.current ? " flow-char--current" : ""}`;
  let changed = false;
  if (node.textContent !== shown) {
    node.textContent = shown;
    changed = true;
  }
  if (node.dataset.status !== character.status) {
    node.dataset.status = character.status;
    changed = true;
  }
  if (node.className !== className) {
    node.className = className;
    changed = true;
  }
  if (changed) performanceStats.characterNodeUpdates += 1;
}

function updateCharacterRange(startIndex, endIndex) {
  if (!run?.passage) return;
  const low = Math.max(0, Math.min(startIndex, endIndex));
  const high = Math.min(run.passage.length - 1, Math.max(startIndex, endIndex));
  for (let index = low; index <= high; index += 1) updateCharacterNode(index);
}

function runHeaderLabel() {
  if (!resolvedRunPlan) return `FLOW · ${resolvedSelection?.passage?.id || "passage"}`;
  if (isPublicLongformRun()) {
    return `FLOW · ${resolvedRunPlan.sessionLength.toUpperCase()} · ${resolvedRunPlan.wordCount} WORDS`;
  }
  const segment = currentSegment();
  const chapter = currentChapter();
  return `CHAPTER ${segment.chapterIndex + 1}/${resolvedRunPlan.chapterCount} · ${chapter.title.toUpperCase()} · ${segment.passageIndex + 1}/${chapter.passages.length}`;
}

function publicStreamIdentityMarkup() {
  if (!isPublicStreamRun()) return "";
  const identity = getFlowStreamIdentity(resolvedRunPlan, activeSegmentIndex);
  const sourceMeta = [
    identity.sourceThemeLabel,
    identity.difficulty,
    identity.wordCount ? `${identity.wordCount.toLocaleString("en-US")} words` : null,
  ].filter(Boolean).join(" · ");
  return `<div class="flow-v5-brand" data-flow-identity>
      <strong><i aria-hidden="true"></i>${escapeHtml(identity.modeLabel)}</strong>
      <span>${escapeHtml(identity.modeDescriptor)}</span>
    </div>
    <div class="flow-v5-source" data-flow-source>
      <span data-flow-source-position>${escapeHtml(identity.sourcePosition)}</span>
      <strong data-flow-source-title title="${escapeHtml(identity.sourceTitle)}">${escapeHtml(identity.sourceTitle)}</strong>
      <small data-flow-source-meta>${escapeHtml(sourceMeta)}</small>
    </div>`;
}

function publicStreamToolsMarkup() {
  if (!isPublicStreamRun()) return "";
  return `<div class="flow-v3-run-tools flow-v5-run-tools">
    <label><span>Text mix</span>
      <select data-flow-theme-select aria-label="Flow text mix">
        ${FLOW_V3_THEME_IDS.map((theme) => `<option value="${theme}"${theme === resolvedRunPlan.theme ? " selected" : ""}>${escapeHtml(formatFlowThemeLabel(theme))}</option>`).join("")}
      </select>
    </label>
    <span class="flow-v3-tab-hint">TAB · NEXT TEXT</span>
  </div>`;
}

function visiblePassageText() {
  return currentSegment()?.text || run?.passage || "";
}

function currentAccuracyPercent() {
  const correct = Number(run?.correctKeystrokes) || 0;
  const incorrect = Number(run?.incorrectKeystrokes) || 0;
  const total = correct + incorrect;
  return total <= 0 ? 100 : (correct / total) * 100;
}

function liveGameplaySnapshot() {
  if (!run) return null;
  return {
    score: Number(run.score) || 0,
    flowValue: Number(run.flowValue) || 0,
    momentum: Number(run.momentum) || 1,
    accuracyPercent: currentAccuracyPercent(),
  };
}

function flowBand(value) {
  if (value >= 85) return "high";
  if (value <= 35) return "low";
  return "mid";
}

function mountRunHud(app) {
  mountedRunHud = Object.freeze({
    progress: app.querySelector("[data-flow-progress]"),
    corrected: app.querySelector("[data-flow-corrected]"),
    unresolved: app.querySelector("[data-flow-unresolved]"),
    score: app.querySelector("[data-flow-score]"),
    flowValue: app.querySelector("[data-flow-value]"),
    meter: app.querySelector("[data-flow-meter]"),
    meterFill: app.querySelector("[data-flow-meter-fill]"),
    momentum: app.querySelector("[data-flow-momentum]"),
    accuracy: app.querySelector("[data-flow-accuracy]"),
    cadence: app.querySelector("[data-flow-cadence]"),
    cadenceLabel: app.querySelector("[data-flow-cadence-label]"),
    finalWpm: app.querySelector("[data-flow-final-wpm]"),
    pauses: app.querySelector("[data-flow-pauses]"),
    sessionRun: app.querySelector("[data-flow-session-run]"),
    sessionWords: app.querySelector("[data-flow-session-words]"),
    sessionScore: app.querySelector("[data-flow-session-score]"),
    sessionBest: app.querySelector("[data-flow-session-best]"),
    sessionTime: app.querySelector("[data-flow-session-time]"),
  });
  return mountedRunHud;
}

function updatePublicSessionHud(hud, {
  score = 0,
  words = 0,
  correctCharacters = 0,
  durationMs = 0,
} = {}) {
  if (!hud || !isPublicStreamRun()) return;
  const summary = getFlowSessionLiveSummaryV4(ensurePublicFlowSessionV4(), {
    score,
    words,
    correctCharacters,
    durationMs,
  });
  setTextIfChanged(hud.sessionRun, String(summary.currentRunNumber));
  setTextIfChanged(hud.sessionWords, summary.totalWords.toLocaleString("en-US"));
  setTextIfChanged(hud.sessionScore, summary.totalScore.toLocaleString("en-US"));
  setTextIfChanged(hud.sessionBest, summary.bestScore.toLocaleString("en-US"));
  setTextIfChanged(hud.sessionTime, formatFlowSessionDurationV4(summary.activeDurationMs));
}

function updateGameplayHud(hud, gameplay, cadence) {
  if (!hud) return;
  if (gameplay) {
    setTextIfChanged(hud.score, gameplay.score.toLocaleString("en-US"));
    const roundedFlow = String(Math.round(gameplay.flowValue));
    setTextIfChanged(hud.flowValue, roundedFlow);
    if (hud.meter?.getAttribute("aria-valuenow") !== roundedFlow) hud.meter?.setAttribute("aria-valuenow", roundedFlow);
    if (hud.meter && hud.meter.dataset.flowBand !== flowBand(gameplay.flowValue)) {
      hud.meter.dataset.flowBand = flowBand(gameplay.flowValue);
    }
    const width = `${gameplay.flowValue}%`;
    if (hud.meterFill && hud.meterFill.style.width !== width) hud.meterFill.style.width = width;
    setTextIfChanged(hud.momentum, `×${gameplay.momentum.toFixed(1)}`);
    setTextIfChanged(hud.accuracy, `${gameplay.accuracyPercent.toFixed(1)}%`);
  }
  if (cadence) {
    setTextIfChanged(hud.cadence, cadence.cadenceScore == null ? "—" : String(cadence.cadenceScore));
    setTextIfChanged(hud.cadenceLabel, cadence.cadenceLabel);
    setTextIfChanged(hud.finalWpm, cadence.finalWpm.toFixed(1));
    setTextIfChanged(hud.pauses, String(cadence.pauseCount));
  }
}

function refreshCadenceHud() {
  cadenceRefreshTimer = null;
  if (!run || view !== "run") return;
  if (!mountedRunHud) return;
  lastCadenceRefreshAt = now();
  performanceStats.cadenceRefreshes += 1;
  const cadence = analyzeFlowCadenceLive(run);
  const windowEvents = Math.max(0, Number(cadence?.liveWindowEventCount) || 0);
  performanceStats.lastCadenceWindowEvents = windowEvents;
  performanceStats.maxCadenceWindowEvents = Math.max(
    performanceStats.maxCadenceWindowEvents,
    windowEvents,
  );
  if (isPublicLongformRun()) {
    const score = isPublicStreamRun()
      ? calculateFlowScoreV3({
        correctCharacters: Math.max(0, (Number(run.currentIndex) || 0) - (Number(run.uncorrectedErrors) || 0)),
        wpm: cadence.finalWpm,
        accuracy: currentAccuracyPercent(),
        consistency: cadence.cadenceScore ?? 0,
      })
      : calculateFlowScoreV2({
        wpm: cadence.finalWpm,
        accuracy: currentAccuracyPercent(),
        consistency: cadence.cadenceScore ?? 0,
      });
    setTextIfChanged(mountedRunHud.score, score.score.toLocaleString("en-US"));
    setTextIfChanged(mountedRunHud.finalWpm, cadence.finalWpm.toFixed(1));
    setTextIfChanged(mountedRunHud.accuracy, `${currentAccuracyPercent().toFixed(1)}%`);
    if (isPublicStreamRun()) {
      setTextIfChanged(mountedRunHud.progress, String(score.standardWords || 0));
      updatePublicSessionHud(mountedRunHud, {
        score: score.score,
        words: score.standardWords,
        correctCharacters: score.correctCharacters,
        durationMs: cadence.typingDurationMs,
      });
    }
    return;
  }
  updateGameplayHud(mountedRunHud, null, cadence);
}

function scheduleCadenceHud(immediate = false) {
  if (!run || view !== "run") return;
  if (immediate) {
    clearCadenceRefresh();
    refreshCadenceHud();
    return;
  }
  if (cadenceRefreshTimer != null) return;
  const elapsed = now() - lastCadenceRefreshAt;
  const delay = Math.max(0, LIVE_CADENCE_INTERVAL_MS - elapsed);
  cadenceRefreshTimer = globalThis.setTimeout?.(refreshCadenceHud, delay) ?? null;
}

function syncRunHud() {
  const hud = mountedRunHud;
  if (!hud) return;
  setTextIfChanged(
    hud.progress,
    isPublicStreamRun()
      ? String(Math.floor(Math.max(0, run.currentIndex - run.uncorrectedErrors) / 5))
      : isPublicLongformRun()
        ? `${Math.min(100, Math.round((run.currentIndex / Math.max(1, run.passage.length)) * 100))}%`
        : `${run.currentIndex} / ${run.passage.length}`,
  );
  setTextIfChanged(hud.corrected, String(run.correctedErrors));
  setTextIfChanged(hud.unresolved, String(run.uncorrectedErrors));
  if (isPublicLongformRun()) {
    setTextIfChanged(hud.accuracy, `${currentAccuracyPercent().toFixed(1)}%`);
  } else {
    updateGameplayHud(hud, liveGameplaySnapshot(), null);
  }
}

function renderRun() {
  const app = root();
  if (!app || !run) return;
  clearCadenceRefresh();
  view = "run";
  const chapter = currentChapter();
  const publicLongform = isPublicLongformRun();
  const hud = publicLongform
    ? `<section class="flow-gameplay-hud flow-game-v2-hud"${isPublicStreamRun() ? ' data-flow-hud-v5="true"' : ""} aria-label="Flow run status">
        <div class="flow-v5-hud-score"><span>Score</span><strong data-flow-score>0</strong>${isPublicStreamRun() ? "<small>LIVE RUN</small>" : ""}</div>
        <div><span>WPM</span><strong data-flow-final-wpm>0.0</strong>${isPublicStreamRun() ? "<small>PACE</small>" : ""}</div>
        <div><span>Accuracy</span><strong data-flow-accuracy>100.0%</strong>${isPublicStreamRun() ? "<small>PRECISION</small>" : ""}</div>
        <div><span>${isPublicStreamRun() ? "Words" : "Progress"}</span><strong data-flow-progress>${isPublicStreamRun() ? "0" : "0%"}</strong>${isPublicStreamRun() ? "<small>VOLUME</small>" : ""}</div>
      </section>`
    : `<section class="flow-gameplay-hud flow-cadence-hud" aria-label="Flow gameplay and cadence status">
        <div class="flow-score-block"><span>Score</span><strong data-flow-score>0</strong></div>
        <div class="flow-meter-block">
          <div class="flow-meter-label"><span>Flow</span><strong data-flow-value>60</strong></div>
          <div class="flow-meter" role="progressbar" aria-label="Flow meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="60" data-flow-meter>
            <span data-flow-meter-fill style="width:60%"></span>
          </div>
        </div>
        <div class="flow-momentum-block"><span>Momentum</span><strong data-flow-momentum>×1.0</strong></div>
        <div class="flow-cadence-block"><span>Cadence</span><strong data-flow-cadence>—</strong><small data-flow-cadence-label>Warming up</small></div>
      </section>`;
  const passage = publicLongform
    ? `<div class="flow-passage flow-longform-passage" data-flow-passage data-flow-longform="true" aria-label="Longform typing text">${publicLongformMarkup()}</div>`
    : `<div class="flow-passage" data-flow-passage aria-label="${escapeHtml(visiblePassageText())}">${visibleCharacterView().map(charMarkup).join("")}</div>`;
  app.innerHTML = `
    <section class="screen flow-phase1-screen flow-run-screen" data-flow-view="run"${publicLongform ? ' data-flow-longform-v2="true"' : ""}>
      <main class="flow-run-shell">
        <header class="flow-run-header${isPublicStreamRun() ? " flow-v5-run-header" : ""}">
          <button type="button" class="screen-back-button" data-flow-action="back">BACK</button>
          ${isPublicStreamRun()
            ? publicStreamIdentityMarkup()
            : `<div><span>${escapeHtml(runHeaderLabel())}</span>${publicLongform ? "" : `<strong data-flow-progress>0 / ${run.passage.length}</strong>`}</div>`}
          ${publicStreamToolsMarkup()}
        </header>
        ${!publicLongform && chapter ? `<div class="flow-chapter-strip" data-flow-chapter><span>${escapeHtml(chapter.title)}</span><strong>${escapeHtml(chapter.difficulty)}</strong></div>` : ""}
        ${hud}
        ${isPublicStreamRun() ? `<div class="flow-v5-session-meta">${publicSessionStripMarkup()}${publicProgressionStripMarkup()}</div>` : ""}
        ${publicMicroResultMarkup()}
        <div class="flow-run-copy">
          <div class="flow-passages" aria-label="Typing passage">${passage}</div>
        </div>
        ${publicLongform ? "" : `<div class="flow-run-diagnostics" aria-live="polite">
          <span>WPM <strong data-flow-final-wpm>0.0</strong></span>
          <span>Accuracy <strong data-flow-accuracy>100.0%</strong></span>
          <span>Pauses <strong data-flow-pauses>0</strong></span>
          <span>Corrected <strong data-flow-corrected>0</strong></span>
          <span>Unresolved <strong data-flow-unresolved>0</strong></span>
        </div>`}
        <textarea class="flow-input-capture" data-flow-input aria-label="Flow typing input" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>
      </main>
    </section>`;
  rebuildMountedCharacterNodes(app);
  mountRunHud(app);
  app.querySelector('[data-flow-action="back"]')?.addEventListener("click", () => {
    exitFlowToReturnSurface("exit");
  });
  const input = app.querySelector("[data-flow-input]");
  input?.addEventListener("beforeinput", handleBeforeInput);
  input?.addEventListener("input", () => { input.value = ""; });
  app.querySelector("[data-flow-passage]")?.addEventListener("pointerdown", () => input?.focus?.({ preventScroll: true }));
  app.querySelector("[data-flow-theme-select]")?.addEventListener("change", (event) => {
    if (!isPublicStreamRun()) return;
    const theme = normalizeFlowV3Theme(event.target?.value);
    finalizePublicStreamRun("theme-change");
    updatePublicFlowUrl({ theme, newSeed: true });
    startRun();
  });
  input?.focus?.({ preventScroll: true });
  syncRunHud();
  scheduleCadenceHud(true);
  scheduleMicroResultDismiss(app);
}

function startRun() {
  clearCadenceRefresh();
  resetVisibilityPause();
  if (resolvedRunPlan) {
    run = createFlowTypingRun(resolvedRunPlan.fullText, {
      category: resolvedRunPlan.category,
      difficulty: resolvedRunPlan.difficulty,
      sessionLength: resolvedRunPlan.sessionLength,
    });
    run.passageId = resolvedRunPlan.id;
    run.cadenceExcludedAfterIndexes = [...resolvedRunPlan.cadenceExcludedAfterIndexes];
    run.pauses = [];
    activeSegmentIndex = 0;
  } else {
    const passage = resolvedSelection?.passage;
    if (!passage) return;
    run = createFlowTypingRun(passage.text, {
      category: passage.category,
      difficulty: passage.difficulty,
      sessionLength: "quick",
    });
    run.passageId = passage.id;
  }
  if (isPublicLongformRun()) {
    if (isPublicStreamRun()) ensurePublicFlowSessionV4();
    if (!isPublicStreamRun()) {
      clearSubmissionState();
      lastPublicResult = null;
      lastPublicRecordState = null;
    }
    publicRunSessionId = createPublicRunSessionId();
  } else {
    publicRunSessionId = null;
    lastPublicResult = null;
    lastPublicRecordState = null;
  }
  performanceStats = createPerformanceStats();
  lastCadenceRefreshAt = -Infinity;
  chapterPauseStartedAt = null;
  active = true;
  view = "run";
  renderRun();
}

function renderChapterTransition(chapterIndex) {
  const app = root();
  if (!app || !resolvedRunPlan || !run) return;
  clearCadenceRefresh();
  resetMountedCharacterNodes();
  const chapter = resolvedRunPlan.chapters[chapterIndex];
  view = "chapter";
  chapterPauseStartedAt = now();
  const snapshot = getFlowTypingSnapshot(run);
  app.innerHTML = `
    <section class="screen flow-phase1-screen flow-chapter-screen" data-flow-view="chapter">
      <main class="flow-phase1-shell flow-chapter-transition">
        <div class="flow-phase1-kicker">Chapter ${chapterIndex + 1} / ${resolvedRunPlan.chapterCount}</div>
        <h1>${escapeHtml(chapter.title)}</h1>
        <p class="flow-phase1-lead">${escapeHtml(chapter.description)}</p>
        <div class="flow-phase1-brief">
          <span><strong>${escapeHtml(chapter.difficulty)}</strong> complexity</span>
          <span><strong>${chapter.passages.length}</strong> passages</span>
          <span><strong>${chapter.wordCount}</strong> words</span>
          <span><strong>${snapshot.gameplay.score.toLocaleString("en-US")}</strong> score</span>
          <span><strong>${snapshot.cadence.cadenceScore ?? "—"}</strong> cadence</span>
        </div>
        <button type="button" class="ui-button ui-button--primary" data-flow-action="continue-chapter">CONTINUE</button>
        <p class="flow-phase1-note">This transition time is excluded from Cadence and WPM analysis.</p>
      </main>
    </section>`;
  app.querySelector('[data-flow-action="continue-chapter"]')?.addEventListener("click", continueChapter);
  app.querySelector('[data-flow-action="continue-chapter"]')?.focus?.({ preventScroll: true });
}

function continueChapter() {
  if (!run || view !== "chapter") return;
  const endAt = now();
  if (chapterPauseStartedAt != null && endAt > chapterPauseStartedAt) {
    run.pauses.push(Object.freeze({
      reason: "chapter-transition",
      startAt: chapterPauseStartedAt,
      endAt,
    }));
  }
  chapterPauseStartedAt = null;
  renderRun();
}

function maybeAdvanceRunPlan() {
  if (!resolvedRunPlan || !run || run.phase === FLOW_PHASES.COMPLETE) return false;
  const segment = currentSegment();
  if (!segment || run.currentIndex <= segment.endIndex) return false;
  const nextIndex = activeSegmentIndex + 1;
  const next = resolvedRunPlan.segments[nextIndex];
  if (!next) return false;
  const chapterChanged = next.chapterIndex !== segment.chapterIndex;
  activeSegmentIndex = nextIndex;
  if (chapterChanged) renderChapterTransition(next.chapterIndex);
  else renderRun();
  return true;
}

function updateRunView(startIndex = run?.currentIndex ?? 0, endIndex = startIndex) {
  if (!run || view !== "run") return;
  if (run.phase === FLOW_PHASES.COMPLETE) {
    clearCadenceRefresh();
    if (isPublicStreamRun()) {
      finalizePublicStreamRun("complete");
      updatePublicFlowUrl({ newSeed: true });
      startRun();
    } else {
      renderComplete();
    }
    return;
  }
  if (isPublicLongformRun()) {
    const beforeSegment = activeSegmentIndex;
    syncPublicSegmentIndex();
    if (isPublicStreamRun() && activeSegmentIndex !== beforeSegment) {
      renderRun();
      return;
    }
  } else if (maybeAdvanceRunPlan()) return;

  if (!root()) return;
  updateCharacterRange(startIndex, endIndex);
  // Phase 8 exposes an optional compositor-aligned caret scheduler. Calling it
  // directly avoids observing the passage subtree on every typed character.
  globalThis.window?.wordstrikeFlowUxPhase8?.scheduleCaretVisibility?.();
  syncRunHud();
  scheduleCadenceHud();
}

function renderHesitationAnalysis(cadence) {
  const hotspots = cadence?.slowestHesitations || [];
  const rows = hotspots.length
    ? hotspots.map((item) => `<li><span>${escapeHtml(item.label)}</span><strong>+${item.deltaMs.toFixed(0)} ms</strong><small>${item.sampleCount} sample${item.sampleCount === 1 ? "" : "s"}</small></li>`).join("")
    : '<li><span>No positive hesitation hotspots detected.</span></li>';
  return `
    <section class="flow-natural-analysis" aria-label="Natural typing analysis">
      <div class="flow-analysis-heading"><span>Natural typing analysis</span><strong>${cadence?.cadenceLabel || "Warming up"}</strong></div>
      <ul>${rows}</ul>
      <p>Baseline key interval: ${cadence?.baselineIntervalMs == null ? "—" : `${cadence.baselineIntervalMs.toFixed(0)} ms`} · pauses use a relative threshold of ${cadence?.pauseThresholdMs == null ? "—" : `${cadence.pauseThresholdMs.toFixed(0)} ms`}.</p>
    </section>`;
}

function flowSubmissionMarkup(result, state = getSubmissionState()) {
  if (!result?.recordEligible) {
    return '<div class="flow-v2-global-status is-local">Global ranking requires a completed run with at least 90% accuracy.</div>';
  }
  if (state?.sessionId !== result.sessionId) {
    return '<div class="flow-v2-global-status">Checking global leaderboard eligibility...</div>';
  }
  if (state.status === "submitted" || state.status === "already-submitted") {
    const rank = state.rank ? ` · GLOBAL #${state.rank}` : "";
    return `<div class="flow-v2-global-status is-success"><strong>SCORE SUBMITTED${rank}</strong><button type="button" class="ui-button" data-flow-global-action="leaderboard">VIEW LEADERBOARD</button></div>`;
  }
  if (["submitting", "checking"].includes(state.status)) {
    return '<div class="flow-v2-global-status">Submitting eligible score...</div>';
  }
  if (state.status === "offline" || state.status === "error") {
    return `<div class="flow-v2-global-status"><span>${state.retryPersisted ? "Score saved for retry." : "Global submission unavailable."}</span><button type="button" class="ui-button" data-flow-global-action="retry">RETRY</button></div>`;
  }
  if (state.reason === "signed-out") {
    return '<div class="flow-v2-global-status"><span>Sign in to submit this score globally.</span><button type="button" class="ui-button" data-flow-global-action="sign-in">SIGN IN</button></div>';
  }
  if (state.reason === "username-required") {
    return '<div class="flow-v2-global-status"><span>Choose a public username to join the leaderboard.</span><button type="button" class="ui-button" data-flow-global-action="account">SET USERNAME</button></div>';
  }
  return '<div class="flow-v2-global-status">Global leaderboard ready.</div>';
}

function syncFlowSubmissionRegion() {
  if (!lastPublicResult || view !== "complete") return;
  const region = root()?.querySelector?.("[data-flow-global-submission]");
  if (!region) return;
  region.innerHTML = flowSubmissionMarkup(lastPublicResult);
}

function maybeSubmitPublicResult() {
  if (!lastPublicResult?.recordEligible) return;
  const auth = getAuthState();
  const profile = getLeaderboardProfileState();
  if (auth?.status === "signed-in" && auth.user?.id && ["idle", "loading"].includes(profile?.status)) {
    void initializeLeaderboardProfile(auth.user);
  }
  const state = refreshSubmissionEligibility(auth, profile);
  syncFlowSubmissionRegion();
  if (state.status !== "ready" || flowAutomaticSubmissionSessionId === lastPublicResult.sessionId) return;
  flowAutomaticSubmissionSessionId = lastPublicResult.sessionId;
  void submitCurrentResult().finally(syncFlowSubmissionRegion);
}

function preparePublicGlobalSubmission(result) {
  flowAutomaticSubmissionSessionId = null;
  prepareResultSubmission("flow", result, getAuthState(), getLeaderboardProfileState());
  maybeSubmitPublicResult();
}

function leaveFlowForAppEvent(name, detail = {}) {
  restoreReturnSurface();
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

function bindFlowSubmissionActions(app, result) {
  app.querySelector("[data-flow-global-submission]")?.addEventListener("click", (event) => {
    const action = event.target?.closest?.("[data-flow-global-action]")?.dataset?.flowGlobalAction;
    if (!action) return;
    event.preventDefault();
    if (action === "retry") {
      void retryCurrentSubmission().finally(syncFlowSubmissionRegion);
    } else if (action === "leaderboard") {
      leaveFlowForAppEvent("wordstrike:open-leaderboard", { boardKey: result.boardKey });
    } else if (action === "account") {
      leaveFlowForAppEvent("wordstrike:open-account-settings");
    } else if (action === "sign-in") {
      const intent = savePendingResultSubmission("flow", result);
      if (!intent) return;
      saveLeaderboardReturnState(leaderboardReturnStateForBoard(result.boardKey));
      void signInWithGoogle();
    }
  });
}

function ensurePublicResult(snapshot) {
  if (!isPublicLongformRun() || !snapshot || !publicRunSessionId) return null;
  if (lastPublicResult?.sessionId === publicRunSessionId) return lastPublicResult;
  const result = createFlowScoreV2Result({
    sessionId: publicRunSessionId,
    endedAt: Date.now(),
    snapshot,
    plan: resolvedRunPlan,
  });
  if (!result) return null;
  lastPublicRecordState = recordFlowResultV2(result);
  if (result.completed && resolvedRunPlan?.corpusVersion === 2) {
    recordFlowCorpusRun(resolvedRunPlan, { completedAt: result.endedAt });
  }
  lastPublicResult = result;
  preparePublicGlobalSubmission(result);
  return result;
}

function renderPublicComplete(app, snapshot) {
  const result = ensurePublicResult(snapshot);
  if (!result) return false;
  const recordState = lastPublicRecordState || {};
  const personalBest = recordState.personalBest;
  const pbCopy = recordState.isPersonalBest
    ? '<div class="flow-v2-pb-badge" data-flow-v2-pb="new">NEW PERSONAL BEST</div>'
    : personalBest
      ? `<div class="flow-v2-pb-reference">Personal best <strong>${personalBest.score.toLocaleString("en-US")}</strong></div>`
      : "";
  const eligibility = result.recordEligible
    ? ""
    : `<p class="flow-v2-record-note">Competitive personal bests require at least 90% accuracy.</p>`;
  app.innerHTML = `
    <section class="screen flow-phase1-screen flow-complete-screen" data-flow-view="complete" data-flow-score-v2="true">
      <main class="flow-phase1-shell flow-complete-shell flow-v2-results">
        <div class="flow-phase1-kicker">${escapeHtml(result.sessionLength.toUpperCase())} LONGFORM COMPLETE</div>
        <h1>FLOW COMPLETE</h1>
        ${pbCopy}
        <div class="flow-final-score flow-v2-final-score">
          <span>Score</span>
          <strong data-flow-final-score>${result.score.toLocaleString("en-US")}</strong>
        </div>
        <section class="flow-v2-result-metrics" aria-label="Flow results">
          <div><span>WPM</span><strong>${result.wpm.toFixed(1)}</strong></div>
          <div><span>Accuracy</span><strong>${result.accuracy.toFixed(1)}%</strong></div>
          <div><span>Consistency</span><strong>${result.consistency.toFixed(0)}</strong></div>
        </section>
        <div class="flow-v2-result-meta">
          <span>${result.wordsCompleted.toLocaleString("en-US")} words</span>
          <span>${formatRunDuration(result.activeDurationMs)}</span>
          <span>${escapeHtml(result.sessionLength)} run</span>
        </div>
        ${eligibility}
        <section class="flow-v2-global-submission" data-flow-global-submission aria-live="polite">
          ${flowSubmissionMarkup(result)}
        </section>
        <div class="flow-complete-actions">
          <button type="button" class="ui-button ui-button--primary" data-flow-action="restart">PLAY AGAIN</button>
          <button type="button" class="ui-button" data-flow-action="back">BACK</button>
        </div>
      </main>
    </section>`;
  app.querySelector('[data-flow-action="restart"]')?.addEventListener("click", startRun);
  app.querySelector('[data-flow-action="back"]')?.addEventListener("click", restoreReturnSurface);
  bindFlowSubmissionActions(app, result);
  app.querySelector('[data-flow-action="restart"]')?.focus?.({ preventScroll: true });
  return true;
}

function renderComplete() {
  const app = root();
  if (!app || !run) return;
  clearCadenceRefresh();
  resetMountedCharacterNodes();
  view = "complete";
  const snapshot = getFlowTypingSnapshot(run);
  if (isPublicLongformRun() && renderPublicComplete(app, snapshot)) return;
  const gameplay = snapshot.gameplay;
  const cadence = snapshot.cadence;
  const breakdown = gameplay.scoreBreakdown;
  const seconds = (cadence.typingDurationMs / 1000).toFixed(1);
  const cadenceScore = cadence.cadenceScore == null ? "—" : cadence.cadenceScore;
  const runMetrics = resolvedRunPlan
    ? isPublicLongformRun()
      ? `<span><strong>${resolvedRunPlan.wordCount}</strong> words</span><span><strong>${resolvedRunPlan.documentCount}</strong> text${resolvedRunPlan.documentCount === 1 ? "" : "s"}</span>`
      : `<span><strong>${resolvedRunPlan.chapterCount}</strong> chapters</span><span><strong>${resolvedRunPlan.passageCount}</strong> passages</span>`
    : "";
  app.innerHTML = `
    <section class="screen flow-phase1-screen flow-complete-screen" data-flow-view="complete">
      <main class="flow-phase1-shell flow-complete-shell">
        <div class="flow-phase1-kicker">${resolvedRunPlan ? "Chapter run complete" : "Cadence analysis complete"}</div>
        <h1>FLOW COMPLETE</h1>
        <div class="flow-final-score"><span>Flow Score</span><strong data-flow-final-score>${gameplay.score.toLocaleString("en-US")}</strong></div>
        <p class="flow-phase1-lead">${resolvedRunPlan ? "One continuous score, Flow state, Momentum curve, and Cadence profile now spans the complete chapter run." : "Flow Score rewards accuracy and sustained gameplay quality while Cadence remains independently reported."}</p>
        <div class="flow-phase1-brief flow-result-metrics">
          ${runMetrics}
          <span><strong>${cadenceScore}</strong> cadence</span>
          <span><strong>${cadence.finalWpm.toFixed(1)}</strong> final WPM</span>
          <span><strong>${cadence.rawWpm.toFixed(1)}</strong> raw WPM</span>
          <span><strong>${gameplay.accuracyPercent.toFixed(1)}%</strong> raw accuracy</span>
          <span><strong>${gameplay.averageFlow.toFixed(1)}</strong> average Flow</span>
          <span><strong>×${gameplay.averageMomentum.toFixed(2)}</strong> average Momentum</span>
          <span><strong>${cadence.pauseCount}</strong> relative pauses</span>
          <span><strong>${cadence.burstCount}</strong> burst intervals</span>
          <span><strong>${(cadence.correctionCost.totalMs / 1000).toFixed(2)}s</strong> correction cost</span>
          <span><strong>${seconds}s</strong> typing time</span>
        </div>
        ${renderHesitationAnalysis(cadence)}
        <div class="flow-score-breakdown" aria-label="Flow score breakdown">
          <span>${breakdown.characterBase.toLocaleString("en-US")} character points</span>
          <span>× ${breakdown.difficultyMultiplier.toFixed(2)} difficulty</span>
          <span>× ${breakdown.accuracyMultiplier.toFixed(3)} accuracy</span>
          <span>× ${breakdown.flowMultiplier.toFixed(3)} Flow</span>
          <span>× ${breakdown.averageMomentum.toFixed(3)} Momentum</span>
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

function submitPublicStreamBestInBackground(result, recordState) {
  if (!result?.recordEligible || !recordState?.isPersonalBest) return;
  const service = createLeaderboardSubmissionService();
  const prepared = service.prepareResultSubmission(
    "flow",
    result,
    getAuthState(),
    getLeaderboardProfileState(),
  );
  if (prepared.status !== "ready") return;
  void service.submitCurrentResult().then((state) => {
    syncMicroResultSubmissionV4(result.sessionId, state);
  });
}

function reachedPublicStreamDocumentIndex() {
  if (!isPublicStreamRun() || !run || !resolvedRunPlan?.documents?.length) return 0;
  let reachedDocumentIndex = 0;
  for (const segment of resolvedRunPlan.segments || []) {
    if (run.currentIndex > segment.startIndex) {
      reachedDocumentIndex = Math.max(reachedDocumentIndex, segment.documentIndex || 0);
    }
  }
  return Math.min(reachedDocumentIndex, resolvedRunPlan.documents.length - 1);
}

function publicProgressionPlan() {
  if (!resolvedRunPlan || resolvedRunPlan.corpusVersion !== 2 || !resolvedRunPlan.documents?.length) {
    return resolvedRunPlan;
  }
  const reachedDocumentIndex = reachedPublicStreamDocumentIndex();
  const reachedThemes = [...new Set(
    resolvedRunPlan.documents
      .slice(0, reachedDocumentIndex + 1)
      .map((document) => document.theme)
      .filter(Boolean),
  )];
  return {
    ...resolvedRunPlan,
    corpusThemes: reachedThemes,
  };
}

function finalizePublicStreamRun(endedReason = "reset") {
  if (!isPublicStreamRun() || !run || !publicRunSessionId || run.currentIndex <= 0) return null;
  const result = createFlowScoreV3Result({
    sessionId: publicRunSessionId,
    endedAt: Date.now(),
    endedReason,
    snapshot: getFlowTypingSnapshot(run),
    plan: resolvedRunPlan,
  });
  if (!result) return null;
  const progressionUpdate = recordFlowProgressionV4(result, {
    plan: publicProgressionPlan(),
    sourceRecords: loadFlowRecordsV3(),
  });
  const recordState = recordFlowResultV3(result);
  const sessionUpdate = recordFlowSessionRunV4(
    ensurePublicFlowSessionV4(),
    result,
    {
      isPersonalBest: recordState.isPersonalBest,
      previousPersonalBest: recordState.previousBest,
    },
  );
  flowSessionV4 = sessionUpdate.session;
  if (endedReason !== "exit" && sessionUpdate.feedback) {
    setPendingMicroResultV4({
      ...sessionUpdate.feedback,
      progressionReward: progressionRewardFromUpdate(progressionUpdate),
    });
  }
  lastPublicResult = result;
  lastPublicRecordState = recordState;
  if (result.completed && resolvedRunPlan?.corpusVersion === 2) {
    const reachedDocumentIndex = reachedPublicStreamDocumentIndex();
    recordFlowCorpusRun({
      ...resolvedRunPlan,
      documents: resolvedRunPlan.documents.slice(0, reachedDocumentIndex + 1),
    }, { completedAt: result.endedAt });
  }
  submitPublicStreamBestInBackground(result, recordState);
  return result;
}

function rememberDisplayedPublicStreamText() {
  if (!isPublicStreamRun() || run?.currentIndex > 0 || !resolvedRunPlan?.documents?.length) return;
  recordFlowCorpusRun({
    ...resolvedRunPlan,
    documents: resolvedRunPlan.documents.slice(0, 1),
  }, { completedAt: Date.now() });
}

function rerollPublicStream() {
  rememberDisplayedPublicStreamText();
  finalizePublicStreamRun("reset");
  updatePublicFlowUrl({ newSeed: true });
  startRun();
  return true;
}

function deleteBackward() {
  if (!run) return;
  const beforeIndex = run.currentIndex;
  if (!backspaceFlowText(run, now())) return;
  updateRunView(run.currentIndex, beforeIndex);
}

function insertText(value) {
  if (!run || typeof value !== "string" || !value.length) return;
  const beforeIndex = run.currentIndex;
  if (!insertFlowText(run, value, now())) return;
  updateRunView(Math.max(0, beforeIndex - 1), run.currentIndex);
}

function handleBeforeInput(event) {
  if (!active || view !== "run" || !run) return;
  if (event.inputType === "deleteContentBackward") {
    event.preventDefault();
    deleteBackward();
    return;
  }
  if (event.inputType?.startsWith("insert") && typeof event.data === "string" && event.data.length) {
    event.preventDefault();
    insertText(event.data);
  }
}

function exitFlowToReturnSurface(reason = "exit") {
  if (!active) return false;
  if (isPublicStreamRun()) finalizePublicStreamRun(reason === "native-back" ? "exit" : reason);
  restoreReturnSurface();
  return true;
}

function handleDocumentKeydown(event) {
  if (!active) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    exitFlowToReturnSurface("exit");
    return;
  }
  if (isPublicStreamRun() && event.key === "Tab" && view === "run") {
    event.preventDefault();
    event.stopImmediatePropagation();
    rerollPublicStream();
    return;
  }
  if (view === "chapter") {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      continueChapter();
    }
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
    deleteBackward();
    return;
  }
  if (event.key.length === 1) {
    event.preventDefault();
    event.stopImmediatePropagation();
    insertText(event.key);
  }
}

function tryLaunchDeveloperFlow() {
  if ((!developerFlowRequested && !publicFlowRequested) || active || dismissed) return false;
  const app = root();
  if (!app || app.childNodes.length === 0) return false;
  preserveReturnSurface();
  launchObserver?.disconnect?.();
  launchObserver = null;
  active = true;
  if (isPublicStreamRun()) {
    startRun();
  } else {
    view = "ready";
    renderReady();
  }
  return true;
}

function activateFlowFromLocation() {
  if (!resolveFlowRouteState()) return false;
  if (active) return true;
  dismissed = false;
  return tryLaunchDeveloperFlow();
}

function startCurrentFlowRun() {
  if (!active || !resolvedRunPlan) return false;
  startRun();
  return true;
}

subscribeToAuth(() => {
  if (lastPublicResult && view === "complete") maybeSubmitPublicResult();
});
subscribeToLeaderboardProfile(() => {
  if (lastPublicResult && view === "complete") maybeSubmitPublicResult();
});
subscribeToSubmissions((state) => {
  if (state?.mode === "flow" && lastPublicResult?.sessionId === state.sessionId) syncFlowSubmissionRegion();
});

document.addEventListener("keydown", handleDocumentKeydown, true);
document.addEventListener("visibilitychange", handleFlowVisibilityChange);
globalThis.window?.addEventListener?.("pagehide", () => beginVisibilityPause());
globalThis.window?.addEventListener?.("pageshow", () => endVisibilityPause());
if (developerFlowRequested || publicFlowRequested) {
  const app = root();
  if (app) {
    launchObserver = new MutationObserver(() => queueMicrotask(tryLaunchDeveloperFlow));
    launchObserver.observe(app, { childList: true });
  }
  queueMicrotask(tryLaunchDeveloperFlow);
}

if (globalThis.window) {
  window.wordstrikeFlowPhase1 = Object.freeze({
    getSnapshot: () => getFlowTypingSnapshot(run),
    getSelection: () => resolvedSelection,
    getRunPlan: () => resolvedRunPlan,
    getActiveSegmentIndex: () => activeSegmentIndex,
    getPerformanceStats: () => ({
      ...performanceStats,
      liveCadenceEventWindow: FLOW_LIVE_CADENCE_EVENT_WINDOW,
    }),
    isActive: () => active,
    exitToReturnSurface: exitFlowToReturnSurface,
    activateFromLocation: activateFlowFromLocation,
    refreshPlanFromLocation: refreshFlowPlanFromLocation,
    startCurrentRun: startCurrentFlowRun,
    rerollPublicRun: () => isPublicStreamRun() ? rerollPublicStream() : false,
    setPublicTheme: (theme) => {
      if (!isPublicStreamRun()) return false;
      finalizePublicStreamRun("theme-change");
      updatePublicFlowUrl({ theme, newSeed: true });
      startRun();
      return true;
    },
    getPublicSessionId: () => publicRunSessionId,
    getPublicResult: () => lastPublicResult ? { ...lastPublicResult, seriesIds: [...lastPublicResult.seriesIds] } : null,
    getPublicSessionState: () => flowSessionV4 ? {
      ...flowSessionV4,
      bestRun: flowSessionV4.bestRun ? { ...flowSessionV4.bestRun } : null,
      lastRun: flowSessionV4.lastRun ? { ...flowSessionV4.lastRun } : null,
    } : null,
    getPublicMicroResult: () => {
      const feedback = getActiveMicroResultV4();
      return feedback ? { ...feedback } : null;
    },
    getPublicProgressionState: () => {
      const progression = loadFlowProgressionV4({ sourceRecords: loadFlowRecordsV3() });
      return {
        progression,
        summary: getFlowProgressionSummaryV4(progression),
      };
    },
    getPublicRecordState: () => lastPublicRecordState ? {
      recorded: lastPublicRecordState.recorded,
      isPersonalBest: lastPublicRecordState.isPersonalBest,
      previousBest: lastPublicRecordState.previousBest ? { ...lastPublicRecordState.previousBest } : null,
      personalBest: lastPublicRecordState.personalBest ? { ...lastPublicRecordState.personalBest } : null,
    } : null,
    developerRouteEnabled: developerFlowRequested,
  });
}
