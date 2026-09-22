import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { shouldIncludePracticeCoachReview, buildPracticeCoachDailyPlan } from "../js/practiceLab/practiceCoachPlanner.js";
import { createPracticeCoachServiceBase } from "../js/practiceLab/practiceCoachService.js";
import { buildPracticeCoachViewModel } from "../js/practiceLab/practiceCoachUi.js";
import { calculatePracticeCoachPlanHash } from "../js/practiceLab/practiceCoachPlan.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";

const profileId = createPracticeId("profile", { uuid: () => "phase5-coach-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "phase5-coach-context-12345678" });
const now = () => new Date("2026-09-08T10:00:00.000Z");

function target() {
  return {
    statId: "stat-r",
    entityType: "key",
    entityKey: "r",
    experimentId: "weak-keys",
    utilityScore: 80,
    availabilityStatus: "ready",
    hierarchy: { status: "independent", explainedBy: [] },
    reasonCodes: ["key-foundation"],
  };
}

function baseRepository({ realPlanWrites = true } = {}) {
  let createCalls = 0;
  return {
    get createCalls() { return createCalls; },
    async getTodayCoachPlan() { return null; },
    async createCoachPlan(plan) {
      createCalls += 1;
      if (!realPlanWrites) throw new Error("unexpected plan persistence");
      return { created: true, raced: false, plan };
    },
    async getPracticeContext() { return { profileId, contextId, dataLocale: "en", updatedAt: "2026-09-08T09:00:00.000Z" }; },
    getPracticeSettings() { return { dailySessionLengthMinutes: 12 }; },
    async listLearningStates() { return []; },
    async getPerformanceState() { return null; },
    async getCurrentPerformanceState() { return null; },
    async listAssessmentRuns() { return []; },
    async listSkillStats() { return []; },
    async listReviewItems() { return []; },
  };
}

const emptyMastery = { async buildContextMasterySnapshot() { return { entities: [], counts: {} }; } };
const emptyReview = {
  async reconcile() {},
  async buildPracticeReviewQueue() { return { candidates: [] }; },
  async buildPracticeReviewPlan() { return { bindings: [] }; },
};

test("Phase 5 overdue reviews are eligible at every supported Daily Training budget", () => {
  const queue = { candidates: [{ dueStatus: "overdue", reviewValue: 1 }] };
  for (const minutes of [5, 8, 12, 15]) assert.equal(shouldIncludePracticeCoachReview(queue, minutes), true, String(minutes));
});

test("Phase 5 optional limiter failure degrades to verified broad practice instead of aborting the plan", async () => {
  const repository = baseRepository();
  const service = createPracticeCoachServiceBase({
    repository,
    experimentRegistry: {
      getRegistration(id) {
        if (id === "real-text") return { runtime: { async getAvailability() { return { supportedDurationsMs: [300_000] }; } } };
        return null;
      },
    },
    limiterService: { async buildContextLimiterSnapshot() { throw new Error("limiter unavailable"); } },
    masteryService: emptyMastery,
    reviewService: emptyReview,
    now,
  });
  const created = await service.createTodayPracticeCoachPlan({ profileId, contextId, requestedMinutes: 12, language: "en" });
  assert.equal(created.created, true);
  assert.equal(created.plan.blocks.length, 1);
  assert.equal(created.plan.blocks[0].kind, "real-text");
  assert.equal(created.plan.blocks[0].realTextDurationMs, 300_000);
  assert.deepEqual(created.plan.decisionContext.degradedInputs, ["limiter-snapshot"]);
  const view = buildPracticeCoachViewModel({ state: { status: "ready", requestedMinutes: 12, plan: created.plan } });
  assert.match(view.plan.rationales.join(" "), /Some local evidence sources were unavailable/);
});

test("Phase 5 does not persist an empty frozen plan when no block can be verified", async () => {
  const repository = baseRepository({ realPlanWrites: false });
  const service = createPracticeCoachServiceBase({
    repository,
    experimentRegistry: { getRegistration() { return null; } },
    limiterService: { async buildContextLimiterSnapshot() { return { candidates: [] }; } },
    masteryService: emptyMastery,
    reviewService: emptyReview,
    now,
  });
  const created = await service.createTodayPracticeCoachPlan({ profileId, contextId, requestedMinutes: 5, language: "en" });
  assert.equal(created.created, false);
  assert.equal(created.plan, null);
  assert.equal(created.reason, "no-available-blocks");
  assert.equal(repository.createCalls, 0);
});

test("Phase 5 progress distinguishes resolved blocks from successful completions", () => {
  const plan = buildPracticeCoachDailyPlan({
    profileId, contextId, localDayKey: "2026-09-08", requestedMinutes: 8, inputFingerprint: "progress",
    targetCandidates: [target()], realTextSupportedMinutes: [3], now,
  });
  const changed = JSON.parse(JSON.stringify(plan));
  changed.blocks[0].status = "skipped";
  changed.completion = { completedCount: 0, skippedCount: 1, blockedCount: 0, invalidCount: 0 };
  const view = buildPracticeCoachViewModel({ state: { status: "ready", requestedMinutes: 8, plan: changed } });
  assert.equal(view.plan.progress.terminal, 1);
  assert.equal(view.plan.progress.completed, 0);
  assert.match(view.plan.progress.label, /1 of 2 resolved · 0 completed/);
});

test("Phase 5 explicit interrupted-block recovery closes a non-resumable orphan without replacing the plan", async () => {
  const original = buildPracticeCoachDailyPlan({
    profileId, contextId, localDayKey: "2026-09-08", requestedMinutes: 5, inputFingerprint: "recovery",
    targetCandidates: [target()], realTextSupportedMinutes: [], now,
  });
  const active = JSON.parse(JSON.stringify(original));
  active.status = "active";
  active.blocks[0].status = "active";
  active.blocks[0].startedAt = "2026-09-08T10:01:00.000Z";
  active.blocks[0].childSessionId = active.blocks[0].plannedSessionId;
  active.planHash = calculatePracticeCoachPlanHash(active);

  let saved = active;
  let checkpointCleared = 0;
  const repository = {
    async getTodayCoachPlan() { return null; },
    async createCoachPlan(plan) { return { created: true, plan }; },
    async getCoachPlan() { return saved; },
    async getActiveCheckpoint() { return { sessionId: active.blocks[0].childSessionId, resumable: false }; },
    async clearActiveCheckpoint() { checkpointCleared += 1; },
    async listCoachChildSessions() { return []; },
    async saveCoachPlan(plan) { saved = plan; return plan; },
  };
  const service = createPracticeCoachServiceBase({
    repository,
    experimentRegistry: { getRegistration() { return null; } },
    limiterService: {},
    masteryService: {},
    reviewService: {},
    now,
  });
  const result = await service.recoverInterruptedPracticeCoachBlock({ coachPlanId: active.coachPlanId });
  assert.equal(result.updated, true);
  assert.equal(checkpointCleared, 1);
  assert.equal(result.plan.blocks[0].status, "invalid");
  assert.equal(result.plan.blocks[0].blockResult.reason, "interrupted-nonresumable");
  assert.equal(result.plan.status, "finished");
  assert.equal(result.plan.blocks[0].plannedSessionId, original.blocks[0].plannedSessionId);
});


test("Phase 5 failed review preflight never substitutes same-entity acquisition", async () => {
  const binding = {
    reviewItemId: "practice-review_phase5-r-12345678",
    cycleId: 1,
    referenceAtUtc: "2026-09-07T10:00:00.000Z",
    entityType: "key",
    entityKey: "r",
  };
  const repository = baseRepository();
  const service = createPracticeCoachServiceBase({
    repository,
    experimentRegistry: {
      getRegistration(id) {
        if (id === "real-text") return { runtime: { async getAvailability() { return { supportedDurationsMs: [300_000] }; } } };
        if (id === "weak-keys") return { runtime: { async inspectTarget() { return { status: "ready" }; } } };
        return null;
      },
    },
    limiterService: {
      async buildContextLimiterSnapshot() {
        return { candidates: [{
          statId: "stat-r", entityType: "key", entityKey: "r", status: "confirmed",
          priorityScore: 90, weaknessScore: 85, hierarchy: { status: "independent", explainedBy: [] },
          evidenceMetadata: { primaryDimensionConfidenceScore: 90 },
          dimensions: { slow: { weightedSeverity: 70 }, inaccurate: { weightedSeverity: 10 }, recoveryHeavy: { weightedSeverity: 5 } },
        }] };
      },
    },
    masteryService: {
      async buildContextMasterySnapshot() { return { entities: [{ statId: "stat-r", stage: "learning" }], counts: {} }; },
    },
    reviewService: {
      async reconcile() {},
      async buildPracticeReviewQueue() { return { candidates: [{ dueStatus: "overdue", reviewValue: 90, reviewBinding: binding }] }; },
      async buildPracticeReviewPlan() { throw new Error("review content unavailable"); },
    },
    now,
  });
  const created = await service.createTodayPracticeCoachPlan({ profileId, contextId, requestedMinutes: 12, language: "en" });
  assert.equal(created.created, true);
  assert.equal(created.plan.blocks.some((block) => block.kind === "targeted-intervention" && block.target?.entityKey === "r"), false);
  assert.equal(created.plan.blocks.some((block) => block.kind === "review"), false);
  assert.equal(created.plan.blocks.some((block) => block.kind === "real-text"), true);
  assert.ok(created.plan.decisionContext.degradedInputs.includes("review-content"));
  const view = buildPracticeCoachViewModel({ state: { status: "ready", requestedMinutes: 12, plan: created.plan } });
  assert.match(view.plan.rationales.join(" "), /due review was omitted/i);
});

test("Phase 5 stale frozen target becomes blocked without throwing a generic Coach failure", async () => {
  const original = buildPracticeCoachDailyPlan({
    profileId, contextId, localDayKey: "2026-09-08", requestedMinutes: 5, inputFingerprint: "stale-target",
    targetCandidates: [target()], realTextSupportedMinutes: [], now,
  });
  let saved = original;
  const repository = {
    async getTodayCoachPlan() { return null; },
    async createCoachPlan(plan) { return { created: true, plan }; },
    async getCoachPlan() { return saved; },
    async listCoachChildSessions() { return []; },
    async getActiveCheckpoint() { return null; },
    async getSkillStat() { return { lastPractisedAt: "2026-09-08T10:30:00.000Z" }; },
    async saveCoachPlan(plan) { saved = plan; return plan; },
  };
  const service = createPracticeCoachServiceBase({
    repository,
    experimentRegistry: { getRegistration() { return null; } },
    limiterService: {}, masteryService: {}, reviewService: {}, now,
  });
  const result = await service.startPracticeCoachBlock({ coachPlanId: original.coachPlanId, blockId: original.blocks[0].blockId });
  assert.equal(result.started, false);
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "target-practised-after-plan");
  assert.equal(result.plan.blocks[0].status, "blocked");
  assert.equal(result.plan.status, "finished");
});

test("Phase 5 no-block recovery action re-runs plan creation directly", async () => {
  const { renderPracticeCoach } = await import("../js/practiceLab/practiceLabRendererCurrent.js");
  const targetRoot = { innerHTML: "", querySelector() { return null; } };
  renderPracticeCoach(targetRoot, {
    title: "Daily Training", subtitle: "", preview: false, status: "ready",
    errorCode: "PRACTICE_COACH_NO_AVAILABLE_BLOCKS", errorDetail: null,
    requestedMinutes: 12, durationChoices: [5,8,12,15].map((minutes) => ({ minutes, selected: minutes === 12 })),
    plan: null, canCreate: true,
  });
  assert.match(targetRoot.innerHTML, /data-practice-action="create-coach-plan"\s*>CHECK AGAIN/);
  assert.doesNotMatch(targetRoot.innerHTML, /data-practice-action="reload-coach">CHECK AGAIN/);
});

test("Phase 5 frozen-block skip remains explicit and irreversible for the day", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceLabControllerCurrent.js", import.meta.url), "utf8");
  assert.match(source, /Skip this Daily Training block\?/);
  assert.match(source, /frozen plan will not replace it today/);
});


