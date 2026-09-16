import {
  PRACTICE_COACH_PERSONALIZATION_DEPTH_WEIGHTS,
  PRACTICE_COACH_PERSONALIZATION_FRESHNESS,
  PRACTICE_COACH_PERSONALIZATION_MAX_AMPLITUDE,
  PRACTICE_COACH_PERSONALIZATION_POLICY_VERSION,
  PRACTICE_COACH_PERSONALIZATION_TIE_TOLERANCE,
  PRACTICE_COACH_PERSONALIZATION_VERSION,
  PRACTICE_COACH_RESPONSE_MODIFIER_MAX,
  PRACTICE_COACH_RESPONSE_MODIFIER_MIN,
} from "./practiceCoachPersonalizationConstants.js";
import { PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION } from "./practiceTreatmentConstants.js";
import { selectPracticeCoachResponseProfile } from "./practiceCoachPersonalizationEvidence.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = Number.isFinite;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function freshness(latestObservedAt, now) {
  const latest = Date.parse(latestObservedAt ?? "");
  const nowMs = new Date(typeof now === "function" ? now() : now).getTime();
  if (!finite(latest) || !finite(nowMs) || latest > nowMs) return { bucket: "stale", weight: 0 };
  const age = nowMs - latest;
  for (const row of PRACTICE_COACH_PERSONALIZATION_FRESHNESS) if (age <= row.maximumAgeMs) return { bucket: row.id, weight: row.weight };
  return { bucket: "stale", weight: 0 };
}

function assignmentComposition(profile) {
  const samples = profile?.eligibleSamples ?? [];
  const manual = samples.filter((sample) => sample.assignmentKind === "manual").length;
  const coach = samples.filter((sample) => sample.assignmentKind === "coach").length;
  return Object.freeze({ manual, coach, total: samples.length });
}

export function calculatePracticeCoachResponseModifier(profile, { baseInterventionMatch = 1, now = new Date() } = {}) {
  if (!profile) return null;
  const summary = profile.summary ?? {};
  const direction = summary.responsePattern === "positive-signal" ? 1 : summary.responsePattern === "negative-signal" ? -1 : 0;
  const threshold = Number(summary.practicalThreshold);
  const center = Number(summary.median);
  const magnitude = finite(center) && finite(threshold) && threshold > 0 ? clamp(Math.abs(center) / (2 * threshold), 0, 1) : 0;
  const depthWeight = PRACTICE_COACH_PERSONALIZATION_DEPTH_WEIGHTS[summary.evidenceDepth] ?? 0;
  const fresh = freshness(profile.latestObservedAt, now);
  const assignments = assignmentComposition(profile);
  const assignmentWeight = assignments.total > 0 && assignments.manual === 0 ? 0.50 : assignments.total > 0 ? 1.00 : 0;
  const measurementGradeWeight = profile.measurementGrade === "prospective-recorded-clean" ? 1.00 : profile.measurementGrade === "hybrid-measurement" ? 0.50 : 0;
  const adjustment = direction * PRACTICE_COACH_PERSONALIZATION_MAX_AMPLITUDE * magnitude * depthWeight * fresh.weight * assignmentWeight * measurementGradeWeight;
  const responseModifier = clamp(1 + adjustment, PRACTICE_COACH_RESPONSE_MODIFIER_MIN, PRACTICE_COACH_RESPONSE_MODIFIER_MAX);
  return freezeDeep({
    version: PRACTICE_COACH_PERSONALIZATION_VERSION,
    personalizationPolicyVersion: PRACTICE_COACH_PERSONALIZATION_POLICY_VERSION,
    applied: Math.abs(adjustment) > PRACTICE_COACH_PERSONALIZATION_TIE_TOLERANCE,
    treatmentFamilyKey: profile.treatmentFamilyKey,
    sourceScope: profile.sourceScope,
    outcomeKey: profile.outcomeKey,
    delayBucket: profile.delayBucket,
    evidenceDepth: summary.evidenceDepth,
    responsePattern: summary.responsePattern,
    eligibleSampleCount: summary.count,
    medianResponse: summary.median,
    responseUnit: profile.responseUnit,
    freshnessBucket: fresh.bucket,
    assignmentComposition: assignments,
    measurementGrade: profile.measurementGrade,
    responseModifier,
    baseInterventionMatch,
    personalizedInterventionMatch: baseInterventionMatch * responseModifier,
    sourceResponseStateId: profile.treatmentResponseStateId,
    sourceResponseStateUpdatedAt: profile.responseStateUpdatedAt,
    responseModelVersion: PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
  });
}

