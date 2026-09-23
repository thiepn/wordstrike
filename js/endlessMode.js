import { appState, Screens } from "./state.js";
import {
  ENDLESS_CONFIG,
  getEndlessWordsPerStage,
  isStandardEndlessConfiguration,
} from "./endlessConfig.js";
import {
  estimateRequiredWpm,
  getEndlessDifficulty,
} from "./endlessDifficulty.js";
import {
  calculateEndlessScore,
  calculateEndlessStageBonus,
  calculateEndlessSurvivalPoints,
  calculateEndlessWordPoints,
} from "./endlessScoring.js";
import { createEndlessWordGenerator } from "./endlessWords.js";
import { handleGameplayKey, reconcileTargetingState, resetTargetingState } from "./input.js";
import {
  clearWordElements,
  createWordElement,
  flashDamage,
  removeWordElement,
  updateWordElement,
} from "./renderer.js";
import { updateWordSeparation } from "./gameLoop.js";
import { createSeededRandom, mixSeed } from "./random.js";
import {
  beginSession,
  completeSession,
  getCurrentSession,
  markSessionActive,
  markSessionResultPersisted,
  SESSION_STATES,
  setSessionState,
} from "./sessionManager.js";
import { buildSessionResult } from "./sessionResult.js";
import {
  annotateLocalResultPersistence,
  LOCAL_RESULT_PERSISTENCE,
} from "./localResultPersistence.js";
import {
  calculateSessionAccuracy,
  calculateSessionWpm,
} from "./sessionMetrics.js";
import { recordCompletedSession } from "./modeStorage.js";
import { MODE_IDS } from "./modes.js";
import {
  advanceWordTrajectory,
  createWordTrajectory,
  logicalSpawnPosition,
  logicalWordDistance,
  projectWordTrajectory,
} from "./gameplayWorld.js";

let currentEndless = null;
let animationFrameId = null;
let callbacks = {};

function spawnRandom(seed) {
  return createSeededRandom(mixSeed(seed, 0x2f6e2b1));
}

function createTargetingState() {
  return {
    mode: "idle",
    prefix: "",
    candidateIds: [],
    activeTargetId: null,
    startedAtActiveMs: null,
  };
}

export function createEndlessRuntime({
  seed,
  vocabulary,
  startStage = 1,
  maximumStages = null,
  recordEligible = true,
  developerMode = false,
} = {}) {
  const safeStage = Number.isInteger(startStage) && startStage > 0 ? startStage : 1;
  const runtimeConfig = {
    startStage: safeStage,
    maximumStages: Number.isInteger(maximumStages) && maximumStages > 0 ? maximumStages : null,
    recordEligible,
  };
  const eligible = isStandardEndlessConfiguration(runtimeConfig, developerMode);
  const game = {
    mode: "endless",
    config: runtimeConfig,
    attemptSeed: seed,
    developerMode,
    recordEligible: eligible,
    stage: safeStage,
    highestStage: safeStage,
    completedStages: 0,
    stageWordsCompleted: 0,
    totalWordsCompleted: 0,
    integrity: ENDLESS_CONFIG.startingIntegrity,
    words: [],
    nextWordId: 1,
    generatedWordCount: 0,
    random: spawnRandom(seed),
    wordGenerator: createEndlessWordGenerator(vocabulary, seed),
    difficulty: getEndlessDifficulty(safeStage),
    phase: "ACTIVE",
    bannerUntilMs: 0,
    bannerText: "",
    lastSpawnAtMs: -ENDLESS_CONFIG.initialSpawnIntervalMs,
    elapsedMs: 0,
    lastTimestamp: null,
    immunityUntilMs: 0,
    coreHits: 0,
    coreBreaches: 0,
    score: 0,
    accumulatedWordPoints: 0,
    accumulatedStageBonusPoints: 0,
    survivalPoints: 0,
    combo: 0,
    maxCombo: 0,
    currentPerfectStreak: 0,
    maximumPerfectStreak: 0,
    currentWordHadError: false,
    correctKeystrokes: 0,
    totalKeystrokes: 0,
    missedCharacters: 0,
    correctCharacters: 0,
    completedWordCount: 0,
    missedWordCount: 0,
    activeTargetId: null,
    targetingState: createTargetingState(),
    rollingEvents: [],
    peakWpm: 0,
    finalRollingWpm: 0,
    coreX: 0,
    coreY: 0,
    ended: false,
    completionNotified: false,
    result: null,
  };
  return game;
}

