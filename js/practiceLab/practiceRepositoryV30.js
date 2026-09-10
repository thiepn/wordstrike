import { createPracticeRepository as createLegacyPracticeRepository } from "./practiceRepositoryLegacy.js";
import { derivePracticeReviewDueStatus } from "./practiceReviewItem.js";
import { getPracticeLocalDayKey, toPracticeUtcIso } from "./practiceTime.js";
import { PRACTICE_LIMITS } from "./practiceConstants.js";
import { createDefaultSkillStat } from "./practiceDefaults.js";
import { createDefaultPracticeAbilityState, mergePracticeAbilityObservation } from "./practiceAbilityEstimator.js";
import { createDefaultPracticeLearningState } from "./practiceLearningState.js";
import { mergePracticeLearningObservation } from "./practiceLearningStateMerge.js";
import { mergePracticeSkillEvidence } from "./practiceSkillEvidenceMerge.js";
import { validatePracticeSkillEvidenceBatch } from "./practiceSkillEvidenceDelta.js";
import { validatePracticeAbilityObservation, validatePracticeAbilityState } from "./practiceAbilityValidation.js";
import { validatePracticeLearningObservationBatch, validatePracticeLearningState } from "./practiceLearningValidation.js";
import { migratePracticeRecord } from "./practiceMigrations.js";
import { buildPracticeRetentionPlan } from "./practiceRetention.js";
import {
  createPracticeAbilityStateId,
  createPracticeLearningStateId,
} from "./practiceIds.js";
import {
  mergePracticeAssessmentBlockDelta,
  reconcilePracticeAssessmentRunExpiry,
  validatePracticeAssessmentRun,
} from "./practiceAssessmentRun.js";
import { validateSessionSummary } from "./practiceValidation.js";
import { validatePracticeCoachPlan } from "./practiceCoachPlan.js";
import { applyPracticeCoachBlockDelta } from "./practiceCoachReconciliation.js";
import { PRACTICE_STORAGE_ERROR_CODES, practiceStorageError } from "./practiceStorageContract.js";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => { out[key] = canonical(value[key]); return out; }, {});
  return value;
}
const equivalent = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const fail = (code, message, details = {}) => practiceStorageError(code, message, { operation: "assessment", recoverable: true, ...details });
const coachFail = (code, message, details = {}) => practiceStorageError(code, message, { operation: "coach", recoverable: true, ...details });

