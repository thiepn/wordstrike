import { PRACTICE_TREATMENT_BASELINE_POLICY_VERSION } from "./practiceTreatmentConstants.js";
import { createPracticeTreatmentOutcomeCandidate } from "./practiceTreatmentOutcome.js";
import { PRACTICE_METRONOME_ANALYSIS_VERSION, PRACTICE_METRONOME_OUTCOME_DOMAIN, PRACTICE_METRONOME_TREATMENT_VERSION } from "./practiceMetronomeConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const finite = Number.isFinite;
const finiteOrNull = (value) => finite(value) ? value : null;

export function normalizePracticeMetronomeSilentBlock(block) {
  if (!block) return null;
  return freezeDeep({
    analysisVersion: PRACTICE_METRONOME_ANALYSIS_VERSION,
    resultVersion: block.resultVersion ?? null,
    status: block.valid === true ? "complete" : "insufficient",
    durationMs: finiteOrNull(block.observedDurationMs),
    paceVariationPercent: finiteOrNull(block.paceVariationPercent),
    paceDriftPercent: null,
    medianAdjustedGrossWpm: finiteOrNull(block.effectiveWpm),
    firstPassAccuracyMedian: finiteOrNull(block.firstPassAccuracy),
    disfluencyMedian: finiteOrNull(block.disfluencyRate),
    correctionCostMedian: finiteOrNull(block.correctionCostRate),
    valid: block.valid === true,
  });
}

export function buildPracticeMetronomeTreatmentBaseline({ analysis, observedAt } = {}) {
  const state = normalizePracticeMetronomeSilentBlock(analysis?.baseline);
  const available = state?.valid === true && finite(state.medianAdjustedGrossWpm) && finite(state.firstPassAccuracyMedian) && finite(state.durationMs) && finite(state.paceVariationPercent);
  return freezeDeep({
    policyVersion: PRACTICE_TREATMENT_BASELINE_POLICY_VERSION,
    kind: "metronome-silent",
    status: available ? "available" : "missing",
    observedAt: observedAt ?? null,
    probeIdentity: null,
    metrics: null,
    abilityState: null,
    consistencyState: available ? state : null,
    frontierState: null,
    metronomeTreatmentVersion: PRACTICE_METRONOME_TREATMENT_VERSION,
  });
}

export function createPracticeMetronomeSilentOutcomeCandidate({ profileId, contextId, sessionId, observedAt, localDayKey, analysis, role = "baseline" } = {}) {
  if (role !== "baseline") return null;
  const metrics = normalizePracticeMetronomeSilentBlock(analysis?.baseline);
  if (!metrics?.valid || !finite(metrics.medianAdjustedGrossWpm) || !finite(metrics.durationMs) || !finite(metrics.paceVariationPercent)) return null;
  return createPracticeTreatmentOutcomeCandidate({
    profileId,
    contextId,
    sessionId,
    observedAt,
    localDayKey,
    sourceKind: "consistency-result",
    subjectKind: "metronome-silent-baseline",
    subjectId: `metronome-silent:${metrics.analysisVersion}:${metrics.durationMs}`,
    outcomeDomain: PRACTICE_METRONOME_OUTCOME_DOMAIN,
    metrics,
    validity: {
      eligible: true,
      compatible: true,
      treatmentVersion: PRACTICE_METRONOME_TREATMENT_VERSION,
      analysisVersion: metrics.analysisVersion,
      durationMs: metrics.durationMs,
    },
    evidenceRole: "delayed-silent-baseline",
  });
}
