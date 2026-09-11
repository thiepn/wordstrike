import { createSkillStatId, hashPracticeContent } from "./practiceIds.js";
import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import {
  PRACTICE_TREATMENT_EPISODE_VERSION,
  PRACTICE_TREATMENT_TRACKING_VERSION,
  PRACTICE_TREATMENT_REGISTRY_VERSION,
  PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
  PRACTICE_TREATMENT_OUTCOME_KEYS,
  PRACTICE_TREATMENT_POLICY,
} from "./practiceTreatmentConstants.js";
import { createPendingPracticeTreatmentBaseline } from "./practiceTreatmentBaseline.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function encode(value) {
  const text = encodeURIComponent(String(value));
  return `${text.length}:${text}`;
}

export function createPracticeTreatmentEpisodeId(profileId, contextId, treatmentSessionId) {
  return `practice-treatment_${[profileId, contextId, treatmentSessionId].map(encode).join("|")}`;
}

function contract(outcomeKey, sourceKind, maximumDelayMs, minimumDelayMs, measurementGrade = "independent") {
  return Object.freeze({ outcomeKey, sourceKind, minimumDelayMs, maximumDelayMs, measurementGrade });
}

export function buildPracticeTreatmentOutcomeContracts(identity) {
  if (identity?.treatmentClass === "targeted") return Object.freeze([
    contract(PRACTICE_TREATMENT_OUTCOME_KEYS.SAME_PROTOCOL_RETEST, "target-baseline-retest", PRACTICE_TREATMENT_POLICY.retestMaximumMs, PRACTICE_TREATMENT_POLICY.minimumDelayedMs),
    contract(PRACTICE_TREATMENT_OUTCOME_KEYS.RETENTION_REVIEW, "retention-review", PRACTICE_TREATMENT_POLICY.retentionMaximumMs, PRACTICE_TREATMENT_POLICY.minimumDelayedMs),
    contract(PRACTICE_TREATMENT_OUTCOME_KEYS.COLD_TRANSFER, "cold-transfer", PRACTICE_TREATMENT_POLICY.transferMaximumMs, PRACTICE_TREATMENT_POLICY.minimumDelayedMs),
  ]);
  if (identity?.outcomeDomain === "metronome-cadence") return Object.freeze([
    contract(PRACTICE_TREATMENT_OUTCOME_KEYS.METRONOME_SILENT, "consistency-result", PRACTICE_TREATMENT_POLICY.metronomeMaximumMs, PRACTICE_TREATMENT_POLICY.metronomeMinimumDelayedMs),
  ]);
  if (identity?.outcomeDomain === "consistency") return Object.freeze([
    contract(PRACTICE_TREATMENT_OUTCOME_KEYS.CONSISTENCY, "consistency-result", PRACTICE_TREATMENT_POLICY.consistencyMaximumMs, PRACTICE_TREATMENT_POLICY.hybridMinimumDelayedMs, "hybrid"),
  ]);
  if (identity?.outcomeDomain === "control-frontier") return Object.freeze([
    contract(PRACTICE_TREATMENT_OUTCOME_KEYS.CONTROL_FRONTIER, "control-frontier", PRACTICE_TREATMENT_POLICY.frontierMaximumMs, PRACTICE_TREATMENT_POLICY.hybridMinimumDelayedMs, "hybrid"),
  ]);
  if (identity?.outcomeDomain === "burst") return Object.freeze([
    contract(PRACTICE_TREATMENT_OUTCOME_KEYS.ABILITY, "ability-observation", PRACTICE_TREATMENT_POLICY.abilityMaximumMs, PRACTICE_TREATMENT_POLICY.hybridMinimumDelayedMs, "hybrid"),
  ]);
  return Object.freeze([
    contract(PRACTICE_TREATMENT_OUTCOME_KEYS.ABILITY, "ability-observation", PRACTICE_TREATMENT_POLICY.abilityMaximumMs, PRACTICE_TREATMENT_POLICY.minimumDelayedMs),
  ]);
}

function baselineKind(identity) {
  if (identity.treatmentClass === "targeted") return "target";
  if (identity.outcomeDomain === "metronome-cadence") return "metronome-silent";
  if (identity.outcomeDomain === "consistency") return "consistency";
  if (identity.outcomeDomain === "control-frontier") return "control-frontier";
  return "ability";
}

