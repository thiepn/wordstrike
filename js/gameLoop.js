import { appState, Screens } from "./state.js";
import {
  clearWordElements,
  clearBossPhrase,
  createWordElement,
  flashDamage,
  removeWordElement,
  updateWordElement,
} from "./renderer.js";
import { createSeededRandom, mixSeed } from "./random.js";
import { reconcileTargetingState } from "./input.js";
import {
  advanceWordTrajectory,
  createWordTrajectory,
  logicalSpawnPosition,
  logicalWordDistance,
  projectWordTrajectory,
} from "./gameplayWorld.js";

let animationFrameId = null;
let callbacks = {};

export function createGameState(levelNumber, config, words, attempt = {}) {
  return {
    mode: "normal",
    levelNumber,
    config,
    wordQueue: [...words],
    selectedWords: [...(attempt.selectedWords || words)],
    attemptSeed: attempt.attemptSeed ?? null,
    random: createSeededRandom(mixSeed(attempt.attemptSeed ?? levelNumber, 0x5f3759df)),
    words: [],
    spawnedCount: 0,
    nextWordId: 1,
    lastSpawnAt: -config.spawnIntervalMs,
    activeTargetId: null,
    targetingState: {
      mode: "idle",
      prefix: "",
      candidateIds: [],
      activeTargetId: null,
      startedAtActiveMs: null,
    },
    lives: config.lives,
    score: 0,
    combo: 0,
    maxCombo: 0,
    correctKeystrokes: 0,
    totalKeystrokes: 0,
    missedCharacters: 0,
    correctCharacters: 0,
    completedWordCount: 0,
    missedWordCount: 0,
    elapsedMs: 0,
    phase: "ACTIVE",
    coreX: 0,
    coreY: 0,
    lastTimestamp: null,
    ended: false,
  };
}

export function registerMissedWord(game, word) {
  if (word.missedCharactersRecorded) return 0;
  word.missedCharactersRecorded = true;
  const remainingCharacters = Math.max(0, word.text.length - word.typedIndex);
  game.missedCharacters += remainingCharacters;
  return remainingCharacters;
}

function getDimensions(game) {
  const area = document.querySelector("#play-area");
  if (!area) return null;
  const width = area.clientWidth;
  const height = area.clientHeight;
  game.coreX = width / 2;
  game.coreY = height / 2;
  return { width, height };
}

function spawnWord(game, dimensions) {
  const edge = Math.floor(game.random() * 4);
  let ratio = 0;
  let logicalPosition = logicalSpawnPosition(edge, ratio);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    ratio = game.random();
    logicalPosition = logicalSpawnPosition(edge, ratio);
    const clear = game.words.every((word) => logicalWordDistance(word, logicalPosition) >= 72);
    if (clear) break;
  }
  const speed = game.config.wordSpeedPxPerSec;
  const trajectory = createWordTrajectory({ edge, ratio, speed });
  const word = {
    id: game.nextWordId,
    text: game.wordQueue[game.spawnedCount],
    typedIndex: 0,
    x: 0,
    y: 0,
    ...trajectory,
    createdAt: game.elapsedMs,
    startedAt: null,
    missedCharactersRecorded: false,
    coreArrivalProcessed: false,
    separationX: 0,
    separationY: 0,
  };
  game.nextWordId += 1;
  game.spawnedCount += 1;
  game.words.push(word);
  projectWordTrajectory(word, dimensions);
  createWordElement(word);
}

export function processWordCoreArrival(game, word) {
  if (game.ended || word.coreArrivalProcessed) return false;
  word.coreArrivalProcessed = true;
  registerMissedWord(game, word);
  game.missedWordCount += 1;
  game.words = game.words.filter((candidate) => candidate.id !== word.id);
  reconcileTargetingState(game);
  game.lives -= 1;
  game.combo = 0;
  removeWordElement(word);
  flashDamage(appState.save.settings.screenShake);
  callbacks.onHudUpdate?.(game);
  return true;
}

function wordVisualSize(word) {
  return {
    width: Math.min(220, Math.max(50, word.text.length * 17 + 18)),
    height: 38,
  };
}

function wordMobility(game, word) {
  if (game.targetingState.activeTargetId === word.id) return 0.25;
  if (game.targetingState.candidateIds.includes(word.id)) return 0.65;
  return 1;
}

