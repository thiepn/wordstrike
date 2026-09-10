import { PRACTICE_ABILITY_POLICY_V1 } from "./practiceAbilityPolicy.js";
import { PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION } from "./practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freeze = (value) => Object.freeze(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function calculatePracticePaceLadderDifficultyAdjustment(formTypability) {
  const status = formTypability?.status ?? "insufficient";
  const difficultyIndex = Number.isFinite(formTypability?.difficultyIndex) ? formTypability.difficultyIndex : null;
  const coverage = Number.isFinite(formTypability?.availableModelWeight) ? clamp(formTypability.availableModelWeight, 0, 1) : 0;
  if (!["full", "partial"].includes(status) || difficultyIndex == null || coverage <= 0) return freeze({ status: "unadjusted", adjustmentLog: 0, difficultyIndex, coverage });
  const adjustmentLog = clamp(PRACTICE_ABILITY_POLICY_V1.difficulty.logCoefficient * difficultyIndex * coverage, -PRACTICE_ABILITY_POLICY_V1.difficulty.maxAbsoluteLogAdjustment, PRACTICE_ABILITY_POLICY_V1.difficulty.maxAbsoluteLogAdjustment);
  return freeze({ status: "adjusted", adjustmentLog, difficultyIndex, coverage });
}

export function isOrdinaryPaceAnchorSession(summary) {
  return Boolean(summary
    && summary.status === "completed"
    && summary.experimentId === "real-text"
    && !summary.assessmentBinding
    && !summary.coachBinding
    && !summary.evaluationSummary
    && !summary.retentionReviewSummary
    && (summary.targetEntities?.length ?? 0) === 0
    && Number.isFinite(summary.wpm)
    && summary.wpm > 0
    && Number.isFinite(summary.accuracy)
    && summary.accuracy >= 85);
}

export function deriveOrdinaryPracticeAnchor(sessionSummaries = [], { maximumSamples = 5 } = {}) {
  const eligible = sessionSummaries.filter(isOrdinaryPaceAnchorSession)
    .sort((a, b) => String(b.completedAtUtc ?? b.updatedAt ?? "").localeCompare(String(a.completedAtUtc ?? a.updatedAt ?? "")))
    .slice(0, maximumSamples);
  const value = median(eligible.map((item) => item.wpm));
  return freeze({ measuredWpm: value, sampleCount: eligible.length, sourceExperimentIds: eligible.length ? ["real-text"] : [] });
}

export function resolvePracticePaceLadderAnchor({ userSelectedWpm = null, ordinaryPerformance = null, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  const requested = Number(userSelectedWpm);
  if (Number.isFinite(requested) && requested >= policy.targetMinimumWpm && requested <= policy.targetMaximumWpm) return freeze({
    version: PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION,
    source: "user-selected",
    requestedWpm: requested,
    measuredWpm: null,
    effectiveWpm: requested,
    calibrationWpm: null,
    calibrationEligible: false,
  });
  const measured = Number(ordinaryPerformance?.measuredWpm);
  if (Number.isFinite(measured) && measured >= policy.targetMinimumWpm && measured <= policy.targetMaximumWpm) return freeze({
    version: PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION,
    source: "ordinary-performance",
    requestedWpm: null,
    measuredWpm: measured,
    effectiveWpm: measured,
    calibrationWpm: null,
    calibrationEligible: false,
  });
  return freeze({ version: PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION, source: "unavailable", requestedWpm: null, measuredWpm: null, effectiveWpm: null, calibrationWpm: null, calibrationEligible: false });
}

export function resolvePracticePaceLadderCalibration({ usableSeconds, correctedChars, coverage, interrupted = false, correctedWpm = null, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  const eligible = !interrupted && coverage === "complete" && Number(usableSeconds) >= policy.calibrationMinimumUsableSeconds && Number(correctedChars) >= policy.calibrationMinimumCorrectedCharacters && Number.isFinite(correctedWpm) && correctedWpm > 0;
  return freeze({ eligible, status: eligible ? "eligible" : "insufficient-measurement", calibrationWpm: eligible ? correctedWpm : null });
}
