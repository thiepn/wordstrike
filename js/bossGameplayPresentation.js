import { appState } from "./state.js";

const BOSS_SCREEN_SELECTOR = ".boss-screen";
let frameId = null;
let observer = null;

function label(text) {
  const node = document.createElement("span");
  node.className = "boss-ui-label";
  node.textContent = text;
  return node;
}

function metric(labelText, valueNode, className = "") {
  const node = document.createElement("div");
  node.className = `boss-ui-metric ${className}`.trim();
  valueNode.classList.add("boss-ui-value");
  node.append(label(labelText), valueNode);
  return node;
}

function bossTier(index) {
  if (index >= 8) return "apex";
  if (index >= 4) return "escalated";
  return "standard";
}

function introStep(game) {
  if (game.phase !== "INTRO") return "engaged";
  const elapsed = Number(game.introElapsedMs) || 0;
  if (elapsed < 1000) return "arrival";
  if (elapsed < 1650) return "identified";
  if (elapsed < 2550) return "countdown";
  return "engage";
}

function timeTier(game) {
  const remaining = Math.max(0, Number(game.remainingMs) || 0);
  if (remaining <= 5000) return "critical";
  if (remaining <= 10000) return "warning";
  return "stable";
}

function overallProgress(game) {
  const total = Math.max(1, game.phrases?.length || game.config?.segmentCount || 1);
  const completed = Math.max(0, Number(game.phrasesCompleted) || 0);
  const phraseLength = Math.max(1, game.currentPhrase?.length || 1);
  const phraseProgress = game.phase === "INTRO"
    ? 0
    : Math.max(0, Math.min(1, (Number(game.phraseCharIndex) || 0) / phraseLength));
  return Math.max(0, Math.min(1, (completed + phraseProgress) / total));
}

function buildResolveMeter() {
  const meter = document.createElement("div");
  meter.className = "boss-resolve-meter";
  meter.dataset.bossResolve = "";
  meter.setAttribute("role", "progressbar");
  meter.setAttribute("aria-label", "Boss encounter completion");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", "100");
  meter.setAttribute("aria-valuenow", "0");
  const track = document.createElement("span");
  track.className = "boss-resolve-track";
  const fill = document.createElement("span");
  fill.className = "boss-resolve-fill";
  track.append(fill);
  const copy = document.createElement("span");
  copy.className = "boss-resolve-copy";
  copy.append(label("BOSS RESOLVE"));
  const value = document.createElement("strong");
  value.dataset.bossResolveValue = "";
  value.textContent = "0%";
  copy.append(value);
  meter.append(copy, track);
  return meter;
}

function enhanceHud(screen) {
  const hud = screen.querySelector(".boss-hud");
  if (!hud || hud.dataset.ui7Enhanced === "true") return;

  const leading = hud.querySelector(".boss-hud-leading");
  const back = hud.querySelector(".gameplay-pause-button");
  const identityValue = leading?.querySelector(".boss-hud-value");
  const phraseCount = hud.querySelector("#boss-phrase-count");
  const wordCount = hud.querySelector("#boss-word-count");
  const timer = hud.querySelector("#boss-timer");
  const score = hud.querySelector("#boss-score");
  const combo = hud.querySelector("#boss-combo");
  const wpm = hud.querySelector("#boss-wpm");
  const accuracy = hud.querySelector("#boss-accuracy");
  if (!back || !identityValue || !phraseCount || !wordCount || !timer || !score || !combo || !wpm || !accuracy) return;

  hud.dataset.ui7Enhanced = "true";
  hud.classList.add("boss-gameplay-hud");
  back.classList.add("boss-hud-back");
  identityValue.classList.add("boss-hud-identity-value");
  phraseCount.classList.add("boss-sequence-count");
  wordCount.classList.add("boss-word-count");

  const primary = document.createElement("div");
  primary.className = "boss-hud-primary";

  const identity = document.createElement("div");
  identity.className = "boss-hud-identity";
  identity.append(label("THREAT"), identityValue);

  const timerMetric = metric("TIME", timer, "boss-hud-timer");
  timerMetric.setAttribute("aria-label", "Boss time remaining");
  const pace = metric("WPM", wpm, "boss-hud-pace");
  const accuracyMetric = metric("ACC", accuracy, "boss-hud-accuracy");
  const scoreMetric = metric("SCORE", score, "boss-hud-score");
  const comboMetric = metric("COMBO", combo, "boss-hud-combo");

  primary.append(back, identity, timerMetric, pace, accuracyMetric, scoreMetric, comboMetric);

  const secondary = document.createElement("div");
  secondary.className = "boss-hud-secondary";

  const sequence = document.createElement("span");
  sequence.className = "boss-hud-sequence";
  // The authoritative phrase-count node already includes the SEQUENCE label.
  // Reuse it directly so the presentation layer never produces "SEQUENCE SEQUENCE".
  sequence.append(phraseCount);

  const words = document.createElement("span");
  words.className = "boss-hud-words";
  words.append(label("WORDS"), wordCount);

  secondary.append(sequence, buildResolveMeter(), words);
  hud.replaceChildren(primary, secondary);
}

