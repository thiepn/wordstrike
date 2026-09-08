import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_DEFINITIONS,
} from "../js/practiceLab/practiceConstants.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { createPracticeCoachPlanRecord } from "../js/practiceLab/practiceCoachPlan.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import {
  applyPracticeCoachBlockDelta,
  blockPracticeCoachBlockRecord,
  reconcilePracticeCoachPlanRecord,
  skipPracticeCoachBlockRecord,
} from "../js/practiceLab/practiceCoachReconciliation.js";
import { buildPracticeCoachDailyPlan } from "../js/practiceLab/practiceCoachPlanner.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

const profileId = createPracticeId("profile", { uuid: () => "pl25-storage-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "pl25-storage-context-12345678" });
const now = () => new Date("2026-09-08T10:00:00.000Z");

function oneTargetPlan() {
  return buildPracticeCoachDailyPlan({
    profileId,
    contextId,
    localDayKey: "2026-09-08",
    requestedMinutes: 5,
    inputFingerprint: "lifecycle-fixture",
    targetCandidates: [{
      statId: "stat-r",
      entityType: "key",
      entityKey: "r",
      experimentId: "weak-keys",
      utilityScore: 80,
      availabilityStatus: "ready",
      hierarchy: { status: "independent", explainedBy: [] },
      reasonCodes: ["key-foundation"],
    }],
    realTextSupportedMinutes: [],
    now,
  });
}

function activateFirst(plan) {
  const value = JSON.parse(JSON.stringify(plan));
  value.status = "active";
  value.blocks[0].status = "active";
  value.blocks[0].childSessionId = value.blocks[0].plannedSessionId;
  value.blocks[0].startedAt = "2026-09-08T10:05:00.000Z";
  return value;
}

test("PL25 storage envelope is DB8 with coachPlans and sessionSummary v13 coach lookup", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 8);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13);
  assert.equal(PRACTICE_RECORD_VERSIONS.coachPlan, 1);
  assert.equal(PRACTICE_STORE_DEFINITIONS.coachPlans.keyPath, "coachPlanId");
  const unique = PRACTICE_STORE_DEFINITIONS.coachPlans.indexes.find((index) => index.name === "profileContextDay");
  assert.deepEqual(unique.keyPath, ["profileId", "contextId", "localDayKey"]);
  assert.equal(unique.options.unique, true);
  assert.equal(PRACTICE_STORE_DEFINITIONS.sessionSummaries.indexes.find((index) => index.name === "coachPlanId").keyPath, "coachBinding.coachPlanId");
});

test("PL25 memory store resolves nested dotted key paths like IndexedDB for coachBinding lookups", async () => {
  const store = createPracticeMemoryStore();
  await store.open();
  const coachPlanId = "practice-coach-plan_nested-index-12345678";
  const summary = createDefaultSessionSummary({
    profileId,
    contextId,
    sessionId: createPracticeId("session", { uuid: () => "pl25-nested-index-session-12345678" }),
    now,
    overrides: {
      coachBinding: {
        coachPlanId,
        blockId: "target-1",
        blockOrdinal: 1,
        plannerVersion: 1,
        planHash: "fnv1a32-12345678",
      },
    },
  });
  await store.put("sessionSummaries", summary);
  const matches = await store.query("sessionSummaries", "coachPlanId", coachPlanId);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].sessionId, summary.sessionId);
  assert.equal(matches[0].coachBinding.coachPlanId, coachPlanId);
});

test("PL25 sessionSummary v12 migrates exactly once to v13 with nullable coachBinding", () => {
  const current = createDefaultSessionSummary({ profileId, contextId, now });
  const historical = { ...current, recordVersion: 12 };
  delete historical.coachBinding;
  const migration = migratePracticeRecord("sessionSummary", historical);
  assert.equal(migration.ok, true, migration.error?.message);
  assert.deepEqual(migration.steps, ["sessionSummary:12->13"]);
  assert.equal(migration.value.recordVersion, 13);
  assert.equal(migration.value.coachBinding, null);
});

