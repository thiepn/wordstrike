import {
  backspaceFlowText,
  createFlowTypingRun,
  getFlowTypingSnapshot,
  insertFlowText,
} from "./flowEngine.js";
import { analyzeFlowCadence } from "./flowCadence.js";
import { resolveFlowRunPlan } from "./flowRunPlan.js";
import { resolveFlowSelection } from "./flowSelection.js";
import { FLOW_PHASES } from "./flowState.js";

const root = () => document.querySelector("#app");
const now = () => globalThis.performance?.now?.() ?? Date.now();
let developerFlowRequested = false;
let resolvedRunPlan = null;
let resolvedSelection = null;
const LIVE_CADENCE_INTERVAL_MS = 180;

function refreshFlowPlanFromLocation(locationLike = globalThis.location) {
  const params = new URLSearchParams(locationLike?.search || "");
  resolvedRunPlan = resolveFlowRunPlan(params);
  resolvedSelection = resolvedRunPlan ? null : resolveFlowSelection(params);
  return resolvedRunPlan || resolvedSelection;
}

function resolveFlowRouteState(locationLike = globalThis.location) {
  const params = new URLSearchParams(locationLike?.search || "");
  developerFlowRequested = params.get("dev") === "1" && params.get("mode") === "flow";
  refreshFlowPlanFromLocation(locationLike);
  return developerFlowRequested;
}

resolveFlowRouteState();

let active = false;
let dismissed = false;
let view = "idle";
let storedReturnNodes = [];
let run = null;
let activeSegmentIndex = 0;
let chapterPauseStartedAt = null;
let mountedCharacterNodes = new Map();
let mountedRunHud = null;
let cadenceRefreshTimer = null;
let lastCadenceRefreshAt = -Infinity;
let performanceStats = createPerformanceStats();

function createPerformanceStats() {
  return {
    characterNodeUpdates: 0,
    cadenceRefreshes: 0,
  };
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

function resetMountedCharacterNodes() {
  mountedCharacterNodes = new Map();
  mountedRunHud = null;
}

function restoreReturnSurface() {
  const app = root();
  if (!app) return;
  clearCadenceRefresh();
  resetMountedCharacterNodes();
  dismissed = true;
  active = false;
  view = "idle";
  run = null;
  activeSegmentIndex = 0;
  chapterPauseStartedAt = null;
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

function charMarkup(character) {
  const shown = character.actual ?? character.expected;
  const classes = ["flow-char", `flow-char--${character.status}`];
  if (character.current) classes.push("flow-char--current");
  return `<span class="${classes.join(" ")}" data-flow-char="${character.index}" data-status="${character.status}" aria-hidden="true">${escapeHtml(shown)}</span>`;
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
  const segment = currentSegment();
  const chapter = currentChapter();
  return `CHAPTER ${segment.chapterIndex + 1}/${resolvedRunPlan.chapterCount} · ${chapter.title.toUpperCase()} · ${segment.passageIndex + 1}/${chapter.passages.length}`;
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
  });
  return mountedRunHud;
}

