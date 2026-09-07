import { getPracticeAssessmentAvailability } from "./practiceAssessmentAvailability.js";
import {
  PRACTICE_ASSESSMENT_LIMITS,
  PRACTICE_ASSESSMENT_PROTOCOL_VERSION,
} from "./practiceAssessmentConstants.js";
import {
  buildPracticeAssessmentPlan,
  createPracticeAssessmentBlockBinding,
} from "./practiceAssessmentPlan.js";
import {
  activatePracticeAssessmentRun,
  abandonPracticeAssessmentRun,
  createDefaultPracticeAssessmentRun,
  mergePracticeAssessmentBlockDelta,
} from "./practiceAssessmentRun.js";
import {
  getPracticeAssessmentChildDescriptorForBlock,
  registerPracticeTrustedAssessmentBinding,
} from "./practiceAssessmentRegistry.js";
import { buildPracticeAssessmentReport } from "./practiceAssessmentReport.js";
import { buildPracticeEvaluationPlan } from "./practiceEvaluationPlan.js";
import { loadPracticeEvaluationContent } from "./practiceEvaluationContentLoader.js";
import { createPracticeContentPlan } from "./practiceSessionContract.js";
import { createPracticeAssessmentRunId } from "./practiceIds.js";
import { getPracticeTransferPoolExposure } from "./practiceEvaluationState.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const nowDate = (now) => {
  const value = typeof now === "function" ? now() : now;
  return value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
};

function serviceError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  error.recoverable = true;
  return error;
}

function countDiagnosticStartedExposures(runs) {
  const counts = {};
  for (const run of runs ?? []) {
    for (const block of run?.blocks ?? []) {
      if (block?.diagnosticFormId && block?.startedAt) counts[block.diagnosticFormId] = (counts[block.diagnosticFormId] ?? 0) + 1;
    }
  }
  return counts;
}

function benchmarkReservable(state, suite) {
  if (!suite?.forms?.length) return false;
  const reserved = new Set((state?.activeReservations ?? [])
    .filter((entry) => entry.kind === "benchmark" && entry.suiteId === suite.suiteId && entry.suiteVersion === suite.suiteVersion)
    .map((entry) => entry.selectedUnitId));
  return suite.forms.some((form) => !reserved.has(form.formId));
}

function transferReservable(state, pool) {
  if (!pool?.units?.length) return false;
  const claimed = new Set(getPracticeTransferPoolExposure(state, pool.poolId, pool.poolVersion)?.claimedUnitIds ?? []);
  const reserved = new Set((state?.activeReservations ?? [])
    .filter((entry) => entry.kind === "cold-transfer" && entry.poolId === pool.poolId && entry.poolVersion === pool.poolVersion)
    .map((entry) => entry.selectedUnitId));
  return pool.units.some((unit) => !claimed.has(unit.unitId) && !reserved.has(unit.unitId));
}

async function abandonPlanReservations(repository, plan) {
  if (!plan) return;
  for (const block of plan.blocks ?? []) {
    if (!block.evaluationReservationId) continue;
    try {
      await repository.abandonPracticeEvaluationReservation({
        profileId: plan.profileId ?? null,
        contextId: plan.contextId ?? null,
        reservationId: block.evaluationReservationId,
      });
    } catch {
      // Reservation expiry remains a safe fallback. Never create an exposure while cleaning up.
    }
  }
}

