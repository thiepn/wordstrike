import { calculateSessionAccuracy, calculateSessionWpm } from "../sessionMetrics.js";
import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_MODE_ID,
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_WAVE_COUNT,
} from "./arcadeRushContract.js";
import { ARCADE_RUSH_GENERATOR_VERSION } from "./arcadeRushConfig.js";
import { isGeneratedArcadeRushPlan } from "./arcadeRushGenerator.js";
import {
  ARCADE_RUSH_DRAFT_RULES_VERSION,
  ARCADE_RUSH_SCORING_VERSION,
  calculateArcadeRushPerfectWaveBonus,
  calculateArcadeRushWaveClearBonus,
  calculateArcadeRushWordPoints,
} from "./arcadeRushScoring.js";
import { buildArcadeRushSessionResult } from "./arcadeRushResult.js";

export const ARCADE_RUSH_RUNTIME_VERSION = 1;
export const ARCADE_RUSH_WAVE_TRANSITION_MS = 2_500;
export const ARCADE_RUSH_MAX_FRAME_DELTA_MS = 100;

export const ARCADE_RUSH_RUNTIME_PORTS = Object.freeze({
  clock: Object.freeze(["now"]),
  scheduler: Object.freeze(["requestFrame", "cancelFrame"]),
  renderer: Object.freeze([
    "clearWords",
    "createWord",
    "updateWord",
    "removeWord",
    "flashDamage",
  ]),
  input: Object.freeze([
    "handleKey",
    "reconcileTargeting",
    "resetTargeting",
  ]),
  world: Object.freeze([
    "createTrajectory",
    "projectTrajectory",
    "advanceTrajectory",
    "updateSeparation",
  ]),
  session: Object.freeze([
    "begin",
    "complete",
    "getCurrent",
    "markActive",
    "markResultPersisted",
    "setState",
  ]),
});

const RUN_STATES = Object.freeze({
  IDLE: "idle",
  ACTIVE: "active",
  TRANSITIONING: "transitioning",
  PAUSED: "paused",
  AWAITING_BOSS: "awaiting-boss",
  FAILED: "failed",
  STOPPED: "stopped",
});

function validPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function snapshot(value) {
  return deepFreeze(JSON.parse(JSON.stringify(value)));
}

function targetingState() {
  return {
    mode: "idle",
    prefix: "",
    candidateIds: [],
    activeTargetId: null,
    startedAtActiveMs: null,
  };
}

function createWaveStats(plan) {
  return plan.waves.map((wave) => ({
    wave: wave.wave,
    spawned: 0,
    resolved: 0,
    completed: 0,
    missed: 0,
    incorrectKeystrokes: 0,
    breaches: 0,
    perfect: false,
  }));
}

function phaseForWave(wave) {
  return `WAVE_${wave}`;
}

function createRuntimeState(plan, options = {}) {
  const firstWave = plan.waves[0];
  return {
    runtimeVersion: ARCADE_RUSH_RUNTIME_VERSION,
    contractVersion: ARCADE_RUSH_CONTRACT_VERSION,
    generatorVersion: ARCADE_RUSH_GENERATOR_VERSION,
    rulesVersion: ARCADE_RUSH_DRAFT_RULES_VERSION,
    scoringVersion: ARCADE_RUSH_SCORING_VERSION,
    modeId: ARCADE_RUSH_MODE_ID,
    source: options.source || "arcade-rush-ready",
    developerMode: options.developerMode === true,
    plan,
    seed: plan.seed,
    phase: phaseForWave(1),
    runState: RUN_STATES.IDLE,
    resumeRunState: null,
    currentWave: 1,
    wavesCompleted: 0,
    integrity: ARCADE_RUSH_STARTING_INTEGRITY,
    words: [],
    nextWordId: 1,
    totalSpawned: 0,
    totalResolved: 0,
    completedWordCount: 0,
    missedWordCount: 0,
    coreBreaches: 0,
    combo: 0,
    maxCombo: 0,
    wordPoints: 0,
    waveClearBonus: 0,
    perfectWaveBonus: 0,
    score: 0,
    perfectWaves: 0,
    correctKeystrokes: 0,
    totalKeystrokes: 0,
    correctCharacters: 0,
    missedCharacters: 0,
    activeTargetId: null,
    targetingState: targetingState(),
    waveStats: createWaveStats(plan),
    elapsedMs: 0,
    lastTimestamp: null,
    lastSpawnAtMs: -(firstWave?.profile?.spawnIntervalMs || 0),
    transitionRemainingMs: 0,
    transitionNextWave: null,
    sessionId: null,
    result: null,
    failureNotified: false,
    terminalNotified: false,
    wavesCompleteNotified: false,
  };
}

