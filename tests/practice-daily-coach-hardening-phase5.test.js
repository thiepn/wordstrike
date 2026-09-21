import test from "node:test";
import assert from "node:assert/strict";
import { shouldIncludePracticeCoachReview, buildPracticeCoachDailyPlan } from "../js/practiceLab/practiceCoachPlanner.js";
import { createPracticeCoachService as createPracticeCoachServiceBase } from "../js/practiceLab/practiceCoachServiceBaseV25.js";
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
