import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPracticeCoachDailyPlan } from "../js/practiceLab/practiceCoachPlanner.js";
import { createPracticeCoachBlockBinding, trustPracticeCoachContentPlan } from "../js/practiceLab/practiceCoachBlockBinding.js";
import { createGenericPracticeExperimentDescriptor, createPracticeContentPlan } from "../js/practiceLab/practiceSessionContract.js";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function targetCandidate() {
  return {
    statId: "stat-r",
    entityType: "key",
    entityKey: "r",
    experimentId: "weak-keys",
    experimentVersion: 1,
    utilityScore: 80,
    availabilityStatus: "ready",
    hierarchy: { status: "independent", explainedBy: [] },
    reasonCodes: ["key-foundation"],
  };
}

function makePlan(harness) {
  return buildPracticeCoachDailyPlan({
    profileId: harness.profileId,
    contextId: harness.contextId,
    localDayKey: "2026-07-05",
    requestedMinutes: 5,
    inputFingerprint: "binding-fixture",
    targetCandidates: [targetCandidate()],
    realTextSupportedMinutes: [],
    now: harness.time.wallClock,
  });
}

function activate(plan) {
  const next = JSON.parse(JSON.stringify(plan));
  next.status = "active";
  next.blocks[0].status = "active";
  next.blocks[0].childSessionId = next.blocks[0].plannedSessionId;
  next.blocks[0].startedAt = "2026-07-05T18:42:13.000Z";
  return next;
}

function coachContent(metadata = {}) {
  return createPracticeContentPlan({
    contentId: "practice-content_pl25-binding-r",
    text: "r",
    targetEntities: [{ entityType: "key", entityKey: "r", directTarget: true }],
    completion: { mode: "manual", value: null },
    metadata,
  });
}

function experiment() {
  return createGenericPracticeExperimentDescriptor({ id: "weak-keys", title: "Weak Keys", resumable: false });
}

function engine(harness, sessionId) {
  return createPracticeSessionEngine({
    repository: harness.repository,
    sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
}

test("PL25 rejects external-plan targetSource when Coach trust is only spoofed in serializable metadata", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl25-coach-spoof" });
  const plan = activate(makePlan(harness));
  await harness.repository.saveCoachPlan(plan);
  const block = plan.blocks[0];
  const contentPlan = coachContent({
    partition: "training",
    coachBinding: { coachPlanId: plan.coachPlanId, blockId: block.blockId, planHash: plan.planHash },
  });
  const child = engine(harness, block.plannedSessionId);
  await assert.rejects(
    () => child.prepare({ experiment: experiment(), configuration: { correctionBehavior: "allow", targetSource: "external-plan" }, contentPlan }),
    (error) => error?.code === "PRACTICE_COACH_BINDING_REQUIRED",
  );
  assert.equal(await harness.repository.getSessionSummary(block.plannedSessionId), null);
});

test("PL25 rejects direct coachBinding configuration as a privileged field even when it looks valid", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl25-coach-config-spoof" });
  const plan = activate(makePlan(harness));
  await harness.repository.saveCoachPlan(plan);
  const block = plan.blocks[0];
  const contentPlan = coachContent();
  const child = engine(harness, block.plannedSessionId);
  await assert.rejects(
    () => child.prepare({
      experiment: experiment(),
      configuration: { correctionBehavior: "allow", coachBinding: createPracticeCoachBlockBinding(plan, block) },
      contentPlan,
    }),
    (error) => error?.code === "PRACTICE_EVALUATION_PRIVILEGE_VIOLATION" || error?.code === "PRACTICE_SESSION_INVALID_CONFIGURATION",
  );
});

test("PL25 object-bound Coach child persists compact v13 coachBinding and completes the exact parent block", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl25-coach-trusted" });
  const plan = activate(makePlan(harness));
  await harness.repository.saveCoachPlan(plan);
  const block = plan.blocks[0];
  const contentPlan = coachContent();
  const binding = createPracticeCoachBlockBinding(plan, block);
  trustPracticeCoachContentPlan(contentPlan, binding);
  const child = engine(harness, block.plannedSessionId);
  await child.prepare({
    experiment: experiment(),
    configuration: { correctionBehavior: "allow", targetSource: "external-plan" },
    contentPlan,
  });
  await child.start();
  const typed = child.handleInput(harness.input("character", "r"));
  assert.equal(typed.accepted, true);
  const completed = await child.complete("manual-stop");
  assert.equal(completed.summary.recordVersion, 13);
  assert.deepEqual(completed.summary.coachBinding, binding);
  assert.equal(completed.commit.coachUpdated, true);

  const storedSummary = await harness.repository.getSessionSummary(block.plannedSessionId);
  assert.deepEqual(storedSummary.coachBinding, binding);
  const parent = await harness.repository.getCoachPlan(plan.coachPlanId);
  assert.equal(parent.blocks[0].status, "completed");
  assert.equal(parent.blocks[0].childSessionId, block.plannedSessionId);
  assert.equal(parent.blocks[0].blockResult.sessionId, block.plannedSessionId);
  assert.equal(parent.status, "finished");

  const repeated = await child.complete("manual-stop");
  assert.deepEqual(repeated.summary.coachBinding, binding);
  assert.equal((await harness.repository.listCoachChildSessions(plan.coachPlanId)).length, 1);
});