function dimensions(game) {
  const area = document.querySelector("#play-area");
  if (!area) return null;
  game.coreX = area.clientWidth / 2;
  game.coreY = area.clientHeight / 2;
  return { width: area.clientWidth, height: area.clientHeight };
}

function spawnWord(game, size) {
  if (game.words.length >= game.difficulty.activeWordCap) return false;
  const edge = Math.floor(game.random() * 4);
  let ratio = 0;
  let logicalPosition = logicalSpawnPosition(edge, ratio);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    ratio = game.random();
    logicalPosition = logicalSpawnPosition(edge, ratio);
    if (game.words.every((word) => logicalWordDistance(word, logicalPosition) >= 72)) break;
  }
  const speed = game.difficulty.movementSpeed;
  const text = game.wordGenerator.next(game.stage);
  const trajectory = createWordTrajectory({ edge, ratio, speed });
  const word = {
    id: game.nextWordId++,
    text,
    typedIndex: 0,
    x: 0,
    y: 0,
    ...trajectory,
    movementSpeed: speed,
    createdAt: game.elapsedMs,
    startedAt: null,
    missedCharactersRecorded: false,
    coreArrivalProcessed: false,
    separationX: 0,
    separationY: 0,
  };
  game.generatedWordCount += 1;
  game.words.push(word);
  projectWordTrajectory(word, size);
  createWordElement(word);
  return true;
}

function updateRollingWpm(game) {
  const cutoff = game.elapsedMs - ENDLESS_CONFIG.rollingWpmWindowMs;
  while (game.rollingEvents.length && game.rollingEvents[0].at < cutoff) {
    game.rollingEvents.shift();
  }
  const firstAt = game.rollingEvents[0]?.at ?? game.elapsedMs;
  const sampleMs = Math.min(
    ENDLESS_CONFIG.rollingWpmWindowMs,
    Math.max(0, game.elapsedMs - firstAt),
  );
  const characters = game.rollingEvents.reduce((sum, event) => sum + event.characters, 0);
  const rolling = calculateSessionWpm({ characterCount: characters, activeDurationMs: sampleMs });
  game.finalRollingWpm = rolling;
  if (game.elapsedMs >= ENDLESS_CONFIG.rollingWpmMinimumSampleMs) {
    game.peakWpm = Math.max(game.peakWpm, rolling);
  }
}

function advanceEndlessStage(game) {
  if (game.stageWordsCompleted < getEndlessWordsPerStage(game.stage)) {
    return false;
  }
  const completedStage = game.stage;
  game.completedStages += 1;
  game.accumulatedStageBonusPoints += calculateEndlessStageBonus(completedStage);
  game.stage += 1;
  game.highestStage = Math.max(game.highestStage, game.stage);
  game.stageWordsCompleted = 0;
  game.wordGenerator.resetStage(game.stage);
  game.difficulty = getEndlessDifficulty(game.stage);
  game.bannerUntilMs = game.elapsedMs + ENDLESS_CONFIG.stageBannerMs;
  game.bannerText = `STAGE ${game.stage}`;
  return true;
}

export function registerEndlessWordCompletion(game, word) {
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  if (game.currentWordHadError) {
    game.currentPerfectStreak = 0;
  } else {
    game.currentPerfectStreak += 1;
    game.maximumPerfectStreak = Math.max(
      game.maximumPerfectStreak,
      game.currentPerfectStreak,
    );
  }
  game.currentWordHadError = false;
  game.totalWordsCompleted += 1;
  game.completedWordCount = game.totalWordsCompleted;
  game.stageWordsCompleted += 1;
  game.accumulatedWordPoints += calculateEndlessWordPoints(
    game.stage,
    word.text.length,
    game.combo,
    game.currentPerfectStreak,
  );
  game.rollingEvents.push({ at: game.elapsedMs, characters: word.text.length });
  updateRollingWpm(game);

  return advanceEndlessStage(game);
}