test("Phase 5 planner never exceeds any supported budget and reports intentional underfill", () => {
  for (const requestedMinutes of [5, 8, 12, 15]) {
    const plan = buildPracticeCoachDailyPlan({
      profileId, contextId, localDayKey: "2026-09-08", requestedMinutes,
      inputFingerprint: `budget-${requestedMinutes}`, targetCandidates: [target()],
      realTextSupportedMinutes: [10, 5, 3], now,
    });
    assert.ok(plan.plannedMinutes <= requestedMinutes, `${requestedMinutes}: ${plan.plannedMinutes}`);
    const view = buildPracticeCoachViewModel({ state: { status: "ready", requestedMinutes, plan } });
    assert.match(view.plan.budgetLabel, new RegExp(`^${plan.plannedMinutes} of ${requestedMinutes} min planned`));
    if (plan.plannedMinutes < requestedMinutes) assert.match(view.plan.budgetLabel, /intentionally underfilled/);
  }
});

test("Phase 5 Coach result repeat controls cannot silently add another frozen dose", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceLabControllerCurrent.js", import.meta.url), "utf8");
  assert.ok((source.match(/onRepeat: onCoachChildExit/g) ?? []).length >= 3);
  assert.match(source, /const common = \{ root, session, logger, onExit: onCoachChildExit \}/);
  assert.doesNotMatch(source, /onRepeat:\s*\(.*startNextBlock/);
});


