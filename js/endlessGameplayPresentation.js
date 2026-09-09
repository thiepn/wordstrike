import { ENDLESS_CONFIG, getEndlessWordsPerStage } from "./endlessConfig.js";
import { getCurrentEndless } from "./endlessMode.js";

const ENDLESS_SCREEN_SELECTOR = ".endless-screen";
const MAX_INTEGRITY = ENDLESS_CONFIG.startingIntegrity;
let frameId = null;
let observer = null;

function setText(node, value) {
  if (!node) return;
  const next = String(value);
  if (node.textContent !== next) node.textContent = next;
}

function createLabel(text) {
  const label = document.createElement("span");
  label.className = "endless-hud-label";
  label.textContent = text;
  return label;
}

function createMetric(labelText, valueNode, className = "") {
  const metric = document.createElement("div");
  metric.className = `endless-hud-metric ${className}`.trim();
  valueNode.classList.add("endless-hud-value");
  metric.append(valueNode, createLabel(labelText));
  return metric;
}

function buildIntegritySegments(className) {
  const segments = document.createElement("span");
  segments.className = className;
  segments.setAttribute("aria-hidden", "true");
  for (let index = 0; index < MAX_INTEGRITY; index += 1) {
    const segment = document.createElement("i");
    segment.dataset.endlessIntegritySegment = String(index + 1);
    segments.append(segment);
  }
  return segments;
}

function enhanceHud(screen) {
  const hud = screen.querySelector(".endless-hud");
  if (!hud || hud.dataset.ui6Enhanced === "true") return;

  const back = hud.querySelector(".gameplay-pause-button");
  const stage = hud.querySelector("#endless-stage");
  const stageProgress = hud.querySelector("#endless-progress");
  const score = hud.querySelector("#endless-score");
  const integrityLegacy = hud.querySelector("#endless-integrity");
  if (!back || !stage || !stageProgress || !score || !integrityLegacy) return;

  hud.dataset.ui6Enhanced = "true";
  hud.classList.add("endless-gameplay-hud");
  back.classList.add("endless-hud-back");

  const primary = document.createElement("div");
  primary.className = "endless-hud-primary";

  const identity = document.createElement("span");
  identity.className = "endless-hud-identity";
  identity.append(createLabel("STAGE"), stage);

  const wpm = document.createElement("strong");
  wpm.dataset.endlessWpm = "";
  wpm.className = "endless-hud-value";
  const pace = createMetric("WPM", wpm, "endless-hud-pace");

  const comboValue = document.createElement("strong");
  comboValue.dataset.endlessCombo = "";
  comboValue.className = "endless-hud-value";
  const combo = createMetric("COMBO", comboValue, "endless-hud-combo");

  const scoreMetric = createMetric("SCORE", score, "endless-hud-score");

  const integrity = document.createElement("div");
  integrity.className = "endless-hud-integrity";
  const integrityCopy = document.createElement("span");
  integrityCopy.className = "endless-hud-integrity-copy";
  integrityCopy.append(createLabel("CORE"));
  integrity.append(integrityCopy, buildIntegritySegments("endless-hud-integrity-segments"));
  integrityLegacy.classList.add("endless-hud-legacy-integrity");
  integrity.append(integrityLegacy);

  primary.append(back, identity, pace, combo, scoreMetric, integrity);

  const secondary = document.createElement("div");
  secondary.className = "endless-hud-secondary";

  const survival = document.createElement("span");
  survival.className = "endless-hud-survival";
  survival.append(createLabel("SURVIVAL"));
  const survivalValue = document.createElement("strong");
  survivalValue.dataset.endlessSurvival = "";
  survival.append(survivalValue);

  const progress = document.createElement("div");
  progress.className = "endless-stage-progress";
  progress.dataset.endlessStageProgress = "";
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", "Endless stage progress");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", "100");
  progress.setAttribute("aria-valuenow", "0");
  const progressFill = document.createElement("span");
  progressFill.className = "endless-stage-progress-fill";
  progress.append(progressFill);

  const pressure = document.createElement("span");
  pressure.className = "endless-hud-pressure";
  pressure.append(createLabel("PRESSURE"));
  const pressureValue = document.createElement("strong");
  pressureValue.dataset.endlessPressureValue = "";
  pressure.append(pressureValue);

  const target = document.createElement("span");
  target.className = "endless-target-state";
  target.dataset.endlessTargetState = "";
  target.textContent = "SCANNING";

  secondary.append(survival, progress, pressure, target);
  hud.replaceChildren(primary, secondary);

  // Preserve the authoritative legacy stage progress text for assistive technology/tests.
  stageProgress.classList.add("endless-hud-legacy-progress");
  hud.append(stageProgress);
}