function enhanceIntro(screen) {
  const intro = screen.querySelector("#boss-intro");
  if (!intro || intro.dataset.ui7Enhanced === "true") return;
  intro.dataset.ui7Enhanced = "true";
  intro.classList.add("boss-cinematic-intro");
  intro.setAttribute("role", "status");
  intro.setAttribute("aria-live", "polite");
  intro.setAttribute("aria-atomic", "true");

  const sigil = document.createElement("span");
  sigil.className = "boss-threat-sigil";
  sigil.setAttribute("aria-hidden", "true");
  sigil.innerHTML = `
    <i class="boss-sigil-ring boss-sigil-ring-a"></i>
    <i class="boss-sigil-ring boss-sigil-ring-b"></i>
    <i class="boss-sigil-axis boss-sigil-axis-a"></i>
    <i class="boss-sigil-axis boss-sigil-axis-b"></i>
    <i class="boss-sigil-core"></i>`;
  intro.prepend(sigil);
}

function enhanceFrame(screen) {
  const frame = screen.querySelector(".boss-phrase-frame");
  const progress = frame?.querySelector(".boss-progress");
  if (!frame || !progress || frame.dataset.ui7Enhanced === "true") return;
  frame.dataset.ui7Enhanced = "true";
  frame.classList.add("boss-combat-frame");
  frame.setAttribute("role", "region");
  frame.setAttribute("aria-label", "Boss typing sequence");
  progress.classList.add("boss-sequence-progress");
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", "Current boss sequence progress");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", "100");
  progress.setAttribute("aria-valuenow", "0");

  const eyebrow = document.createElement("div");
  eyebrow.className = "boss-frame-eyebrow";
  const phase = document.createElement("span");
  phase.dataset.bossFramePhase = "";
  phase.textContent = "ENGAGE";
  const marker = document.createElement("span");
  marker.textContent = "PRECISION SEQUENCE";
  eyebrow.append(phase, marker);
  frame.prepend(eyebrow);
}

function enhanceKeyboardTrigger(screen) {
  const trigger = screen.querySelector(".gameplay-keyboard-trigger");
  if (!trigger || trigger.dataset.ui7Enhanced === "true") return;
  trigger.dataset.ui7Enhanced = "true";
  trigger.classList.add("boss-keyboard-trigger");
  trigger.textContent = "KEYBOARD";
  trigger.setAttribute("aria-label", "Open gameplay keyboard");
}

function enhanceBossScreen() {
  const screen = document.querySelector(BOSS_SCREEN_SELECTOR);
  if (!screen) return null;
  screen.classList.add("boss-gameplay-screen");
  enhanceHud(screen);
  enhanceIntro(screen);
  enhanceFrame(screen);
  enhanceKeyboardTrigger(screen);
  return screen;
}

function syncPresentation(screen, game) {
  const index = Math.max(1, Number(game.config?.bossIndex) || Math.ceil((Number(game.levelNumber) || 10) / 10));
  const resolve = overallProgress(game);
  const resolvePercent = Math.round(resolve * 100);
  const phraseLength = Math.max(1, game.currentPhrase?.length || 1);
  const phrasePercent = Math.round(Math.max(0, Math.min(1, (Number(game.phraseCharIndex) || 0) / phraseLength)) * 100);

  screen.dataset.bossPhase = String(game.phase || "INTRO").toLowerCase();
  screen.dataset.bossTier = bossTier(index);
  screen.dataset.bossIntroStep = introStep(game);
  screen.dataset.bossTimeTier = timeTier(game);

  const resolveMeter = screen.querySelector("[data-boss-resolve]");
  if (resolveMeter) {
    resolveMeter.setAttribute("aria-valuenow", String(resolvePercent));
    resolveMeter.setAttribute("aria-valuetext", `${resolvePercent}% of boss encounter completed`);
    resolveMeter.style.setProperty("--boss-resolve", `${resolvePercent}%`);
  }
  const resolveValue = screen.querySelector("[data-boss-resolve-value]");
  if (resolveValue) resolveValue.textContent = `${resolvePercent}%`;

  const sequenceProgress = screen.querySelector(".boss-sequence-progress");
  if (sequenceProgress) {
    sequenceProgress.setAttribute("aria-valuenow", String(phrasePercent));
    sequenceProgress.setAttribute("aria-valuetext", `${phrasePercent}% of current sequence completed`);
  }

  const framePhase = screen.querySelector("[data-boss-frame-phase]");
  if (framePhase) {
    framePhase.textContent = game.phase === "TRANSITION"
      ? "SEQUENCE BREACHED"
      : game.phase === "ACTIVE"
        ? "ENGAGED"
        : "LOCKING TARGET";
  }

  const intro = screen.querySelector("#boss-intro");
  if (intro) intro.dataset.introStep = introStep(game);

  const arena = screen.querySelector(".boss-arena");
  if (arena) arena.setAttribute("aria-busy", game.phase === "TRANSITION" ? "true" : "false");
}

function tick() {
  frameId = null;
  const screen = enhanceBossScreen();
  const game = appState.game;
  if (screen && game?.mode === "boss") syncPresentation(screen, game);
  if (screen) frameId = requestAnimationFrame(tick);
}

function queue() {
  if (frameId != null) return;
  frameId = requestAnimationFrame(tick);
}

const appRoot = document.querySelector("#app");
if (appRoot) {
  observer = new MutationObserver(queue);
  observer.observe(appRoot, { childList: true, subtree: true });
  queue();
}

export function stopBossPresentation() {
  if (frameId != null) cancelAnimationFrame(frameId);
  frameId = null;
  observer?.disconnect?.();
  observer = null;
}