export function processEndlessCoreBreach(game, word) {
  if (!game || game.ended || word.coreArrivalProcessed) return false;
  word.coreArrivalProcessed = true;
  if (!word.missedCharactersRecorded) {
    word.missedCharactersRecorded = true;
    game.missedCharacters += Math.max(0, word.text.length - word.typedIndex);
  }
  game.missedWordCount += 1;
  game.coreBreaches += 1;
  game.combo = 0;
  game.currentPerfectStreak = 0;
  game.currentWordHadError = false;
  game.words = game.words.filter((candidate) => candidate.id !== word.id);
  reconcileTargetingState(game);
  removeWordElement(word);
  if (game.elapsedMs >= game.immunityUntilMs) {
    game.coreHits += 1;
    game.integrity -= 1;
    game.immunityUntilMs = game.elapsedMs + ENDLESS_CONFIG.collisionImmunityMs;
    flashDamage(appState.save?.settings?.screenShake !== false);
  }
  return true;
}

export function handleEndlessKey(event, game = currentEndless) {
  if (!game || game.ended) return false;
  const beforeTotal = game.totalKeystrokes;
  const beforeCorrect = game.correctKeystrokes;
  const beforeTargetingMode = game.targetingState?.mode || "idle";
  const handled = handleGameplayKey(
    event,
    game,
    {
      ...(appState.save?.settings || {}),
      strictMode: false,
      particles: appState.save?.settings?.particles !== false,
    },
    (_ignored, word) => registerEndlessWordCompletion(game, word),
  );
  if (game.totalKeystrokes > beforeTotal && game.correctKeystrokes === beforeCorrect) {
    game.currentPerfectStreak = 0;
    game.currentWordHadError = beforeTargetingMode !== "idle";
  }
  game.score = calculateEndlessScore(
    game.elapsedMs,
    game.accumulatedWordPoints,
    game.accumulatedStageBonusPoints,
  );
  callbacks.onUpdate?.(game);
  return handled;
}

function buildEndlessResult(game) {
  const session = getCurrentSession();
  if (!session || session.modeId !== MODE_IDS.ENDLESS) return null;
  const accuracy = calculateSessionAccuracy({
    correctKeystrokes: game.correctKeystrokes,
    totalKeystrokes: game.totalKeystrokes,
    missedCharacters: game.missedCharacters,
  });
  const averageWpm = calculateSessionWpm({
    characterCount: game.correctCharacters,
    activeDurationMs: game.elapsedMs,
  });
  updateRollingWpm(game);
  const score = calculateEndlessScore(
    game.elapsedMs,
    game.accumulatedWordPoints,
    game.accumulatedStageBonusPoints,
  );
  const endedAt = Date.now();
  return buildSessionResult({
    sessionId: session.id,
    modeId: MODE_IDS.ENDLESS,
    variantId: "standard",
    sessionSource: session.source,
    startedAt: session.startedAtEpochMs ?? session.createdAtEpochMs,
    endedAt,
    durationMs: Math.max(0, endedAt - session.createdAtEpochMs),
    activeDurationMs: game.elapsedMs,
    seed: game.attemptSeed,
    developerMode: game.developerMode,
    success: false,
    failureReason: "core-destroyed",
    score,
    grade: null,
    accuracy,
    wpm: averageWpm,
    characters: {
      correct: game.correctCharacters,
      incorrect: Math.max(0, game.totalKeystrokes - game.correctKeystrokes),
      missed: game.missedCharacters,
      totalKeystrokes: game.totalKeystrokes,
    },
    words: {
      completed: game.totalWordsCompleted,
      missed: game.missedWordCount,
      total: game.totalWordsCompleted + game.missedWordCount,
    },
    combo: { maximum: game.maxCombo, final: game.combo },
    modeData: {
      metricVersion: 1,
      highestStage: game.highestStage,
      finalStage: game.stage,
      stageProgress: game.stageWordsCompleted,
      completedStages: game.completedStages,
      wordsCompleted: game.totalWordsCompleted,
      survivalTimeMs: game.elapsedMs,
      coreHits: game.coreHits,
      coreBreaches: game.coreBreaches,
      maximumCombo: game.maxCombo,
      maximumPerfectStreak: game.maximumPerfectStreak,
      averageWpm,
      peakWpm: game.peakWpm,
      finalRollingWpm: game.finalRollingWpm,
      survivalPoints: calculateEndlessSurvivalPoints(game.elapsedMs),
      wordPoints: game.accumulatedWordPoints,
      stageBonusPoints: game.accumulatedStageBonusPoints,
      attemptSeed: game.attemptSeed,
      startStage: game.config.startStage,
      recordEligible: game.recordEligible,
    },
  });
}

