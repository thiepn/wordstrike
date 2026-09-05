import {
  createPracticeSessionEngine as createLegacyPracticeSessionEngine,
  restorePracticeSessionEngine as restoreLegacyPracticeSessionEngine,
} from "./practiceSessionEngineLegacy.js";
import { withPracticeRetentionAnalysis } from "./practiceFoundationAnalysis.js";
import { buildPracticeRetentionAnalysis } from "./practiceRetentionAnalysis.js";
import { validatePracticeReviewPlanForPreparation } from "./practiceReviewPlan.js";
import { commitCompletedPracticeRetentionSession } from "./practiceRetentionCommit.js";
import {
  getPracticeTrustedRetentionPurpose,
  registerPracticeTrustedRetentionPurpose,
} from "./practiceSessionPurposeRegistry.js";
import { resolvePracticeEvidenceRole } from "./practiceEvidenceRole.js";
import { PRACTICE_SESSION_LIMITS } from "./practiceSessionConstants.js";
import { getPracticeTimeContext } from "./practiceTime.js";

const completionReasonForMode = (mode) => ({
  content: "content-complete",
  duration: "time-complete",
  "word-count": "word-target-complete",
  manual: "manual-stop",
})[mode] || "manual-stop";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function reviewPlanError(code, message, details = null) {
  const error = new Error(message);
  error.name = "PracticeSessionError";
  error.code = code;
  error.operation = "prepare-review-plan";
  error.recoverable = true;
  error.details = details;
  return error;
}

function nowDate(wallClock) {
  const value = typeof wallClock === "function" ? wallClock() : wallClock;
  return value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
}

