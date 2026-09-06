import { hashPracticeContent } from "./practiceIds.js";
import { PRACTICE_TRANSFER_SELECTION_POLICY_VERSION } from "./practiceEvaluationConstants.js";
import { assertPracticeEvaluationOptionsTargetBlind } from "./practiceEvaluationValidation.js";
import { getPracticeTransferPoolExposure } from "./practiceEvaluationState.js";

const ALLOWED = new Set(["profileId", "contextId", "poolId", "pool", "evaluationState", "selectionPolicyVersion"]);

function selectionRank(profileId, poolId, unitId, version) {
  return hashPracticeContent(`${version}|${profileId}|${poolId}|${unitId}`);
}

export function selectPracticeColdTransferUnit(options = {}) {
  assertPracticeEvaluationOptionsTargetBlind(options, ALLOWED);
  const {
    profileId,
    poolId,
    pool,
    evaluationState,
    selectionPolicyVersion = PRACTICE_TRANSFER_SELECTION_POLICY_VERSION,
  } = options;
  if (typeof profileId !== "string" || !profileId) throw new TypeError("Cold-transfer selection requires profileId");
  if (!pool || pool.poolId !== poolId || pool.status !== "ready") {
    const error = new Error("Cold-transfer pool is not ready");
    error.code = "PRACTICE_TRANSFER_POOL_NOT_READY";
    throw error;
  }
  const lane = getPracticeTransferPoolExposure(evaluationState, poolId, pool.poolVersion);
  const claimed = new Set(lane?.claimedUnitIds ?? []);
  const reserved = new Set((evaluationState?.activeReservations ?? [])
    .filter((entry) => entry.kind === "cold-transfer" && entry.poolId === poolId)
    .map((entry) => entry.selectedUnitId));
  const candidates = pool.units
    .filter((unit) => !claimed.has(unit.unitId) && !reserved.has(unit.unitId))
    .map((unit) => ({ unit, rank: selectionRank(profileId, poolId, unit.unitId, selectionPolicyVersion) }))
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.unit.unitId.localeCompare(b.unit.unitId));
  if (!candidates.length) {
    const error = new Error("Cold-transfer pool exhausted");
    error.code = "COLD_TRANSFER_POOL_EXHAUSTED";
    throw error;
  }
  return Object.freeze({
    status: "selected",
    poolId,
    poolVersion: pool.poolVersion,
    unitId: candidates[0].unit.unitId,
    unitVersion: candidates[0].unit.unitVersion,
    selectionPolicyVersion,
  });
}