export function completeEndlessRun(game = currentEndless) {
  if (!game || game.ended) return null;
  game.ended = true;
  stopEndlessLoop();
  const result = buildEndlessResult(game);
  if (!result) return null;
  setSessionState(SESSION_STATES.RESULTS);
  if (!completeSession(result)) return null;
  const recordPersisted = game.recordEligible ? recordCompletedSession(result) : false;
  if (recordPersisted) {
    markSessionResultPersisted(result.sessionId);
  }

  const visibleResult = !game.recordEligible
    ? annotateLocalResultPersistence(result, {
      status: LOCAL_RESULT_PERSISTENCE.EXCLUDED,
    })
    : recordPersisted
      ? annotateLocalResultPersistence(result, {
        status: LOCAL_RESULT_PERSISTENCE.SAVED,
      })
      : annotateLocalResultPersistence(result, {
        status: LOCAL_RESULT_PERSISTENCE.FAILED,
        warning: "THIS ENDLESS RESULT COULD NOT BE SAVED LOCALLY. Keep this page open until you have retried any global submission.",
      });

  game.result = visibleResult;
  return visibleResult;
}

function tick(timestamp) {
  const game = currentEndless;
  if (!game || game.ended) return;
  if (appState.screen !== Screens.PLAYING) {
    game.lastTimestamp = timestamp;
    animationFrameId = requestAnimationFrame(tick);
    return;
  }
  if (game.lastTimestamp == null) game.lastTimestamp = timestamp;
  const deltaMs = Math.min(100, Math.max(0, timestamp - game.lastTimestamp));
  game.lastTimestamp = timestamp;
  game.elapsedMs += deltaMs;
  if (game.stageWordsCompleted >= getEndlessWordsPerStage(game.stage)) {
    advanceEndlessStage(game);
  }
  game.survivalPoints = calculateEndlessSurvivalPoints(game.elapsedMs);
  game.score = calculateEndlessScore(
    game.elapsedMs,
    game.accumulatedWordPoints,
    game.accumulatedStageBonusPoints,
  );
  const size = dimensions(game);
  if (!size) {
    animationFrameId = requestAnimationFrame(tick);
    return;
  }
  if (game.elapsedMs - game.lastSpawnAtMs >= game.difficulty.spawnIntervalMs) {
    spawnWord(game, size);
    game.lastSpawnAtMs = game.elapsedMs;
  }
  for (const word of [...game.words]) {
    if (advanceWordTrajectory(word, deltaMs, size)) {
      processEndlessCoreBreach(game, word);
      if (game.integrity <= 0) {
        const result = completeEndlessRun(game);
        if (!game.completionNotified) {
          game.completionNotified = true;
          callbacks.onComplete?.(game, result);
        }
        return;
      }
    }
  }
  updateWordSeparation(game, size, deltaMs);
  const candidates = new Set(game.targetingState.candidateIds);
  for (const word of game.words) {
    updateWordElement(word, game.activeTargetId === word.id, {
      candidate: game.targetingState.mode === "ambiguous" && candidates.has(word.id),
      prefixLength: game.targetingState.prefix.length,
    });
  }
  updateRollingWpm(game);
  callbacks.onUpdate?.(game);
  animationFrameId = requestAnimationFrame(tick);
}

