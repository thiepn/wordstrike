import {
  createPracticeSessionEngine as createLegacyPracticeSessionEngine,
  restorePracticeSessionEngine as restoreLegacyPracticeSessionEngine,
} from "./practiceSessionEngineLegacy.js";
import {
  withPracticeAssessmentAnalysis,
  withPracticeEvaluationAnalysis,
  withPracticeRetentionAnalysis,
} from "./practiceFoundationAnalysis.js";
import { buildPracticeRetentionAnalysis } from "./practiceRetentionAnalysis.js";
import { validatePracticeReviewPlanForPreparation } from "./practiceReviewPlan.js";
import { commitCompletedPracticeRetentionSession } from "./practiceRetentionCommit.js";
import {
  getPracticeTrustedEvaluationPurpose,
  getPracticeTrustedRetentionPurpose,
  registerPracticeTrustedEvaluationPurpose,
  registerPracticeTrustedRetentionPurpose,
} from "./practiceSessionPurposeRegistry.js";
import { resolvePracticeEvidenceRole } from "./practiceEvidenceRole.js";
import { PRACTICE_SESSION_LIMITS } from "./practiceSessionConstants.js";
import { getPracticeTimeContext } from "./practiceTime.js";
import { applyPracticeEvaluationConfigurationOverrides } from "./practiceEvaluationIntegrity.js";
import {
  buildPracticeEvaluationAnalysis,
  buildPracticeEvaluationEvidenceOverrides,
  filterPracticeCommitForEvaluation,
} from "./practiceEvaluationAnalysis.js";
import { validatePracticeEvaluationBinding } from "./practiceEvaluationValidation.js";
import { buildPracticeAssessmentAnalysis } from "./practiceAssessmentAnalysis.js";
import {
  PRACTICE_ASSESSMENT_MEASUREMENT_MINIMAL_OVERRIDES,
  PRACTICE_ASSESSMENT_PROTOCOL_VERSION,
} from "./practiceAssessmentConstants.js";
import { getPracticeTrustedAssessmentBinding } from "./practiceAssessmentRegistry.js";
import { markPracticeAssessmentBlockStarted } from "./practiceAssessmentRun.js";

const completionReasonForMode = (mode) => ({ content: "content-complete", duration: "time-complete", "word-count": "word-target-complete", manual: "manual-stop" })[mode] || "manual-stop";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function planError(code, message, details = null, operation = "prepare-evaluation-plan") {
  const error = new Error(message);
  error.name = "PracticeSessionError";
  error.code = code;
  error.operation = operation;
  error.recoverable = true;
  error.details = details;
  return error;
}

function nowDate(wallClock) {
  const value = typeof wallClock === "function" ? wallClock() : wallClock;
  return value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
}

function buildEvaluationSession(input, { sessionId, profileId, contextId, configuration, finalStatus, finalReason, contentPlan, wallClock }) {
  const metrics = input?.metricsSnapshot ?? {};
  const snapshot = input?.sessionSnapshot ?? {};
  const completedAtUtc = snapshot?.completion?.completedAtUtc ?? nowDate(wallClock).toISOString();
  return freezeDeep({
    sessionId: snapshot.sessionId ?? sessionId,
    profileId: snapshot.profileId ?? profileId,
    contextId: snapshot.contextId ?? contextId,
    status: finalStatus,
    completionReason: finalReason ?? completionReasonForMode(contentPlan?.completion?.mode),
    completedAtUtc,
    wpm: metrics.wpm,
    rawWpm: metrics.rawWpm,
    accuracy: metrics.accuracy,
    activeDurationMs: metrics.activeDurationMs,
    pausedDurationMs: metrics.pausedDurationMs,
    typedCharacterCount: metrics.acceptedInsertions,
    configuration,
  });
}

function compactAssessmentBinding(binding) {
  if (!binding) return null;
  return Object.freeze({ assessmentRunId: binding.assessmentRunId, blockId: binding.blockId, blockOrdinal: binding.blockOrdinal, protocolVersion: PRACTICE_ASSESSMENT_PROTOCOL_VERSION });
}