function updateGameplayHud(hud, gameplay, cadence) {
  if (!hud) return;
  if (gameplay) {
    setTextIfChanged(hud.score, gameplay.score.toLocaleString("en-US"));
    const roundedFlow = String(Math.round(gameplay.flowValue));
    setTextIfChanged(hud.flowValue, roundedFlow);
    if (hud.meter?.getAttribute("aria-valuenow") !== roundedFlow) hud.meter?.setAttribute("aria-valuenow", roundedFlow);
    if (hud.meter?.dataset.flowBand !== flowBand(gameplay.flowValue)) hud.meter.dataset.flowBand = flowBand(gameplay.flowValue);
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
  updateGameplayHud(mountedRunHud, null, analyzeFlowCadence(run));
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
  setTextIfChanged(hud.progress, `${run.currentIndex} / ${run.passage.length}`);
  setTextIfChanged(hud.corrected, String(run.correctedErrors));
  setTextIfChanged(hud.unresolved, String(run.uncorrectedErrors));
  updateGameplayHud(hud, liveGameplaySnapshot(), null);
}

function renderRun() {
  const app = root();
  if (!app || !run) return;
  clearCadenceRefresh();
  view = "run";
  const chapter = currentChapter();
  app.innerHTML = `
    <section class="screen flow-phase1-screen flow-run-screen" data-flow-view="run">
      <main class="flow-run-shell">
        <header class="flow-run-header">
          <button type="button" class="screen-back-button" data-flow-action="back">BACK</button>
          <div><span>${escapeHtml(runHeaderLabel())}</span><strong data-flow-progress>0 / ${run.passage.length}</strong></div>
        </header>
        ${chapter ? `<div class="flow-chapter-strip" data-flow-chapter><span>${escapeHtml(chapter.title)}</span><strong>${escapeHtml(chapter.difficulty)}</strong></div>` : ""}
        <section class="flow-gameplay-hud flow-cadence-hud" aria-label="Flow gameplay and cadence status">
          <div class="flow-score-block"><span>Score</span><strong data-flow-score>0</strong></div>
          <div class="flow-meter-block">
            <div class="flow-meter-label"><span>Flow</span><strong data-flow-value>60</strong></div>
            <div class="flow-meter" role="progressbar" aria-label="Flow meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="60" data-flow-meter>
              <span data-flow-meter-fill style="width:60%"></span>
            </div>
          </div>
          <div class="flow-momentum-block"><span>Momentum</span><strong data-flow-momentum>×1.0</strong></div>
          <div class="flow-cadence-block"><span>Cadence</span><strong data-flow-cadence>—</strong><small data-flow-cadence-label>Warming up</small></div>
        </section>
        <div class="flow-run-copy">
          <p>${chapter ? escapeHtml(chapter.description) : "Type naturally. Flow tracks quality; Cadence tracks rhythm relative to your baseline."}</p>
          <div class="flow-passages" aria-label="Typing passage">
            <div class="flow-passage" data-flow-passage aria-label="${escapeHtml(visiblePassageText())}">${visibleCharacterView().map(charMarkup).join("")}</div>
          </div>
        </div>
        <div class="flow-run-diagnostics" aria-live="polite">
          <span>WPM <strong data-flow-final-wpm>0.0</strong></span>
          <span>Accuracy <strong data-flow-accuracy>100.0%</strong></span>
          <span>Pauses <strong data-flow-pauses>0</strong></span>
          <span>Corrected <strong data-flow-corrected>0</strong></span>
          <span>Unresolved <strong data-flow-unresolved>0</strong></span>
        </div>
        <textarea class="flow-input-capture" data-flow-input aria-label="Flow typing input" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>
      </main>
    </section>`;
  rebuildMountedCharacterNodes(app);
  mountRunHud(app);
  app.querySelector('[data-flow-action="back"]')?.addEventListener("click", restoreReturnSurface);
  const input = app.querySelector("[data-flow-input]");
  input?.addEventListener("beforeinput", handleBeforeInput);
  input?.addEventListener("input", () => { input.value = ""; });
  app.querySelector("[data-flow-passage]")?.addEventListener("pointerdown", () => input?.focus?.({ preventScroll: true }));
  input?.focus?.({ preventScroll: true });
  syncRunHud();
  scheduleCadenceHud(true);
}

function startRun() {
  clearCadenceRefresh();
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
    renderComplete();
    return;
  }
  if (maybeAdvanceRunPlan()) return;

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

function renderComplete() {
  const app = root();
  if (!app || !run) return;
  clearCadenceRefresh();
  resetMountedCharacterNodes();
  view = "complete";
  const snapshot = getFlowTypingSnapshot(run);
  const gameplay = snapshot.gameplay;
  const cadence = snapshot.cadence;
  const breakdown = gameplay.scoreBreakdown;
  const seconds = (cadence.typingDurationMs / 1000).toFixed(1);
  const cadenceScore = cadence.cadenceScore == null ? "—" : cadence.cadenceScore;
  const runMetrics = resolvedRunPlan
    ? `<span><strong>${resolvedRunPlan.chapterCount}</strong> chapters</span><span><strong>${resolvedRunPlan.passageCount}</strong> passages</span>`
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

function handleDocumentKeydown(event) {
  if (!active) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    restoreReturnSurface();
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
  if (!developerFlowRequested || active || dismissed) return false;
  const app = root();
  if (!app || app.childNodes.length === 0) return false;
  preserveReturnSurface();
  active = true;
  view = "ready";
  renderReady();
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

document.addEventListener("keydown", handleDocumentKeydown, true);
if (developerFlowRequested) {
  const app = root();
  if (app) new MutationObserver(() => queueMicrotask(tryLaunchDeveloperFlow)).observe(app, { childList: true });
  queueMicrotask(tryLaunchDeveloperFlow);
}

if (globalThis.window) {
  window.wordstrikeFlowPhase1 = Object.freeze({
    getSnapshot: () => getFlowTypingSnapshot(run),
    getSelection: () => resolvedSelection,
    getRunPlan: () => resolvedRunPlan,
    getActiveSegmentIndex: () => activeSegmentIndex,
    getPerformanceStats: () => ({ ...performanceStats }),
    isActive: () => active,
    activateFromLocation: activateFlowFromLocation,
    refreshPlanFromLocation: refreshFlowPlanFromLocation,
    startCurrentRun: startCurrentFlowRun,
    developerRouteEnabled: developerFlowRequested,
  });
}