export function updateWordSeparation(game, dimensions, deltaMs = 16) {
  const targets = new Map(game.words.map((word) => [word.id, { x: 0, y: 0 }]));
  const gap = 8;
  for (let firstIndex = 0; firstIndex < game.words.length; firstIndex += 1) {
    const first = game.words[firstIndex];
    const firstSize = wordVisualSize(first);
    for (let secondIndex = firstIndex + 1; secondIndex < game.words.length; secondIndex += 1) {
      const second = game.words[secondIndex];
      const secondSize = wordVisualSize(second);
      const dx = (second.x + (second.separationX || 0))
        - (first.x + (first.separationX || 0));
      const dy = (second.y + (second.separationY || 0))
        - (first.y + (first.separationY || 0));
      const overlapX = (firstSize.width + secondSize.width) / 2 + gap - Math.abs(dx);
      const overlapY = (firstSize.height + secondSize.height) / 2 + gap - Math.abs(dy);
      if (overlapX <= 0 || overlapY <= 0) continue;
      const firstMobility = wordMobility(game, first);
      const secondMobility = wordMobility(game, second);
      const mobilityTotal = firstMobility + secondMobility;
      const firstShare = firstMobility / mobilityTotal;
      const secondShare = secondMobility / mobilityTotal;
      const firstTarget = targets.get(first.id);
      const secondTarget = targets.get(second.id);
      if (overlapX < overlapY) {
        const direction = dx >= 0 ? 1 : -1;
        firstTarget.x -= direction * overlapX * firstShare;
        secondTarget.x += direction * overlapX * secondShare;
      } else {
        const direction = dy >= 0 ? 1 : -1;
        firstTarget.y -= direction * overlapY * firstShare;
        secondTarget.y += direction * overlapY * secondShare;
      }
    }
  }

  const smoothing = Math.min(1, Math.max(0, deltaMs) / 80);
  const cap = 30;
  for (const word of game.words) {
    const target = targets.get(word.id);
    const size = wordVisualSize(word);
    let nextX = (word.separationX || 0) + (target.x - (word.separationX || 0)) * smoothing;
    let nextY = (word.separationY || 0) + (target.y - (word.separationY || 0)) * smoothing;
    if (dimensions) {
      const minimumOffsetX = Math.min(0, size.width / 2 - word.x);
      const maximumOffsetX = Math.max(0, dimensions.width - size.width / 2 - word.x);
      const minimumOffsetY = Math.min(0, size.height / 2 - word.y);
      const maximumOffsetY = Math.max(0, dimensions.height - size.height / 2 - word.y);
      nextX = Math.max(minimumOffsetX, Math.min(maximumOffsetX, nextX));
      nextY = Math.max(minimumOffsetY, Math.min(maximumOffsetY, nextY));
    }
    nextX = Math.max(-cap, Math.min(cap, nextX));
    nextY = Math.max(-cap, Math.min(cap, nextY));
    word.separationX = nextX;
    word.separationY = nextY;
  }
}

function targetingVisualState(game, word) {
  const state = game.targetingState;
  return {
    active: state.mode === "locked" && state.activeTargetId === word.id,
    candidate: state.mode === "ambiguous" && state.candidateIds.includes(word.id),
    prefixLength: state.prefix.length,
  };
}

function finish(game, success) {
  if (game.ended) return;
  game.ended = true;
  stopGameLoop();
  callbacks.onEnd?.(game, success);
}

function tick(timestamp) {
  const game = appState.game;
  if (!game || game.ended) return;
  if (appState.screen !== Screens.PLAYING) {
    game.lastTimestamp = timestamp;
    animationFrameId = requestAnimationFrame(tick);
    return;
  }

  if (game.lastTimestamp === null) game.lastTimestamp = timestamp;
  const deltaMs = Math.min(timestamp - game.lastTimestamp, 100);
  game.lastTimestamp = timestamp;

  game.elapsedMs += deltaMs;
  const dimensions = getDimensions(game);
  if (!dimensions) return;

  if (
    game.spawnedCount < game.config.wordCount &&
    game.words.length < game.config.maxSimultaneousWords &&
    game.elapsedMs - game.lastSpawnAt >= game.config.spawnIntervalMs
  ) {
    spawnWord(game, dimensions);
    game.lastSpawnAt = game.elapsedMs;
  }

  for (const word of [...game.words]) {
    if (advanceWordTrajectory(word, deltaMs, dimensions)) {
      processWordCoreArrival(game, word);
      if (game.ended) return;
      if (game.lives <= 0) {
        finish(game, false);
        return;
      }
    }
  }
  updateWordSeparation(game, dimensions, deltaMs);
  for (const word of game.words) {
    const targeting = targetingVisualState(game, word);
    updateWordElement(word, targeting.active, targeting);
  }

  callbacks.onHudUpdate?.(game);
  if (
    game.spawnedCount >= game.config.wordCount &&
    game.words.length === 0
  ) {
    finish(game, true);
    return;
  }
  animationFrameId = requestAnimationFrame(tick);
}

export function startLevelLoop(
  levelNumber,
  config,
  words,
  nextCallbacks = {},
  attempt = {},
) {
  stopGameLoop();
  clearBossPhrase();
  clearWordElements();
  callbacks = nextCallbacks;
  appState.game = createGameState(levelNumber, config, words, attempt);
  animationFrameId = requestAnimationFrame(tick);
  return appState.game;
}

export function stopGameLoop() {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  clearWordElements();
  if (appState.game?.mode === "normal") appState.game.lastTimestamp = null;
}

export function resumeGameLoop() {
  if (animationFrameId === null && appState.game && !appState.game.ended) {
    appState.game.lastTimestamp = null;
    animationFrameId = requestAnimationFrame(tick);
  }
}
