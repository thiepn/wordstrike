import {
  getFlowModifierGameplayScales,
  getFlowModifierScoreBreakdown,
} from "./flowModifiers.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const FLOW_GAMEPLAY_EVENT_RETAIN_LIMIT = 4096;
const FLOW_GAMEPLAY_EVENT_TRIM_TO = 3072;

export const FLOW_GAMEPLAY_RULES = Object.freeze({
  startingFlow: 60,
  flow: Object.freeze({
    correctCharacterGain: 0.35,
    incorrectCharacterLoss: 8,
    correctedErrorRecovery: 1.5,
    correctBackspaceLoss: 1,
    cleanWordBonus: 1.5,
    cleanSentenceBonus: 4,
  }),
  momentum: Object.freeze({
    maxCharge: 120,
    correctCharacterGain: 1,
    incorrectCharacterLoss: 14,
    correctedErrorRecovery: 2,
    correctBackspaceLoss: 2,
    cleanWordBonus: 2,
    cleanSentenceBonus: 5,
  }),
  difficultyMultipliers: Object.freeze({
    smooth: 1,
    natural: 1.1,
    advanced: 1.25,
    expert: 1.45,
  }),
  basePointsPerCorrectCharacter: 10,
  accuracyExponent: 1.5,
});

export function getFlowMomentumMultiplier(charge) {
  const safe = clamp(Number(charge) || 0, 0, FLOW_GAMEPLAY_RULES.momentum.maxCharge);
  if (safe >= 100) return 2.5;
  if (safe >= 70) return 2;
  if (safe >= 40) return 1.5;
  if (safe >= 20) return 1.2;
  return 1;
}

function getDifficultyMultiplier(difficulty) {
  return FLOW_GAMEPLAY_RULES.difficultyMultipliers[difficulty]
    ?? FLOW_GAMEPLAY_RULES.difficultyMultipliers.natural;
}

function currentAccuracy(run) {
  const total = (run.correctKeystrokes || 0) + (run.incorrectKeystrokes || 0);
  if (total <= 0) return 100;
  return ((run.correctKeystrokes || 0) / total) * 100;
}

function currentAverageFlow(run) {
  if ((run.flowSampleCount || 0) <= 0) return run.flowValue;
  return run.flowSampleTotal / run.flowSampleCount;
}

function currentAverageMomentum(run) {
  if ((run.momentumSampleCount || 0) <= 0) return run.momentum;
  return run.momentumSampleTotal / run.momentumSampleCount;
}

function flowScoreMultiplier(averageFlow) {
  return 0.75 + (clamp(averageFlow, 0, 100) / 200);
}

export function calculateFlowScore(run) {
  if (!run) return Object.freeze({ score: 0 });
  const accuracy = currentAccuracy(run);
  const averageFlow = currentAverageFlow(run);
  const averageMomentum = currentAverageMomentum(run);
  const difficultyMultiplier = getDifficultyMultiplier(run.difficulty);
  const modifierBreakdown = getFlowModifierScoreBreakdown(run);
  const modifierMultiplier = modifierBreakdown.multiplier;
  const accuracyMultiplier = Number(
    Math.pow(clamp(accuracy, 0, 100) / 100, FLOW_GAMEPLAY_RULES.accuracyExponent).toFixed(4),
  );
  const flowMultiplier = Number(flowScoreMultiplier(averageFlow).toFixed(4));
  const scoredAverageMomentum = Number(averageMomentum.toFixed(3));
  const characterBase = Math.max(0, Number(run.correctChars) || 0) * FLOW_GAMEPLAY_RULES.basePointsPerCorrectCharacter;
  const score = Math.round(
    characterBase
      * difficultyMultiplier
      * accuracyMultiplier
      * flowMultiplier
      * scoredAverageMomentum
      * modifierMultiplier,
  );
  return Object.freeze({
    score,
    characterBase,
    correctCharacters: Math.max(0, Number(run.correctChars) || 0),
    difficultyMultiplier,
    accuracyPercent: Number(accuracy.toFixed(2)),
    accuracyMultiplier,
    averageFlow: Number(averageFlow.toFixed(2)),
    flowMultiplier,
    averageMomentum: scoredAverageMomentum,
    modifierMultiplier,
    modifierEntries: modifierBreakdown.entries,
  });
}

function syncScore(run) {
  const breakdown = calculateFlowScore(run);
  run.score = breakdown.score;
  run.scoreBreakdown = breakdown;
  return breakdown;
}

function setFlow(run, nextValue) {
  run.flowValue = Number(clamp(nextValue, 0, 100).toFixed(2));
  run.peakFlow = Math.max(run.peakFlow || 0, run.flowValue);
}

function setMomentumCharge(run, nextCharge) {
  run.momentumCharge = Number(clamp(
    nextCharge,
    0,
    FLOW_GAMEPLAY_RULES.momentum.maxCharge,
  ).toFixed(2));
  run.momentum = getFlowMomentumMultiplier(run.momentumCharge);
  run.peakMomentum = Math.max(run.peakMomentum || 1, run.momentum);
}

function sampleQuality(run) {
  run.flowSampleTotal += run.flowValue;
  run.flowSampleCount += 1;
  run.momentumSampleTotal += run.momentum;
  run.momentumSampleCount += 1;
}

function recordGameplayEvent(run, event) {
  if (run.gameplayEvents.length >= FLOW_GAMEPLAY_EVENT_RETAIN_LIMIT) {
    const removeCount = run.gameplayEvents.length - FLOW_GAMEPLAY_EVENT_TRIM_TO;
    run.gameplayEvents.splice(0, removeCount);
    run.gameplayEventsDropped = (run.gameplayEventsDropped || 0) + removeCount;
  }
  run.gameplayEvents.push(Object.freeze({
    ...event,
    flow: run.flowValue,
    momentumCharge: run.momentumCharge,
    momentum: run.momentum,
    score: run.score,
  }));
}

