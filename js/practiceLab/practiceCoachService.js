// Phase 8 canonical Daily Coach service.
// The former V25 base is embedded here so production has one service owner and one cache/lifecycle surface.

import * as __coach_base_dep0 from "./practiceLimiterService.js";
import * as __coach_base_dep1 from "./practiceMasteryService.js";
import * as __coach_base_dep2 from "./practiceReviewService.js";
import * as __coach_base_dep3 from "./practiceSaturationModel.js";
import * as __coach_base_dep4 from "./practiceLearningPolicy.js";
import * as __coach_base_dep5 from "./practiceReviewItem.js";
import * as __coach_base_dep6 from "./practiceCoachConstants.js";
import * as __coach_base_dep7 from "./practiceCoachPolicy.js";
import * as __coach_base_dep8 from "./practiceCoachTargets.js";
import * as __coach_base_dep9 from "./practiceCoachPlanner.js";
import * as __coach_base_dep10 from "./practiceCoachPlan.js";
import * as __coach_base_dep11 from "./practiceCoachReviewGenerator.js";
import * as __coach_base_dep12 from "./practiceCoachReview.js";
import * as __coach_base_dep13 from "./practiceCoachBlockBinding.js";
import * as __coach_base_dep14 from "./practiceCoachReconciliation.js";
import * as __coach_base_dep15 from "./practiceIndexLoader.js";
import * as __coach_base_dep16 from "./practiceTargetIndex.js";
import * as __coach_base_dep17 from "./practiceTime.js";
import * as __coach_base_dep18 from "./practiceIds.js";
import * as __coach_base_dep19 from "./practiceAssessmentConstants.js";
import * as __coach_base_dep20 from "./practiceLimiterPolicy.js";
import * as __coach_base_dep21 from "./practiceMasteryConstants.js";
import * as __coach_base_dep22 from "./practiceLearningConstants.js";
import * as __coach_base_dep23 from "./practiceReviewConstants.js";
import * as __coach_base_dep24 from "./practicePerformanceConstants.js";
import * as __coach_current_dep0 from "./practiceLimiterService.js";
import * as __coach_current_dep1 from "./practiceCoachTargets.js";
import * as __coach_current_dep2 from "./practiceCoachTreatmentOptions.js";
import * as __coach_current_dep3 from "./practiceCoachPlan.js";
import * as __coach_current_dep4 from "./practiceTreatmentConstants.js";
import * as __coach_current_dep5 from "./practiceTime.js";