function enhanceCore(screen) {
  const core = screen.querySelector(".core");
  if (!core || core.dataset.ui6Enhanced === "true") return;
  core.dataset.ui6Enhanced = "true";
  core.classList.add("endless-core");
  core.setAttribute("role", "img");

  const field = document.createElement("span");
  field.className = "endless-core-field";
  field.setAttribute("aria-hidden", "true");

  const radarA = document.createElement("span");
  radarA.className = "endless-core-radar endless-core-radar-a";
  radarA.setAttribute("aria-hidden", "true");

  const radarB = document.createElement("span");
  radarB.className = "endless-core-radar endless-core-radar-b";
  radarB.setAttribute("aria-hidden", "true");

  const sweep = document.createElement("span");
  sweep.className = "endless-core-sweep";
  sweep.setAttribute("aria-hidden", "true");

  const reactor = document.createElement("span");
  reactor.className = "endless-core-reactor";
  reactor.setAttribute("aria-hidden", "true");

  const integrity = buildIntegritySegments("endless-core-integrity");
  const label = document.createElement("span");
  label.className = "endless-core-label";
  label.textContent = "SURVIVE";
  label.setAttribute("aria-hidden", "true");

  core.append(field, radarA, radarB, sweep, reactor, integrity, label);
}

function enhanceKeyboardTrigger(screen) {
  const trigger = screen.querySelector(".gameplay-keyboard-trigger");
  if (!trigger || trigger.dataset.ui6Enhanced === "true") return;
  trigger.dataset.ui6Enhanced = "true";
  trigger.classList.add("endless-keyboard-trigger");
  trigger.textContent = "KEYBOARD";
  trigger.setAttribute("aria-label", "Open gameplay keyboard");
}

function enhanceStageBanner(screen) {
  const banner = screen.querySelector("#endless-stage-banner");
  if (!banner || banner.dataset.ui6Enhanced === "true") return;
  banner.dataset.ui6Enhanced = "true";
  banner.classList.add("endless-stage-transition");
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
}

function targetingCopy(game) {
  const targeting = game?.targetingState;
  if (targeting?.mode === "locked" || game?.activeTargetId) return "TARGET LOCKED";
  const candidates = Array.isArray(targeting?.candidateIds) ? targeting.candidateIds.length : 0;
  if (targeting?.mode === "ambiguous" || candidates > 1) return `${candidates} CANDIDATES`;
  if (targeting?.prefix) return "ACQUIRING";
  return "SCANNING";
}

