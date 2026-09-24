import { appState, Screens } from "./state.js";
import { clearBossPhrase, clearWordElements, renderBossPhrase } from "./renderer.js";
import { clampGameplayFrameDelta } from "./runtimeTiming.js";

const INTRO_DURATION_MS = 2800;
export const BOSS_TRANSITION_DURATION_MS = 350;

let animationFrameId = null;
let callbacks = {};

export function createBossGameState(levelNumber, config, phrases) {
  return {
    mode: "boss",
    levelNumber,
    config,
    attemptSeed: config.attemptSeed ?? null,
    segments: [...phrases],
    phrases: [...phrases],
    currentPhrase: phrases[0] || "",
    phraseIndex: 0,
    displayedSequenceNumber: 1,
    phraseCharIndex: 0,
    phrasesCompleted: 0,
    phase: "INTRO",
    introElapsedMs: 0,
    transitionElapsedMs: 0,
    remainingMs: config.timeLimitSec * 1000,
    elapsedMs: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    correctKeystrokes: 0,
    totalKeystrokes: 0,
    correctCharacters: 0,
    missedCharacters: 0,
    completedWordCount: 0,
    missedWordCount: 0,
    wordStartIndex: 0,
    wordStartElapsedMs: 0,
    lastTimestamp: null,
    ended: false,
    timeoutCounted: false,
  };
}

export function addBossTimeoutMisses(game) {
  if (game.timeoutCounted) return 0;
  game.timeoutCounted = true;
  let missed = Math.max(0, game.currentPhrase.length - game.phraseCharIndex);
  for (let index = game.phraseIndex + 1; index < game.phrases.length; index += 1) {
    missed += game.phrases[index].length;
  }
  game.missedCharacters += missed;
  game.missedWordCount = Math.max(
    0,
    (game.config.totalWordCount || 0) - game.completedWordCount,
  );
  return missed;
}

function finishBoss(game, success) {
  if (game.ended) return;
  game.ended = true;
  if (!success) addBossTimeoutMisses(game);
  const onUpdate = callbacks.onUpdate;
  const onEnd = callbacks.onEnd;
  stopBossLoop();
  onUpdate?.(game);
  onEnd?.(game, success);
}

export function completeBossPhrase(game) {
  if (game.ended || game.phase !== "ACTIVE") return;
  game.phrasesCompleted += 1;
  if (game.phrasesCompleted >= game.phrases.length) {
    finishBoss(game, true);
    return;
  }
  game.phase = "TRANSITION";
  game.transitionElapsedMs = 0;
  callbacks.onUpdate?.(game);
}

function beginNextPhrase(game) {
  game.phraseIndex += 1;
  game.displayedSequenceNumber = Math.min(
    game.phraseIndex + 1,
    Math.max(1, game.phrases.length),
  );
  game.currentPhrase = game.phrases[game.phraseIndex] || "";
  game.phraseCharIndex = 0;
  game.wordStartIndex = 0;
  game.wordStartElapsedMs = game.elapsedMs;
  game.phase = "ACTIVE";
  renderBossPhrase(game);
  callbacks.onUpdate?.(game);
}

function tick(timestamp) {
  const game = appState.game;
  if (!game || game.mode !== "boss" || game.ended) {
    animationFrameId = null;
    return;
  }

  if (appState.screen !== Screens.PLAYING) {
    game.lastTimestamp = null;
    animationFrameId = null;
    return;
  }

  const deltaMs = clampGameplayFrameDelta(timestamp, game.lastTimestamp);
  game.lastTimestamp = timestamp;

  if (game.phase === "INTRO") {
    game.introElapsedMs += deltaMs;
    if (game.introElapsedMs >= INTRO_DURATION_MS) {
      game.phase = "ACTIVE";
      game.wordStartElapsedMs = 0;
      renderBossPhrase(game);
    }
  } else if (game.phase === "ACTIVE") {
    game.remainingMs = Math.max(0, game.remainingMs - deltaMs);
    game.elapsedMs += deltaMs;
    if (game.remainingMs <= 0) {
      finishBoss(game, false);
      return;
    }
  } else if (game.phase === "TRANSITION") {
    const transitionRemainingMs = Math.max(
      0,
      BOSS_TRANSITION_DURATION_MS - game.transitionElapsedMs,
    );
    const chargedTransitionMs = Math.min(deltaMs, transitionRemainingMs);
    game.remainingMs = Math.max(0, game.remainingMs - chargedTransitionMs);
    game.transitionElapsedMs += chargedTransitionMs;
    if (game.remainingMs <= 0) {
      finishBoss(game, false);
      return;
    }
    if (game.transitionElapsedMs >= BOSS_TRANSITION_DURATION_MS) beginNextPhrase(game);
  }

  callbacks.onUpdate?.(game);
  animationFrameId = requestAnimationFrame(tick);
}

export function startBossLoop(levelNumber, config, phrases, nextCallbacks = {}) {
  stopBossLoop();
  clearWordElements();
  clearBossPhrase();
  callbacks = nextCallbacks;
  appState.game = createBossGameState(levelNumber, config, phrases);
  callbacks.onUpdate?.(appState.game);
  animationFrameId = requestAnimationFrame(tick);
  return appState.game;
}

export function suspendBossLoop() {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  if (appState.game?.mode === "boss") appState.game.lastTimestamp = null;
}

export function stopBossLoop() {
  suspendBossLoop();
  clearBossPhrase();
  callbacks = {};
}

export function resumeBossLoop() {
  if (
    animationFrameId === null &&
    appState.game?.mode === "boss" &&
    !appState.game.ended
  ) {
    appState.game.lastTimestamp = null;
    animationFrameId = requestAnimationFrame(tick);
  }
}
