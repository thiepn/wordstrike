import {
  PRACTICE_COACH_PERSONALIZATION_DELAY_ORDER,
  PRACTICE_COACH_PERSONALIZATION_LOOKBACK_MS,
  PRACTICE_COACH_PERSONALIZATION_OUTCOME_ORDER,
  PRACTICE_COACH_PERSONALIZATION_SUPPORTED_OUTCOMES,
} from "./practiceCoachPersonalizationConstants.js";
import { PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION } from "./practiceTreatmentConstants.js";
import { summarizePracticeTreatmentResponses } from "./practiceTreatmentResponseState.js";

const finite = Number.isFinite;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const DEPTH_RANK = Object.freeze({ high: 2, medium: 1, low: 0, insufficient: -1 });
const GRADE_RANK = Object.freeze({ "prospective-recorded-clean": 2, "hybrid-measurement": 1, confounded: 0 });

function observedMs(sample) { return Date.parse(sample?.observedAt ?? ""); }
function recentEligibleSamples(state, nowMs) {
  return (Array.isArray(state?.samples) ? state.samples : [])
    .filter((sample) => sample?.aggregateEligible === true
      && sample?.contaminated !== true
      && sample?.tradeoff !== true
      && sample?.evidenceGrade === "prospective-recorded-clean"
      && sample?.responseUnit === "quality-points"
      && finite(sample?.responseValue)
      && finite(observedMs(sample))
      && observedMs(sample) <= nowMs
      && nowMs - observedMs(sample) <= PRACTICE_COACH_PERSONALIZATION_LOOKBACK_MS);
}

function profileMeasurementGrade(samples) {
  if (!samples.length) return "confounded";
  if (samples.every((sample) => sample.measurementGrade === "independent")) return "prospective-recorded-clean";
  if (samples.every((sample) => ["independent", "hybrid"].includes(sample.measurementGrade))) return "hybrid-measurement";
  return "confounded";
}

function buildProfile(state, samples, sourceScope) {
  if (!samples.length) return null;
  const targetedForDepth = sourceScope === "family";
  const summary = summarizePracticeTreatmentResponses({
    samples,
    responseUnit: state.responseUnit,
    outcomeKey: state.outcomeKey,
    targeted: targetedForDepth,
  });
  if (!summary || !["medium", "high"].includes(summary.evidenceDepth)) return null;
  const measurementGrade = profileMeasurementGrade(samples);
  if (measurementGrade === "confounded") return null;
  const latestObservedAt = samples.reduce((latest, sample) => String(sample.observedAt) > latest ? String(sample.observedAt) : latest, "");
  return freezeDeep({
    sourceScope,
    treatmentResponseStateId: state.treatmentResponseStateId,
    responseStateUpdatedAt: state.updatedAt,
    treatmentFamilyKey: state.treatmentFamilyKey,
    targetEntityType: state.targetEntityType,
    outcomeKey: state.outcomeKey,
    delayBucket: state.delayBucket,
    responseUnit: state.responseUnit,
    responseModelVersion: state.responseModelVersion,
    eligibleSamples: samples,
    eligibleSampleCount: summary.count,
    latestObservedAt,
    measurementGrade,
    summary,
  });
}

function profileSort(left, right) {
  return (DEPTH_RANK[right.summary.evidenceDepth] ?? -1) - (DEPTH_RANK[left.summary.evidenceDepth] ?? -1)
    || (GRADE_RANK[right.measurementGrade] ?? 0) - (GRADE_RANK[left.measurementGrade] ?? 0)
    || (PRACTICE_COACH_PERSONALIZATION_OUTCOME_ORDER[right.outcomeKey] ?? 0) - (PRACTICE_COACH_PERSONALIZATION_OUTCOME_ORDER[left.outcomeKey] ?? 0)
    || right.eligibleSampleCount - left.eligibleSampleCount
    || (PRACTICE_COACH_PERSONALIZATION_DELAY_ORDER[right.delayBucket] ?? 0) - (PRACTICE_COACH_PERSONALIZATION_DELAY_ORDER[left.delayBucket] ?? 0)
    || String(left.treatmentResponseStateId).localeCompare(String(right.treatmentResponseStateId));
}

export function selectPracticeCoachResponseProfile({
  responseStates = [],
  profileId,
  contextId,
  treatmentFamilyKey,
  targetEntityType,
  targetStatId,
  now = new Date(),
} = {}) {
  const nowMs = new Date(typeof now === "function" ? now() : now).getTime();
  if (!finite(nowMs)) return null;
  const compatible = (Array.isArray(responseStates) ? responseStates : []).filter((state) => state
    && state.profileId === profileId
    && state.contextId === contextId
    && state.treatmentFamilyKey === treatmentFamilyKey
    && state.targetEntityType === targetEntityType
    && state.responseModelVersion === PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION
    && state.responseUnit === "quality-points"
    && PRACTICE_COACH_PERSONALIZATION_SUPPORTED_OUTCOMES.includes(state.outcomeKey));

  const exact = compatible.map((state) => {
    const samples = recentEligibleSamples(state, nowMs).filter((sample) => sample.targetStatId === targetStatId);
    return buildProfile(state, samples, "exact-target");
  }).filter(Boolean).sort(profileSort);
  if (exact.length) return exact[0];

  const family = compatible.map((state) => buildProfile(state, recentEligibleSamples(state, nowMs), "family"))
    .filter(Boolean).sort(profileSort);
  return family[0] ?? null;
}

export function buildPracticeCoachPersonalizationEvidence(input = {}) {
  return selectPracticeCoachResponseProfile(input);
}