function formatSurvival(elapsedMs) {
  const totalSeconds = Math.max(0, Math.floor((Number(elapsedMs) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function stageTier(stage) {
  if (stage >= 11) return "late";
  if (stage >= 6) return "mid";
  return "early";
}

function pressureTier(active, cap) {
  if (!cap) return "low";
  const ratio = active / cap;
  if (ratio >= 0.75) return "high";
  if (ratio >= 0.45) return "mid";
  return "low";
}

function syncIntegrity(screen, integrity) {
  const safeIntegrity = Math.max(0, Math.min(MAX_INTEGRITY, Number.isFinite(Number(integrity)) ? Math.round(Number(integrity)) : MAX_INTEGRITY));
  screen.dataset.endlessIntegrity = String(safeIntegrity);
  const core = screen.querySelector(".endless-core");
  if (core) {
    core.dataset.integrity = String(safeIntegrity);
    core.setAttribute("aria-label", `Endless Core, integrity ${safeIntegrity} of ${MAX_INTEGRITY}`);
  }
  screen.querySelectorAll("[data-endless-integrity-segment]").forEach((segment) => {
    const segmentNumber = Number(segment.dataset.endlessIntegritySegment);
    segment.classList.toggle("is-depleted", segmentNumber > safeIntegrity);
  });
}

function syncWordRisk(screen, game) {
  const playArea = screen.querySelector("#play-area");
  if (!playArea) return;
  const coreX = Number.isFinite(game.coreX) && game.coreX > 0 ? game.coreX : playArea.clientWidth / 2;
  const coreY = Number.isFinite(game.coreY) && game.coreY > 0 ? game.coreY : playArea.clientHeight / 2;
  const threshold = Math.max(92, Math.min(playArea.clientWidth, playArea.clientHeight) * 0.24);
  const wordsById = new Map((game.words || []).map((word) => [String(word.id), word]));
  screen.querySelectorAll(".word-position[data-word-id]").forEach((position) => {
    const word = wordsById.get(String(position.dataset.wordId));
    if (!word) return;
    const distance = Math.hypot((Number(word.x) || 0) - coreX, (Number(word.y) || 0) - coreY);
    position.classList.toggle("endless-word-imminent", distance <= threshold);
  });
}

function syncPresentation(screen, game) {
  const stage = Math.max(1, Number(game.stage) || 1);
  const completed = Math.max(0, Number(game.stageWordsCompleted) || 0);
  const total = Math.max(1, getEndlessWordsPerStage(stage));
  const progressPercent = Math.max(0, Math.min(100, (completed / total) * 100));
  const activeWords = Array.isArray(game.words) ? game.words.length : 0;
  const activeCap = Math.max(1, Number(game.difficulty?.activeWordCap) || ENDLESS_CONFIG.maxActiveWords);
  const rollingWpm = Math.max(0, Math.round(Number(game.finalRollingWpm) || 0));
  const combo = Math.max(0, Number(game.combo) || 0);

  screen.dataset.endlessStageTier = stageTier(stage);
  screen.dataset.endlessPressure = pressureTier(activeWords, activeCap);

  setText(screen.querySelector("[data-endless-wpm]"), rollingWpm);
  setText(screen.querySelector("[data-endless-combo]"), combo);
  setText(screen.querySelector("[data-endless-survival]"), formatSurvival(game.elapsedMs));
  setText(screen.querySelector("[data-endless-pressure-value]"), `${activeWords} / ${activeCap}`);
  setText(screen.querySelector("[data-endless-target-state]"), targetingCopy(game));

  const progress = screen.querySelector("[data-endless-stage-progress]");
  if (progress) {
    const rounded = Math.round(progressPercent);
    progress.setAttribute("aria-valuenow", String(rounded));
    progress.setAttribute("aria-valuetext", `${completed} of ${total} words completed in stage ${stage}`);
    const fill = progress.querySelector(".endless-stage-progress-fill");
    if (fill) fill.style.setProperty("--endless-stage-progress", `${progressPercent}%`);
  }

  syncIntegrity(screen, game.integrity);
  syncWordRisk(screen, game);
}

function enhanceEndlessScreen() {
  const screen = document.querySelector(ENDLESS_SCREEN_SELECTOR);
  if (!screen) return null;
  screen.classList.add("endless-gameplay-screen");
  enhanceHud(screen);
  enhanceCore(screen);
  enhanceKeyboardTrigger(screen);
  enhanceStageBanner(screen);
  return screen;
}

function tickPresentation() {
  frameId = null;
  const screen = enhanceEndlessScreen();
  const game = getCurrentEndless();
  if (screen && game && game.mode === "endless") syncPresentation(screen, game);
  if (screen) frameId = requestAnimationFrame(tickPresentation);
}

function queuePresentation() {
  if (frameId != null) return;
  frameId = requestAnimationFrame(tickPresentation);
}

const appRoot = document.querySelector("#app");
if (appRoot) {
  observer = new MutationObserver(queuePresentation);
  observer.observe(appRoot, { childList: true, subtree: true });
  queuePresentation();
}

export function stopEndlessPresentation() {
  if (frameId != null) cancelAnimationFrame(frameId);
  frameId = null;
  observer?.disconnect?.();
  observer = null;
}