const __coach_base = (() => {
  const { createPracticeLimiterModel } = __coach_base_dep0;
  const { createPracticeMasteryService } = __coach_base_dep1;
  const { createPracticeReviewService } = __coach_base_dep2;
  const { evaluatePracticeSaturation } = __coach_base_dep3;
  const { PRACTICE_LEARNING_POLICY_V1 } = __coach_base_dep4;
  const { derivePracticeReviewDueStatus } = __coach_base_dep5;
  const { PRACTICE_COACH_MAX_FEASIBILITY_CHECKS, PRACTICE_COACH_REVIEW_GENERATOR_VERSION } = __coach_base_dep6;
  const { PRACTICE_COACH_POLICY_V1, normalizePracticeCoachRequestedMinutes } = __coach_base_dep7;
  const { buildPracticeCoachTargetCandidates } = __coach_base_dep8;
  const { buildPracticeCoachDailyPlan, shouldIncludePracticeCoachReview } = __coach_base_dep9;
  const { createPracticeCoachFingerprint, calculatePracticeCoachCompletion, validatePracticeCoachPlan } = __coach_base_dep10;
  const { buildPracticeCoachReviewPreflight } = __coach_base_dep11;
  const { createPracticeCoachReviewDescriptor } = __coach_base_dep12;
  const { createPracticeCoachBlockBinding, trustPracticeCoachContentPlan } = __coach_base_dep13;
  const { abandonPracticeCoachPlanRecord, blockPracticeCoachBlockRecord, reconcilePracticeCoachPlanRecord, skipPracticeCoachBlockRecord } = __coach_base_dep14;
  const { createPracticeIndexLoader } = __coach_base_dep15;
  const { createPracticeTargetIndex } = __coach_base_dep16;
  const { getPracticeLocalDayKey, toPracticeUtcIso } = __coach_base_dep17;
  const { hashPracticeContent } = __coach_base_dep18;
  const { PRACTICE_ASSESSMENT_PROTOCOL_VERSION } = __coach_base_dep19;
  const { PRACTICE_LIMITER_MODEL_VERSION, PRACTICE_LIMITER_POLICY_VERSION } = __coach_base_dep20;
  const { PRACTICE_MASTERY_MODEL_VERSION, PRACTICE_MASTERY_POLICY_VERSION } = __coach_base_dep21;
  const { PRACTICE_LEARNING_MODEL_VERSION, PRACTICE_LEARNING_POLICY_VERSION, PRACTICE_SATURATION_MODEL_VERSION } = __coach_base_dep22;
  const { PRACTICE_REVIEW_MODEL_VERSION, PRACTICE_REVIEW_POLICY_VERSION } = __coach_base_dep23;
  const { PRACTICE_PERFORMANCE_STATE_MODEL_VERSION, PRACTICE_PERFORMANCE_STATE_POLICY_VERSION } = __coach_base_dep24;
  const DAY_MS = 86_400_000;
  const COACH_READINESS_CHANNEL = "cold-natural-text";
  const freezeDeep = (value) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freezeDeep);
    return Object.freeze(value);
  };
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const entityIdentity = (value) => `${value?.entityType ?? ""}\u0000${value?.entityKey ?? ""}`;
  
  function serviceError(code, message, details = null) {
    const error = new Error(message);
    error.name = "PracticeCoachError";
    error.code = code;
    error.details = details;
    error.recoverable = true;
    return error;
  }
  
  function coachPlannedSessionId(profileId, contextId, localDayKey, blockId) {
    const hash = hashPracticeContent(`${profileId}|${contextId}|${localDayKey}|${blockId}|1`).slice(-8);
    return `practice-session_coach-${hash}-${blockId}`;
  }
  
  function modeAvailabilityStatus(result) {
    if (result?.status === "ready" || result?.eligible === true && result?.status !== "unavailable") return "ready";
    if (result?.status === "limited-content") return "limited-content";
    return "unavailable";
  }
  
  function maximumUpdatedAt(records = []) {
    return records.reduce((latest, record) => {
      const value = typeof record?.updatedAt === "string" ? record.updatedAt : "";
      return value > latest ? value : latest;
    }, "");
  }
  
  function assessmentStateFromRuns(runs = []) {
    const completed = runs
      .filter((run) => run?.status === "completed" && run?.report)
      .sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")));
    if (!completed.length) return "never-started";
    const latest = completed[0];
    if (latest.report?.reportStatus !== "complete") return "incomplete";
    if (latest.protocolVersion !== PRACTICE_ASSESSMENT_PROTOCOL_VERSION || latest.report?.protocolVersion !== PRACTICE_ASSESSMENT_PROTOCOL_VERSION) return "stale";
    return "complete";
  }
  
  function modelVersions() {
    return Object.freeze({
      limiterModelVersion: PRACTICE_LIMITER_MODEL_VERSION,
      limiterPolicyVersion: PRACTICE_LIMITER_POLICY_VERSION,
      performanceModelVersion: PRACTICE_PERFORMANCE_STATE_MODEL_VERSION,
      performancePolicyVersion: PRACTICE_PERFORMANCE_STATE_POLICY_VERSION,
      masteryModelVersion: PRACTICE_MASTERY_MODEL_VERSION,
      masteryPolicyVersion: PRACTICE_MASTERY_POLICY_VERSION,
      learningModelVersion: PRACTICE_LEARNING_MODEL_VERSION,
      learningPolicyVersion: PRACTICE_LEARNING_POLICY_VERSION,
      saturationModelVersion: PRACTICE_SATURATION_MODEL_VERSION,
      reviewModelVersion: PRACTICE_REVIEW_MODEL_VERSION,
      reviewPolicyVersion: PRACTICE_REVIEW_POLICY_VERSION,
      coachReviewGeneratorVersion: PRACTICE_COACH_REVIEW_GENERATOR_VERSION,
      assessmentProtocolVersion: PRACTICE_ASSESSMENT_PROTOCOL_VERSION,
    });
  }
  
  function reasonFromReviewQueue(queue, bindings) {
    const ids = new Set((bindings ?? []).map((binding) => binding.reviewItemId));
    const selected = (queue?.candidates ?? []).filter((candidate) => ids.has(candidate.reviewItemId ?? candidate.reviewBinding?.reviewItemId));
    return {
      hasOverdue: selected.some((candidate) => candidate.dueStatus === "overdue"),
      maximumReviewValue: selected.reduce((max, candidate) => Math.max(max, Number(candidate.reviewValue || 0)), 0),
    };
  }
  
  function deriveSuggestions({ assessmentState, assessmentAvailability, actionableTargetCount, masterySnapshot, coldTransferAvailability, recentColdTransferAt, now }) {
    const quickAvailable = Boolean(assessmentAvailability?.depths?.quick?.available || assessmentAvailability?.quick?.available);
    const assessmentRecommended = ["never-started", "stale"].includes(assessmentState) && quickAvailable;
    const assessmentSuggestion = assessmentRecommended ? {
      kind: "assessment",
      value: actionableTargetCount === 0 ? "high-value" : "recommended",
      reason: assessmentState,
    } : null;
    const transferUnverifiedCount = Number(masterySnapshot?.counts?.transferUnverifiedCount || 0);
    const coldReady = coldTransferAvailability?.status === "ready" || coldTransferAvailability?.available === true;
    const recentMs = recentColdTransferAt ? Date.parse(recentColdTransferAt) : NaN;
    const nowMs = new Date(typeof now === "function" ? now() : now).getTime();
    const recent = Number.isFinite(recentMs) && Number.isFinite(nowMs) && nowMs - recentMs < 7 * DAY_MS;
    const coldTransferSuggestion = coldReady && transferUnverifiedCount >= 3 && !recent
      ? { kind: "cold-transfer", value: "available", cadenceDays: 7 }
      : null;
    return freezeDeep({ assessmentSuggestion, coldTransferSuggestion });
  }
  
  function targetSetup(block) {
    if (block.experimentId === "weak-keys") return { entityKey: block.target.entityKey, targetSource: "external-plan", sessionId: block.plannedSessionId };
    if (block.experimentId === "combination-repair") return { entityType: block.target.entityType, entityKey: block.target.entityKey, targetSource: "external-plan", sessionId: block.plannedSessionId };
    if (block.experimentId === "problem-words") return { entityKey: block.target.entityKey, targetSource: "external-plan", sessionId: block.plannedSessionId };
    if (block.experimentId === "accuracy-control") return { entityType: block.target.entityType, entityKey: block.target.entityKey, targetSource: "external-plan", sessionId: block.plannedSessionId };
    throw serviceError("PRACTICE_COACH_UNSUPPORTED_TARGET", "Frozen Coach target experiment is unsupported", { experimentId: block.experimentId });
  }
  
  function withUpdatedBlock(plan, blockId, patch, { status = null, now = () => new Date() } = {}) {
    const blocks = clone(plan.blocks);
    const index = blocks.findIndex((block) => block.blockId === blockId);
    if (index < 0) throw serviceError("PRACTICE_COACH_BLOCK_MISSING", "Frozen Coach block is missing", { blockId });
    blocks[index] = { ...blocks[index], ...patch };
    const next = {
      ...clone(plan),
      blocks,
      status: status ?? plan.status,
      updatedAt: toPracticeUtcIso(now),
      completion: calculatePracticeCoachCompletion(blocks),
    };
    const validation = validatePracticeCoachPlan(next);
    if (!validation.valid) throw serviceError("PRACTICE_COACH_PLAN_INVALID", "Coach lifecycle update failed validation", validation.errors);
    return freezeDeep(next);
  }
  
  function createPracticeCoachService({
    repository,
    experimentRegistry,
    limiterService = null,
    masteryService = null,
    reviewService = null,
    logger = null,
    now = () => new Date(),
    policy = PRACTICE_COACH_POLICY_V1,
    fetchImpl = globalThis.fetch,
    language = "en",
    corpusVersion = 1,
    indexBaseUrl = "data/practice/indexes",
    corpusBaseUrl = "data/practice",
    getAssessmentAvailability = null,
    getAssessmentState = null,
    getColdTransferAvailability = null,
    getRecentColdTransferAt = null,
  } = {}) {
    if (!repository || typeof repository.getTodayCoachPlan !== "function" || typeof repository.createCoachPlan !== "function") throw new TypeError("Daily Coach requires PL25 repository support");
    if (!experimentRegistry || typeof experimentRegistry.getRegistration !== "function") throw new TypeError("Daily Coach requires the Practice experiment registry");
    if (typeof now !== "function") throw new TypeError("Daily Coach requires injected now()");
    const resolvedLimiterService = limiterService ?? createPracticeLimiterModel({ repository, now });
    const resolvedMasteryService = masteryService ?? createPracticeMasteryService({ repository, limiterService: resolvedLimiterService, now });
    const resolvedReviewService = reviewService ?? createPracticeReviewService({ repository, limiterService: resolvedLimiterService, now });
    let reviewIndexPromise = null;
  
    const loadReviewTargetIndex = async () => {
      if (reviewIndexPromise) return reviewIndexPromise;
      if (typeof fetchImpl !== "function") throw serviceError("PRACTICE_COACH_REVIEW_INDEX_UNAVAILABLE", "Coach Review target index loader is unavailable");
      reviewIndexPromise = (async () => {
        const loader = createPracticeIndexLoader({ fetchImpl, baseUrl: indexBaseUrl });
        const [corpusManifestResponse, indexManifest] = await Promise.all([
          fetchImpl(`${corpusBaseUrl}/manifests/${language}-v${corpusVersion}.manifest.json`),
          loader.loadManifest({ language, corpusVersion }),
        ]);
        if (!corpusManifestResponse?.ok) throw serviceError("PRACTICE_COACH_REVIEW_INDEX_UNAVAILABLE", "Coach Review corpus manifest is unavailable");
        const corpusManifest = await corpusManifestResponse.json();
        if (indexManifest.corpusId !== corpusManifest.corpusId || indexManifest.corpusVersion !== corpusManifest.corpusVersion) throw serviceError("PRACTICE_COACH_REVIEW_INDEX_STALE", "Coach Review target index does not match the corpus manifest");
        return createPracticeTargetIndex({ loader, corpusManifest, indexManifest });
      })().catch((error) => { reviewIndexPromise = null; throw error; });
      return reviewIndexPromise;
    };
  
    const getTodayPracticeCoachPlan = async (profileId, contextId, queryNow = now) => {
      const localDayKey = getPracticeLocalDayKey(queryNow);
      return repository.getTodayCoachPlan(profileId, contextId, localDayKey);
    };
  
    const inspectTargetAvailability = async (candidate) => {
      const registration = experimentRegistry.getRegistration(candidate.experimentId);
      if (!registration?.runtime) return "unavailable";
      try {
        let result = null;
        if (candidate.experimentId === "weak-keys") result = await registration.runtime.inspectTarget?.({ entityKey: candidate.entityKey });
        else if (candidate.experimentId === "combination-repair") result = await registration.runtime.inspectTarget?.({ entityType: candidate.entityType, entityKey: candidate.entityKey });
        else if (candidate.experimentId === "problem-words") result = await registration.runtime.inspectTarget?.({ entityKey: candidate.entityKey });
        else if (candidate.experimentId === "accuracy-control") result = await registration.runtime.inspectTarget?.({ entityType: candidate.entityType, entityKey: candidate.entityKey });
        return modeAvailabilityStatus(result);
      } catch {
        return "unavailable";
      }
    };
  
    const createTodayPracticeCoachPlan = async ({ profileId, contextId, requestedMinutes, language: requestedLanguage = null } = {}) => {
      const localDayKey = getPracticeLocalDayKey(now);
      const existing = await repository.getTodayCoachPlan(profileId, contextId, localDayKey);
      if (existing) return freezeDeep({ created: false, plan: existing });
      const context = await repository.getPracticeContext(contextId);
      if (!context || context.profileId !== profileId) throw serviceError("PRACTICE_COACH_CONTEXT_MISMATCH", "Daily Coach context is missing or belongs to another profile");
      const budget = normalizePracticeCoachRequestedMinutes(requestedMinutes ?? repository.getPracticeSettings?.()?.dailySessionLengthMinutes, policy);
      const degradedInputs = new Set();
      const degrade = (code, fallback, error = null) => {
        degradedInputs.add(code);
        logger?.warn?.("Daily Coach optional evidence unavailable", { code, name: error?.name ?? "Error" });
        return fallback;
      };
  
      try { await resolvedReviewService.reconcile({ profileId, contextId }); }
      catch (error) { degrade("review-reconcile", null, error); }
  
      const [limiterSnapshot, masterySnapshot, learningStates, performanceState, reviewQueue, assessmentRuns, skillStats] = await Promise.all([
        resolvedLimiterService.buildContextLimiterSnapshot({ profileId, contextId, maxCandidates: 32 }).catch((error) => degrade("limiter-snapshot", { candidates: [] }, error)),
        resolvedMasteryService.buildContextMasterySnapshot({ profileId, contextId, maxEntities: 256, entityTypes: ["key", "bigram", "trigram", "word"] }).catch((error) => degrade("mastery-snapshot", { entities: [], counts: {} }, error)),
        repository.listLearningStates(profileId, contextId).catch((error) => degrade("learning-states", [], error)),
        repository.getPerformanceState(profileId, contextId).catch((error) => degrade("performance-state", null, error)),
        resolvedReviewService.buildPracticeReviewQueue({ profileId, contextId, maxCandidates: 128, includeNearDue: false, reconcile: false }).catch((error) => degrade("review-queue", { candidates: [] }, error)),
        (repository.listAssessmentRuns?.(profileId, { contextId }) ?? Promise.resolve([])).catch((error) => degrade("assessment-history", [], error)),
        repository.listSkillStats(profileId, contextId).catch((error) => degrade("skill-stats", [], error)),
      ]);
  
      const currentPerformance = await repository.getCurrentPerformanceState(profileId, contextId, COACH_READINESS_CHANNEL, now)
        .catch((error) => degrade("current-performance", null, error));
      const readinessBand = currentPerformance?.readinessBand ?? "unknown";
      const readinessStale = currentPerformance?.status === "stale";
      const warmupStatus = performanceState?.warmupModels?.[COACH_READINESS_CHANNEL]?.status ?? "insufficient-data";
      const masteryByStat = new Map((masterySnapshot?.entities ?? []).map((entry) => [entry.statId, entry]));
      const learningStateByStat = new Map((learningStates ?? []).map((entry) => [entry.statId, entry]));
      const learningByStat = new Map();
      for (const candidate of limiterSnapshot?.candidates ?? []) {
        const learningState = learningStateByStat.get(candidate.statId) ?? null;
        const mastery = masteryByStat.get(candidate.statId) ?? null;
        const saturation = learningState
          ? evaluatePracticeSaturation({ learningState, mastery, limiter: candidate, policy: PRACTICE_LEARNING_POLICY_V1 })
          : { status: "insufficient-data" };
        learningByStat.set(candidate.statId, {
          saturation,
          marginalGain: learningState?.acquisition?.curve?.marginalGainStatus ?? "unknown",
        });
      }
  
      let reviewPlan = null;
      const reviewRequested = shouldIncludePracticeCoachReview(reviewQueue, budget.minutes, policy);
      let reviewReservedBindings = reviewRequested
        ? (reviewQueue?.candidates ?? [])
          .filter((candidate) => ["due", "overdue"].includes(candidate?.dueStatus))
          .slice(0, policy.review.maxItems)
          .map((candidate) => candidate.reviewBinding ?? candidate)
          .filter((binding) => binding?.entityType && binding?.entityKey)
        : [];
      if (reviewRequested) {
        let tentative = null;
        try {
          tentative = await resolvedReviewService.buildPracticeReviewPlan({ queue: reviewQueue, maxItems: policy.review.maxItems, maxCostUnits: policy.review.maxCostUnits, includeNearDue: false });
        } catch (error) {
          degrade("review-plan", null, error);
        }
        if (tentative?.bindings?.length) {
          reviewReservedBindings = tentative.bindings;
          const targetIndex = await loadReviewTargetIndex().catch((error) => degrade("review-index", null, error));
          if (targetIndex) {
            const reviewSessionId = coachPlannedSessionId(profileId, contextId, localDayKey, "review");
            const preflight = await buildPracticeCoachReviewPreflight({ sessionId: reviewSessionId, reviewPlan: tentative, targetIndex })
              .catch((error) => degrade("review-preflight", null, error));
            if (preflight?.status === "ready" && preflight.reviewPlan?.bindings?.length) {
              const reviewReason = reasonFromReviewQueue(reviewQueue, preflight.reviewPlan.bindings);
              reviewPlan = freezeDeep({ ...preflight.reviewPlan, ...reviewReason });
            }
          }
        }
        if (!reviewPlan) degradedInputs.add("review-content");
      }
  
      const reviewSuppressionBindings = reviewPlan?.bindings ?? reviewReservedBindings;
      const reviewedEntities = new Set(reviewSuppressionBindings.map(entityIdentity));
      const reviewedStatIds = new Set(reviewSuppressionBindings.map((binding) => skillStats.find((stat) => stat.entityType === binding.entityType && stat.entityKey === binding.entityKey)?.statId).filter(Boolean));
      let targetCandidates = buildPracticeCoachTargetCandidates({
        limiterCandidates: limiterSnapshot?.candidates ?? [],
        masteryByStat,
        learningByStat,
        readinessBand,
        readinessStale,
        reviewedStatIds,
        reviewedEntities,
        policy,
      });
  
      const bounded = targetCandidates.slice(0, Math.min(PRACTICE_COACH_MAX_FEASIBILITY_CHECKS, policy.candidateLimits.feasibility));
      const availability = await Promise.all(bounded.map((candidate) => inspectTargetAvailability(candidate)));
      targetCandidates = freezeDeep(bounded.map((candidate, index) => ({ ...candidate, availabilityStatus: availability[index] })).filter((candidate) => candidate.availabilityStatus === "ready"));
      const unavailableTargetCount = Math.max(0, bounded.length - targetCandidates.length);
  
      const realTextRegistration = experimentRegistry.getRegistration("real-text");
      let realTextAvailability = null;
      try { realTextAvailability = await realTextRegistration?.runtime?.getAvailability?.() ?? null; }
      catch (error) { degrade("real-text-availability", null, error); }
      if (!realTextRegistration?.runtime) degradedInputs.add("real-text-availability");
      const realTextSupportedMinutes = (realTextAvailability?.supportedDurationsMs ?? []).map((durationMs) => durationMs / 60_000).filter((minutes) => [3, 5, 10].includes(minutes));
  
      let assessmentState = assessmentStateFromRuns(assessmentRuns);
      if (typeof getAssessmentState === "function") {
        try { assessmentState = await getAssessmentState({ profileId, contextId, runs: assessmentRuns, now }); }
        catch (error) { assessmentState = "unknown"; logger?.warn?.("Daily Coach optional assessment state unavailable", { code: "assessment-state", name: error?.name ?? "Error" }); }
      }
      const assessmentAvailability = typeof getAssessmentAvailability === "function"
        ? await getAssessmentAvailability({ profileId, contextId, language: requestedLanguage ?? context.dataLocale ?? language }).catch(() => null)
        : null;
      const coldTransferAvailability = typeof getColdTransferAvailability === "function"
        ? await getColdTransferAvailability({ profileId, contextId, language: requestedLanguage ?? context.dataLocale ?? language }).catch(() => null)
        : null;
      const recentColdTransferAt = typeof getRecentColdTransferAt === "function"
        ? await getRecentColdTransferAt({ profileId, contextId, now }).catch(() => null)
        : null;
      const suggestions = deriveSuggestions({ assessmentState, assessmentAvailability, actionableTargetCount: targetCandidates.length, masterySnapshot, coldTransferAvailability, recentColdTransferAt, now });
  
      const reviewItemsForFingerprint = await repository.listReviewItems(profileId, contextId)
        .catch((error) => degrade("review-items", [], error));
      const decisionContext = freezeDeep({
        readinessBand,
        warmupStatus,
        assessmentState,
        reviewCandidateCount: (reviewQueue?.candidates ?? []).filter((candidate) => ["due", "overdue"].includes(candidate.dueStatus)).length,
        reviewRequested,
        limiterCandidateCount: (limiterSnapshot?.candidates ?? []).filter((candidate) => ["likely", "confirmed"].includes(candidate.status)).length,
        verifiedTargetCount: targetCandidates.length,
        unavailableTargetCount,
        degradedInputs: Object.freeze([...degradedInputs].sort()),
        modelVersions: modelVersions(),
        budgetDiagnostic: budget.diagnostic,
      });
      const inputFingerprint = createPracticeCoachFingerprint({
        modelVersions: decisionContext.modelVersions,
        profileId,
        contextId,
        localDayKey,
        requestedMinutes: budget.minutes,
        contextUpdatedAt: context.updatedAt,
        performanceUpdatedAt: performanceState?.updatedAt ?? null,
        skillUpdatedAt: maximumUpdatedAt(skillStats),
        learningUpdatedAt: maximumUpdatedAt(learningStates),
        reviewUpdatedAt: maximumUpdatedAt(reviewItemsForFingerprint ?? []),
        assessmentState,
        degradedInputs: decisionContext.degradedInputs,
        review: (reviewQueue?.candidates ?? []).filter((candidate) => ["due", "overdue"].includes(candidate.dueStatus)).slice(0, 8).map((candidate) => [candidate.reviewItemId ?? candidate.reviewBinding?.reviewItemId, candidate.dueStatus, candidate.reviewValue]),
        targets: targetCandidates.map((candidate) => [candidate.statId, candidate.experimentId, candidate.utilityScore, candidate.availabilityStatus]),
        realTextSupportedMinutes,
      });
  
      const plan = buildPracticeCoachDailyPlan({
        profileId,
        contextId,
        localDayKey,
        requestedMinutes: budget.minutes,
        inputFingerprint,
        decisionContext,
        suggestions,
        reviewQueue,
        reviewPlan,
        targetCandidates,
        realTextSupportedMinutes,
        readinessBand,
        warmupStatus,
        now,
        policy,
      });
      if (!plan.blocks.length) {
        return freezeDeep({ created: false, raced: false, plan: null, reason: "no-available-blocks", decisionContext: plan.decisionContext });
      }
      const persisted = await repository.createCoachPlan(plan);
      return freezeDeep({ created: persisted.created, raced: Boolean(persisted.raced), plan: persisted.plan, reason: null });
    };
  
    const reconcilePracticeCoachPlan = async ({ coachPlanId } = {}) => {
      const plan = await repository.getCoachPlan(coachPlanId);
      if (!plan) return null;
      const sessions = await repository.listCoachChildSessions(coachPlanId);
      const activeCheckpoint = await repository.getActiveCheckpoint?.(plan.profileId).catch(() => null);
      const activeSessionIds = activeCheckpoint?.sessionId ? [activeCheckpoint.sessionId] : [];
      const next = reconcilePracticeCoachPlanRecord(plan, { childSessions: sessions, activeSessionIds, now });
      if (next !== plan) await repository.saveCoachPlan(next);
      return next;
    };
  
    const recoverInterruptedPracticeCoachBlock = async ({ coachPlanId } = {}) => {
      const plan = await repository.getCoachPlan(coachPlanId);
      if (!plan) throw serviceError("PRACTICE_COACH_PLAN_MISSING", "Daily Coach plan does not exist");
      const activeBlock = plan.blocks.find((block) => block.status === "active") ?? null;
      if (!activeBlock) return freezeDeep({ updated: false, reason: "no-active-block", plan });
      const checkpoint = await repository.getActiveCheckpoint?.(plan.profileId).catch(() => null);
      if (checkpoint?.sessionId === activeBlock.childSessionId) {
        if (checkpoint.resumable === true) throw serviceError("PRACTICE_COACH_RECOVERY_RESUMABLE", "Daily Coach will not clear a resumable session checkpoint");
        await repository.clearActiveCheckpoint?.(plan.profileId);
      }
      const sessions = await repository.listCoachChildSessions(coachPlanId);
      const next = reconcilePracticeCoachPlanRecord(plan, { childSessions: sessions, activeSessionIds: [], now });
      if (next !== plan) await repository.saveCoachPlan(next);
      return freezeDeep({ updated: next !== plan, reason: next === plan ? "active-block-still-current" : null, plan: next });
    };
  
    const startPracticeCoachBlock = async ({ coachPlanId, blockId = null } = {}) => {
      let plan = await reconcilePracticeCoachPlan({ coachPlanId });
      if (!plan) throw serviceError("PRACTICE_COACH_PLAN_MISSING", "Daily Coach plan does not exist");
      if (["finished", "abandoned", "expired"].includes(plan.status)) throw serviceError("PRACTICE_COACH_PLAN_NOT_STARTABLE", "Daily Coach plan is no longer startable", { status: plan.status });
      if (plan.localDayKey !== getPracticeLocalDayKey(now)) throw serviceError("PRACTICE_COACH_PLAN_EXPIRED", "Daily Coach plan belongs to another local day");
      const requested = blockId ? plan.blocks.find((block) => block.blockId === blockId) : plan.blocks.find((block) => block.status === "pending");
      if (!requested || requested.status !== "pending") throw serviceError("PRACTICE_COACH_BLOCK_NOT_PENDING", "No pending Daily Coach block is available");
      const earlierPending = plan.blocks.find((block) => block.ordinal < requested.ordinal && block.status === "pending");
      if (earlierPending) throw serviceError("PRACTICE_COACH_BLOCK_ORDER", "Earlier Daily Coach block must be completed or skipped first", { earlierBlockId: earlierPending.blockId });
  
      let session = null;
      if (requested.kind === "targeted-intervention") {
        const stat = requested.target?.statId
          ? await repository.getSkillStat(plan.profileId, plan.contextId, requested.target.entityType, requested.target.entityKey)
          : await repository.getSkillStat(plan.profileId, plan.contextId, requested.target.entityType, requested.target.entityKey);
        if (stat?.lastPractisedAt && Date.parse(stat.lastPractisedAt) > Date.parse(plan.createdAt)) {
          const blocked = blockPracticeCoachBlockRecord(plan, requested.blockId, "target-practised-after-plan", { now });
          if (blocked.updated) await repository.saveCoachPlan(blocked.plan);
          return freezeDeep({ started: false, blocked: true, reason: "target-practised-after-plan", plan: blocked.plan, block: blocked.plan.blocks.find((entry) => entry.blockId === requested.blockId) });
        }
        const registration = experimentRegistry.getRegistration(requested.experimentId);
        if (!registration?.setupFactory || !registration?.sessionFactory) throw serviceError("PRACTICE_COACH_EXPERIMENT_UNAVAILABLE", "Frozen Coach intervention is unavailable", { experimentId: requested.experimentId });
        try {
          const prepared = await registration.setupFactory(targetSetup(requested));
          session = registration.sessionFactory(prepared);
        } catch (cause) {
          const blocked = blockPracticeCoachBlockRecord(plan, requested.blockId, cause?.code ?? "intervention-unavailable", { now });
          if (blocked.updated) await repository.saveCoachPlan(blocked.plan);
          return freezeDeep({ started: false, blocked: true, reason: cause?.code ?? "intervention-unavailable", plan: blocked.plan, block: blocked.plan.blocks.find((entry) => entry.blockId === requested.blockId) });
        }
      } else if (requested.kind === "review") {
        const currentItems = await repository.listReviewItems(plan.profileId, plan.contextId);
        const byId = new Map(currentItems.map((item) => [item.reviewItemId, item]));
        for (const binding of requested.reviewPlan?.bindings ?? []) {
          const item = byId.get(binding.reviewItemId);
          const dueStatus = derivePracticeReviewDueStatus(item, now());
          if (!item || item.state !== "active" || item.cycle?.cycleId !== binding.cycleId || item.cycle?.referenceAtUtc !== binding.referenceAtUtc || !["due", "overdue"].includes(dueStatus)) {
            const blocked = blockPracticeCoachBlockRecord(plan, requested.blockId, "review-binding-stale", { now });
            if (blocked.updated) await repository.saveCoachPlan(blocked.plan);
            return freezeDeep({ started: false, blocked: true, reason: "review-binding-stale", plan: blocked.plan, block: blocked.plan.blocks.find((entry) => entry.blockId === requested.blockId) });
          }
        }
        try {
          const targetIndex = await loadReviewTargetIndex();
          const rebuilt = await buildPracticeCoachReviewPreflight({ sessionId: requested.plannedSessionId, reviewPlan: requested.reviewPlan, targetIndex });
          if (rebuilt.status !== "ready" || rebuilt.reviewContentPlanHash !== requested.reviewPlan.reviewContentPlanHash) throw serviceError("PRACTICE_COACH_REVIEW_HASH_MISMATCH", "Coach Review content no longer matches preflight");
          session = {
            experiment: createPracticeCoachReviewDescriptor(),
            configuration: { correctionBehavior: "allow", timingMode: "on-first-input" },
            contentPlan: rebuilt.contentPlan,
            reviewPlan: rebuilt.reviewPlan,
            coachReviewPlan: rebuilt.reviewPlan,
          };
        } catch (cause) {
          const blocked = blockPracticeCoachBlockRecord(plan, requested.blockId, cause?.code ?? "review-content-stale", { now });
          if (blocked.updated) await repository.saveCoachPlan(blocked.plan);
          return freezeDeep({ started: false, blocked: true, reason: cause?.code ?? "review-content-stale", plan: blocked.plan, block: blocked.plan.blocks.find((entry) => entry.blockId === requested.blockId) });
        }
      } else if (requested.kind === "real-text") {
        const registration = experimentRegistry.getRegistration("real-text");
        if (!registration?.setupFactory || !registration?.sessionFactory) throw serviceError("PRACTICE_COACH_REAL_TEXT_UNAVAILABLE", "Real Text is unavailable");
        try {
          const availability = await registration.runtime?.getAvailability?.();
          if (!availability?.supportedDurationsMs?.includes(requested.realTextDurationMs)) throw serviceError("PRACTICE_COACH_REAL_TEXT_STALE", "Frozen Real Text duration is no longer available");
          const prepared = await registration.setupFactory({ durationMs: requested.realTextDurationMs, sessionId: requested.plannedSessionId });
          session = registration.sessionFactory(prepared);
          if (session.contentPlan?.targetEntities?.length) throw serviceError("PRACTICE_COACH_REAL_TEXT_TARGETED", "Daily Coach Real Text must remain target-blind");
        } catch (cause) {
          const blocked = blockPracticeCoachBlockRecord(plan, requested.blockId, cause?.code ?? "real-text-stale", { now });
          if (blocked.updated) await repository.saveCoachPlan(blocked.plan);
          return freezeDeep({ started: false, blocked: true, reason: cause?.code ?? "real-text-stale", plan: blocked.plan, block: blocked.plan.blocks.find((entry) => entry.blockId === requested.blockId) });
        }
      }
  
      plan = withUpdatedBlock(plan, requested.blockId, {
        status: "active",
        startedAt: toPracticeUtcIso(now),
        childSessionId: requested.plannedSessionId,
      }, { status: "active", now });
      await repository.saveCoachPlan(plan);
      const activeBlock = plan.blocks.find((block) => block.blockId === requested.blockId);
      const binding = createPracticeCoachBlockBinding(plan, activeBlock);
      trustPracticeCoachContentPlan(session.contentPlan, binding);
      return freezeDeep({
        started: true,
        blocked: false,
        plan,
        block: activeBlock,
        session: { ...session, sessionId: requested.plannedSessionId, coachBinding: binding },
      });
    };
  
    const skipPracticeCoachBlock = async ({ coachPlanId, blockId } = {}) => {
      const plan = await reconcilePracticeCoachPlan({ coachPlanId });
      if (!plan) throw serviceError("PRACTICE_COACH_PLAN_MISSING", "Daily Coach plan does not exist");
      const result = skipPracticeCoachBlockRecord(plan, blockId, { now });
      if (result.updated) await repository.saveCoachPlan(result.plan);
      return result;
    };
  
    const abandonPracticeCoachPlan = async ({ coachPlanId } = {}) => {
      const plan = await reconcilePracticeCoachPlan({ coachPlanId });
      if (!plan) throw serviceError("PRACTICE_COACH_PLAN_MISSING", "Daily Coach plan does not exist");
      if (plan.blocks.some((block) => block.status === "active")) throw serviceError("PRACTICE_COACH_ACTIVE_CHILD", "Finish or exit the active Daily Coach child before ending today");
      const next = abandonPracticeCoachPlanRecord(plan, { now });
      if (next !== plan) await repository.saveCoachPlan(next);
      return next;
    };
  
    return Object.freeze({
      getTodayPracticeCoachPlan,
      createTodayPracticeCoachPlan,
      startPracticeCoachBlock,
      skipPracticeCoachBlock,
      abandonPracticeCoachPlan,
      reconcilePracticeCoachPlan,
      recoverInterruptedPracticeCoachBlock,
      clearCaches() { reviewIndexPromise = null; },
    });
  }
  
  async function getTodayPracticeCoachPlan(service, profileId, contextId, nowValue) {
    if (!service?.getTodayPracticeCoachPlan) throw new TypeError("getTodayPracticeCoachPlan requires Coach service");
    return service.getTodayPracticeCoachPlan(profileId, contextId, nowValue);
  }
  
  async function createTodayPracticeCoachPlan(service, options) {
    if (!service?.createTodayPracticeCoachPlan) throw new TypeError("createTodayPracticeCoachPlan requires Coach service");
    return service.createTodayPracticeCoachPlan(options);
  }
  
  async function startPracticeCoachBlock(service, options) {
    if (!service?.startPracticeCoachBlock) throw new TypeError("startPracticeCoachBlock requires Coach service");
    return service.startPracticeCoachBlock(options);
  }
  
  async function skipPracticeCoachBlock(service, options) {
    if (!service?.skipPracticeCoachBlock) throw new TypeError("skipPracticeCoachBlock requires Coach service");
    return service.skipPracticeCoachBlock(options);
  }
  
  async function abandonPracticeCoachPlan(service, options) {
    if (!service?.abandonPracticeCoachPlan) throw new TypeError("abandonPracticeCoachPlan requires Coach service");
    return service.abandonPracticeCoachPlan(options);
  }
  
  async function reconcilePracticeCoachPlan(service, options) {
    if (!service?.reconcilePracticeCoachPlan) throw new TypeError("reconcilePracticeCoachPlan requires Coach service");
    return service.reconcilePracticeCoachPlan(options);
  }
  return Object.freeze({ getTodayPracticeCoachPlan, createTodayPracticeCoachPlan, startPracticeCoachBlock, skipPracticeCoachBlock, abandonPracticeCoachPlan, reconcilePracticeCoachPlan, createPracticeCoachService });
})();

