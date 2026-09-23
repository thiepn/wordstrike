const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};

export const FLOW_V3_BOARD_KEY = "flow-standard-v1";

export const FLOW_SCORE_V3_RULES = Object.freeze({
  contractVersion: 2,
  rulesVersion: 3,
  metricVersion: 2,
  pointsPerCorrectCharacter: 10,
  baselineWpm: 60,
  minimumSpeedMultiplier: 0.75,
  maximumSpeedMultiplier: 2.25,
  accuracyExponent: 3,
  consistencyFloor: 0.9,
  consistencyWeight: 0.1,
  maximumEnduranceBonus: 0.6,
  enduranceCharactersForMaximumBonus: 10_000,
  minimumRecordAccuracy: 90,
  minimumRecordCharacters: 250,
  minimumRecordDurationMs: 20_000,
  minimumConsistencySamples: 20,
});

export function calculateFlowScoreV3({
  correctCharacters = 0,
  wpm = 0,
  accuracy = 0,
  consistency = 0,
} = {}) {
  const scoredCharacters = Math.max(0, Math.round(finite(correctCharacters)));
  const measuredWpm = Math.max(0, finite(wpm));
  const scoredAccuracy = clamp(finite(accuracy), 0, 100);
  const scoredConsistency = clamp(finite(consistency), 0, 100);
  const volumePoints = scoredCharacters * FLOW_SCORE_V3_RULES.pointsPerCorrectCharacter;
  const speedMultiplier = clamp(
    measuredWpm / FLOW_SCORE_V3_RULES.baselineWpm,
    FLOW_SCORE_V3_RULES.minimumSpeedMultiplier,
    FLOW_SCORE_V3_RULES.maximumSpeedMultiplier,
  );
  const accuracyMultiplier = Math.pow(
    scoredAccuracy / 100,
    FLOW_SCORE_V3_RULES.accuracyExponent,
  );
  const consistencyMultiplier = FLOW_SCORE_V3_RULES.consistencyFloor
    + (FLOW_SCORE_V3_RULES.consistencyWeight * (scoredConsistency / 100));
  const enduranceProgress = clamp(
    scoredCharacters / FLOW_SCORE_V3_RULES.enduranceCharactersForMaximumBonus,
    0,
    1,
  );
  const enduranceMultiplier = 1
    + (FLOW_SCORE_V3_RULES.maximumEnduranceBonus * enduranceProgress);
  const score = Math.round(
    volumePoints
      * speedMultiplier
      * accuracyMultiplier
      * consistencyMultiplier
      * enduranceMultiplier,
  );

  return Object.freeze({
    score,
    correctCharacters: scoredCharacters,
    standardWords: Math.floor(scoredCharacters / 5),
    volumePoints,
    wpm: round(measuredWpm, 1),
    accuracy: round(scoredAccuracy, 2),
    consistency: round(scoredConsistency, 1),
    speedMultiplier: round(speedMultiplier, 6),
    accuracyMultiplier: round(accuracyMultiplier, 6),
    consistencyMultiplier: round(consistencyMultiplier, 6),
    enduranceMultiplier: round(enduranceMultiplier, 6),
    rulesVersion: FLOW_SCORE_V3_RULES.rulesVersion,
    metricVersion: FLOW_SCORE_V3_RULES.metricVersion,
  });
}

export function createFlowScoreV3Result({
  sessionId,
  endedAt = Date.now(),
  endedReason = "reset",
  snapshot,
  plan,
} = {}) {
  if (!snapshot || !plan || plan.gameplayVersion !== 3 || plan.structure !== "continuous-stream") {
    return null;
  }
  const cadence = snapshot.cadence || {};
  const gameplay = snapshot.gameplay || {};
  const consistencyAvailable = Number.isFinite(Number(cadence.cadenceScore))
    && finite(cadence.sampleCount) >= FLOW_SCORE_V3_RULES.minimumConsistencySamples;
  const consistency = consistencyAvailable ? finite(cadence.cadenceScore) : 0;
  const correctCharacters = Math.max(0, Math.round(
    finite(snapshot.correctChars, finite(snapshot.currentIndex) - finite(snapshot.uncorrectedErrors)),
  ));
  const breakdown = calculateFlowScoreV3({
    correctCharacters,
    wpm: cadence.finalWpm,
    accuracy: gameplay.accuracyPercent,
    consistency,
  });
  const activeDurationMs = Math.max(0, round(cadence.typingDurationMs, 1));
  const recordEligible = consistencyAvailable
    && activeDurationMs >= FLOW_SCORE_V3_RULES.minimumRecordDurationMs
    && breakdown.correctCharacters >= FLOW_SCORE_V3_RULES.minimumRecordCharacters
    && breakdown.wpm > 0
    && breakdown.accuracy >= FLOW_SCORE_V3_RULES.minimumRecordAccuracy;
  const normalizedReason = ["reset", "complete", "exit", "theme-change"].includes(endedReason)
    ? endedReason
    : "reset";

  return Object.freeze({
    schemaVersion: 1,
    contractVersion: FLOW_SCORE_V3_RULES.contractVersion,
    rulesVersion: FLOW_SCORE_V3_RULES.rulesVersion,
    metricVersion: FLOW_SCORE_V3_RULES.metricVersion,
    modeId: "flow",
    variantId: "flow-v3",
    boardKey: FLOW_V3_BOARD_KEY,
    sessionId: String(sessionId || ""),
    endedAt: Math.max(0, finite(endedAt)),
    endedReason: normalizedReason,
    sessionLength: "flow",
    completed: breakdown.correctCharacters > 0,
    recordEligible,
    score: breakdown.score,
    wpm: breakdown.wpm,
    rawWpm: round(cadence.rawWpm, 1),
    accuracy: breakdown.accuracy,
    consistency: breakdown.consistency,
    consistencySamples: Math.max(0, Math.round(finite(cadence.sampleCount))),
    activeDurationMs,
    wordsCompleted: breakdown.standardWords,
    charactersCompleted: Math.max(0, Math.round(finite(snapshot.currentIndex))),
    correctCharacters: breakdown.correctCharacters,
    correctKeystrokes: Math.max(0, Math.round(finite(gameplay.correctKeystrokes))),
    incorrectKeystrokes: Math.max(0, Math.round(finite(gameplay.incorrectKeystrokes))),
    correctedErrors: Math.max(0, Math.round(finite(snapshot.correctedErrors))),
    unresolvedErrors: Math.max(0, Math.round(finite(snapshot.uncorrectedErrors))),
    textId: String(plan.id || ""),
    seed: String(plan.seed || ""),
    theme: String(plan.theme || "mixed"),
    seriesIds: Object.freeze(Array.isArray(plan.seriesIds) ? plan.seriesIds.map(String) : []),
    scoreBreakdown: breakdown,
  });
}

export function compareFlowScoreV3Results(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  for (const key of ["score", "correctCharacters", "accuracy", "wpm", "consistency"]) {
    const a = finite(left[key]);
    const b = finite(right[key]);
    if (a === b) continue;
    return a > b ? -1 : 1;
  }
  const endedA = finite(left.endedAt, Number.MAX_SAFE_INTEGER);
  const endedB = finite(right.endedAt, Number.MAX_SAFE_INTEGER);
  return endedA === endedB ? 0 : endedA < endedB ? -1 : 1;
}