function evidenceInput(decision) {
  if (!decision?.sourceResponseStateId) return null;
  return Object.freeze({
    treatmentFamilyKey: decision.treatmentFamilyKey,
    treatmentResponseStateId: decision.sourceResponseStateId,
    updatedAt: decision.sourceResponseStateUpdatedAt,
    sourceScope: decision.sourceScope,
    responseModifier: decision.responseModifier,
  });
}

export function selectPersonalizedPracticeTreatment({
  candidate,
  options = [],
  responseStates = [],
  profileId,
  contextId,
  now = new Date(),
} = {}) {
  const needUtility = Number(candidate?.needUtility ?? candidate?.utilityBreakdown?.needUtility ?? candidate?.baseUtilityScore ?? candidate?.utilityScore ?? 0);
  const rows = (Array.isArray(options) ? options : []).map((option) => {
    const profile = selectPracticeCoachResponseProfile({
      responseStates,
      profileId,
      contextId,
      treatmentFamilyKey: option.treatmentFamilyKey,
      targetEntityType: candidate?.entityType,
      targetStatId: candidate?.statId,
      now,
    });
    const decision = calculatePracticeCoachResponseModifier(profile, { baseInterventionMatch: option.baseInterventionMatch, now });
    const responseModifier = decision?.responseModifier ?? 1;
    const personalizedInterventionMatch = option.baseInterventionMatch * responseModifier;
    const personalizedOptionUtility = clamp(needUtility * personalizedInterventionMatch, 0, 100);
    return freezeDeep({ option, profile, decision, responseModifier, personalizedInterventionMatch, personalizedOptionUtility });
  });
  if (!rows.length) return null;
  rows.sort((a, b) => b.personalizedOptionUtility - a.personalizedOptionUtility
    || (a.option.isDefaultPreferred === b.option.isDefaultPreferred ? 0 : a.option.isDefaultPreferred ? -1 : 1)
    || a.option.experimentId.localeCompare(b.option.experimentId));
  const bestUtility = rows[0].personalizedOptionUtility;
  const tied = rows.filter((row) => Math.abs(row.personalizedOptionUtility - bestUtility) <= PRACTICE_COACH_PERSONALIZATION_TIE_TOLERANCE);
  const chosen = tied.find((row) => row.option.isDefaultPreferred) ?? tied[0];
  const evidenceInputs = rows.map((row) => evidenceInput(row.decision)).filter(Boolean)
    .sort((a, b) => a.treatmentResponseStateId.localeCompare(b.treatmentResponseStateId));
  const comparisonAdjusted = rows.some((row) => row.decision?.applied === true);
  const decision = chosen.decision
    ? { ...chosen.decision, comparisonAdjusted, evidenceInputs }
    : {
      version: PRACTICE_COACH_PERSONALIZATION_VERSION,
      personalizationPolicyVersion: PRACTICE_COACH_PERSONALIZATION_POLICY_VERSION,
      applied: false,
      treatmentFamilyKey: chosen.option.treatmentFamilyKey,
      sourceScope: "none",
      outcomeKey: null,
      delayBucket: null,
      evidenceDepth: "insufficient",
      responsePattern: "insufficient",
      eligibleSampleCount: 0,
      medianResponse: null,
      responseUnit: "quality-points",
      freshnessBucket: null,
      assignmentComposition: { manual: 0, coach: 0, total: 0 },
      measurementGrade: null,
      responseModifier: 1,
      baseInterventionMatch: chosen.option.baseInterventionMatch,
      personalizedInterventionMatch: chosen.option.baseInterventionMatch,
      sourceResponseStateId: null,
      sourceResponseStateUpdatedAt: null,
      responseModelVersion: PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
      comparisonAdjusted,
      evidenceInputs,
    };
  return freezeDeep({
    experimentId: chosen.option.experimentId,
    experimentVersion: chosen.option.experimentVersion,
    treatmentFamilyKey: chosen.option.treatmentFamilyKey,
    baseInterventionMatch: chosen.option.baseInterventionMatch,
    personalizedInterventionMatch: chosen.personalizedInterventionMatch,
    personalizedOptionUtility: chosen.personalizedOptionUtility,
    personalizationDecision: decision,
    responseInformed: comparisonAdjusted,
    optionComparisons: rows.map((row) => Object.freeze({
      experimentId: row.option.experimentId,
      treatmentFamilyKey: row.option.treatmentFamilyKey,
      baseInterventionMatch: row.option.baseInterventionMatch,
      responseModifier: row.responseModifier,
      personalizedInterventionMatch: row.personalizedInterventionMatch,
      personalizedOptionUtility: row.personalizedOptionUtility,
      sourceScope: row.decision?.sourceScope ?? "none",
      responsePattern: row.decision?.responsePattern ?? "insufficient",
      evidenceDepth: row.decision?.evidenceDepth ?? "insufficient",
    })),
  });
}
