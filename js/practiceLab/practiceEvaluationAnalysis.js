import { PRACTICE_EVALUATION_ANALYSIS_VERSION } from "./practiceEvaluationConstants.js";
import { evaluatePracticeEvaluationIntegrity } from "./practiceEvaluationIntegrity.js";
import { buildPracticeBenchmarkMeasurement } from "./practiceBenchmarkMeasurement.js";
import { buildPracticeTransferMeasurement } from "./practiceTransferMeasurement.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createEmptyPracticeEvaluationAnalysis() {
  return freezeDeep({
    version: PRACTICE_EVALUATION_ANALYSIS_VERSION,
    kind: null,
    status: "not-requested",
    binding: null,
    integrity: null,
    measurement: null,
    evidenceAdmission: {
      skillEvidenceEligible: false,
      abilityEligible: false,
      transferEvidenceEligible: false,
      benchmarkComparisonEligible: false,
      coldVerificationEligible: false,
    },
    sessionSummary: null,
  });
}

function compactSummary(analysis) {
  const binding = analysis.binding;
  const measurement = analysis.measurement;
  const integrity = analysis.integrity;
  if (!binding || !integrity) return null;
  return freezeDeep({
    analysisVersion: PRACTICE_EVALUATION_ANALYSIS_VERSION,
    frameworkVersion: binding.frameworkVersion,
    kind: binding.kind,
    protocolId: binding.protocolId,
    protocolVersion: binding.protocolVersion,
    suiteId: binding.suiteId ?? null,
    suiteVersion: binding.suiteVersion ?? null,
    formId: binding.formId ?? null,
    formVersion: binding.formVersion ?? null,
    poolId: binding.poolId ?? null,
    poolVersion: binding.poolVersion ?? null,
    unitId: binding.unitId ?? null,
    unitVersion: binding.unitVersion ?? null,
    exposureOrdinal: binding.exposureOrdinal,
    freshnessStatus: binding.freshnessStatus,
    integrityStatus: integrity.status,
    integrityReasons: [...integrity.reasons],
    comparabilityClass: measurement?.comparabilityClass ?? null,
    wpm: measurement?.wpm ?? null,
    accuracy: measurement?.accuracy ?? null,
    adjustedWpm: measurement?.adjustedWpm ?? null,
    measurementSigmaLog: measurement?.measurementSigmaLog ?? null,
    skillEvidenceEligible: integrity.skillEvidenceEligible,
    transferEvidenceEligible: integrity.transferEvidenceEligible,
    abilityEligible: integrity.abilityEligible,
    benchmarkComparisonEligible: integrity.benchmarkComparisonEligible,
  });
}

export function buildPracticeEvaluationAnalysis({
  plan = null,
  session = null,
  contentPlan = null,
  foundationAnalysis = null,
  artifact = null,
  historyStatus = "complete",
  runtime = {},
} = {}) {
  if (!plan) return createEmptyPracticeEvaluationAnalysis();
  const integrity = evaluatePracticeEvaluationIntegrity({ plan, session, contentPlan, historyStatus, runtime });
  let measurement = null;
  let measurementError = null;
  try {
    measurement = plan.binding.kind === "benchmark"
      ? buildPracticeBenchmarkMeasurement({ plan, integrity, session, foundationAnalysis, suite: artifact })
      : buildPracticeTransferMeasurement({ plan, integrity, session, foundationAnalysis, pool: artifact });
  } catch (cause) {
    measurementError = cause;
  }
  const status = measurementError
    ? "measurement-failed"
    : integrity.status === "valid"
      ? "measured"
      : integrity.status;
  const analysis = {
    version: PRACTICE_EVALUATION_ANALYSIS_VERSION,
    kind: plan.binding.kind,
    status,
    binding: plan.binding,
    integrity,
    measurement,
    evidenceAdmission: {
      skillEvidenceEligible: integrity.skillEvidenceEligible,
      abilityEligible: integrity.abilityEligible,
      transferEvidenceEligible: integrity.transferEvidenceEligible,
      benchmarkComparisonEligible: integrity.benchmarkComparisonEligible,
      coldVerificationEligible: integrity.coldVerificationEligible,
    },
    measurementFailure: measurementError ? { code: measurementError.code ?? "MEASUREMENT_FAILED" } : null,
    sessionSummary: null,
  };
  analysis.sessionSummary = compactSummary(analysis);
  return freezeDeep(analysis);
}

export function filterPracticeCommitForEvaluation({
  payload,
  evaluationAnalysis = null,
  evidenceRole = "unclassified",
  evaluationRequested = false,
} = {}) {
  const integrity = evaluationAnalysis?.integrity ?? null;
  if (!evaluationRequested) {
    if (evidenceRole === "transfer" || evidenceRole === "benchmark") {
      return {
        ...payload,
        skillEvidenceDeltas: [],
        abilityObservation: payload.abilityObservation ?? null,
        learningObservationDeltas: [],
      };
    }
    return payload;
  }
  return {
    ...payload,
    skillEvidenceDeltas: integrity?.skillEvidenceEligible ? payload.skillEvidenceDeltas : [],
    abilityObservation: integrity?.abilityEligible ? payload.abilityObservation : null,
    learningObservationDeltas: integrity?.transferEvidenceEligible ? payload.learningObservationDeltas : [],
  };
}

export function buildPracticeEvaluationEvidenceOverrides(foundationAnalysis, evaluationAnalysis) {
  if (!evaluationAnalysis?.integrity) return {
    skillEvidenceSummary: foundationAnalysis?.skills?.summary ?? null,
    abilityMeasurementSummary: foundationAnalysis?.ability?.sessionSummary ?? null,
    learningEvidenceSummary: foundationAnalysis?.learning?.summary ?? null,
  };
  const integrity = evaluationAnalysis.integrity;
  return freezeDeep({
    skillEvidenceSummary: integrity.skillEvidenceEligible ? foundationAnalysis?.skills?.summary ?? null : null,
    abilityMeasurementSummary: integrity.abilityEligible ? foundationAnalysis?.ability?.sessionSummary ?? null : (
      foundationAnalysis?.ability?.channel
        ? {
            ...(foundationAnalysis?.ability?.sessionSummary ?? {}),
            status: "not-eligible",
            reasons: ["evaluation-not-fresh"],
            adjustedWpm: null,
            measurementSigmaLog: null,
            reliabilityWeight: null,
          }
        : null
    ),
    learningEvidenceSummary: integrity.transferEvidenceEligible ? foundationAnalysis?.learning?.summary ?? null : (
      foundationAnalysis?.learning?.summary
        ? {
            ...foundationAnalysis.learning.summary,
            transferObservationCount: 0,
            learningStateUpdateCount: integrity.skillEvidenceEligible ? foundationAnalysis.learning.summary.learningStateUpdateCount : 0,
          }
        : null
    ),
  });
}