export function createPracticeSessionEngine(options = {}) {
  const { repository, sessionId, profileId, contextId, wallClock = () => new Date(), checkpointPolicy = {}, segmenter = null } = options;
  if (!repository) throw new TypeError("Practice engine requires a repository");

  let reviewPlan = null;
  let preparedContentPlan = null;
  let trustedExperiment = null;
  let retentionAnalysis = null;
  let evaluationPlan = null;
  let evaluationArtifact = null;
  let evaluationAnalysis = null;
  let assessmentBinding = null;
  let assessmentRun = null;
  let assessmentBlock = null;
  let assessmentAnalysis = null;
  let assessmentRuntime = { pauseObserved: false, contentAppendObserved: false, restoredFromCheckpoint: false };
  let effectiveConfiguration = null;
  let evidenceRole = "unclassified";
  let evaluationRuntime = { pauseObserved: false, contentAppendObserved: false, restoredFromCheckpoint: false };
  let finalStatus = "completed";
  let finalReason = null;

  const repositoryFacade = Object.freeze({
    ...repository,
    async commitCompletedPracticeSession(payload) {
      const filtered = filterPracticeCommitForEvaluation({ payload, evaluationAnalysis, evidenceRole, evaluationRequested: Boolean(evaluationPlan) });
      return commitCompletedPracticeRetentionSession({
        repository,
        sessionSummary: filtered.sessionSummary,
        skillEvidenceDeltas: filtered.skillEvidenceDeltas,
        abilityObservation: filtered.abilityObservation,
        performanceStateDelta: filtered.performanceStateDelta,
        learningObservationDeltas: filtered.learningObservationDeltas,
        retentionReviewDeltas: retentionAnalysis?.reviewDeltas ?? [],
        experimentReviewItemChanges: filtered.reviewItemChanges ?? [],
        updatedProfileSummary: filtered.updatedProfileSummary,
        assessmentBlockDelta: assessmentAnalysis?.assessmentBlockDelta ?? null,
        clearCheckpoint: filtered.clearCheckpoint,
      });
    },
  });

  const base = createLegacyPracticeSessionEngine({ ...options, repository: repositoryFacade });

  const prepare = async ({ experiment, configuration = {}, contentPlan, reviewPlan: suppliedReviewPlan = null, evaluationPlan: suppliedEvaluationPlan = null, evaluationArtifact: suppliedEvaluationArtifact = null }) => {
    const retentionKind = experiment?.retentionMeasurementKind ?? null;
    const evaluationKind = experiment?.evaluationMeasurementKind ?? null;
    reviewPlan = suppliedReviewPlan;
    evaluationPlan = suppliedEvaluationPlan;
    evaluationArtifact = suppliedEvaluationArtifact;
    preparedContentPlan = contentPlan;
    trustedExperiment = experiment;
    retentionAnalysis = null;
    evaluationAnalysis = null;
    assessmentAnalysis = null;
    assessmentBinding = getPracticeTrustedAssessmentBinding(contentPlan);
    assessmentRun = null;
    assessmentBlock = null;
    assessmentRuntime = { pauseObserved: false, contentAppendObserved: false, restoredFromCheckpoint: false };
    evaluationRuntime = { pauseObserved: false, contentAppendObserved: false, restoredFromCheckpoint: false };
    finalStatus = "completed";
    finalReason = completionReasonForMode(contentPlan?.completion?.mode);
    evidenceRole = resolvePracticeEvidenceRole({ contentPlan });

    if (Object.hasOwn(configuration, "retentionMeasurementKind") || Object.hasOwn(configuration, "evaluationMeasurementKind") || Object.hasOwn(configuration, "assessmentBinding")) throw planError("PRACTICE_EVALUATION_PRIVILEGE_VIOLATION", "Practice configuration cannot set trusted measurement or assessment privileges");
    if (experiment?.internalAssessmentOnly && !assessmentBinding) throw planError("PRACTICE_ASSESSMENT_BINDING_REQUIRED", "Internal Full Assessment child cannot launch without trusted parent binding", null, "prepare-assessment");
    if (assessmentBinding) {
      assessmentRun = await repository.getAssessmentRun?.(assessmentBinding.assessmentRunId);
      if (!assessmentRun || assessmentRun.status !== "active") throw planError("PRACTICE_ASSESSMENT_RUN_INACTIVE", "Full Assessment parent run is missing or inactive", null, "prepare-assessment");
      if (assessmentRun.profileId !== profileId || assessmentRun.contextId !== contextId) throw planError("PRACTICE_ASSESSMENT_CONTEXT_MISMATCH", "Assessment binding does not match session profile/context", null, "prepare-assessment");
      if (assessmentRun.plan?.planVersion !== assessmentBinding.planVersion || assessmentRun.plan?.planHash !== assessmentBinding.planHash) throw planError("PRACTICE_ASSESSMENT_PLAN_STALE", "Assessment binding does not match frozen plan", null, "prepare-assessment");
      assessmentBlock = assessmentRun.plan.blocks[assessmentRun.progress.currentBlockIndex] ?? null;
      const parentBlock = assessmentRun.blocks[assessmentRun.progress.currentBlockIndex] ?? null;
      if (!assessmentBlock || !parentBlock || assessmentBlock.blockId !== assessmentBinding.blockId || assessmentBlock.ordinal !== assessmentBinding.blockOrdinal || assessmentBlock.expectedExperimentId !== experiment?.id || assessmentBinding.expectedExperimentId !== experiment?.id || parentBlock.status !== "pending") throw planError("PRACTICE_ASSESSMENT_BLOCK_MISMATCH", "Assessment child does not match the next frozen block", null, "prepare-assessment");
      if (experiment?.resumable !== false) throw planError("PRACTICE_ASSESSMENT_RESUMABLE_FORBIDDEN", "Assessment child sessions must be non-resumable", null, "prepare-assessment");
      if ((contentPlan?.targetEntities?.length ?? 0) !== 0) throw planError("PRACTICE_ASSESSMENT_TARGETED_CONTENT", "Assessment child sessions cannot contain target entities", null, "prepare-assessment");
      if (contentPlan?.completion?.mode !== "duration" || contentPlan?.completion?.value !== assessmentBlock.durationMs) throw planError("PRACTICE_ASSESSMENT_PROTOCOL_INVALID", "Assessment child requires exact frozen duration completion", null, "prepare-assessment");
      if (retentionKind != null || experiment?.performanceMeasurementKind != null) throw planError("PRACTICE_ASSESSMENT_ROLE_CONFLICT", "Assessment child cannot be a retention or performance-state measurement", null, "prepare-assessment");
      if (assessmentBlock.blockKind === "diagnostic") {
        if (evaluationKind != null || experiment?.abilityChannel != null) throw planError("PRACTICE_ASSESSMENT_ROLE_CONFLICT", "Diagnostic assessment child cannot request protected evaluation or ability measurement", null, "prepare-assessment");
        if ((contentPlan?.metadata?.partition ?? contentPlan?.metadata?.corpusPartition) !== "diagnostic") throw planError("PRACTICE_CORPUS_PARTITION_MISMATCH", "Assessment diagnostic content requires diagnostic partition", null, "prepare-assessment");
      }
      if (assessmentBlock.blockKind === "benchmark" && (evaluationKind !== "benchmark" || experiment?.abilityChannel !== "cold-natural-text")) throw planError("PRACTICE_ASSESSMENT_ROLE_CONFLICT", "Assessment benchmark descriptor is incompatible", null, "prepare-assessment");
      if (assessmentBlock.blockKind === "cold-transfer" && (evaluationKind !== "cold-transfer" || experiment?.abilityChannel != null)) throw planError("PRACTICE_ASSESSMENT_ROLE_CONFLICT", "Assessment transfer descriptor is incompatible", null, "prepare-assessment");
    }

    if (retentionKind != null && evaluationKind != null) throw planError("PRACTICE_EVALUATION_CONFLICT", "Retention review and protected evaluation cannot share one session");
    if (evaluationKind != null && experiment?.performanceMeasurementKind != null) throw planError("PRACTICE_EVALUATION_CONFLICT", "PL18 v1 protected evaluation cannot combine with PL14 performance measurement");

    if (retentionKind != null) {
      if (retentionKind !== "entity-review") throw planError("PRACTICE_REVIEW_PLAN_STALE", "Unsupported retention measurement kind", null, "prepare-review-plan");
      if ((configuration.correctionBehavior ?? experiment.defaultCorrectionBehavior) !== "allow") throw planError("PRACTICE_REVIEW_PLAN_INVALID", "Retention review requires correctionBehavior=allow", null, "prepare-review-plan");
      if (evidenceRole !== "training") throw planError("PRACTICE_CORPUS_PARTITION_MISMATCH", "Retention review requires trusted training-partition content", null, "prepare-review-plan");
      const planValidation = await validatePracticeReviewPlanForPreparation({ plan: suppliedReviewPlan, repository, profileId, contextId, contentPlan });
      if (!planValidation.valid) throw planError(planValidation.code || "PRACTICE_REVIEW_PLAN_STALE", "Practice retention review plan is stale or incompatible", planValidation, "prepare-review-plan");
      registerPracticeTrustedRetentionPurpose(contentPlan, retentionKind);
    } else {
      if (suppliedReviewPlan != null) throw planError("PRACTICE_REVIEW_PLAN_INVALID", "Ordinary Practice sessions cannot bind a retention review plan", null, "prepare-review-plan");
      registerPracticeTrustedRetentionPurpose(contentPlan, null);
    }

    if (evaluationKind != null) {
      if (!["benchmark", "cold-transfer"].includes(evaluationKind)) throw planError("PRACTICE_EVALUATION_UNSUPPORTED", "Unsupported evaluation measurement kind");
      if (!suppliedEvaluationPlan || suppliedEvaluationPlan.kind !== evaluationKind || !suppliedEvaluationArtifact) throw planError("PRACTICE_EVALUATION_PLAN_INVALID", "Protected evaluation requires matching claimed plan and artifact");
      const binding = suppliedEvaluationPlan.binding;
      const bindingValidation = validatePracticeEvaluationBinding(binding);
      if (!bindingValidation.valid) throw planError("PRACTICE_EVALUATION_PLAN_INVALID", "Protected evaluation binding failed validation", bindingValidation.errors);
      if (binding.profileId !== profileId || binding.contextId !== contextId || binding.sessionId !== sessionId) throw planError("PRACTICE_EVALUATION_BINDING_MISMATCH", "Evaluation binding does not match session identity");
      if (suppliedEvaluationArtifact.status !== "ready") throw planError("PRACTICE_EVALUATION_ARTIFACT_NOT_READY", "Protected evaluation artifact is not ready");
      if (experiment.resumable !== false) throw planError("PRACTICE_EVALUATION_RESUMABLE_FORBIDDEN", "Protected evaluation sessions must be non-resumable");
      if ((contentPlan?.targetEntities?.length ?? 0) !== 0) throw planError("PRACTICE_EVALUATION_TARGETED_CONTENT", "Protected evaluation content cannot contain target entities");
      const expectedPartition = evaluationKind === "benchmark" ? "benchmark" : "transfer";
      if ((contentPlan?.metadata?.partition ?? contentPlan?.metadata?.corpusPartition) !== expectedPartition) throw planError("PRACTICE_CORPUS_PARTITION_MISMATCH", "Protected evaluation content came from the wrong partition");
      if (contentPlan?.metadata?.evaluationContentBindingHash !== binding.contentBindingHash) throw planError("PRACTICE_EVALUATION_CONTENT_HASH_MISMATCH", "Protected evaluation content does not match claimed binding");
      if (contentPlan?.completion?.mode !== "duration" || contentPlan?.completion?.value !== suppliedEvaluationPlan.measurementProtocol.durationMs) throw planError("PRACTICE_EVALUATION_PROTOCOL_INVALID", "Protected evaluation requires fixed duration protocol");
      registerPracticeTrustedEvaluationPurpose(contentPlan, evaluationKind);
      effectiveConfiguration = applyPracticeEvaluationConfigurationOverrides(configuration, evaluationKind);
    } else {
      if (suppliedEvaluationPlan != null || suppliedEvaluationArtifact != null) throw planError("PRACTICE_EVALUATION_PLAN_INVALID", "Ordinary Practice sessions cannot bind protected evaluation artifacts");
      registerPracticeTrustedEvaluationPurpose(contentPlan, null);
      effectiveConfiguration = configuration;
    }
    if (assessmentBinding) effectiveConfiguration = Object.freeze({ ...effectiveConfiguration, ...PRACTICE_ASSESSMENT_MEASUREMENT_MINIMAL_OVERRIDES });

    const originalAnalyze = experiment?.analyzeResult;
    const wrappedExperiment = freezeDeep({
      ...experiment,
      async analyzeResult(input) {
        let analyzerInput = input;
        if (retentionKind === "entity-review") {
          const currentPlan = await validatePracticeReviewPlanForPreparation({ plan: reviewPlan, repository, profileId, contextId, contentPlan: preparedContentPlan });
          const reviewedAt = nowDate(wallClock);
          const traceCapacity = checkpointPolicy.eventCapacity ?? PRACTICE_SESSION_LIMITS.eventBuffer;
          const eventTrace = Array.isArray(input?.eventTrace) ? input.eventTrace : [];
          retentionAnalysis = buildPracticeRetentionAnalysis({
            foundationAnalysis: input.foundationAnalysis,
            experiment: trustedExperiment,
            contentPlan: preparedContentPlan,
            reviewPlan,
            session: { sessionId: input?.sessionSnapshot?.sessionId ?? sessionId, status: finalStatus, completionReason: finalReason ?? completionReasonForMode(preparedContentPlan?.completion?.mode), reviewedAtUtc: reviewedAt.toISOString(), localDayKey: getPracticeTimeContext(reviewedAt).localDayKey },
            traceMetadata: { truncated: eventTrace.length >= traceCapacity, scope: eventTrace.length >= traceCapacity ? "retained-window" : "complete-session" },
            restoredFromCheckpoint: false,
            planCurrent: currentPlan.valid,
            segmenter,
          });
          analyzerInput = freezeDeep({ ...input, foundationAnalysis: withPracticeRetentionAnalysis(input.foundationAnalysis, retentionAnalysis) });
        }
        if (evaluationPlan) {
          evaluationAnalysis = buildPracticeEvaluationAnalysis({
            plan: evaluationPlan,
            session: buildEvaluationSession(input, { sessionId, profileId, contextId, configuration: effectiveConfiguration, finalStatus, finalReason, contentPlan: preparedContentPlan, wallClock }),
            contentPlan: preparedContentPlan,
            foundationAnalysis: analyzerInput.foundationAnalysis,
            artifact: evaluationArtifact,
            historyStatus: evaluationPlan.historyStatus ?? (evaluationPlan.binding?.freshnessStatus === "unknown" ? "partial" : "complete"),
            runtime: evaluationRuntime,
          });
          analyzerInput = freezeDeep({ ...analyzerInput, foundationAnalysis: withPracticeEvaluationAnalysis(analyzerInput.foundationAnalysis, evaluationAnalysis) });
        }
        if (assessmentBinding) {
          assessmentAnalysis = buildPracticeAssessmentAnalysis({
            binding: assessmentBinding,
            blockKind: assessmentBlock.blockKind,
            summary: buildEvaluationSession(input, { sessionId, profileId, contextId, configuration: effectiveConfiguration, finalStatus, finalReason, contentPlan: preparedContentPlan, wallClock }),
            foundationAnalysis: analyzerInput.foundationAnalysis,
            evaluationSummary: evaluationAnalysis?.sessionSummary ?? null,
            diagnosticFormId: assessmentBlock.diagnosticFormId ?? null,
            diagnosticFreshness: assessmentBinding.diagnosticFreshness ?? null,
            runtime: assessmentRuntime,
          });
          analyzerInput = freezeDeep({ ...analyzerInput, foundationAnalysis: withPracticeAssessmentAnalysis(analyzerInput.foundationAnalysis, assessmentAnalysis) });
        }
        const output = typeof originalAnalyze === "function" ? await originalAnalyze(analyzerInput) : null;
        const overrides = buildPracticeEvaluationEvidenceOverrides(analyzerInput.foundationAnalysis, evaluationAnalysis);
        return {
          ...(output && typeof output === "object" && !Array.isArray(output) ? output : {}),
          __pl17RetentionReviewSummary: retentionAnalysis?.summary ?? null,
          __pl18EvaluationSummary: evaluationAnalysis?.sessionSummary ?? null,
          __pl18SkillEvidenceSummary: overrides.skillEvidenceSummary,
          __pl18AbilityMeasurementSummary: overrides.abilityMeasurementSummary,
          __pl18LearningEvidenceSummary: overrides.learningEvidenceSummary,
          __pl19AssessmentBinding: compactAssessmentBinding(assessmentBinding),
          __pl19AssessmentBlockDelta: assessmentAnalysis?.assessmentBlockDelta ?? null,
        };
      },
    });
    const prepared = await base.prepare({ experiment: wrappedExperiment, configuration: effectiveConfiguration, contentPlan });
    if (assessmentBinding) {
      const latest = await repository.getAssessmentRun(assessmentBinding.assessmentRunId);
      const next = markPracticeAssessmentBlockStarted(latest, { blockId: assessmentBinding.blockId, childSessionId: sessionId, now: () => nowDate(wallClock) });
      await repository.saveAssessmentRun(next);
      assessmentRun = next;
    }
    return prepared;
  };

  const complete = (reason) => { finalStatus = "completed"; if (reason != null) finalReason = reason; return base.complete(reason); };
  const abandon = (reason = "manual-stop") => { finalStatus = "abandoned"; finalReason = reason; return base.abandon(reason); };
  const pause = (reason = "manual") => {
    if (evaluationPlan) evaluationRuntime = { ...evaluationRuntime, pauseObserved: true };
    if (assessmentBinding) assessmentRuntime = { ...assessmentRuntime, pauseObserved: true };
    return base.pause(reason);
  };
  const handleVisibilityState = (nextVisibility) => {
    if (evaluationPlan && nextVisibility === "hidden") evaluationRuntime = { ...evaluationRuntime, pauseObserved: true };
    if (assessmentBinding && nextVisibility === "hidden") assessmentRuntime = { ...assessmentRuntime, pauseObserved: true };
    return base.handleVisibilityState(nextVisibility);
  };
  const appendContent = (addition) => {
    if (assessmentBinding) {
      assessmentRuntime = { ...assessmentRuntime, contentAppendObserved: true };
      throw planError("PRACTICE_ASSESSMENT_APPEND_FORBIDDEN", "Assessment child content cannot be appended", null, "append-content");
    }
    if (evaluationPlan) {
      evaluationRuntime = { ...evaluationRuntime, contentAppendObserved: true };
      throw planError("PRACTICE_EVALUATION_APPEND_FORBIDDEN", "Protected evaluation content cannot be appended", null, "append-content");
    }
    return base.appendContent(addition);
  };

  return Object.freeze({
    ...base,
    prepare,
    complete,
    abandon,
    pause,
    handleVisibilityState,
    appendContent,
    getRetentionAnalysis() { return retentionAnalysis; },
    getEvaluationAnalysis() { return evaluationAnalysis; },
    getAssessmentAnalysis() { return assessmentAnalysis; },
    getTrustedRetentionMeasurementKind() { return preparedContentPlan ? getPracticeTrustedRetentionPurpose(preparedContentPlan) : null; },
    getTrustedEvaluationMeasurementKind() { return preparedContentPlan ? getPracticeTrustedEvaluationPurpose(preparedContentPlan) : null; },
    getTrustedAssessmentBinding() { return assessmentBinding; },
  });
}

export async function restorePracticeSessionEngine(options = {}) {
  // PL17 retention review, PL18 protected evaluation and PL19 assessment children are deliberately non-resumable.
  return restoreLegacyPracticeSessionEngine(options);
}