test("PL25 repository keeps one canonical Coach plan per profile/context/local day", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl25-coach-unique" });
  const first = createPracticeCoachPlanRecord({
    profileId: harness.profileId,
    contextId: harness.contextId,
    localDayKey: "2026-07-05",
    requestedMinutes: 12,
    inputFingerprint: "first",
    blocks: [],
    now: harness.time.wallClock,
  });
  const second = createPracticeCoachPlanRecord({
    profileId: harness.profileId,
    contextId: harness.contextId,
    localDayKey: "2026-07-05",
    requestedMinutes: 8,
    inputFingerprint: "second",
    blocks: [],
    now: harness.time.wallClock,
  });
  const created = await harness.repository.createCoachPlan(first);
  const repeated = await harness.repository.createCoachPlan(second);
  assert.equal(created.created, true);
  assert.equal(repeated.created, false);
  assert.equal(repeated.plan.coachPlanId, first.coachPlanId);
  assert.equal(repeated.plan.requestedMinutes, 12);
  assert.equal((await harness.repository.listCoachPlans(harness.profileId, { contextId: harness.contextId })).length, 1);
});

test("PL25 active non-resumable block with no canonical child summary reconciles to invalid and finishes the frozen plan", () => {
  const active = activateFirst(oneTargetPlan());
  const reconciled = reconcilePracticeCoachPlanRecord(active, { childSessions: [], activeSessionIds: [], now });
  assert.equal(reconciled.blocks[0].status, "invalid");
  assert.equal(reconciled.blocks[0].blockResult.reason, "interrupted-nonresumable");
  assert.equal(reconciled.status, "finished");
  assert.equal(reconciled.completion.invalidCount, 1);
});

test("PL25 canonical child completion updates the exact active block once and replay is idempotent", () => {
  const active = activateFirst(oneTargetPlan());
  const block = active.blocks[0];
  const delta = {
    coachPlanId: active.coachPlanId,
    blockId: block.blockId,
    plannedSessionId: block.plannedSessionId,
    sessionId: block.plannedSessionId,
    terminalStatus: "completed",
    completedAt: "2026-09-08T10:10:00.000Z",
  };
  const first = applyPracticeCoachBlockDelta(active, delta, { now });
  assert.equal(first.updated, true);
  assert.equal(first.plan.blocks[0].status, "completed");
  assert.equal(first.plan.status, "finished");
  const replay = applyPracticeCoachBlockDelta(first.plan, delta, { now });
  assert.equal(replay.updated, false);
  assert.equal(replay.idempotent, true);
});

test("PL25 skip and blocked outcomes are terminal without substituting another block", () => {
  const plan = oneTargetPlan();
  const skipped = skipPracticeCoachBlockRecord(plan, plan.blocks[0].blockId, { now });
  assert.equal(skipped.updated, true);
  assert.equal(skipped.plan.blocks[0].status, "skipped");
  assert.equal(skipped.plan.status, "finished");

  const blocked = blockPracticeCoachBlockRecord(plan, plan.blocks[0].blockId, "target-practised-after-plan", { now });
  assert.equal(blocked.updated, true);
  assert.equal(blocked.plan.blocks.length, plan.blocks.length);
  assert.equal(blocked.plan.blocks[0].plannedSessionId, plan.blocks[0].plannedSessionId);
  assert.equal(blocked.plan.blocks[0].status, "blocked");
  assert.equal(blocked.plan.blocks[0].blockResult.reason, "target-practised-after-plan");
});

test("PL25 local-day rollover expires an unfinished plan without changing its frozen block identities", () => {
  const plan = oneTargetPlan();
  const beforeIds = plan.blocks.map((block) => block.plannedSessionId);
  const expired = reconcilePracticeCoachPlanRecord(plan, {
    childSessions: [],
    activeSessionIds: [],
    now: () => new Date("2026-09-09T10:00:00.000Z"),
  });
  assert.equal(expired.status, "expired");
  assert.deepEqual(expired.blocks.map((block) => block.plannedSessionId), beforeIds);
});