export function createPracticeAssessmentService({
  repository,
  benchmarkRegistry,
  transferRegistry,
  diagnosticRegistry,
  limiterService = null,
  masteryService = null,
  now = () => new Date(),
  loadProtectedContentItems = null,
  loadDiagnosticFormContent = null,
} = {}) {
  if (!repository || typeof repository.listAssessmentRuns !== "function" || typeof repository.createAssessmentRun !== "function") throw new TypeError("Practice assessment service requires PL19 repository support");
  if (!benchmarkRegistry || !transferRegistry || !diagnosticRegistry) throw new TypeError("Practice assessment service requires benchmark, transfer and diagnostic registries");
  if (typeof now !== "function") throw new TypeError("Practice assessment service requires injected now()");

  const getAvailability = async ({ profileId, contextId, language } = {}) => {
    const state = await repository.ensureEvaluationState(profileId);
    const benchmarkSuites = benchmarkRegistry.listReadySuites().filter((suite) => suite.language === language && benchmarkReservable(state, suite));
    const transferPools = transferRegistry.listReadyPools().filter((pool) => pool.language === language && transferReservable(state, pool));
    return getPracticeAssessmentAvailability({
      language,
      benchmarkSuites,
      diagnosticRegistry,
      transferPools,
      transferReservable: transferPools.length > 0,
    });
  };

  const startAssessment = async ({ profileId, contextId, language, depth } = {}) => {
    const active = await repository.getActiveAssessmentRun(profileId);
    if (active) throw serviceError("PRACTICE_ASSESSMENT_ACTIVE_CONFLICT", "A Full Assessment is already active for this profile", { assessmentRunId: active.assessmentRunId });
    const availability = await getAvailability({ profileId, contextId, language });
    if (!availability.depths?.[depth]?.available) throw serviceError("PRACTICE_ASSESSMENT_DEPTH_UNAVAILABLE", `Full Assessment depth is unavailable: ${depth}`, availability.depths?.[depth]?.reasons ?? []);
    const benchmarkSuite = benchmarkRegistry.getSuite(availability.benchmarkSuiteId) ?? await benchmarkRegistry.loadSuite(availability.benchmarkSuiteId);
    const transferPool = depth === "deep"
      ? (transferRegistry.getPool(availability.transferPoolId) ?? await transferRegistry.loadPool(availability.transferPoolId))
      : null;
    const history = await repository.listAssessmentRuns(profileId);
    const diagnosticExposureCounts = countDiagnosticStartedExposures(history);
    const assessmentRunId = createPracticeAssessmentRunId();
    let plan = null;
    try {
      plan = await buildPracticeAssessmentPlan({
        assessmentRunId,
        profileId,
        contextId,
        language,
        depth,
        availability,
        diagnosticRegistry,
        diagnosticExposureCounts,
        benchmarkSuite,
        transferPool,
        evaluationRepository: repository,
        now,
      });
      const created = createDefaultPracticeAssessmentRun({ assessmentRunId, profileId, contextId, depth, plan, now });
      await repository.createAssessmentRun(created);
      const activeRun = activatePracticeAssessmentRun(created, { now });
      await repository.saveAssessmentRun(activeRun);
      return freezeDeep({ run: activeRun, availability });
    } catch (cause) {
      if (plan) {
        for (const block of plan.blocks ?? []) {
          if (!block.evaluationReservationId) continue;
          try { await repository.abandonPracticeEvaluationReservation({ profileId, contextId, reservationId: block.evaluationReservationId, now }); } catch {}
        }
      }
      throw cause;
    }
  };

  const prepareNextBlock = async ({ assessmentRunId, sessionId } = {}) => {
    const run = await repository.getAssessmentRun(assessmentRunId);
    if (!run || run.status !== "active") throw serviceError("PRACTICE_ASSESSMENT_RUN_INACTIVE", "Full Assessment run is missing or inactive");
    const block = run.plan?.blocks?.[run.progress.currentBlockIndex] ?? null;
    const parentBlock = run.blocks?.[run.progress.currentBlockIndex] ?? null;
    if (!block || !parentBlock || parentBlock.status !== "pending") throw serviceError("PRACTICE_ASSESSMENT_BLOCK_UNAVAILABLE", "No pending Full Assessment block is ready to start");
    const descriptor = getPracticeAssessmentChildDescriptorForBlock(block.blockKind);
    if (!descriptor || descriptor.id !== block.expectedExperimentId) throw serviceError("PRACTICE_ASSESSMENT_DESCRIPTOR_MISMATCH", "Frozen assessment block descriptor is unavailable");

    let evaluationPlan = null;
    let evaluationArtifact = null;
    let rawContent = null;
    let diagnosticFreshness = null;

    if (block.blockKind === "diagnostic") {
      const runs = await repository.listAssessmentRuns(run.profileId);
      const exposures = countDiagnosticStartedExposures(runs);
      diagnosticFreshness = Number(exposures[block.diagnosticFormId] ?? 0) > 0 ? "repeat" : "fresh";
      const set = diagnosticRegistry.getFormSet(run.plan?.language ?? run.language ?? "en", block.blockId)
        ?? diagnosticRegistry.listArtifacts().flatMap((artifact) => artifact.formSets ?? []).find((entry) => entry.blockId === block.blockId && entry.forms?.some((form) => form.formId === block.diagnosticFormId));
      const form = set?.forms?.find((entry) => entry.formId === block.diagnosticFormId) ?? null;
      if (!form || set?.status !== "ready") throw serviceError("PRACTICE_ASSESSMENT_DIAGNOSTIC_NOT_READY", "Frozen diagnostic form is unavailable");
      if (typeof loadDiagnosticFormContent !== "function") throw new TypeError("Assessment diagnostic start requires explicit same-origin diagnostic content loader");
      const loaded = await loadDiagnosticFormContent({ blockId: block.blockId, formId: block.diagnosticFormId, form });
      if (!loaded || typeof loaded.text !== "string") throw serviceError("PRACTICE_ASSESSMENT_DIAGNOSTIC_LOAD_FAILED", "Diagnostic content loader returned no text");
      rawContent = {
        contentId: loaded.contentId ?? `practice-content_assessment-${block.diagnosticFormId}`.replace(/[^a-z0-9._-]/gi, "-"),
        contentGeneratorVersion: 1,
        text: loaded.text,
        targetEntities: [],
        completion: { mode: "duration", value: block.durationMs },
        metadata: {
          sourceType: "assessment-diagnostic",
          partition: "diagnostic",
          assessmentDiagnosticFormId: block.diagnosticFormId,
          assessmentBlockId: block.blockId,
        },
      };
    } else {
      evaluationArtifact = block.blockKind === "benchmark"
        ? (benchmarkRegistry.getSuite(block.evaluationArtifactId) ?? await benchmarkRegistry.loadSuite(block.evaluationArtifactId))
        : (transferRegistry.getPool(block.evaluationArtifactId) ?? await transferRegistry.loadPool(block.evaluationArtifactId));
      const version = block.blockKind === "benchmark" ? evaluationArtifact?.suiteVersion : evaluationArtifact?.poolVersion;
      if (!evaluationArtifact || evaluationArtifact.status !== "ready" || version !== block.evaluationArtifactVersion) throw serviceError("PRACTICE_ASSESSMENT_PROTECTED_ARTIFACT_STALE", "Frozen protected evaluation artifact is unavailable or stale");
      if (!block.evaluationReservationId) throw serviceError("PRACTICE_ASSESSMENT_RESERVATION_MISSING", "Frozen protected block has no reservation");
      const claim = await repository.claimPracticeEvaluationReservation({
        profileId: run.profileId,
        contextId: run.contextId,
        reservationId: block.evaluationReservationId,
        sessionId,
        artifact: evaluationArtifact,
        now,
      });
      evaluationPlan = buildPracticeEvaluationPlan({ binding: claim.binding, artifact: evaluationArtifact, historyStatus: claim.state?.historyStatus ?? "partial" });
      rawContent = await loadPracticeEvaluationContent({ plan: evaluationPlan, loadContentItems: loadProtectedContentItems });
    }

    const contentPlan = createPracticeContentPlan(rawContent);
    const assessmentBinding = createPracticeAssessmentBlockBinding(run.plan, block, { diagnosticFreshness });
    registerPracticeTrustedAssessmentBinding(contentPlan, assessmentBinding);
    return freezeDeep({
      run,
      block,
      descriptor,
      configuration: {},
      contentPlan,
      assessmentBinding,
      evaluationPlan,
      evaluationArtifact,
    });
  };

  const reconcileRun = async (assessmentRunId) => {
    let run = await repository.getAssessmentRun(assessmentRunId);
    if (!run || run.status !== "active") return run;
    const current = run.blocks?.[run.progress.currentBlockIndex] ?? null;
    if (!current || current.status !== "active") return run;
    const summary = current.childSessionId ? await repository.getSessionSummary(current.childSessionId) : null;
    const completedAtUtc = summary?.completedAtUtc ?? nowDate(now).toISOString();
    run = mergePracticeAssessmentBlockDelta(run, {
      deltaVersion: 1,
      assessmentRunId: run.assessmentRunId,
      blockId: current.blockId,
      blockOrdinal: current.ordinal,
      sessionId: current.childSessionId,
      profileId: run.profileId,
      contextId: run.contextId,
      completedAtUtc,
      status: "invalid",
      blockMetrics: null,
      coverage: null,
      evaluationSummary: summary?.evaluationSummary ?? null,
      diagnosticFormId: current.diagnosticFormId,
      diagnosticFreshness: null,
    });
    await repository.saveAssessmentRun(run);
    return run;
  };

  const abandonAssessment = async (assessmentRunId) => {
    const run = await repository.getAssessmentRun(assessmentRunId);
    if (!run) return null;
    const next = abandonPracticeAssessmentRun(run, { now });
    if (next !== run) await repository.saveAssessmentRun(next);
    return next;
  };

  const finalizeAssessment = async (assessmentRunId) => {
    const run = await repository.getAssessmentRun(assessmentRunId);
    if (!run) throw serviceError("PRACTICE_ASSESSMENT_RUN_NOT_FOUND", "Full Assessment run does not exist");
    if (!run.blocks.every((block) => block.status === "completed" || block.status === "invalid")) throw serviceError("PRACTICE_ASSESSMENT_NOT_TERMINAL", "Full Assessment still has non-terminal blocks");
    const completedAt = nowDate(now).toISOString();
    const reportInputRun = { ...run, completedAt };
    const [limiterSnapshot, abilityState, masterySnapshot] = await Promise.all([
      limiterService?.buildContextLimiterSnapshot?.({ profileId: run.profileId, contextId: run.contextId }) ?? null,
      repository.getAbilityState?.(run.profileId, run.contextId, "cold-natural-text") ?? null,
      masteryService?.buildContextMasterySnapshot?.({ profileId: run.profileId, contextId: run.contextId }) ?? null,
    ]);
    const report = buildPracticeAssessmentReport({ run: reportInputRun, limiterSnapshot, abilityState, masterySnapshot });
    return repository.finalizeAssessmentRun({ assessmentRunId, report, completedAt });
  };

  const reconcileAssessmentState = async ({ profileId, contextId } = {}) => {
    const runs = await repository.listAssessmentRuns(profileId, { contextId });
    if (!runs.length) return freezeDeep({ state: "never-started", latestCompletedAt: null, assessmentRunId: null });
    const compatible = runs
      .filter((run) => run.status === "completed" && run.report?.reportStatus === "complete" && run.protocolVersion === PRACTICE_ASSESSMENT_PROTOCOL_VERSION)
      .sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")));
    if (!compatible.length) return freezeDeep({ state: "incomplete", latestCompletedAt: null, assessmentRunId: runs[0]?.assessmentRunId ?? null });
    const latest = compatible[0];
    const ageMs = nowDate(now).getTime() - Date.parse(latest.completedAt);
    return freezeDeep({
      state: ageMs > PRACTICE_ASSESSMENT_LIMITS.freshnessWindowMs ? "stale" : "complete",
      latestCompletedAt: latest.completedAt,
      assessmentRunId: latest.assessmentRunId,
      ageMs,
    });
  };

  return Object.freeze({
    getAvailability,
    startAssessment,
    prepareNextBlock,
    reconcileRun,
    abandonAssessment,
    finalizeAssessment,
    reconcileAssessmentState,
    countDiagnosticStartedExposures,
  });
}
