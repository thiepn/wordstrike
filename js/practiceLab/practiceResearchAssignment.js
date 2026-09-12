import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import {
  PRACTICE_RESEARCH_FOCUSED_MAPPING,
  PRACTICE_RESEARCH_POLICY,
  PRACTICE_RESEARCH_RANDOMIZATION_VERSION,
} from "./practiceResearchConstants.js";
import { derivePracticeResearchArm } from "./practiceResearchRandomization.js";

const iso = (value) => new Date(value).toISOString();
const localDay = (value) => {
  const date = new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export function getPracticeResearchFocusedExperiment(entityType) { return PRACTICE_RESEARCH_FOCUSED_MAPPING[entityType] ?? null; }

export function evaluatePracticeResearchTargetEligibility(candidate, { now = Date.now() } = {}) {
  const reasons = [];
  if (!candidate || !PRACTICE_RESEARCH_FOCUSED_MAPPING[candidate.entityType]) reasons.push("unsupported-entity-type");
  if (!["likely", "confirmed"].includes(candidate?.weaknessStatus)) reasons.push("weakness-status");
  if (!["independent", "partial"].includes(candidate?.hierarchyStatus)) reasons.push("hierarchy-status");
  if (candidate?.stableAnchor === true) reasons.push("stable-anchor");
  if (["supported", "resolved"].includes(candidate?.saturationStatus) === false) reasons.push("saturation");
  if (!(Number(candidate?.learningHeadroom) > 0)) reasons.push("no-learning-headroom");
  if (!(Number(candidate?.bossTargetUtility) >= 35)) reasons.push("boss-utility");
  if (candidate?.bossContentReady !== true) reasons.push("boss-content-unavailable");
  if (candidate?.focusedContentReady !== true) reasons.push("focused-content-unavailable");
  if (candidate?.canonicalTreatment !== PRACTICE_RESEARCH_FOCUSED_MAPPING[candidate?.entityType]) reasons.push("canonical-treatment-mismatch");
  if (candidate?.retentionReviewState === "due" || candidate?.retentionReviewState === "overdue") reasons.push("retention-review-conflict");
  if (candidate?.coachConflict === true) reasons.push("coach-conflict");
  const at = now instanceof Date ? now.getTime() : Number(now);
  if (Number.isFinite(Date.parse(candidate?.lastDirectPractisedAt)) && at - Date.parse(candidate.lastDirectPractisedAt) < PRACTICE_RESEARCH_POLICY.directPracticeExclusionMs) reasons.push("recent-direct-practice");
  if (Number.isFinite(Date.parse(candidate?.lastResearchAssignedAt)) && at - Date.parse(candidate.lastResearchAssignedAt) < PRACTICE_RESEARCH_POLICY.targetHardRecencyMs) reasons.push("recent-research-target");
  return Object.freeze({ eligible: reasons.length === 0, reasons: Object.freeze(reasons) });
}

export function selectPracticeResearchTarget(candidates, { now = Date.now() } = {}) {
  const at = now instanceof Date ? now.getTime() : Number(now);
  return (candidates ?? [])
    .map((candidate) => ({ candidate, eligibility: evaluatePracticeResearchTargetEligibility(candidate, { now: at }) }))
    .filter(({ eligibility }) => eligibility.eligible)
    .sort((left, right) => {
      const leftOld = !Number.isFinite(Date.parse(left.candidate.lastResearchAssignedAt)) || at - Date.parse(left.candidate.lastResearchAssignedAt) >= PRACTICE_RESEARCH_POLICY.targetPreferenceRecencyMs;
      const rightOld = !Number.isFinite(Date.parse(right.candidate.lastResearchAssignedAt)) || at - Date.parse(right.candidate.lastResearchAssignedAt) >= PRACTICE_RESEARCH_POLICY.targetPreferenceRecencyMs;
      if (leftOld !== rightOld) return leftOld ? -1 : 1;
      return Number(right.candidate.bossTargetUtility) - Number(left.candidate.bossTargetUtility) || String(left.candidate.statId).localeCompare(String(right.candidate.statId));
    })[0]?.candidate ?? null;
}

function assignmentId(enrollmentId, assignmentIndex) { return `research-assignment:${enrollmentId}:${String(assignmentIndex).padStart(3, "0")}`; }

export async function createPracticeResearchAssignmentRecord({ enrollment, study, target, now = Date.now(), cryptoImpl = globalThis.crypto } = {}) {
  if (enrollment?.status !== "active") throw new TypeError("Practice Research enrollment is not active");
  if (!target?.statId || !target?.entityType || !target?.entityKey) throw new TypeError("Practice Research target must be frozen before randomization");
  const eligibility = evaluatePracticeResearchTargetEligibility(target, { now });
  if (!eligibility.eligible) throw new TypeError(`Practice Research target is ineligible: ${eligibility.reasons.join(", ")}`);
  const assignmentIndex = Number(enrollment.strataProgress?.[target.entityType] ?? 0);
  const randomization = await derivePracticeResearchArm({
    randomizationSeed: enrollment.randomizationSeed,
    studyId: study.studyId,
    studyVersion: study.studyVersion,
    contextId: enrollment.contextId,
    stratum: target.entityType,
    assignmentIndex,
    cryptoImpl,
  });
  const atMs = now instanceof Date ? now.getTime() : Number(now);
  const at = iso(atMs);
  return Object.freeze({
    researchAssignmentId: assignmentId(enrollment.researchEnrollmentId, enrollment.assignmentsCreated),
    researchEnrollmentId: enrollment.researchEnrollmentId,
    profileId: enrollment.profileId,
    contextId: enrollment.contextId,
    recordVersion: PRACTICE_RECORD_VERSIONS.researchAssignment,
    studyId: study.studyId,
    studyVersion: study.studyVersion,
    studyHash: enrollment.studyHash,
    assignmentIndex,
    enrollmentAssignmentIndex: enrollment.assignmentsCreated,
    stratum: target.entityType,
    blockIndex: randomization.blockIndex,
    blockPosition: randomization.blockPosition,
    randomizationVersion: PRACTICE_RESEARCH_RANDOMIZATION_VERSION,
    assignedArm: randomization.assignedArm,
    status: "assigned",
    localDayKey: localDay(atMs),
    target: Object.freeze({ entityType: target.entityType, statId: target.statId, entityKey: target.entityKey }),
    eligibilitySnapshot: Object.freeze({ ...target, assignedArm: undefined }),
    baseline: null,
    treatment: Object.freeze({ status: "pending", experimentId: randomization.assignedArm === "weakness-boss" ? "weakness-boss" : getPracticeResearchFocusedExperiment(target.entityType), exposureStartedAt: null, completedAt: null }),
    primaryFollowup: null,
    secondaryOutcomes: null,
    contamination: Object.freeze({ level: "none", events: Object.freeze([]) }),
    analysisEligibility: "followup-missing",
    createdAt: at,
    updatedAt: at,
    closedAt: null,
  });
}

export function advancePracticeResearchEnrollmentForAssignment(enrollment, assignment, recentProbeFamilyIds = []) {
  const strataProgress = { ...enrollment.strataProgress, [assignment.stratum]: Number(enrollment.strataProgress?.[assignment.stratum] ?? 0) + 1 };
  return Object.freeze({ ...enrollment, assignmentsCreated: enrollment.assignmentsCreated + 1, strataProgress: Object.freeze(strataProgress), recentProbeFamilyIds: Object.freeze([...new Set([...(enrollment.recentProbeFamilyIds ?? []), ...recentProbeFamilyIds])].slice(-64)), updatedAt: assignment.createdAt });
}