export function createPracticeRepository(options = {}) {
  const { dataStore, manifestStore, now = Date.now } = options;
  const core = createLegacyPracticeRepository(options);
  if (!dataStore) return core;

  const listReviewItems = async (profileId = null, contextId = null) => {
    const activeProfile = await core.getPracticeProfile();
    const resolvedProfileId = profileId ?? activeProfile?.profileId ?? null;
    const resolvedContextId = contextId ?? activeProfile?.activeContextId ?? null;
    if (!resolvedProfileId || !resolvedContextId) return [];
    const records = await dataStore.query("reviewItems", "contextId", resolvedContextId);
    return records.filter((record) => record.profileId === resolvedProfileId && record.contextId === resolvedContextId);
  };

  const getCoachPlan = async (coachPlanId) => {
    const raw = await dataStore.get("coachPlans", coachPlanId);
    if (!raw) return null;
    const migrated = migratePracticeRecord("coachPlan", raw);
    if (!migrated.ok) throw migrated.error;
    if (migrated.migrated) await dataStore.put("coachPlans", migrated.value);
    return migrated.value;
  };

  const getTodayCoachPlan = async (profileId, contextId, localDayKey = getPracticeLocalDayKey(now)) => {
    const records = await dataStore.query("coachPlans", "profileContextDay", [profileId, contextId, localDayKey]);
    const raw = records.find((record) => record.profileId === profileId && record.contextId === contextId && record.localDayKey === localDayKey) ?? null;
    if (!raw) return null;
    const migrated = migratePracticeRecord("coachPlan", raw);
    if (!migrated.ok) throw migrated.error;
    if (migrated.migrated) await dataStore.put("coachPlans", migrated.value);
    return migrated.value;
  };

  const listCoachPlans = async (profileId, { contextId = null } = {}) => {
    const records = contextId ? await dataStore.query("coachPlans", "contextId", contextId) : await dataStore.query("coachPlans", "profileId", profileId);
    const output = [];
    for (const raw of records) {
      if (raw.profileId !== profileId || (contextId && raw.contextId !== contextId)) continue;
      const migrated = migratePracticeRecord("coachPlan", raw);
      if (!migrated.ok) continue;
      if (migrated.migrated) await dataStore.put("coachPlans", migrated.value);
      output.push(migrated.value);
    }
    return output.sort((a, b) => b.localDayKey.localeCompare(a.localDayKey) || b.createdAt.localeCompare(a.createdAt) || a.coachPlanId.localeCompare(b.coachPlanId));
  };

  const saveCoachPlan = async (plan) => {
    const validation = validatePracticeCoachPlan(plan);
    if (!validation.valid) throw coachFail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice Coach plan failed validation", { cause: validation.errors, recordId: plan?.coachPlanId ?? null });
    await dataStore.put("coachPlans", plan);
    return plan;
  };

  const createCoachPlan = async (plan) => {
    const validation = validatePracticeCoachPlan(plan);
    if (!validation.valid) throw coachFail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice Coach plan failed validation", { cause: validation.errors, recordId: plan?.coachPlanId ?? null });
    try {
      return await dataStore.runTransaction(["coachPlans"], "readwrite", async (transaction) => {
        const existing = await transaction.query("coachPlans", "profileContextDay", [plan.profileId, plan.contextId, plan.localDayKey]);
        const canonicalPlan = existing.find((record) => record.profileId === plan.profileId && record.contextId === plan.contextId && record.localDayKey === plan.localDayKey);
        if (canonicalPlan) return { created: false, plan: canonicalPlan };
        await transaction.put("coachPlans", plan);
        return { created: true, plan };
      });
    } catch (cause) {
      const canonicalPlan = await getTodayCoachPlan(plan.profileId, plan.contextId, plan.localDayKey).catch(() => null);
      if (canonicalPlan) return { created: false, raced: true, plan: canonicalPlan };
      throw cause;
    }
  };

  const listCoachChildSessions = async (coachPlanId) => dataStore.query("sessionSummaries", "coachPlanId", coachPlanId);

  const pruneCoachPlans = async (profileId) => {
    const plans = await listCoachPlans(profileId);
    if (!plans.length) return { deleted: [] };
    const currentDay = getPracticeLocalDayKey(now);
    const cutoff = new Date(typeof now === "function" ? now() : now).getTime() - PRACTICE_LIMITS.coachPlanDays * 86_400_000;
    const protectedIds = new Set(plans.filter((plan) => plan.localDayKey === currentDay || plan.status === "active" || plan.blocks?.some((block) => block.status === "active")).map((plan) => plan.coachPlanId));
    const removable = plans
      .filter((plan) => !protectedIds.has(plan.coachPlanId) && ["finished", "expired", "abandoned"].includes(plan.status))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.coachPlanId.localeCompare(b.coachPlanId));
    const selected = new Set(removable.filter((plan) => Date.parse(plan.updatedAt) < cutoff).map((plan) => plan.coachPlanId));
    const remainingCount = plans.length - selected.size;
    const excess = Math.max(0, remainingCount - PRACTICE_LIMITS.coachPlans);
    for (const plan of removable) {
      if (selected.size >= removable.filter((candidate) => Date.parse(candidate.updatedAt) < cutoff).length + excess) break;
      selected.add(plan.coachPlanId);
    }
    for (const id of selected) await dataStore.delete("coachPlans", id);
    return { deleted: [...selected] };
  };

  const getAssessmentRun = async (assessmentRunId) => {
    const raw = await dataStore.get("assessmentRuns", assessmentRunId);
    if (!raw) return null;
    const migrated = migratePracticeRecord("assessmentRun", raw);
    if (!migrated.ok) throw migrated.error;
    const reconciled = reconcilePracticeAssessmentRunExpiry(migrated.value, { now });
    if (!equivalent(reconciled, migrated.value)) await dataStore.put("assessmentRuns", reconciled);
    return reconciled;
  };

  const listAssessmentRuns = async (profileId, { contextId = null } = {}) => {
    const records = contextId ? await dataStore.query("assessmentRuns", "contextId", contextId) : await dataStore.query("assessmentRuns", "profileId", profileId);
    const output = [];
    for (const record of records) {
      if (record.profileId !== profileId || (contextId && record.contextId !== contextId)) continue;
      const validation = validatePracticeAssessmentRun(record);
      if (!validation.valid) continue;
      const reconciled = reconcilePracticeAssessmentRunExpiry(record, { now });
      if (!equivalent(reconciled, record)) await dataStore.put("assessmentRuns", reconciled);
      output.push(reconciled);
    }
    return output.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.assessmentRunId.localeCompare(b.assessmentRunId));
  };

  const pruneAssessmentRuns = async (profileId) => {
    const runs = await listAssessmentRuns(profileId);
    if (runs.length <= PRACTICE_LIMITS.assessmentRuns) return { deleted: [] };
    const protectedIds = new Set(runs.filter((run) => run.status === "active" || run.status === "created").map((run) => run.assessmentRunId));
    const byContext = new Map();
    for (const run of runs.filter((entry) => entry.status === "completed" && entry.report?.reportStatus === "complete")) {
      const list = byContext.get(run.contextId) ?? [];
      list.push(run);
      byContext.set(run.contextId, list);
    }
    for (const list of byContext.values()) {
      list.sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));
      if (list[0]) protectedIds.add(list[0].assessmentRunId);
      if (list.at(-1)) protectedIds.add(list.at(-1).assessmentRunId);
    }
    const removable = runs.filter((run) => !protectedIds.has(run.assessmentRunId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const excess = Math.max(0, runs.length - PRACTICE_LIMITS.assessmentRuns);
    const deleted = removable.slice(0, excess).map((run) => run.assessmentRunId);
    for (const id of deleted) await dataStore.delete("assessmentRuns", id);
    return { deleted };
  };

  const commitAssessmentChild = async ({
    sessionSummary,
    skillEvidenceDeltas = [],
    abilityObservation = null,
    performanceStateDelta = null,
    learningObservationDeltas = [],
    reviewItemChanges = [],
    updatedProfileSummary = null,
    assessmentBlockDelta,
    clearCheckpoint = true,
  }) => {
    const sessionValidation = validateSessionSummary(sessionSummary);
    if (!sessionValidation.valid) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Assessment child session summary failed validation", { cause: sessionValidation.errors });
    if (!sessionSummary.assessmentBinding || sessionSummary.assessmentBinding.assessmentRunId !== assessmentBlockDelta?.assessmentRunId || sessionSummary.assessmentBinding.blockId !== assessmentBlockDelta?.blockId || sessionSummary.assessmentBinding.blockOrdinal !== assessmentBlockDelta?.blockOrdinal) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Assessment block delta does not match session binding");
    if (assessmentBlockDelta.sessionId !== sessionSummary.sessionId || assessmentBlockDelta.profileId !== sessionSummary.profileId || assessmentBlockDelta.contextId !== sessionSummary.contextId) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Assessment block delta does not match session identity");
    if (performanceStateDelta || reviewItemChanges.length) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Full Assessment child sessions cannot update performance state or retention reviews");
    const skillValidation = validatePracticeSkillEvidenceBatch(skillEvidenceDeltas, { sessionId: sessionSummary.sessionId, profileId: sessionSummary.profileId, contextId: sessionSummary.contextId });
    if (!skillValidation.valid) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Assessment child skill evidence failed validation", { cause: skillValidation.errors });
    const learningValidation = validatePracticeLearningObservationBatch(learningObservationDeltas, { sessionId: sessionSummary.sessionId, profileId: sessionSummary.profileId, contextId: sessionSummary.contextId });
    if (!learningValidation.valid) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Assessment child learning evidence failed validation", { cause: learningValidation.errors });
    if (abilityObservation) {
      const abilityValidation = validatePracticeAbilityObservation(abilityObservation);
      if (!abilityValidation.valid || abilityObservation.sessionId !== sessionSummary.sessionId || abilityObservation.profileId !== sessionSummary.profileId || abilityObservation.contextId !== sessionSummary.contextId) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Assessment child ability observation failed validation", { cause: abilityValidation.errors });
    }
    const stores = ["contexts", "assessmentRuns", "sessionSummaries", "skillStats", "abilityStates", "learningStates", "profiles", "activeSessionCheckpoints"];
    return dataStore.runTransaction(stores, "readwrite", async (transaction) => {
      const existing = await transaction.get("sessionSummaries", sessionSummary.sessionId);
      if (existing) {
        if (equivalent(existing, sessionSummary)) return { committed: false, idempotent: true, assessmentUpdated: false };
        throw fail(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "A different completed Practice session already uses this sessionId", { recordId: sessionSummary.sessionId });
      }
      const context = await transaction.get("contexts", sessionSummary.contextId);
      if (!context || context.profileId !== sessionSummary.profileId) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Assessment child context belongs to another profile");
      let run = await transaction.get("assessmentRuns", assessmentBlockDelta.assessmentRunId);
      if (!run || run.profileId !== sessionSummary.profileId || run.contextId !== sessionSummary.contextId) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Assessment parent run is missing or mismatched");
      run = reconcilePracticeAssessmentRunExpiry(run, { now });
      const parentExpired = run.status === "expired";
      if (run.status !== "active" && !parentExpired) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Assessment parent run is no longer active", { assessmentRunId: run.assessmentRunId, status: run.status });

      const mergedStats = [];
      for (const delta of skillEvidenceDeltas) {
        let stat = await transaction.get("skillStats", delta.statId);
        if (stat) {
          const migration = migratePracticeRecord("skillStat", stat);
          if (!migration.ok) throw migration.error;
          stat = migration.value;
        } else stat = createDefaultSkillStat({ statId: delta.statId, profileId: delta.profileId, contextId: delta.contextId, entityType: delta.entityType, entityKey: delta.entityKey, now: () => new Date(delta.observedAt) });
        mergedStats.push(mergePracticeSkillEvidence(stat, delta));
      }

      let mergedAbility = null;
      if (abilityObservation) {
        const id = createPracticeAbilityStateId(abilityObservation.profileId, abilityObservation.contextId, abilityObservation.channel);
        let state = await transaction.get("abilityStates", id);
        if (!state) state = createDefaultPracticeAbilityState({ profileId: abilityObservation.profileId, contextId: abilityObservation.contextId, channel: abilityObservation.channel, now: () => new Date(abilityObservation.completedAtUtc) });
        else {
          const migration = migratePracticeRecord("abilityState", state);
          if (!migration.ok) throw migration.error;
          state = migration.value;
        }
        mergedAbility = mergePracticeAbilityObservation(state, abilityObservation);
        const validation = validatePracticeAbilityState(mergedAbility, { maxBytes: PRACTICE_LIMITS.abilityStateBytes });
        if (!validation.valid) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Merged assessment ability state failed validation", { cause: validation.errors });
      }

      const mergedLearning = [];
      for (const delta of learningObservationDeltas) {
        const id = createPracticeLearningStateId(delta.profileId, delta.contextId, delta.entityType, delta.entityKey);
        let state = await transaction.get("learningStates", id);
        if (state) {
          const migration = migratePracticeRecord("learningState", state);
          if (!migration.ok) throw migration.error;
          state = migration.value;
        } else if (delta.kind === "acquisition") state = createDefaultPracticeLearningState({ profileId: delta.profileId, contextId: delta.contextId, entityType: delta.entityType, entityKey: delta.entityKey, statId: delta.statId, now: () => new Date(delta.observation.completedAtUtc) });
        else continue;
        const merged = mergePracticeLearningObservation(state, delta);
        const validation = validatePracticeLearningState(merged);
        if (!validation.valid) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Merged assessment learning state failed validation", { cause: validation.errors });
        mergedLearning.push(merged);
      }

      if (parentExpired) {
        const blockIndex = run.blocks.findIndex((block) => block.blockId === assessmentBlockDelta.blockId && block.ordinal === assessmentBlockDelta.blockOrdinal);
        const currentBlock = blockIndex >= 0 ? run.blocks[blockIndex] : null;
        if (!currentBlock || currentBlock.status !== "active" || currentBlock.childSessionId !== sessionSummary.sessionId) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Expired assessment parent block identity mismatch");
        const expiredRun = JSON.parse(JSON.stringify(run));
        expiredRun.blocks[blockIndex].status = "invalid";
        expiredRun.blocks[blockIndex].completedAt = assessmentBlockDelta.completedAtUtc;
        expiredRun.blocks[blockIndex].result = { ...assessmentBlockDelta, status: "invalid", reason: "parent-expired" };
        expiredRun.progress.terminalBlockCount += 1;
        expiredRun.progress.currentBlockIndex = Math.min(blockIndex + 1, expiredRun.blocks.length);
        if (expiredRun.integrityStatus !== "invalid") expiredRun.integrityStatus = "partial";
        run = expiredRun;
      } else {
        run = mergePracticeAssessmentBlockDelta(run, assessmentBlockDelta);
      }
      const runValidation = validatePracticeAssessmentRun(run);
      if (!runValidation.valid) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Merged assessment run failed validation", { cause: runValidation.errors });
      if (!parentExpired) {
        for (const stat of mergedStats) await transaction.put("skillStats", stat);
        if (mergedAbility) await transaction.put("abilityStates", mergedAbility);
        for (const learning of mergedLearning) await transaction.put("learningStates", learning);
      }
      if (updatedProfileSummary) await transaction.put("profiles", updatedProfileSummary);
      await transaction.put("assessmentRuns", run);
      await transaction.put("sessionSummaries", sessionSummary);
      if (clearCheckpoint) await transaction.delete("activeSessionCheckpoints", sessionSummary.profileId);
      return { committed: true, idempotent: false, assessmentUpdated: true, assessmentInvalidatedByExpiry: parentExpired, mergedSkillStatCount: parentExpired ? 0 : mergedStats.length, learningUpdated: parentExpired ? 0 : mergedLearning.length, abilityUpdated: parentExpired ? false : Boolean(mergedAbility) };
    });
  };

  const commitCoachChild = async (args) => {
    const { sessionSummary, coachBlockDelta } = args;
    const validation = validateSessionSummary(sessionSummary);
    if (!validation.valid) throw coachFail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Coach child session summary failed validation", { cause: validation.errors });
    const binding = sessionSummary.coachBinding;
    if (!binding || !coachBlockDelta || binding.coachPlanId !== coachBlockDelta.coachPlanId || binding.blockId !== coachBlockDelta.blockId || sessionSummary.sessionId !== coachBlockDelta.sessionId || binding.planHash !== coachBlockDelta.planHash) throw coachFail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Coach child delta does not match the trusted session binding");
    const plan = await getCoachPlan(binding.coachPlanId).catch(() => null);
    const block = plan?.blocks?.find((entry) => entry.blockId === binding.blockId && entry.ordinal === binding.blockOrdinal) ?? null;
    const planMatches = Boolean(plan
      && plan.profileId === sessionSummary.profileId
      && plan.contextId === sessionSummary.contextId
      && plan.planHash === binding.planHash
      && block?.plannedSessionId === coachBlockDelta.plannedSessionId
      && block?.childSessionId === sessionSummary.sessionId
      && block?.status === "active");
    const { coachBlockDelta: _coachBlockDelta, ...coreArgs } = args;
    const result = await core.commitCompletedPracticeSession(coreArgs);
    if (!planMatches) return { ...result, coachUpdated: false, commitDiagnostic: "coach-plan-stale" };
    const applied = applyPracticeCoachBlockDelta(plan, coachBlockDelta, { now });
    if (!applied.updated && !applied.idempotent) return { ...result, coachUpdated: false, commitDiagnostic: "coach-plan-stale" };
    try {
      if (applied.updated) await saveCoachPlan(applied.plan);
      return { ...result, coachUpdated: Boolean(applied.updated), coachIdempotent: Boolean(applied.idempotent) };
    } catch {
      return { ...result, coachUpdated: false, commitDiagnostic: "coach-plan-stale" };
    }
  };

  const runAssessmentAwareRetention = async () => {
    const profile = await core.getPracticeProfile();
    const assessmentRuns = profile ? await listAssessmentRuns(profile.profileId) : [];
    const coachPlans = profile ? await listCoachPlans(profile.profileId) : [];
    const preserveSessionIds = new Set();
    for (const run of assessmentRuns) {
      if (run.status !== "active") continue;
      for (const block of run.blocks ?? []) if (block.childSessionId && ["active", "completed"].includes(block.status)) preserveSessionIds.add(block.childSessionId);
    }
    for (const coachPlan of coachPlans) for (const block of coachPlan.blocks ?? []) if (block.childSessionId && block.status === "active") preserveSessionIds.add(block.childSessionId);
    const [checkpoints, sessionSummaries, skillStats, learningStates, reviewItems, quarantine] = await Promise.all([
      dataStore.list("activeSessionCheckpoints"),
      dataStore.list("sessionSummaries"),
      dataStore.list("skillStats"),
      dataStore.list("learningStates"),
      dataStore.list("reviewItems"),
      dataStore.list("quarantine"),
    ]);
    const plan = buildPracticeRetentionPlan({
      checkpoints,
      sessionSummaries,
      skillStats,
      learningStates,
      reviewItems,
      quarantine,
      preserveSessionIds: [...preserveSessionIds],
      now,
    });
    const deletions = [
      ["activeSessionCheckpoints", plan.checkpoints],
      ["sessionSummaries", plan.sessionSummaries],
      ["reviewItems", plan.reviewItems],
      ["learningStates", plan.learningStates ?? []],
      ["skillStats", plan.skillStats],
      ["quarantine", plan.quarantine],
    ];
    const stores = deletions.filter(([, ids]) => ids.length).map(([store]) => store);
    if (stores.length) {
      await dataStore.runTransaction(stores, "readwrite", async (transaction) => {
        for (const [storeName, ids] of deletions) for (const id of ids) await transaction.delete(storeName, id);
      });
    }
    const assessment = profile ? await pruneAssessmentRuns(profile.profileId) : { deleted: [] };
    const coach = profile ? await pruneCoachPlans(profile.profileId) : { deleted: [] };
    return { ...plan, assessmentRuns: assessment.deleted, coachPlans: coach.deleted, preserveSessionIds: [...preserveSessionIds] };
  };

  return Object.freeze({
    ...core,
    listReviewItems,
    async listDueReviewItems(profileId = null, contextId = null, dueAtUtc = toPracticeUtcIso(now)) {
      const items = await listReviewItems(profileId, contextId);
      const queryNow = new Date(dueAtUtc);
      return items
        .map((item) => ({ item, dueStatus: derivePracticeReviewDueStatus(item, queryNow) }))
        .filter(({ dueStatus }) => dueStatus === "due" || dueStatus === "overdue")
        .sort((a, b) => ((a.dueStatus === "overdue" ? 0 : 1) - (b.dueStatus === "overdue" ? 0 : 1) || String(a.item.dueAtUtc).localeCompare(String(b.item.dueAtUtc)) || a.item.entityType.localeCompare(b.item.entityType) || a.item.entityKey.localeCompare(b.item.entityKey)))
        .map(({ item }) => item);
    },
    deleteReviewItem(reviewItemId) { return dataStore.delete("reviewItems", reviewItemId); },

    getCoachPlan,
    getTodayCoachPlan,
    listCoachPlans,
    listCoachChildSessions,
    createCoachPlan,
    saveCoachPlan,
    deleteCoachPlan(coachPlanId) { return dataStore.delete("coachPlans", coachPlanId); },
    pruneCoachPlans,

    getAssessmentRun,
    listAssessmentRuns,
    async getActiveAssessmentRun(profileId) {
      const runs = await listAssessmentRuns(profileId);
      return runs.find((run) => run.status === "active" || run.status === "created") ?? null;
    },
    async createAssessmentRun(run) {
      const validation = validatePracticeAssessmentRun(run);
      if (!validation.valid) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice assessment run failed validation", { cause: validation.errors });
      return dataStore.runTransaction(["assessmentRuns"], "readwrite", async (transaction) => {
        const existing = await transaction.query("assessmentRuns", "profileId", run.profileId);
        const active = existing.find((item) => item.status === "created" || item.status === "active");
        if (active) throw fail(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "A Practice assessment run is already active for this profile", { recordId: active.assessmentRunId });
        await transaction.put("assessmentRuns", run);
        return run;
      });
    },
    async saveAssessmentRun(run) {
      const validation = validatePracticeAssessmentRun(run);
      if (!validation.valid) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice assessment run failed validation", { cause: validation.errors });
      await dataStore.put("assessmentRuns", run);
      return run;
    },
    async commitCompletedPracticeSession(args) {
      if (args?.assessmentBlockDelta && args?.coachBlockDelta) throw coachFail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "A Practice child cannot belong to Assessment and Daily Coach simultaneously");
      if (args?.assessmentBlockDelta) return commitAssessmentChild(args);
      if (args?.coachBlockDelta) return commitCoachChild(args);
      return core.commitCompletedPracticeSession(args);
    },
    async finalizeAssessmentRun({ assessmentRunId, report, completedAt = toPracticeUtcIso(now) }) {
      return dataStore.runTransaction(["assessmentRuns", "profiles"], "readwrite", async (transaction) => {
        const run = await transaction.get("assessmentRuns", assessmentRunId);
        if (!run) throw fail(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, "Practice assessment run does not exist", { recordId: assessmentRunId });
        if (run.report) {
          if (equivalent(run.report, report)) return { run, idempotent: true };
          throw fail(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "Practice assessment run already has a different finalized report", { recordId: assessmentRunId });
        }
        if (!run.blocks.every((block) => block.status === "completed" || block.status === "invalid")) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice assessment run cannot finalize before all selected blocks are terminal");
        const nextRun = { ...run, status: "completed", completedAt, integrityStatus: report?.integrity?.status ?? run.integrityStatus, report };
        const validation = validatePracticeAssessmentRun(nextRun);
        if (!validation.valid) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Finalized assessment run failed validation", { cause: validation.errors });
        await transaction.put("assessmentRuns", nextRun);
        let profile = await transaction.get("profiles", run.profileId);
        if (profile && report?.reportStatus === "complete") {
          profile = {
            ...profile,
            firstAssessmentCompleted: true,
            firstAssessmentCompletedAt: profile.firstAssessmentCompletedAt ?? completedAt,
            lastAssessmentAt: completedAt,
            updatedAt: completedAt,
          };
          await transaction.put("profiles", profile);
        }
        return { run: nextRun, profile, idempotent: false };
      });
    },
    pruneAssessmentRuns,
    runPracticeRetention: runAssessmentAwareRetention,
  });
}
