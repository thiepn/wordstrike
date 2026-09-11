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

function thresholdFor(state) {
  if (state.responseUnit === "quality-points") return PRACTICE_TREATMENT_THRESHOLDS.targetQualityPoints;
  if (state.outcomeKey === "control-frontier") return PRACTICE_TREATMENT_THRESHOLDS.frontierPercent;
  if (state.outcomeKey === "consistency") return PRACTICE_TREATMENT_THRESHOLDS.consistencyVariationPp;
  if (state.responseUnit === "percent") return PRACTICE_TREATMENT_THRESHOLDS.abilityPercent;
  return null;
}

function evidenceDepth(samples, targeted, hybridOnly) {
  const days = new Set(samples.map((sample) => sample.localDayKey ?? String(sample.observedAt ?? "").slice(0, 10)).filter(Boolean));
  const targets = new Set(samples.map((sample) => sample.targetStatId).filter(Boolean));
  let depth = "insufficient";
  if (samples.length >= 3 && days.size >= 2) depth = "low";
  if (samples.length >= 5 && days.size >= 3 && (!targeted || targets.size >= 2)) depth = "medium";
  if (samples.length >= 10 && days.size >= 5 && (!targeted || targets.size >= 3)) depth = "high";
  if (hybridOnly && depth === "high") depth = "medium";
  return { depth, distinctDays: days.size, distinctTargets: targets.size };
}

function summarize(state) {
  const eligible = state.samples.filter((sample) => sample.aggregateEligible === true && finite(sample.responseValue));
  const values = eligible.map((sample) => sample.responseValue);
  const center = median(values);
  const spread = mad(values, center);
  const threshold = thresholdFor(state);
  let positiveCount = 0; let negativeCount = 0; let deadbandCount = 0;
  if (finite(threshold)) for (const value of values) {
    if (value >= threshold) positiveCount += 1;
    else if (value <= -threshold) negativeCount += 1;
    else deadbandCount += 1;
  }
  let responsePattern = "insufficient";
  if (eligible.length >= 3 && finite(threshold) && finite(center)) {
    if (center >= threshold && positiveCount / eligible.length >= 0.60) responsePattern = "positive-signal";
    else if (center <= -threshold && negativeCount / eligible.length >= 0.60) responsePattern = "negative-signal";
    else if (Math.abs(center) < threshold && deadbandCount / eligible.length >= 0.50) responsePattern = "little-signal";
    else responsePattern = "mixed";
  }
  const targeted = Boolean(state.targetEntityType);
  const hybridOnly = eligible.length > 0 && eligible.every((sample) => sample.measurementGrade === "hybrid");
  const depth = evidenceDepth(eligible, targeted, hybridOnly);
  return freezeDeep({
    count: eligible.length,
    median: center,
    mad: spread,
    positiveCount,
    negativeCount,
    deadbandCount,
    distinctDays: depth.distinctDays,
    distinctTargets: depth.distinctTargets,
    manualCount: eligible.filter((sample) => sample.assignmentKind === "manual").length,
    coachCount: eligible.filter((sample) => sample.assignmentKind === "coach").length,
    contaminatedEpisodeCount: state.summary?.contaminatedEpisodeCount ?? 0,
    responsePattern,
    evidenceDepth: depth.depth,
    practicalThreshold: threshold,
    hybridOnly,
  });
}

export function createPracticeTreatmentResponseState({ profileId, contextId, treatmentFamilyKey, targetEntityType = null, outcomeKey, delayBucket, responseUnit, now = new Date().toISOString() } = {}) {
  const treatmentResponseStateId = createPracticeTreatmentResponseStateId({ profileId, contextId, treatmentFamilyKey, targetEntityType, outcomeKey, delayBucket });
  const state = {
    treatmentResponseStateId,
    profileId,
    contextId,
    recordVersion: PRACTICE_RECORD_VERSIONS.treatmentResponseState,
    stateVersion: PRACTICE_TREATMENT_RESPONSE_STATE_VERSION,
    responseModelVersion: PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
    treatmentFamilyKey,
    targetEntityType,
    outcomeKey,
    delayBucket,
    responseUnit,
    samples: [],
    summary: null,
    updatedAt: now,
  };
  return freezeDeep({ ...state, summary: summarize(state) });
}

export function buildPracticeTreatmentResponseSample({ episode, outcome, localDayKey = null } = {}) {
  const response = outcome?.response;
  if (!episode || !outcome || !finite(response?.responseValue)) return null;
  const hybrid = outcome.measurementGrade === "hybrid";
  const nonConfoundedHybrid = hybrid && outcome.status === "observed" && !["recorded-confounded", "incompatible"].includes(outcome.evidenceGrade);
  return freezeDeep({
    treatmentEpisodeId: episode.treatmentEpisodeId,
    candidateId: outcome.candidateId,
    observedAt: outcome.observedAt,
    localDayKey,
    assignmentKind: episode.assignmentKind,
    targetStatId: episode.treatment?.targetStatId ?? null,
    measurementGrade: outcome.measurementGrade ?? "independent",
    primaryEligible: outcome.primaryEligible === true,
    aggregateEligible: outcome.primaryEligible === true || nonConfoundedHybrid,
    responseValue: response.responseValue,
    responseUnit: response.responseUnit,
    tradeoff: response.tradeoff === true,
  });
}

export function mergePracticeTreatmentResponseSample(state, sample, now = sample?.observedAt ?? new Date().toISOString()) {
  if (!state || !sample) return state;
  if (state.responseModelVersion !== PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION) throw new TypeError("Treatment response state model version mismatch");
  if (sample.responseUnit !== state.responseUnit) throw new TypeError("Treatment response units cannot be mixed");
  const duplicate = state.samples.some((entry) => entry.treatmentEpisodeId === sample.treatmentEpisodeId && entry.candidateId === sample.candidateId);
  if (duplicate) return state;
  const samples = [...state.samples, sample]
    .sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)) || String(a.treatmentEpisodeId).localeCompare(String(b.treatmentEpisodeId)))
    .slice(-PRACTICE_TREATMENT_POLICY.responseSamplesMaximum);
  const next = { ...state, samples, updatedAt: now };
  return freezeDeep({ ...next, summary: summarize(next) });
}

export function incrementPracticeTreatmentContaminatedCount(state, now = new Date().toISOString()) {
  const next = { ...state, updatedAt: now, summary: { ...(state.summary ?? {}), contaminatedEpisodeCount: (state.summary?.contaminatedEpisodeCount ?? 0) + 1 } };
  return freezeDeep({ ...next, summary: { ...summarize(next), contaminatedEpisodeCount: next.summary.contaminatedEpisodeCount } });
}