export function startEndlessRun(options = {}) {
  stopEndlessLoop();
  clearWordElements();
  const game = createEndlessRuntime(options);
  const session = beginSession({
    modeId: MODE_IDS.ENDLESS,
    variantId: "standard",
    source: options.developerMode ? "developer" : options.source || "mode-select",
    seed: game.attemptSeed,
    developerMode: game.developerMode,
    config: {
      startStage: game.config.startStage,
      maximumStages: game.config.maximumStages,
      recordEligible: game.recordEligible,
    },
  });
  if (!session) return null;
  currentEndless = game;
  appState.game = game;
  callbacks = { onUpdate: options.onUpdate, onComplete: options.onComplete };
  markSessionActive();
  animationFrameId = requestAnimationFrame(tick);
  return game;
}

export function stopEndlessLoop() {
  if (animationFrameId != null) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
}

export function resumeEndlessLoop() {
  if (animationFrameId == null && currentEndless && !currentEndless.ended) {
    currentEndless.lastTimestamp = null;
    animationFrameId = requestAnimationFrame(tick);
  }
}

export function clearEndlessRuntime() {
  stopEndlessLoop();
  clearWordElements();
  if (currentEndless) {
    currentEndless.words.length = 0;
    currentEndless.rollingEvents.length = 0;
    resetTargetingState(currentEndless);
  }
  currentEndless = null;
  callbacks = {};
}

export function getCurrentEndless() {
  return currentEndless;
}

export function getEndlessLoopActive() {
  return animationFrameId != null;
}

export function getEndlessDiagnosticText(game = currentEndless) {
  if (!game) return "ENDLESS=inactive";
  const session = getCurrentSession();
  return [
    `SEED=${game.attemptSeed}`,
    `SESSION=${session?.id ?? "none"}`,
    `STATE=${session?.state ?? "idle"}`,
    `ELIGIBLE=${game.recordEligible}`,
    `STAGE=${game.stage}`,
    `COMPLETED STAGES=${game.completedStages}`,
    `PROGRESS=${game.stageWordsCompleted}/${getEndlessWordsPerStage(game.stage)}`,
    `WORDS=${game.totalWordsCompleted}`,
    `ACTIVE=${Math.round(game.elapsedMs)}ms`,
    `SCORE=${game.score}`,
    `COMBO=${game.combo}/${game.maxCombo}`,
    `PERFECT=${game.currentPerfectStreak}/${game.maximumPerfectStreak}`,
    `MOVEMENT=${game.difficulty.movementMultiplier.toFixed(2)}:${game.difficulty.movementSpeed.toFixed(1)}`,
    `SPAWN=${game.difficulty.spawnIntervalMs}ms`,
    `CAP=${game.words.length}/${game.difficulty.activeWordCap}`,
    `LENGTH=${game.difficulty.minimumWordLength}-${game.difficulty.maximumWordLength}`,
    `TARGET AVG=${game.difficulty.targetAverageLength}`,
    `REQUIRED WPM=${estimateRequiredWpm({
      targetAverageWordLength: game.difficulty.targetAverageLength,
      spawnIntervalMs: game.difficulty.spawnIntervalMs,
    }).toFixed(1)}`,
    `WEIGHTS=${JSON.stringify(game.difficulty.vocabularyWeights)}`,
    `IMMUNITY=${Math.max(0, game.immunityUntilMs - game.elapsedMs)}ms`,
    `GENERATED=${game.generatedWordCount}`,
    `RECENT=${game.wordGenerator.recentWords.length}`,
    `FINALIZED=${session?.resultFinalized === true}`,
    `PERSISTED=${session?.resultPersisted === true}`,
  ].join(" // ");
}