export function initializeFlowGameplay(run) {
  if (!run || typeof run !== "object") return run;
  run.flowValue = FLOW_GAMEPLAY_RULES.startingFlow;
  run.peakFlow = run.flowValue;
  run.momentumCharge = 0;
  run.momentum = 1;
  run.peakMomentum = 1;
  run.furthestIndexReached = 0;
  run.correctKeystrokes = 0;
  run.incorrectKeystrokes = 0;
  run.flowSampleTotal = 0;
  run.flowSampleCount = 0;
  run.momentumSampleTotal = 0;
  run.momentumSampleCount = 0;
  run.gameplayEvents = [];
  run.gameplayEventsDropped = 0;
  run.score = 0;
  run.scoreBreakdown = calculateFlowScore(run);
  return run;
}

export function applyFlowInsertGameplay(run, event) {
  if (!run || !event) return null;
  const correct = event.correct === true;
  const newProgress = event.newProgress === true;
  const modifierScales = getFlowModifierGameplayScales(run);
  if (correct) run.correctKeystrokes += 1;
  else run.incorrectKeystrokes += 1;

  if (!correct) {
    setFlow(run, run.flowValue - (FLOW_GAMEPLAY_RULES.flow.incorrectCharacterLoss * modifierScales.incorrectLossScale));
    setMomentumCharge(run, run.momentumCharge - (FLOW_GAMEPLAY_RULES.momentum.incorrectCharacterLoss * modifierScales.incorrectLossScale));
  } else if (newProgress) {
    setFlow(run, run.flowValue + FLOW_GAMEPLAY_RULES.flow.correctCharacterGain);
    setMomentumCharge(run, run.momentumCharge + FLOW_GAMEPLAY_RULES.momentum.correctCharacterGain);
    if (event.cleanWord === true) {
      setFlow(run, run.flowValue + FLOW_GAMEPLAY_RULES.flow.cleanWordBonus);
      setMomentumCharge(run, run.momentumCharge + FLOW_GAMEPLAY_RULES.momentum.cleanWordBonus);
    }
    if (event.cleanSentence === true) {
      setFlow(run, run.flowValue + FLOW_GAMEPLAY_RULES.flow.cleanSentenceBonus);
      setMomentumCharge(run, run.momentumCharge + FLOW_GAMEPLAY_RULES.momentum.cleanSentenceBonus);
    }
  }

  if (newProgress) {
    run.furthestIndexReached = Math.max(run.furthestIndexReached, event.index + 1);
    sampleQuality(run);
  }

  const breakdown = syncScore(run);
  recordGameplayEvent(run, {
    type: "insert",
    index: event.index,
    correct,
    newProgress,
    cleanWord: event.cleanWord === true,
    cleanSentence: event.cleanSentence === true,
    at: event.at,
  });
  return breakdown;
}

export function applyFlowBackspaceGameplay(run, event) {
  if (!run || !event?.removed) return null;
  const removed = event.removed;
  const modifierScales = getFlowModifierGameplayScales(run);
  if (removed.correct === true) {
    setFlow(run, run.flowValue - (FLOW_GAMEPLAY_RULES.flow.correctBackspaceLoss * modifierScales.correctBackspaceLossScale));
    setMomentumCharge(run, run.momentumCharge - (FLOW_GAMEPLAY_RULES.momentum.correctBackspaceLoss * modifierScales.correctBackspaceLossScale));
  } else {
    setFlow(run, run.flowValue + (FLOW_GAMEPLAY_RULES.flow.correctedErrorRecovery * modifierScales.correctedRecoveryScale));
    setMomentumCharge(run, run.momentumCharge + (FLOW_GAMEPLAY_RULES.momentum.correctedErrorRecovery * modifierScales.correctedRecoveryScale));
  }
  const breakdown = syncScore(run);
  recordGameplayEvent(run, {
    type: "backspace",
    index: removed.index,
    correctedError: removed.correct !== true,
    at: event.at,
  });
  return breakdown;
}

export function finalizeFlowGameplay(run) {
  if (!run) return null;
  const breakdown = syncScore(run);
  run.finalFlow = run.flowValue;
  run.finalMomentum = run.momentum;
  return breakdown;
}

export function getFlowGameplaySnapshot(run) {
  if (!run) return null;
  return Object.freeze({
    flowValue: run.flowValue,
    finalFlow: run.finalFlow ?? null,
    peakFlow: run.peakFlow,
    averageFlow: Number(currentAverageFlow(run).toFixed(2)),
    momentumCharge: run.momentumCharge,
    momentum: run.momentum,
    finalMomentum: run.finalMomentum ?? null,
    peakMomentum: run.peakMomentum,
    averageMomentum: Number(currentAverageMomentum(run).toFixed(3)),
    correctKeystrokes: run.correctKeystrokes,
    incorrectKeystrokes: run.incorrectKeystrokes,
    accuracyPercent: Number(currentAccuracy(run).toFixed(2)),
    score: run.score,
    scoreBreakdown: run.scoreBreakdown ? { ...run.scoreBreakdown } : calculateFlowScore(run),
    furthestIndexReached: run.furthestIndexReached,
    gameplayEvents: run.gameplayEvents.map((event) => ({ ...event })),
    gameplayEventsDropped: Math.max(0, Number(run.gameplayEventsDropped) || 0),
  });
}
