import { PRACTICE_ABILITY_POLICY_V1 } from "./practiceAbilityPolicy.js";
import { PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION } from "./practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freeze = (value) => Object.freeze(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const DAY_MS = 86_400_000;

export function calculatePracticePaceLadderDifficultyAdjustment(formTypability) {
  const status = formTypability?.status ?? "insufficient";
  const difficultyIndex = Number.isFinite(formTypability?.difficultyIndex) ? formTypability.difficultyIndex : null;
  const coverage = Number.isFinite(formTypability?.availableModelWeight) ? clamp(formTypability.availableModelWeight, 0, 1) : 0;
  if (!["full", "partial"].includes(status) || difficultyIndex == null || coverage < 0.90) return freeze({ status: "unadjusted", adjustmentLog: 0, difficultyIndex, coverage });
  const adjustmentLog = clamp(PRACTICE_ABILITY_POLICY_V1.difficulty.logCoefficient * difficultyIndex * coverage, -PRACTICE_ABILITY_POLICY_V1.difficulty.maxAbsoluteLogAdjustment, PRACTICE_ABILITY_POLICY_V1.difficulty.maxAbsoluteLogAdjustment);
  return freeze({ status: "adjusted", adjustmentLog, difficultyIndex, coverage });
}

export function resolvePracticePaceLadderFrontierAnchor({ controlFrontier = null, difficultyAdjustmentLog = 0, now = () => new Date(), policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  const status = controlFrontier?.status;
  const confidence = controlFrontier?.confidence;
  const frontierWpm = Number(controlFrontier?.frontierWpm);
  const updatedAtMs = Date.parse(controlFrontier?.updatedAt ?? "");
  const nowValue = typeof now === "function" ? now() : now;
  const nowMs = (nowValue instanceof Date ? nowValue : new Date(nowValue)).getTime();
  const ageMs = Number.isFinite(updatedAtMs) && Number.isFinite(nowMs) ? Math.max(0, nowMs - updatedAtMs) : Infinity;
  if (!["bracketed", "lower-bound"].includes(status) || !["medium", "high"].includes(confidence) || !Number.isFinite(frontierWpm) || frontierWpm <= 0 || ageMs > 45 * DAY_MS) return freeze({ version: PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION, source: "in-session-reference", status: "pending", rawAnchorWpm: null, effectiveWpm: null });
  const adjustment = Number.isFinite(difficultyAdjustmentLog) ? difficultyAdjustmentLog : 0;
  const rawAnchorWpm = clamp(frontierWpm * Math.exp(-adjustment), policy.targetMinimumWpm, policy.targetMaximumWpm);
  return freeze({ version: PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION, source: "pl14-frontier", status: "ready", rawAnchorWpm, effectiveWpm: frontierWpm, frontierStatus: status, frontierConfidence: confidence, frontierUpdatedAt: controlFrontier.updatedAt, frontierIsLowerBound: status === "lower-bound" });
}

export function resolvePracticePaceLadderReferenceAnchor({ acceptedForwardInsertions, firstPassAccuracy, grossWpm, coverage, interrupted = false, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  const accuracyRatio = Number.isFinite(firstPassAccuracy) ? (firstPassAccuracy > 1 ? firstPassAccuracy / 100 : firstPassAccuracy) : null;
  const eligible = !interrupted && coverage === "complete" && Number(acceptedForwardInsertions) >= policy.referenceMinimumAcceptedForwardInsertions && Number.isFinite(accuracyRatio) && accuracyRatio >= policy.referenceMinimumFirstPassAccuracy && Number.isFinite(grossWpm) && grossWpm > 0;
  const rawAnchorWpm = eligible ? clamp(grossWpm, policy.targetMinimumWpm, policy.targetMaximumWpm) : null;
  return freeze({ version: PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION, source: "in-session-reference", status: eligible ? "ready" : "insufficient-measurement", rawAnchorWpm, effectiveWpm: rawAnchorWpm, referenceAccuracy: accuracyRatio, acceptedForwardInsertions: Number(acceptedForwardInsertions || 0) });
}

// Legacy-reader compatibility only; no canonical launch path consumes ordinary/user anchors.
export function isOrdinaryPaceAnchorSession() { return false; }
export function deriveOrdinaryPracticeAnchor() { return freeze({ measuredWpm: null, sampleCount: 0, sourceExperimentIds: [] }); }
export function resolvePracticePaceLadderAnchor(input = {}) { return resolvePracticePaceLadderFrontierAnchor(input); }
export function resolvePracticePaceLadderCalibration(input = {}) { const anchor = resolvePracticePaceLadderReferenceAnchor({ acceptedForwardInsertions: input.acceptedForwardInsertions ?? input.correctedChars, firstPassAccuracy: input.firstPassAccuracy ?? 1, grossWpm: input.grossWpm ?? input.correctedWpm, coverage: input.coverage, interrupted: input.interrupted }); return freeze({ eligible: anchor.status === "ready", status: anchor.status, calibrationWpm: anchor.rawAnchorWpm }); }
