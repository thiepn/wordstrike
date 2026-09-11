import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import {
  PRACTICE_TREATMENT_RESPONSE_STATE_VERSION,
  PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
  PRACTICE_TREATMENT_POLICY,
  PRACTICE_TREATMENT_THRESHOLDS,
} from "./practiceTreatmentConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const finite = Number.isFinite;

function encode(value) {
  const text = encodeURIComponent(String(value ?? "none"));
  return `${text.length}:${text}`;
}

export function createPracticeTreatmentResponseStateId({ profileId, contextId, treatmentFamilyKey, targetEntityType = null, outcomeKey, delayBucket } = {}) {
  return `practice-treatment-response_${[profileId, contextId, treatmentFamilyKey, targetEntityType ?? "none", outcomeKey, delayBucket].map(encode).join("|")}`;
}

function median(values) {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mad(values, center = median(values)) {
  return center == null ? null : median(values.filter(finite).map((value) => Math.abs(value - center)));
}

export function getPracticeTreatmentResponseThreshold({ responseUnit, outcomeKey } = {}) {
  if (responseUnit === "quality-points") return PRACTICE_TREATMENT_THRESHOLDS.targetQualityPoints;
  if (outcomeKey === "control-frontier") return PRACTICE_TREATMENT_THRESHOLDS.frontierPercent;
  if (["consistency", "metronome-silent"].includes(outcomeKey)) return PRACTICE_TREATMENT_THRESHOLDS.consistencyVariationPp;
  if (responseUnit === "percent") return PRACTICE_TREATMENT_THRESHOLDS.abilityPercent;
  return null;
}

export function calculatePracticeTreatmentEvidenceDepth(samples = [], { targeted = false, hybridOnly = null } = {}) {
  const days = new Set(samples.map((sample) => sample.localDayKey ?? String(sample.observedAt ?? "").slice(0, 10)).filter(Boolean));
  const targets = new Set(samples.map((sample) => sample.targetStatId).filter(Boolean));
  let depth = "insufficient";
  if (samples.length >= 3 && days.size >= 2) depth = "low";
  if (samples.length >= 5 && days.size >= 3 && (!targeted || targets.size >= 2)) depth = "medium";
  if (samples.length >= 10 && days.size >= 5 && (!targeted || targets.size >= 3)) depth = "high";
  const resolvedHybridOnly = hybridOnly == null
    ? samples.length > 0 && samples.every((sample) => sample.measurementGrade === "hybrid")
    : hybridOnly === true;
  if (resolvedHybridOnly && depth === "high") depth = "medium";
  return freezeDeep({ depth, distinctDays: days.size, distinctTargets: targets.size });
}

export function classifyPracticeTreatmentResponsePattern({ values = [], threshold, medianResponse = median(values) } = {}) {
  if (!Array.isArray(values) || values.length < 3 || !finite(threshold) || !finite(medianResponse)) return "insufficient";
  let positiveCount = 0; let negativeCount = 0; let deadbandCount = 0;
  for (const value of values) {
    if (value >= threshold) positiveCount += 1;
    else if (value <= -threshold) negativeCount += 1;
    else deadbandCount += 1;
  }
  if (medianResponse >= threshold && positiveCount / values.length >= 0.60) return "positive-signal";
  if (medianResponse <= -threshold && negativeCount / values.length >= 0.60) return "negative-signal";
  if (Math.abs(medianResponse) < threshold && deadbandCount / values.length >= 0.50) return "little-signal";
  return "mixed";
}

export function summarizePracticeTreatmentResponses({ samples = [], responseUnit, outcomeKey, targeted = false } = {}) {
  const eligible = (Array.isArray(samples) ? samples : []).filter((sample) => sample?.aggregateEligible === true && finite(sample?.responseValue));
  const values = eligible.map((sample) => sample.responseValue);
  const center = median(values);
  const spread = mad(values, center);
  const threshold = getPracticeTreatmentResponseThreshold({ responseUnit, outcomeKey });
  let positiveCount = 0; let negativeCount = 0; let deadbandCount = 0;
  if (finite(threshold)) for (const value of values) {
    if (value >= threshold) positiveCount += 1;
    else if (value <= -threshold) negativeCount += 1;
    else deadbandCount += 1;
  }
  const depth = calculatePracticeTreatmentEvidenceDepth(eligible, { targeted });
  return freezeDeep({ count: eligible.length, median: center, mad: spread, positiveCount, negativeCount, deadbandCount, distinctDays: depth.distinctDays, distinctTargets: depth.distinctTargets, manualCount: eligible.filter((sample) => sample.assignmentKind === "manual").length, coachCount: eligible.filter((sample) => sample.assignmentKind === "coach").length, responsePattern: classifyPracticeTreatmentResponsePattern({ values, threshold, medianResponse: center }), evidenceDepth: depth.depth, practicalThreshold: threshold, hybridOnly: eligible.length > 0 && eligible.every((sample) => sample.measurementGrade === "hybrid") });
}

function summarize(state) {
  const eligible = state.samples.filter((sample) => sample.aggregateEligible === true && finite(sample.responseValue));
  const summary = summarizePracticeTreatmentResponses({ samples: state.samples, responseUnit: state.responseUnit, outcomeKey: state.outcomeKey, targeted: Boolean(state.targetEntityType) });
  return freezeDeep({ ...summary, contaminatedEpisodeCount: state.samples.filter((sample) => sample.contaminated === true).length, hybridOnly: eligible.length > 0 && eligible.every((sample) => sample.measurementGrade === "hybrid") });
}

export function createPracticeTreatmentResponseState({ profileId, contextId, treatmentFamilyKey, targetEntityType = null, outcomeKey, delayBucket, responseUnit, now = new Date().toISOString() } = {}) {
  const treatmentResponseStateId = createPracticeTreatmentResponseStateId({ profileId, contextId, treatmentFamilyKey, targetEntityType, outcomeKey, delayBucket });
  const state = { treatmentResponseStateId, profileId, contextId, recordVersion: PRACTICE_RECORD_VERSIONS.treatmentResponseState, stateVersion: PRACTICE_TREATMENT_RESPONSE_STATE_VERSION, responseModelVersion: PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION, treatmentFamilyKey, targetEntityType, outcomeKey, delayBucket, responseUnit, samples: [], summary: null, updatedAt: now };
  return freezeDeep({ ...state, summary: summarize(state) });
}

export function buildPracticeTreatmentResponseSample({ episode, outcome, localDayKey = null } = {}) {
  const response = outcome?.response;
  if (!episode || !outcome || !finite(response?.responseValue)) return null;
  return freezeDeep({ treatmentEpisodeId: episode.treatmentEpisodeId, candidateId: outcome.candidateId, observedAt: outcome.observedAt, localDayKey, assignmentKind: episode.assignmentKind, targetStatId: episode.treatment?.targetStatId ?? null, measurementGrade: outcome.measurementGrade ?? "independent", primaryEligible: outcome.primaryEligible === true, aggregateEligible: outcome.aggregateEligible === true, contaminated: outcome.status === "contaminated" || outcome.evidenceGrade === "recorded-confounded", evidenceGrade: outcome.evidenceGrade ?? "insufficient", responseValue: response.responseValue, responseUnit: response.responseUnit, tradeoff: response.tradeoff === true, classification: response.classification ?? null });
}

export function mergePracticeTreatmentResponseSample(state, sample, now = sample?.observedAt ?? new Date().toISOString()) {
  if (!state || !sample) return state;
  if (state.responseModelVersion !== PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION) throw new TypeError("Treatment response state model version mismatch");
  if (sample.responseUnit !== state.responseUnit) throw new TypeError("Treatment response units cannot be mixed");
  const duplicate = state.samples.some((entry) => entry.treatmentEpisodeId === sample.treatmentEpisodeId && entry.candidateId === sample.candidateId);
  if (duplicate) return state;
  const samples = [...state.samples, sample].sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)) || String(a.treatmentEpisodeId).localeCompare(String(b.treatmentEpisodeId))).slice(-PRACTICE_TREATMENT_POLICY.responseSamplesMaximum);
  const next = { ...state, samples, updatedAt: now };
  return freezeDeep({ ...next, summary: summarize(next) });
}

export function incrementPracticeTreatmentContaminatedCount(state, now = new Date().toISOString()) {
  if (!state) return state;
  return freezeDeep({ ...state, updatedAt: now, summary: summarize(state) });
}