test("Phase 5 load failures expose only reload recovery while planning failures can retry creation", async () => {
  const storageView = buildPracticeCoachViewModel({ state: {
    status: "error", requestedMinutes: 12, plan: null, errorCode: "PRACTICE_STORAGE_OPEN_FAILED",
  } });
  assert.equal(storageView.canCreate, false);

  const planFailureView = buildPracticeCoachViewModel({ state: {
    status: "error", requestedMinutes: 12, plan: null, errorCode: "PRACTICE_COACH_PLAN_FAILED",
  } });
  assert.equal(planFailureView.canCreate, true);
});


test("Phase 5 Assessment-state failure cannot block an otherwise valid training plan", async () => {
  const repository = baseRepository();
  const service = createPracticeCoachServiceBase({
    repository,
    experimentRegistry: {
      getRegistration(id) {
        if (id === "real-text") return { runtime: { async getAvailability() { return { supportedDurationsMs: [300_000] }; } } };
        return null;
      },
    },
    limiterService: { async buildContextLimiterSnapshot() { return { candidates: [] }; } },
    masteryService: emptyMastery,
    reviewService: emptyReview,
    getAssessmentState: async () => { throw new Error("assessment unavailable"); },
    now,
  });
  const created = await service.createTodayPracticeCoachPlan({ profileId, contextId, requestedMinutes: 5, language: "en" });
  assert.equal(created.created, true);
  assert.equal(created.plan.blocks.length, 1);
  assert.equal(created.plan.blocks[0].kind, "real-text");
  assert.equal(created.plan.decisionContext.assessmentState, "unknown");
  assert.equal(created.plan.suggestions.assessmentSuggestion, null);
});
