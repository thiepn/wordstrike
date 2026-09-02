import { calculateSessionAccuracy, calculateSessionWpm } from "../sessionMetrics.js";
import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_MODE_ID,
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_WAVE_COUNT,
} from "./arcadeRushContract.js";
import { ARCADE_RUSH_GENERATOR_VERSION } from "./arcadeRushConfig.js";
import { isGeneratedArcadeRushPlan } from "./arcadeRushGenerator.js";
import { createArcadeRushBossPort } from "./arcadeRushBoss.js";
import {
  ARCADE_RUSH_DRAFT_RULES_VERSION,
  ARCADE_RUSH_SCORING_VERSION,
  calculateArcadeRushPerfectWaveBonus,
  calculateArcadeRushWaveClearBonus,
  calculateArcadeRushWordPoints,
} from "./arcadeRushScoring.js";
import { buildArcadeRushSessionResult } from "./arcadeRushResult.js";

export const ARCADE_RUSH_RUNTIME_VERSION = 2;
export const ARCADE_RUSH_WAVE_TRANSITION_MS = 2_500;
export const ARCADE_RUSH_BOSS_INTRO_MS = 2_500;
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
  BOSS_INTRO: "boss-intro",
  BOSS_ACTIVE: "boss-active",
  AWAITING_BOSS: "awaiting-boss",
  COMPLETE: "complete",
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