export function createPracticeSessionEngine(options = {}) {
  const {
    repository,
    sessionId,
    profileId,
    contextId,
    wallClock = () => new Date(),
    checkpointPolicy = {},
    segmenter = null,
  } = options;
  if (!repository) throw new TypeError("Practice engine requires a repository");

  let reviewPlan = null;
  let preparedContentPlan = null;
  let trustedExperiment = null;
  let retentionAnalysis = null;
  let finalStatus = "completed";
  let finalReason = null;

  const repositoryProxy = new Proxy(repository, {
    get(target, property, receiver) {
      if (property !== "commitCompletedPracticeSession") return Reflect.get(target, property, receiver);
      return async (payload) => commitCompletedPracticeRetentionSession({
        repository: target,
        sessionSummary: payload.sessionSummary,
        skillEvidenceDeltas: payload.skillEvidenceDeltas,
        abilityObservation: payload.abilityObservation,
        performanceStateDelta: payload.performanceStateDelta,
        learningObservationDeltas: payload.learningObservationDeltas,
        retentionReviewDeltas: retentionAnalysis?.reviewDeltas ?? [],
        experimentReviewItemChanges: payload.reviewItemChanges ?? [],
        updatedProfileSummary: payload.updatedProfileSummary,
        clearCheckpoint: payload.clearCheckpoint,
      });
    },
  });

  const base = createLegacyPracticeSessionEngine({ ...options, repository: repositoryProxy });

  const prepare = async ({ experiment, configuration = {}, contentPlan, reviewPlan: suppliedReviewPlan = null }) => {
    const retentionKind = experiment?.retentionMeasurementKind ?? null;
    reviewPlan = suppliedReviewPlan;
    preparedContentPlan = contentPlan;
    trustedExperiment = experiment;
    retentionAnalysis = null;
    finalStatus = "completed";
    finalReason = completionReasonForMode(contentPlan?.completion?.mode);

    if (retentionKind != null) {
      if (retentionKind !== "entity-review") throw reviewPlanError("PRACTICE_REVIEW_PLAN_STALE", "Unsupported retention measurement kind");
      if ((configuration.correctionBehavior ?? experiment.defaultCorrectionBehavior) !== "allow") throw reviewPlanError("PRACTICE_REVIEW_PLAN_INVALID", "Retention review requires correctionBehavior=allow");
      if (resolvePracticeEvidenceRole({ contentPlan }) !== "training") throw reviewPlanError("PRACTICE_CORPUS_PARTITION_MISMATCH", "Retention review requires trusted training-partition content");
      const planValidation = await validatePracticeReviewPlanForPreparation({
        plan: suppliedReviewPlan,
        repository,
        profileId,
        contextId,
        contentPlan,
      });
      if (!planValidation.valid) throw reviewPlanError(planValidation.code || "PRACTICE_REVIEW_PLAN_STALE", "Practice retention review plan is stale or incompatible", planValidation);
      registerPracticeTrustedRetentionPurpose(contentPlan, retentionKind);
    } else {
      if (suppliedReviewPlan != null) throw reviewPlanError("PRACTICE_REVIEW_PLAN_INVALID", "Ordinary Practice sessions cannot bind a retention review plan");
      registerPracticeTrustedRetentionPurpose(contentPlan, null);
    }

    const originalAnalyze = experiment?.analyzeResult;
    const wrappedExperiment = freezeDeep({
      ...experiment,
      async analyzeResult(input) {
        let analyzerInput = input;
        if (retentionKind === "entity-review") {
          const currentPlan = await validatePracticeReviewPlanForPreparation({
            plan: reviewPlan,
            repository,
            profileId,
            contextId,
            contentPlan: preparedContentPlan,
          });
          const reviewedAt = nowDate(wallClock);
          const traceCapacity = checkpointPolicy.eventCapacity ?? PRACTICE_SESSION_LIMITS.eventBuffer;
          const eventTrace = Array.isArray(input?.eventTrace) ? input.eventTrace : [];
          retentionAnalysis = buildPracticeRetentionAnalysis({
            foundationAnalysis: input.foundationAnalysis,
            experiment: trustedExperiment,
            contentPlan: preparedContentPlan,
            reviewPlan,
            session: {
              sessionId: input?.sessionSnapshot?.sessionId ?? sessionId,
              status: finalStatus,
              completionReason: finalReason ?? completionReasonForMode(preparedContentPlan?.completion?.mode),
              reviewedAtUtc: reviewedAt.toISOString(),
              localDayKey: getPracticeTimeContext(reviewedAt).localDayKey,
            },
            traceMetadata: {
              truncated: eventTrace.length >= traceCapacity,
              scope: eventTrace.length >= traceCapacity ? "retained-window" : "complete-session",
            },
            restoredFromCheckpoint: false,
            planCurrent: currentPlan.valid,
            segmenter,
          });
          analyzerInput = freezeDeep({
            ...input,
            foundationAnalysis: withPracticeRetentionAnalysis(input.foundationAnalysis, retentionAnalysis),
          });
        }
        const output = typeof originalAnalyze === "function" ? await originalAnalyze(analyzerInput) : null;
        return {
          ...(output && typeof output === "object" && !Array.isArray(output) ? output : {}),
          __pl17RetentionReviewSummary: retentionAnalysis?.summary ?? null,
        };
      },
    });
    return base.prepare({ experiment: wrappedExperiment, configuration, contentPlan });
  };

  const complete = (reason) => {
    finalStatus = "completed";
    if (reason != null) finalReason = reason;
    return base.complete(reason);
  };

  const abandon = (reason = "manual-stop") => {
    finalStatus = "abandoned";
    finalReason = reason;
    return base.abandon(reason);
  };

  return Object.freeze({
    ...base,
    prepare,
    complete,
    abandon,
    getRetentionAnalysis() { return retentionAnalysis; },
    getTrustedRetentionMeasurementKind() { return preparedContentPlan ? getPracticeTrustedRetentionPurpose(preparedContentPlan) : null; },
  });
}

export async function restorePracticeSessionEngine(options = {}) {
  // PL17 v1 deliberately does not restore a retention verification plan. The underlying
  // session may resume for typing/practice evidence, but no PL17 review verification can be emitted.
  return restoreLegacyPracticeSessionEngine(options);
}
