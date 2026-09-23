const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};

export const FLOW_SCORE_V2_RULES = Object.freeze({
  rulesVersion: 2,
  metricVersion: 1,
  pointsPerWpm: 1000,
  accuracyExponent: 5,
  consistencyFloor: 0.85,
  consistencyWeight: 0.15,
  maximumScoredWpm: 300,
  minimumRecordAccuracy: 90,
  minimumConsistencySamples: 5,
});

export const FLOW_V2_BOARD_KEYS = Object.freeze({
  quick: "flow-quick-v1",
  standard: "flow-standard-v1",
  long: "flow-long-v1",
});

export function calculateFlowScoreV2({
  wpm = 0,
  accuracy = 0,
  consistency = 0,
} = {}) {
  const measuredWpm = Math.max(0, finite(wpm));
  const scoredWpm = clamp(measuredWpm, 0, FLOW_SCORE_V2_RULES.maximumScoredWpm);
  const scoredAccuracy = clamp(finite(accuracy), 0, 100);
  const scoredConsistency = clamp(finite(consistency), 0, 100);
  const accuracyMultiplier = Math.pow(scoredAccuracy / 100, FLOW_SCORE_V2_RULES.accuracyExponent);
  const consistencyMultiplier = FLOW_SCORE_V2_RULES.consistencyFloor
    + (FLOW_SCORE_V2_RULES.consistencyWeight * (scoredConsistency / 100));
  const score = Math.round(
    FLOW_SCORE_V2_RULES.pointsPerWpm
      * scoredWpm
      * accuracyMultiplier
      * consistencyMultiplier,
  );
  return Object.freeze({
    score,
    wpm: round(measuredWpm, 1),
    scoredWpm: round(scoredWpm, 1),
    accuracy: round(scoredAccuracy, 2),
    consistency: round(scoredConsistency, 1),
    accuracyMultiplier: round(accuracyMultiplier, 6),
    consistencyMultiplier: round(consistencyMultiplier, 6),
    pointsPerWpm: FLOW_SCORE_V2_RULES.pointsPerWpm,
    rulesVersion: FLOW_SCORE_V2_RULES.rulesVersion,
    metricVersion: FLOW_SCORE_V2_RULES.metricVersion,
  });
}

function safeLength(value) {
  return ["quick", "standard", "long"].includes(value) ? value : "standard";
}

export function createFlowScoreV2Result({
  sessionId,
  endedAt = Date.now(),
  snapshot,
  plan,
} = {}) {
  if (!snapshot || !plan || plan.gameplayVersion !== 2 || plan.structure !== "continuous-longform") {
    return null;
  }
  const cadence = snapshot.cadence || {};
  const gameplay = snapshot.gameplay || {};
  const sessionLength = safeLength(plan.sessionLength || snapshot.sessionLength);
  const consistencyAvailable = Number.isFinite(Number(cadence.cadenceScore))
    && finite(cadence.sampleCount) >= FLOW_SCORE_V2_RULES.minimumConsistencySamples;
  const consistency = consistencyAvailable ? finite(cadence.cadenceScore) : 0;
  const breakdown = calculateFlowScoreV2({
    wpm: cadence.finalWpm,
    accuracy: gameplay.accuracyPercent,
    consistency,
  });
  const completed = snapshot.phase === "complete"
    && finite(snapshot.currentIndex) >= finite(snapshot.passageLength);
  const recordEligible = completed
    && consistencyAvailable
    && breakdown.wpm > 0
    && breakdown.accuracy >= FLOW_SCORE_V2_RULES.minimumRecordAccuracy;

  return Object.freeze({
    schemaVersion: 1,
    contractVersion: 1,
    rulesVersion: FLOW_SCORE_V2_RULES.rulesVersion,
    metricVersion: FLOW_SCORE_V2_RULES.metricVersion,
    modeId: "flow",
    variantId: `flow-${sessionLength}-v2`,
    boardKey: FLOW_V2_BOARD_KEYS[sessionLength],
    sessionId: String(sessionId || ""),
    endedAt: Math.max(0, finite(endedAt)),
    sessionLength,
    completed,
    recordEligible,
    score: breakdown.score,
    wpm: breakdown.wpm,
    rawWpm: round(cadence.rawWpm, 1),
    accuracy: breakdown.accuracy,
    consistency: breakdown.consistency,
    activeDurationMs: Math.max(0, round(cadence.typingDurationMs, 1)),
    wordsCompleted: Math.max(0, Math.round(finite(plan.wordCount, snapshot.wordTimings?.length || 0))),
    charactersCompleted: Math.max(0, Math.round(finite(snapshot.currentIndex))),
    correctKeystrokes: Math.max(0, Math.round(finite(gameplay.correctKeystrokes))),
    incorrectKeystrokes: Math.max(0, Math.round(finite(gameplay.incorrectKeystrokes))),
    correctedErrors: Math.max(0, Math.round(finite(snapshot.correctedErrors))),
    unresolvedErrors: Math.max(0, Math.round(finite(snapshot.uncorrectedErrors))),
    textId: String(plan.id || ""),
    seed: String(plan.seed || ""),
    seriesIds: Object.freeze(Array.isArray(plan.seriesIds) ? plan.seriesIds.map(String) : []),
    scoreBreakdown: breakdown,
  });
}

export function compareFlowScoreV2Results(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  const metrics = [
    ["score", true],
    ["accuracy", true],
    ["wpm", true],
    ["consistency", true],
  ];
  for (const [key, higherWins] of metrics) {
    const a = finite(left[key]);
    const b = finite(right[key]);
    if (a === b) continue;
    return higherWins ? (a > b ? -1 : 1) : (a < b ? -1 : 1);
  }
  const endedA = finite(left.endedAt, Number.MAX_SAFE_INTEGER);
  const endedB = finite(right.endedAt, Number.MAX_SAFE_INTEGER);
  return endedA === endedB ? 0 : endedA < endedB ? -1 : 1;
}
