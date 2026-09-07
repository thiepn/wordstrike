import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPracticeAssessmentPlan, validatePracticeAssessmentPlan } from "../js/practiceLab/practiceAssessmentPlan.js";

const profileId = "practice-profile_pl19-plan-12345678";
const contextId = "practice-context_pl19-plan-12345678";
const benchmarkSuite = { suiteId: "suite-en", suiteVersion: 1 };
const transferPool = { poolId: "pool-en", poolVersion: 1 };
const availability = {
  depths: {
    quick: { available: true, reasons: [] },
    standard: { available: true, reasons: [] },
    deep: { available: true, reasons: [] },
  },
};
const diagnosticRegistry = {
  selectForm({ blockId }) { return { formId: `form-${blockId}` }; },
};

function evaluationRepository(log) {
  return {
    async reservePracticeBenchmarkForm() {
      log.push("benchmark-reserved");
      return { reservation: { reservationId: "practice-evaluation-reservation_benchmark-12345678" } };
    },
    async reservePracticeColdTransferUnit() {
      log.push("transfer-reserved");
      return { reservation: { reservationId: "practice-evaluation-reservation_transfer-12345678" } };
    },
    async abandonPracticeEvaluationReservation() { log.push("reservation-abandoned"); },
  };
}

async function makePlan(depth, log = []) {
  return buildPracticeAssessmentPlan({
    assessmentRunId: `practice-assessment_${depth}-12345678`,
    profileId,
    contextId,
    language: "en",
    depth,
    availability,
    diagnosticRegistry,
    diagnosticExposureCounts: {},
    benchmarkSuite,
    transferPool,
    evaluationRepository: evaluationRepository(log),
    now: () => new Date("2026-09-07T00:00:00.000Z"),
  });
}

test("PL19 Deep precommits benchmark then transfer before any child can start", async () => {
  const log = [];
  const plan = await makePlan("deep", log);
  assert.deepEqual(log, ["benchmark-reserved", "transfer-reserved"]);
  assert.equal(plan.blocks[0].evaluationReservationId, "practice-evaluation-reservation_benchmark-12345678");
  assert.equal(plan.blocks[9].evaluationReservationId, "practice-evaluation-reservation_transfer-12345678");
  assert.equal(plan.blocks[0].evaluationArtifactId, "suite-en");
  assert.equal(plan.blocks[9].evaluationArtifactId, "pool-en");
  assert.equal(validatePracticeAssessmentPlan(plan).valid, true);
});

test("PL19 Quick reserves no cold-transfer unit and never escalates to Standard/Deep", async () => {
  const log = [];
  const plan = await makePlan("quick", log);
  assert.deepEqual(log, ["benchmark-reserved"]);
  assert.equal(plan.depth, "quick");
  assert.equal(plan.blocks.length, 3);
  assert.equal(plan.blocks.some((block) => block.blockId === "cold-transfer"), false);
});

test("PL19 frozen plan contains zero personalized targets and cannot change with later limiter data", async () => {
  const plan = await makePlan("standard");
  const before = JSON.stringify(plan);
  const unrelatedLaterLimiterSnapshot = { primaryLimiterIds: ["practice-stat_br"], weaknessScore: 99 };
  assert.ok(unrelatedLaterLimiterSnapshot);
  assert.ok(plan.blocks.every((block) => Array.isArray(block.targetEntities) && block.targetEntities.length === 0));
  assert.equal(JSON.stringify(plan), before);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.blocks), true);
});

test("PL19 plan builder does not require or read skill/limiter/mastery/learning repositories", async () => {
  const forbiddenReads = { skillStats: 0, limiter: 0, mastery: 0, learning: 0 };
  const plan = await buildPracticeAssessmentPlan({
    assessmentRunId: "practice-assessment_noread-12345678",
    profileId,
    contextId,
    language: "en",
    depth: "quick",
    availability,
    diagnosticRegistry,
    benchmarkSuite,
    evaluationRepository: evaluationRepository([]),
    now: () => new Date("2026-09-07T00:00:00.000Z"),
    forbiddenReads,
  });
  assert.equal(plan.depth, "quick");
  assert.deepEqual(forbiddenReads, { skillStats: 0, limiter: 0, mastery: 0, learning: 0 });
});