export function isArcadeRushRuntimePorts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(ARCADE_RUSH_RUNTIME_PORTS).every(([group, methods]) => (
    value[group] && typeof value[group] === "object" &&
    methods.every((method) => typeof value[group][method] === "function")
  ));
}

export function createArcadeRushRuntimePorts(value) {
  if (!isArcadeRushRuntimePorts(value)) return null;
  return Object.freeze(Object.fromEntries(
    Object.entries(ARCADE_RUSH_RUNTIME_PORTS).map(([group, methods]) => [
      group,
      Object.freeze(Object.fromEntries(methods.map((method) => [method, value[group][method]]))),
    ]),
  ));
}

export function createArcadeRushRuntime({
  plan,
  ports,
  source = "arcade-rush-ready",
  developerMode = false,
  callbacks = {},
} = {}) {
  if (!isGeneratedArcadeRushPlan(plan)) return null;
  const runtimePorts = createArcadeRushRuntimePorts(ports);
  if (!runtimePorts) return null;

  let game = createRuntimeState(plan, { source, developerMode });
  let frameId = null;
  let disposed = false;

  function currentWavePlan() {
    return game.plan.waves[game.currentWave - 1] || null;
  }

  function currentWaveStats() {
    return game.waveStats[game.currentWave - 1] || null;
  }

  function notifyUpdate() {
    callbacks.onUpdate?.(getSnapshot());
  }

  function cancelFrame() {
    if (frameId != null) runtimePorts.scheduler.cancelFrame(frameId);
    frameId = null;
  }

  function shouldLoop() {
    return !disposed && [RUN_STATES.ACTIVE, RUN_STATES.TRANSITIONING].includes(game.runState);
  }

  function scheduleFrame() {
    if (!shouldLoop() || frameId != null) return false;
    frameId = runtimePorts.scheduler.requestFrame(tick);
    return true;
  }

  function updateEarnedScore() {
    game.waveClearBonus = calculateArcadeRushWaveClearBonus(game.wavesCompleted) ?? 0;
    game.perfectWaveBonus = calculateArcadeRushPerfectWaveBonus(game.perfectWaves) ?? 0;
    game.score = game.wordPoints + game.waveClearBonus + game.perfectWaveBonus;
  }

  function removeWord(word) {
    game.words = game.words.filter((candidate) => candidate.id !== word.id);
    if (game.activeTargetId === word.id) game.activeTargetId = null;
    runtimePorts.renderer.removeWord(word);
    runtimePorts.input.reconcileTargeting(game);
  }

  function findWord(wordId) {
    return game.words.find((word) => word.id === Number(wordId)) || null;
  }

  function finishWaveIfResolved() {
    if (game.runState !== RUN_STATES.ACTIVE) return false;
    const wave = currentWavePlan();
    const stats = currentWaveStats();
    if (!wave || !stats || stats.resolved !== wave.wordCount || game.words.length !== 0) return false;

    stats.perfect = stats.breaches === 0 && stats.incorrectKeystrokes === 0;
    game.wavesCompleted = game.currentWave;
    if (stats.perfect) game.perfectWaves += 1;
    updateEarnedScore();
    runtimePorts.input.resetTargeting(game);

    if (game.currentWave >= ARCADE_RUSH_WAVE_COUNT) {
      cancelFrame();
      game.phase = "BOSS_INTRO";
      game.runState = RUN_STATES.AWAITING_BOSS;
      game.transitionRemainingMs = 0;
      game.transitionNextWave = null;
      runtimePorts.session.setState("transitioning");
      if (!game.wavesCompleteNotified) {
        game.wavesCompleteNotified = true;
        callbacks.onWavesComplete?.(getSnapshot());
      }
      notifyUpdate();
      return true;
    }

    game.phase = "WAVE_TRANSITION";
    game.runState = RUN_STATES.TRANSITIONING;
    game.transitionRemainingMs = ARCADE_RUSH_WAVE_TRANSITION_MS;
    game.transitionNextWave = game.currentWave + 1;
    runtimePorts.session.setState("transitioning");
    callbacks.onWaveTransition?.(getSnapshot(), Object.freeze({
      clearedWave: game.currentWave,
      nextWave: game.transitionNextWave,
      perfect: stats.perfect,
      waveClearBonus: game.waveClearBonus,
      perfectWaveBonus: game.perfectWaveBonus,
    }));
    notifyUpdate();
    return true;
  }

  function completeWord(wordId) {
    if (game.runState !== RUN_STATES.ACTIVE) return false;
    const word = findWord(wordId);
    if (!word || word.resolved) return false;
    word.resolved = true;
    word.typedIndex = word.text.length;
    game.combo += 1;
    game.maxCombo = Math.max(game.maxCombo, game.combo);
    const points = calculateArcadeRushWordPoints({
      pointTier: word.entry.pointTier,
      comboAfterCompletion: game.combo,
    });
    if (points == null) return false;
    game.wordPoints += points;
    game.totalResolved += 1;
    game.completedWordCount += 1;
    const stats = currentWaveStats();
    stats.resolved += 1;
    stats.completed += 1;
    removeWord(word);
    updateEarnedScore();
    callbacks.onWordComplete?.(getSnapshot(), snapshot({
      wordId: word.id,
      word: word.text,
      wave: word.entry.wave,
      points,
      combo: game.combo,
    }));
    finishWaveIfResolved();
    notifyUpdate();
    return true;
  }

  function recordCorrectCharacter(wordId, count = 1) {
    if (game.runState !== RUN_STATES.ACTIVE || !validPositiveInteger(count)) return false;
    const word = findWord(wordId);
    if (!word || word.resolved) return false;
    const remaining = Math.max(0, word.text.length - word.typedIndex);
    const applied = Math.min(count, remaining);
    if (!applied) return false;
    word.typedIndex += applied;
    game.correctKeystrokes += applied;
    game.totalKeystrokes += applied;
    game.correctCharacters += applied;
    return true;
  }

  function recordIncorrectCharacter(count = 1) {
    if (game.runState !== RUN_STATES.ACTIVE || !validPositiveInteger(count)) return false;
    game.totalKeystrokes += count;
    const stats = currentWaveStats();
    if (stats) stats.incorrectKeystrokes += count;
    return true;
  }

  function setWordProgress(wordId, typedIndex) {
    if (game.runState !== RUN_STATES.ACTIVE || !Number.isSafeInteger(typedIndex)) return false;
    const word = findWord(wordId);
    if (!word || word.resolved || typedIndex < 0 || typedIndex > word.text.length) return false;
    word.typedIndex = typedIndex;
    return true;
  }

  function setActiveTarget(wordId) {
    if (wordId == null) {
      game.activeTargetId = null;
      return true;
    }
    if (!findWord(wordId)) return false;
    game.activeTargetId = Number(wordId);
    return true;
  }

  function buildFailureResult() {
    const session = runtimePorts.session.getCurrent?.() || {};
    const startedAt = Number.isFinite(session.startedAtEpochMs)
      ? session.startedAtEpochMs
      : Number.isFinite(session.createdAtEpochMs) ? session.createdAtEpochMs : 0;
    const endedAt = startedAt + Math.round(game.elapsedMs);
    const accuracy = calculateSessionAccuracy({
      correctKeystrokes: game.correctKeystrokes,
      totalKeystrokes: game.totalKeystrokes,
      missedCharacters: game.missedCharacters,
    });
    const wpm = calculateSessionWpm({
      characterCount: game.correctCharacters,
      activeDurationMs: game.elapsedMs,
    });
    return buildArcadeRushSessionResult({
      sessionId: game.sessionId,
      sessionSource: game.source,
      startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - (session.createdAtEpochMs ?? startedAt)),
      activeDurationMs: Math.round(game.elapsedMs),
      seed: game.seed,
      developerMode: game.developerMode,
      success: false,
      accuracy,
      wpm,
      characters: {
        correct: game.correctCharacters,
        incorrect: Math.max(0, game.totalKeystrokes - game.correctKeystrokes),
        missed: game.missedCharacters,
        totalKeystrokes: game.totalKeystrokes,
      },
      words: {
        completed: game.completedWordCount,
        missed: game.missedWordCount,
        total: game.totalResolved,
      },
      combo: { maximum: game.maxCombo, final: game.combo },
      wavesCompleted: game.wavesCompleted,
      bossDefeated: false,
      bossTimeRemainingMs: 0,
      integrityRemaining: 0,
      perfectWaves: game.perfectWaves,
      wordPoints: game.wordPoints,
    });
  }

  function failRun() {
    if ([RUN_STATES.FAILED, RUN_STATES.STOPPED, RUN_STATES.AWAITING_BOSS].includes(game.runState)) {
      return game.result;
    }
    cancelFrame();
    game.integrity = 0;
    game.phase = "FAILED";
    game.runState = RUN_STATES.FAILED;
    runtimePorts.session.setState("results");
    game.result = buildFailureResult();
    if (game.result) {
      game.score = game.result.score;
      runtimePorts.session.complete(game.result);
    }
    if (!game.failureNotified) {
      game.failureNotified = true;
      callbacks.onFailure?.(getSnapshot(), game.result);
    }
    if (!game.terminalNotified) {
      game.terminalNotified = true;
      callbacks.onTerminal?.(getSnapshot(), game.result);
    }
    notifyUpdate();
    return game.result;
  }

  function processCoreBreach(wordId) {
    if (game.runState !== RUN_STATES.ACTIVE) return false;
    const word = findWord(wordId);
    if (!word || word.resolved) return false;
    word.resolved = true;
    const untyped = Math.max(0, word.text.length - word.typedIndex);
    game.missedCharacters += untyped;
    game.totalResolved += 1;
    game.missedWordCount += 1;
    game.coreBreaches += 1;
    game.combo = 0;
    game.integrity = Math.max(0, game.integrity - 1);
    const stats = currentWaveStats();
    stats.resolved += 1;
    stats.missed += 1;
    stats.breaches += 1;
    removeWord(word);
    runtimePorts.renderer.flashDamage();
    callbacks.onCoreBreach?.(getSnapshot(), snapshot({
      wordId: word.id,
      word: word.text,
      wave: word.entry.wave,
      integrity: game.integrity,
    }));
    if (game.integrity <= 0) failRun();
    else finishWaveIfResolved();
    notifyUpdate();
    return true;
  }

  function interactionApi() {
    return Object.freeze({
      completeWord,
      getWords: () => game.words,
      recordCorrectCharacter,
      recordIncorrectCharacter,
      setActiveTarget,
      setWordProgress,
    });
  }

  function handleKey(event) {
    if (game.runState !== RUN_STATES.ACTIVE) return false;
    const handled = runtimePorts.input.handleKey(event, game, interactionApi());
    runtimePorts.input.reconcileTargeting(game);
    notifyUpdate();
    return Boolean(handled);
  }

  function spawnWord() {
    if (game.runState !== RUN_STATES.ACTIVE) return false;
    const wave = currentWavePlan();
    const stats = currentWaveStats();
    if (!wave || !stats || stats.spawned >= wave.entries.length) return false;
    if (game.words.length >= wave.profile.maxSimultaneousWords) return false;
    const entry = wave.entries[stats.spawned];
    const trajectory = runtimePorts.world.createTrajectory(entry, game) || {};
    const word = {
      id: game.nextWordId++,
      text: entry.word,
      typedIndex: 0,
      resolved: false,
      entry,
      trajectory,
    };
    game.words.push(word);
    stats.spawned += 1;
    game.totalSpawned += 1;
    runtimePorts.world.projectTrajectory(word, game);
    runtimePorts.renderer.createWord(word);
    callbacks.onWordSpawn?.(getSnapshot(), snapshot({
      wordId: word.id,
      word: word.text,
      wave: entry.wave,
      entryIndex: entry.waveIndex,
    }));
    return true;
  }

  function updateRenderedWords() {
    runtimePorts.world.updateSeparation(game.words, game);
    const candidates = new Set(game.targetingState?.candidateIds || []);
    for (const word of game.words) {
      runtimePorts.renderer.updateWord(word, {
        active: game.activeTargetId === word.id,
        candidate: game.targetingState?.mode === "ambiguous" && candidates.has(word.id),
        prefixLength: game.targetingState?.prefix?.length || 0,
      });
    }
  }

  function tickWave(deltaMs) {
    const wave = currentWavePlan();
    const stats = currentWaveStats();
    if (!wave || !stats) return;
    if (
      stats.spawned < wave.entries.length &&
      game.words.length < wave.profile.maxSimultaneousWords &&
      game.elapsedMs - game.lastSpawnAtMs >= wave.profile.spawnIntervalMs &&
      spawnWord()
    ) {
      game.lastSpawnAtMs = game.elapsedMs;
    }

    for (const word of [...game.words]) {
      const outcome = runtimePorts.world.advanceTrajectory(word, deltaMs, game);
      const reachedCore = outcome === true || outcome?.reachedCore === true;
      if (reachedCore) {
        processCoreBreach(word.id);
        if (game.runState === RUN_STATES.FAILED) return;
      }
    }
    if (game.runState === RUN_STATES.ACTIVE) updateRenderedWords();
  }

  function tickTransition(deltaMs) {
    game.transitionRemainingMs = Math.max(0, game.transitionRemainingMs - deltaMs);
    if (game.transitionRemainingMs > 0) return;
    const nextWave = game.transitionNextWave;
    if (!Number.isInteger(nextWave) || nextWave < 2 || nextWave > ARCADE_RUSH_WAVE_COUNT) return;
    game.currentWave = nextWave;
    game.phase = phaseForWave(nextWave);
    game.runState = RUN_STATES.ACTIVE;
    game.transitionNextWave = null;
    const wave = currentWavePlan();
    game.lastSpawnAtMs = game.elapsedMs - (wave?.profile?.spawnIntervalMs || 0);
    runtimePorts.session.setState("active");
    callbacks.onWaveStart?.(getSnapshot(), nextWave);
  }

  function tick(timestamp) {
    frameId = null;
    if (!shouldLoop()) return;
    const now = Number.isFinite(timestamp) ? timestamp : runtimePorts.clock.now();
    let deltaMs = 0;
    if (game.lastTimestamp != null) {
      deltaMs = Math.min(
        ARCADE_RUSH_MAX_FRAME_DELTA_MS,
        Math.max(0, now - game.lastTimestamp),
      );
    }
    game.lastTimestamp = now;
    game.elapsedMs += deltaMs;

    if (game.runState === RUN_STATES.ACTIVE) tickWave(deltaMs);
    else if (game.runState === RUN_STATES.TRANSITIONING) tickTransition(deltaMs);

    notifyUpdate();
    scheduleFrame();
  }

  function start() {
    if (disposed || game.runState !== RUN_STATES.IDLE) return null;
    runtimePorts.renderer.clearWords();
    runtimePorts.input.resetTargeting(game);
    const session = runtimePorts.session.begin({
      modeId: ARCADE_RUSH_MODE_ID,
      variantId: `draft-r${ARCADE_RUSH_DRAFT_RULES_VERSION}-s${ARCADE_RUSH_SCORING_VERSION}`,
      source: game.source,
      seed: game.seed,
      developerMode: game.developerMode,
      config: {
        contractVersion: ARCADE_RUSH_CONTRACT_VERSION,
        generatorVersion: ARCADE_RUSH_GENERATOR_VERSION,
        runtimeVersion: ARCADE_RUSH_RUNTIME_VERSION,
        waveCount: ARCADE_RUSH_WAVE_COUNT,
        startingIntegrity: ARCADE_RUSH_STARTING_INTEGRITY,
        recordEligible: false,
      },
    });
    if (!session || typeof session.id !== "string" || !session.id) return null;
    game.sessionId = session.id;
    game.runState = RUN_STATES.ACTIVE;
    game.lastTimestamp = null;
    runtimePorts.session.markActive();
    callbacks.onWaveStart?.(getSnapshot(), 1);
    notifyUpdate();
    scheduleFrame();
    return getSnapshot();
  }

  function pause() {
    if (![RUN_STATES.ACTIVE, RUN_STATES.TRANSITIONING].includes(game.runState)) return false;
    game.resumeRunState = game.runState;
    game.runState = RUN_STATES.PAUSED;
    cancelFrame();
    runtimePorts.session.setState("paused");
    callbacks.onPause?.(getSnapshot());
    notifyUpdate();
    return true;
  }

  function resume() {
    if (game.runState !== RUN_STATES.PAUSED) return false;
    game.runState = game.resumeRunState || RUN_STATES.ACTIVE;
    game.resumeRunState = null;
    game.lastTimestamp = null;
    runtimePorts.session.setState(
      game.runState === RUN_STATES.TRANSITIONING ? "transitioning" : "active",
    );
    callbacks.onResume?.(getSnapshot());
    notifyUpdate();
    scheduleFrame();
    return true;
  }

  function stop({ abortSession = true } = {}) {
    cancelFrame();
    if (abortSession && ![RUN_STATES.FAILED, RUN_STATES.STOPPED].includes(game.runState)) {
      runtimePorts.session.setState("aborted");
    }
    if (game.runState !== RUN_STATES.FAILED) game.runState = RUN_STATES.STOPPED;
    game.lastTimestamp = null;
    return true;
  }

  function cleanup({ abortSession = true } = {}) {
    stop({ abortSession });
    runtimePorts.renderer.clearWords();
    runtimePorts.input.resetTargeting(game);
    game.words.length = 0;
    game.activeTargetId = null;
    callbacks.onCleanup?.(getSnapshot());
    return true;
  }

  function restart({ plan: nextPlan, source: nextSource = source, developerMode: nextDeveloperMode = developerMode } = {}) {
    if (!isGeneratedArcadeRushPlan(nextPlan)) return null;
    cleanup({ abortSession: true });
    game = createRuntimeState(nextPlan, {
      source: nextSource,
      developerMode: nextDeveloperMode,
    });
    disposed = false;
    return start();
  }

  function dispose({ abortSession = true } = {}) {
    cleanup({ abortSession });
    disposed = true;
    return true;
  }

  function getSnapshot() {
    return snapshot({
      ...game,
      plan: undefined,
      words: game.words.map((word) => ({
        id: word.id,
        text: word.text,
        typedIndex: word.typedIndex,
        resolved: word.resolved,
        wave: word.entry.wave,
        waveIndex: word.entry.waveIndex,
        pointTier: word.entry.pointTier,
        edge: word.entry.edge,
      })),
    });
  }

  function getLoopActive() {
    return frameId != null;
  }

  return Object.freeze({
    cleanup,
    completeWord,
    dispose,
    getLoopActive,
    getSnapshot,
    handleKey,
    pause,
    processCoreBreach,
    recordCorrectCharacter,
    recordIncorrectCharacter,
    restart,
    resume,
    setActiveTarget,
    setWordProgress,
    start,
    stop,
  });
}