const __coach_current = (() => {
  const { createPracticeCoachService: createPracticeCoachServiceBase } = __coach_base;
  const { createPracticeLimiterModel } = __coach_current_dep0;
  const { calculatePracticeCoachExecutionPressure } = __coach_current_dep1;
  const { getCurrentPracticeCoachTreatmentFamilyKeys, getPotentialPracticeCoachTreatmentExperimentIds } = __coach_current_dep2;
  const { calculatePracticeCoachPlanHash, createPracticeCoachFingerprint, validatePracticeCoachPlan } = __coach_current_dep3;
  const { PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION } = __coach_current_dep4;
  const { getPracticeLocalDayKey } = __coach_current_dep5;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const currentFamilies = new Set(getCurrentPracticeCoachTreatmentFamilyKeys());
  
  function availabilityStatus(result) {
    if (result?.status === "ready" || result?.eligible === true && result?.status !== "unavailable") return "ready";
    if (result?.status === "limited-content") return "limited-content";
    return "unavailable";
  }
  
  async function inspectOption(experimentRegistry, candidate, experimentId) {
    const registration = experimentRegistry?.getRegistration?.(experimentId);
    if (!registration?.runtime) return "unavailable";
    try {
      let result = null;
      if (experimentId === "weak-keys") result = await registration.runtime.inspectTarget?.({ entityKey: candidate.entityKey });
      else if (experimentId === "combination-repair") result = await registration.runtime.inspectTarget?.({ entityType: candidate.entityType, entityKey: candidate.entityKey });
      else if (experimentId === "problem-words") result = await registration.runtime.inspectTarget?.({ entityKey: candidate.entityKey });
      else if (experimentId === "accuracy-control") result = await registration.runtime.inspectTarget?.({ entityType: candidate.entityType, entityKey: candidate.entityKey });
      return availabilityStatus(result);
    } catch {
      return "unavailable";
    }
  }
  
  function createPracticeCoachService(options = {}) {
    const { repository, experimentRegistry } = options;
    const now = typeof options.now === "function" ? options.now : () => new Date();
    if (!repository || !experimentRegistry) return createPracticeCoachServiceBase(options);
    const responseCache = new Map();
    const responseStateSnapshots = new Map();
    const baseLimiter = options.limiterService ?? createPracticeLimiterModel({ repository, now });
  
    function cacheKey(profileId, contextId) {
      return `${profileId}\u0000${contextId}\u0000${getPracticeLocalDayKey(now)}`;
    }
  
    async function loadResponseStates(profileId, contextId) {
      const key = cacheKey(profileId, contextId);
      if (!responseCache.has(key)) {
        const pending = (typeof repository.listTreatmentResponseStates === "function"
          ? repository.listTreatmentResponseStates(profileId, { contextId })
          : Promise.resolve([]))
          .catch(() => [])
          .then((states) => Object.freeze((Array.isArray(states) ? states : []).slice(0, 256)));
        responseCache.set(key, pending);
      }
      const states = await responseCache.get(key);
      responseStateSnapshots.set(key, states);
      return states;
    }
  
    const personalizationLimiter = Object.freeze({
      ...baseLimiter,
      async buildContextLimiterSnapshot(args = {}) {
        const snapshot = await baseLimiter.buildContextLimiterSnapshot(args);
        const profileId = args.profileId;
        const contextId = args.contextId;
        const responseStates = await loadResponseStates(profileId, contextId);
        const personalizationNow = now();
        const candidates = await Promise.all((snapshot?.candidates ?? []).map(async (candidate) => {
          const pressure = calculatePracticeCoachExecutionPressure(candidate);
          const enriched = { ...candidate, ...pressure };
          const ids = getPotentialPracticeCoachTreatmentExperimentIds(enriched);
          const statuses = await Promise.all(ids.map((experimentId) => inspectOption(experimentRegistry, candidate, experimentId)));
          const availability = Object.freeze(ids.reduce((out, experimentId, index) => {
            out[experimentId] = statuses[index];
            return out;
          }, {}));
          return Object.freeze({
            ...candidate,
            coachProfileId: profileId,
            coachContextId: contextId,
            coachPersonalizationNow: personalizationNow,
            coachTreatmentResponseStates: responseStates,
            coachTreatmentOptionAvailability: availability,
          });
        }));
        return Object.freeze({ ...snapshot, candidates: Object.freeze(candidates) });
      },
    });
  
    const repositoryProxy = Object.freeze({
      ...repository,
      async createCoachPlan(plan) {
        if (plan?.plannerVersion !== 2) return repository.createCoachPlan(plan);
        const key = cacheKey(plan.profileId, plan.contextId);
        const states = responseStateSnapshots.get(key) ?? [];
        const relevantStates = states
          .filter((state) => currentFamilies.has(state?.treatmentFamilyKey)
            && ["key", "bigram", "trigram", "word"].includes(state?.targetEntityType)
            && state?.responseModelVersion === PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION)
          .map((state) => ({ treatmentResponseStateId: state.treatmentResponseStateId, updatedAt: state.updatedAt }))
          .sort((a, b) => a.treatmentResponseStateId.localeCompare(b.treatmentResponseStateId));
        const next = clone(plan);
        next.inputFingerprint = createPracticeCoachFingerprint({
          baseCoachFingerprint: plan.inputFingerprint,
          responseModelVersion: PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
          treatmentResponseStates: relevantStates,
        });
        next.planHash = calculatePracticeCoachPlanHash(next);
        const validation = validatePracticeCoachPlan(next);
        if (!validation.valid) {
          const error = new TypeError("PL33 Coach plan failed post-personalization validation");
          error.details = validation.errors;
          throw error;
        }
        return repository.createCoachPlan(next);
      },
    });
  
    const base = createPracticeCoachServiceBase({
      ...options,
      repository: repositoryProxy,
      limiterService: personalizationLimiter,
    });
  
    return Object.freeze({
      ...base,
      async createTodayPracticeCoachPlan(input) {
        try { return await base.createTodayPracticeCoachPlan(input); }
        catch (error) {
          responseCache.clear();
          responseStateSnapshots.clear();
          throw error;
        }
      },
      clearCaches() {
        responseCache.clear();
        responseStateSnapshots.clear();
        base.clearCaches?.();
      },
    });
  }
  
  async function getTodayPracticeCoachPlan(service, profileId, contextId, nowValue) {
    return service.getTodayPracticeCoachPlan(profileId, contextId, nowValue);
  }
  return Object.freeze({ getTodayPracticeCoachPlan, createPracticeCoachService });
})();

export const createPracticeCoachServiceBase = __coach_base.createPracticeCoachService;
export const getTodayPracticeCoachPlan = __coach_current.getTodayPracticeCoachPlan;
export const createPracticeCoachService = __coach_current.createPracticeCoachService;