function createBossMetricsBaseline(integrity = ARCADE_RUSH_STARTING_INTEGRITY) {
  return {
    correctKeystrokes: 0,
    totalKeystrokes: 0,
    correctCharacters: 0,
    missedCharacters: 0,
    completedWords: 0,
    missedWords: 0,
    successfulPhrases: 0,
    failedPhrases: 0,
    integrityRemaining: integrity,
  };
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
    bossIntroRemainingMs: 0,
    boss: null,
    sessionId: null,
    result: null,
    failureNotified: false,
    completeNotified: false,
    terminalNotified: false,
    wavesCompleteNotified: false,
    bossIntroNotified: false,
    bossStartNotified: false,
    bossCompleteNotified: false,
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
  bossPort,
  source = "arcade-rush-ready",
  developerMode = false,
  callbacks = {},
} = {}) {
  if (!isGeneratedArcadeRushPlan(plan)) return null;
  const runtimePorts = createArcadeRushRuntimePorts(ports);
  if (!runtimePorts) return null;

  const requestedBossPort = bossPort === undefined ? null : bossPort;
  const runtimeBossPort = requestedBossPort === null
    ? null
    : createArcadeRushBossPort(requestedBossPort);
  if (requestedBossPort !== null && !runtimeBossPort) return null;

  let game = createRuntimeState(plan, { source, developerMode });
  let frameId = null;
  let disposed = false;
  let bossEncounter = null;
  let bossMetricsApplied = createBossMetricsBaseline(game.integrity);

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
    return !disposed && [
      RUN_STATES.ACTIVE,
      RUN_STATES.TRANSITIONING,
      RUN_STATES.BOSS_INTRO,
      RUN_STATES.BOSS_ACTIVE,
    ].includes(game.runState);
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

  function beginBossIntro() {
    game.phase = "BOSS_INTRO";
    game.transitionRemainingMs = 0;
    game.transitionNextWave = null;
    runtimePorts.session.setState("transitioning");

    if (!runtimeBossPort) {
      cancelFrame();
      game.runState = RUN_STATES.AWAITING_BOSS;
      return;
    }

    game.runState = RUN_STATES.BOSS_INTRO;
    game.bossIntroRemainingMs = ARCADE_RUSH_BOSS_INTRO_MS;
    if (!game.bossIntroNotified) {
      game.bossIntroNotified = true;
      callbacks.onBossIntro?.(getSnapshot(), snapshot({
        bossId: game.plan.boss.id,
        durationMs: ARCADE_RUSH_BOSS_INTRO_MS,
      }));
    }
    scheduleFrame();
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
      if (!game.wavesCompleteNotified) {
        game.wavesCompleteNotified = true;
        callbacks.onWavesComplete?.(getSnapshot());
      }
      beginBossIntro();
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

  function buildTerminalResult({
    success,
    bossDefeated = false,
    bossTimeRemainingMs = 0,
  }) {
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
      success,
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
      bossDefeated,
      bossTimeRemainingMs,
      integrityRemaining: success ? game.integrity : 0,
      perfectWaves: game.perfectWaves,
      wordPoints: game.wordPoints,
    });
  }

  function finalizeSessionResult(result) {
    if (!result) return null;
    game.result = result;
    game.score = result.score;
    runtimePorts.session.setState("results");
    runtimePorts.session.complete(result);
    return result;
  }

  function failRun({ bossTimeRemainingMs = 0 } = {}) {
    if ([RUN_STATES.FAILED, RUN_STATES.COMPLETE, RUN_STATES.STOPPED].includes(game.runState)) {
      return game.result;
    }
    cancelFrame();
    game.integrity = 0;
    game.phase = "FAILED";
    game.runState = RUN_STATES.FAILED;
    const result = finalizeSessionResult(buildTerminalResult({
      success: false,
      bossDefeated: false,
      bossTimeRemainingMs,
    }));
    if (!game.failureNotified) {
      game.failureNotified = true;
      callbacks.onFailure?.(getSnapshot(), result);
    }
    if (!game.terminalNotified) {
      game.terminalNotified = true;
      callbacks.onTerminal?.(getSnapshot(), result);
    }
    notifyUpdate();
    return result;
  }

  function completeRun() {
    if ([RUN_STATES.COMPLETE, RUN_STATES.FAILED, RUN_STATES.STOPPED].includes(game.runState)) {
      return game.result;
    }
    cancelFrame();
    game.phase = "COMPLETE";
    game.runState = RUN_STATES.COMPLETE;
    const result = finalizeSessionResult(buildTerminalResult({
      success: true,
      bossDefeated: true,
      bossTimeRemainingMs: game.boss?.durationRemainingMs ?? 0,
    }));
    if (!game.bossCompleteNotified) {
      game.bossCompleteNotified = true;
      callbacks.onBossComplete?.(getSnapshot(), result);
    }
    if (!game.completeNotified) {
      game.completeNotified = true;
      callbacks.onComplete?.(getSnapshot(), result);
    }
    if (!game.terminalNotified) {
      game.terminalNotified = true;
      callbacks.onTerminal?.(getSnapshot(), result);
    }
    notifyUpdate();
    return result;
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

  function syncBossSnapshot(explicitSnapshot = null) {
    if (!runtimeBossPort || !bossEncounter) return null;
    const next = explicitSnapshot || runtimeBossPort.getSnapshot(bossEncounter);
    if (!next) return null;

    const completedWords = Math.max(
      0,
      next.completedWords - bossMetricsApplied.completedWords,
    );
    const missedWords = Math.max(
      0,
      next.missedWords - bossMetricsApplied.missedWords,
    );
    const correctKeystrokes = Math.max(
      0,
      next.correctKeystrokes - bossMetricsApplied.correctKeystrokes,
    );
    const totalKeystrokes = Math.max(
      0,
      next.totalKeystrokes - bossMetricsApplied.totalKeystrokes,
    );
    const correctCharacters = Math.max(
      0,
      next.correctCharacters - bossMetricsApplied.correctCharacters,
    );
    const missedCharacters = Math.max(
      0,
      next.missedCharacters - bossMetricsApplied.missedCharacters,
    );
    const successfulPhrases = Math.max(
      0,
      next.successfulPhrases - bossMetricsApplied.successfulPhrases,
    );
    const failedPhrases = Math.max(
      0,
      next.failedPhrases - bossMetricsApplied.failedPhrases,
    );
    const damage = Math.max(
      0,
      bossMetricsApplied.integrityRemaining - next.integrityRemaining,
    );

    game.correctKeystrokes += correctKeystrokes;
    game.totalKeystrokes += totalKeystrokes;
    game.correctCharacters += correctCharacters;
    game.missedCharacters += missedCharacters;
    game.completedWordCount += completedWords;
    game.missedWordCount += missedWords;
    game.totalResolved += completedWords + missedWords;

    if (missedWords > 0 || damage > 0) game.combo = 0;
    if (completedWords > 0) {
      game.combo += completedWords;
      game.maxCombo = Math.max(game.maxCombo, game.combo);
    }

    if (damage > 0) {
      game.coreBreaches += damage;
      for (let hit = 0; hit < damage; hit += 1) {
        runtimePorts.renderer.flashDamage();
      }
    }
    game.integrity = next.integrityRemaining;
    game.boss = next;

    if (successfulPhrases > 0) {
      callbacks.onBossPhraseComplete?.(getSnapshot(), snapshot({
        count: successfulPhrases,
        hp: next.hp,
        completedWords,
      }));
    }
    if (failedPhrases > 0) {
      callbacks.onBossAttack?.(getSnapshot(), snapshot({
        count: failedPhrases,
        damage,
        integrity: next.integrityRemaining,
        missedWords,
      }));
    }

    bossMetricsApplied = {
      correctKeystrokes: next.correctKeystrokes,
      totalKeystrokes: next.totalKeystrokes,
      correctCharacters: next.correctCharacters,
      missedCharacters: next.missedCharacters,
      completedWords: next.completedWords,
      missedWords: next.missedWords,
      successfulPhrases: next.successfulPhrases,
      failedPhrases: next.failedPhrases,
      integrityRemaining: next.integrityRemaining,
    };
    return next;
  }

  function settleBossIfTerminal() {
    if (!game.boss || !runtimeBossPort || !bossEncounter) return false;
    if (!["DEFEATED", "FAILED"].includes(game.boss.phase)) return false;

    const finalized = runtimeBossPort.finalize(bossEncounter);
    if (finalized) syncBossSnapshot(finalized);

    if (game.boss?.phase === "DEFEATED") {
      completeRun();
      return true;
    }

    failRun({
      bossTimeRemainingMs: game.boss?.durationRemainingMs ?? 0,
    });
    return true;
  }

  function handleKey(event) {
    if (game.runState === RUN_STATES.BOSS_ACTIVE) {
      const response = runtimeBossPort?.handleInput(bossEncounter, event);
      const handled = typeof response === "object"
        ? response?.handled === true
        : Boolean(response);
      syncBossSnapshot();
      const terminal = settleBossIfTerminal();
      if (!terminal) notifyUpdate();
      return handled;
    }

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

  function startBossEncounter() {
    if (!runtimeBossPort || game.runState !== RUN_STATES.BOSS_INTRO) return false;
    bossEncounter = runtimeBossPort.createEncounter({
      boss: game.plan.boss,
      seed: game.plan.boss.seed,
      integrityRemaining: game.integrity,
    });
    if (!bossEncounter) {
      cancelFrame();
      game.runState = RUN_STATES.STOPPED;
      runtimePorts.session.setState("aborted");
      callbacks.onBossError?.(getSnapshot(), "boss-creation-failed");
      notifyUpdate();
      return false;
    }
    bossMetricsApplied = createBossMetricsBaseline(game.integrity);
    syncBossSnapshot();
    game.phase = "BOSS";
    game.runState = RUN_STATES.BOSS_ACTIVE;
    game.bossIntroRemainingMs = 0;
    runtimePorts.session.setState("active");
    if (!game.bossStartNotified) {
      game.bossStartNotified = true;
      callbacks.onBossStart?.(getSnapshot(), game.boss);
    }
    return true;
  }

  function tickBossIntro(deltaMs) {
    game.bossIntroRemainingMs = Math.max(
      0,
      game.bossIntroRemainingMs - deltaMs,
    );
    if (game.bossIntroRemainingMs <= 0) startBossEncounter();
  }

  function tickBoss(deltaMs) {
    runtimeBossPort?.update(bossEncounter, deltaMs);
    syncBossSnapshot();
    settleBossIfTerminal();
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
    else if (game.runState === RUN_STATES.BOSS_INTRO) tickBossIntro(deltaMs);
    else if (game.runState === RUN_STATES.BOSS_ACTIVE) tickBoss(deltaMs);

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
        bossId: game.plan.boss.id,
        bossVersion: game.plan.boss.bossVersion,
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
    if (![
      RUN_STATES.ACTIVE,
      RUN_STATES.TRANSITIONING,
      RUN_STATES.BOSS_INTRO,
      RUN_STATES.BOSS_ACTIVE,
    ].includes(game.runState)) return false;
    game.resumeRunState = game.runState;
    game.runState = RUN_STATES.PAUSED;
    cancelFrame();
    runtimePorts.session.setState("paused");
    callbacks.onPause?.(getSnapshot());
    notifyUpdate();
    return true;
  }

  function sessionStateForRunState(runState) {
    return [RUN_STATES.TRANSITIONING, RUN_STATES.BOSS_INTRO].includes(runState)
      ? "transitioning"
      : "active";
  }

  function resume() {
    if (game.runState !== RUN_STATES.PAUSED) return false;
    game.runState = game.resumeRunState || RUN_STATES.ACTIVE;
    game.resumeRunState = null;
    game.lastTimestamp = null;
    runtimePorts.session.setState(sessionStateForRunState(game.runState));
    callbacks.onResume?.(getSnapshot());
    notifyUpdate();
    scheduleFrame();
    return true;
  }

  function stop({ abortSession = true } = {}) {
    cancelFrame();
    if (
      abortSession
      && ![RUN_STATES.FAILED, RUN_STATES.COMPLETE, RUN_STATES.STOPPED].includes(game.runState)
    ) {
      runtimePorts.session.setState("aborted");
    }
    if (![RUN_STATES.FAILED, RUN_STATES.COMPLETE].includes(game.runState)) {
      game.runState = RUN_STATES.STOPPED;
    }
    game.lastTimestamp = null;
    return true;
  }

  function cleanup({ abortSession = true } = {}) {
    stop({ abortSession });
    runtimePorts.renderer.clearWords();
    runtimePorts.input.resetTargeting(game);
    game.words.length = 0;
    game.activeTargetId = null;
    bossEncounter = null;
    game.boss = null;
    callbacks.onCleanup?.(getSnapshot());
    return true;
  }

  function restart({
    plan: nextPlan,
    source: nextSource = source,
    developerMode: nextDeveloperMode = developerMode,
  } = {}) {
    if (!isGeneratedArcadeRushPlan(nextPlan)) return null;
    cleanup({ abortSession: true });
    game = createRuntimeState(nextPlan, {
      source: nextSource,
      developerMode: nextDeveloperMode,
    });
    bossEncounter = null;
    bossMetricsApplied = createBossMetricsBaseline(game.integrity);
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