export function createPracticeTreatmentEpisode({
  profileId,
  contextId,
  treatmentSessionId,
  identity,
  plannedAt,
  treatmentContext = {},
  baseline = null,
  relatedTargetIds = [],
  probeIdentity = null,
  coachBinding = null,
} = {}) {
  if (!profileId || !contextId || !treatmentSessionId || !identity?.treatmentFamilyKey) throw new TypeError("Treatment episode requires profile, context, session and trusted identity");
  const timestamp = plannedAt ?? new Date().toISOString();
  const treatmentEpisodeId = createPracticeTreatmentEpisodeId(profileId, contextId, treatmentSessionId);
  const targetStatId = identity.targetEntityType && identity.targetEntityKey
    ? createSkillStatId(profileId, contextId, identity.targetEntityType, identity.targetEntityKey)
    : null;
  const contracts = buildPracticeTreatmentOutcomeContracts(identity);
  return freezeDeep({
    treatmentEpisodeId,
    profileId,
    contextId,
    recordVersion: PRACTICE_RECORD_VERSIONS.treatmentEpisode,
    episodeVersion: PRACTICE_TREATMENT_EPISODE_VERSION,
    trackingVersion: PRACTICE_TREATMENT_TRACKING_VERSION,
    registryVersion: PRACTICE_TREATMENT_REGISTRY_VERSION,
    responseModelVersion: PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
    status: "prepared",
    assignmentKind: identity.assignmentKind,
    treatment: {
      treatmentSessionId,
      experimentId: identity.experimentId,
      experimentVersion: identity.experimentVersion,
      treatmentClass: identity.treatmentClass,
      treatmentFamilyKey: identity.treatmentFamilyKey,
      protocolFingerprint: identity.protocolFingerprint,
      protocolVariant: identity.protocolVariant,
      outcomeDomain: identity.outcomeDomain,
      responseDimensions: identity.responseDimensions ?? null,
      targetEntityType: identity.targetEntityType,
      targetEntityKey: identity.targetEntityKey,
      targetStatId,
      doseDescriptor: identity.doseDescriptor,
      plannedAt: timestamp,
      exposureStartedAt: null,
      completedAt: null,
      actualDurationMs: null,
    },
    baseline: baseline ?? createPendingPracticeTreatmentBaseline({ kind: baselineKind(identity), probeIdentity }),
    treatmentContext: {
      ...treatmentContext,
      relatedTargetIds: [...new Set(relatedTargetIds)].slice(0, PRACTICE_TREATMENT_POLICY.relatedTargetIdMaximum),
      coachPlanId: coachBinding?.coachPlanId ?? null,
      coachBlockId: coachBinding?.blockId ?? null,
    },
    outcomeContracts: contracts,
    outcomes: contracts.map((entry) => ({
      outcomeKey: entry.outcomeKey,
      sourceKind: entry.sourceKind,
      status: "pending",
      measurementGrade: entry.measurementGrade,
      candidateId: null,
      observedAt: null,
      delayMs: null,
      delayBucket: null,
      evidenceGrade: "insufficient",
      contamination: null,
      response: null,
      reason: null,
    })),
    contamination: { level: "none", reasons: [], auditedAt: null },
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: null,
    integrityHash: hashPracticeContent(`${treatmentEpisodeId}|${identity.treatmentFamilyKey}|${identity.protocolFingerprint}`),
  });
}

export function updatePracticeTreatmentEpisode(episode, patch, updatedAt = new Date().toISOString()) {
  return freezeDeep({ ...episode, ...patch, updatedAt });
}

export function markPracticeTreatmentExposureStarted(episode, exposureStartedAt) {
  if (!episode || episode.status !== "prepared") return episode;
  return updatePracticeTreatmentEpisode(episode, {
    treatment: { ...episode.treatment, exposureStartedAt },
  }, exposureStartedAt);
}

export function setPracticeTreatmentBaseline(episode, baseline) {
  if (!episode || !baseline) return episode;
  return updatePracticeTreatmentEpisode(episode, { baseline }, baseline.observedAt ?? new Date().toISOString());
}

export function finalizePracticeTreatmentEpisode(episode, { completedAt, actualDurationMs, treatmentExposureEligible = true } = {}) {
  if (!episode) return null;
  const timestamp = completedAt ?? new Date().toISOString();
  if (!treatmentExposureEligible || !episode.treatment?.exposureStartedAt) {
    return updatePracticeTreatmentEpisode(episode, { status: "invalid", invalidReason: treatmentExposureEligible ? "no-treatment-exposure" : "incomplete-treatment", closedAt: timestamp }, timestamp);
  }
  return updatePracticeTreatmentEpisode(episode, {
    status: "tracking",
    treatment: { ...episode.treatment, completedAt: timestamp, actualDurationMs: Number.isFinite(actualDurationMs) ? actualDurationMs : null },
  }, timestamp);
}

export function invalidatePracticeTreatmentEpisode(episode, reason, at = new Date().toISOString()) {
  return updatePracticeTreatmentEpisode(episode, { status: "invalid", invalidReason: reason ?? "invalid-treatment", closedAt: at }, at);
}
