import { PRACTICE_TREATMENT_BASELINE_POLICY_VERSION } from "./practiceTreatmentConstants.js";
import { createPracticeTreatmentOutcomeCandidate } from "./practiceTreatmentOutcome.js";
import { PRACTICE_METRONOME_ANALYSIS_VERSION, PRACTICE_METRONOME_OUTCOME_DOMAIN, PRACTICE_METRONOME_TREATMENT_VERSION } from "./practiceMetronomeConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const finite = Number.isFinite;
const finiteOrNull = (value) => finite(value) ? value : null;

export function normalizePracticeMetronomeSilentBlock(block) {
  if (!block) return null;
  return freezeDeep({ analysisVersion: PRACTICE_METRONOME_ANALYSIS_VERSION, baselineDurationMs: finiteOrNull(block.observedDurationMs), effectiveWpm: finiteOrNull(block.effectiveWpm), paceVariationPercent: finiteOrNull(block.paceVariationPercent), firstPassAccuracy: finiteOrNull(block.firstPassAccuracy), disfluencyRate: finiteOrNull(block.disfluencyRate), correctionCostRate: finiteOrNull(block.correctionCostRate), valid: block.valid === true });
}

export function buildPracticeMetronomeTreatmentBaseline({ analysis, observedAt } = {}) {
  const state = normalizePracticeMetronomeSilentBlock(analysis?.baseline);
  const available = state?.valid === true && finite(state.effectiveWpm) && finite(state.firstPassAccuracy) && finite(state.baselineDurationMs);
  return freezeDeep({ policyVersion: PRACTICE_TREATMENT_BASELINE_POLICY_VERSION, kind: "metronome-silent", status: available ? "available" : "missing", observedAt: observedAt ?? null, probeIdentity: null, metrics: available ? state : null, abilityState: null, consistencyState: null, frontierState: null, metronomeState: available ? state : null });
}

export function createPracticeMetronomeSilentOutcomeCandidate({ profileId, contextId, sessionId, observedAt, localDayKey, analysis, role = "baseline" } = {}) {
  if (role !== "baseline") return null;
  const metrics = normalizePracticeMetronomeSilentBlock(analysis?.baseline);
  if (!metrics?.valid || !finite(metrics.effectiveWpm) || !finite(metrics.baselineDurationMs)) return null;
  return createPracticeTreatmentOutcomeCandidate({ profileId, contextId, sessionId, observedAt, localDayKey, sourceKind: "metronome-silent-baseline", subjectKind: "metronome-silent-baseline", subjectId: `metronome-silent:${metrics.baselineDurationMs}`, outcomeDomain: PRACTICE_METRONOME_OUTCOME_DOMAIN, metrics, validity: { eligible: true, compatible: true, treatmentVersion: PRACTICE_METRONOME_TREATMENT_VERSION, analysisVersion: PRACTICE_METRONOME_ANALYSIS_VERSION, baselineDurationMs: metrics.baselineDurationMs }, evidenceRole: "delayed-silent-baseline" });
}

export function estimatePracticeMetronomeSilentResponse(baselineState, candidateMetrics) {
  if (!baselineState || !candidateMetrics || !finite(baselineState.effectiveWpm) || baselineState.effectiveWpm <= 0 || !finite(candidateMetrics.effectiveWpm) || candidateMetrics.effectiveWpm <= 0) return null;
  const responseValue = 100 * (candidateMetrics.effectiveWpm / baselineState.effectiveWpm - 1);
  const accuracyDeltaPp = finite(candidateMetrics.firstPassAccuracy) && finite(baselineState.firstPassAccuracy) ? 100 * (candidateMetrics.firstPassAccuracy - baselineState.firstPassAccuracy) : null;
  const variationDeltaPercent = finite(candidateMetrics.paceVariationPercent) && finite(baselineState.paceVariationPercent) ? candidateMetrics.paceVariationPercent - baselineState.paceVariationPercent : null;
  const disfluencyDeltaPp = finite(candidateMetrics.disfluencyRate) && finite(baselineState.disfluencyRate) ? 100 * (candidateMetrics.disfluencyRate - baselineState.disfluencyRate) : null;
  const correctionCostDeltaPp = finite(candidateMetrics.correctionCostRate) && finite(baselineState.correctionCostRate) ? 100 * (candidateMetrics.correctionCostRate - baselineState.correctionCostRate) : null;
  const tradeoff = (finite(accuracyDeltaPp) && accuracyDeltaPp < -2) || (finite(disfluencyDeltaPp) && disfluencyDeltaPp > 5) || (finite(correctionCostDeltaPp) && correctionCostDeltaPp > 2);
  return freezeDeep({ responseValue, responseUnit: "percent", classification: tradeoff ? "tradeoff" : Math.abs(responseValue) < 2 ? "little-change" : responseValue > 0 ? "higher-silent-pace" : "lower-silent-pace", tradeoff, accuracyDeltaPp, variationDeltaPercent, disfluencyDeltaPp, correctionCostDeltaPp });
}
