import test from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_BURST_RECOVERY_DURATION_MS,
  PRACTICE_BURST_SPRINT_COUNT,
  PRACTICE_BURST_SPRINT_DURATION_MS,
  PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS,
  PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS,
  PRACTICE_BURST_SPRINTS_POLICY_V1,
  validatePracticeBurstSprintsPolicy,
} from "../js/practiceLab/practiceBurstSprintsConstants.js";
import { createPracticeBurstSprintsPlan } from "../js/practiceLab/practiceBurstSprintsPlan.js";
import {
  buildPracticeBurstAbilityMeasurement,
  selectPracticeBurstEstimatorSprints,
} from "../js/practiceLab/practiceBurstSprintsMeasurement.js";
import { createPracticeBurstSprintsExperiment, registerPracticeBurstSprintsExperiment } from "../js/practiceLab/practiceBurstSprintsExperiment.js";
import { buildPracticeAbilityObservation } from "../js/practiceLab/practiceAbilityObservation.js";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistryRuntime.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";

const sprint = (ordinal, correctedWpm, accuracy = 96, eligible = true) => ({
  sprintId: `sprint-${ordinal}`,
  sprintOrdinal: ordinal,
  durationMs: 10_000,
  acceptedInsertions: 100,
  correctInsertions: Math.round(accuracy),
  incorrectInsertions: 100 - Math.round(accuracy),
  correctionActions: 1,
  removedCount: 1,
  rawWpm: correctedWpm + 5,
  correctedWpm,
  strictAccuracy: accuracy,
  correctionOverheadRate: 0.01,
  completed: true,
  eligible,
});

const completeResult = () => ({
  status: "complete",
  interrupted: false,
  eligibleSprintCount: 6,
  completedSprintCount: 6,
  sprints: [
    sprint(1, 100),
    sprint(2, 140),
    sprint(3, 130),
    sprint(4, 120),
    sprint(5, 150),
    sprint(6, 80),
  ],
});

test("PL27 freezes the six-bout Burst Sprints protocol", () => {
  assert.equal(validatePracticeBurstSprintsPolicy(), true);
  assert.equal(PRACTICE_BURST_SPRINT_COUNT, 6);
  assert.equal(PRACTICE_BURST_SPRINT_DURATION_MS, 10_000);
  assert.equal(PRACTICE_BURST_RECOVERY_DURATION_MS, 15_000);
  assert.equal(PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS, 60_000);
  assert.equal(PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS, 135_000);
  assert.equal(PRACTICE_BURST_SPRINTS_POLICY_V1.minimumEligibleSprints, 3);
  assert.equal(PRACTICE_BURST_SPRINTS_POLICY_V1.estimatorSprintCount, 3);

  const plan = createPracticeBurstSprintsPlan({
    sessionId: "session",
    profileId: "profile",
    contextId: "context",
    form: { formId: "burst-en-01", formFamilyId: "WS-BURST-EN-1", formOrdinal: 1, language: "en" },
  });
  assert.equal(plan.sprints.length, 6);
  assert.deepEqual(plan.sprints.map(({ activeStartMs, activeEndMs }) => [activeStartMs, activeEndMs]), [
    [0, 10_000], [10_000, 20_000], [20_000, 30_000], [30_000, 40_000], [40_000, 50_000], [50_000, 60_000],
  ]);
  assert.deepEqual(plan.sprints.map(({ recoveryAfterMs }) => recoveryAfterMs), [15_000, 15_000, 15_000, 15_000, 15_000, 0]);
});

test("PL27 uses a robust median of the three fastest eligible controlled sprints", () => {
  const result = completeResult();
  const selected = selectPracticeBurstEstimatorSprints(result);
  assert.deepEqual(selected.map(({ sprintId }) => sprintId), ["sprint-5", "sprint-2", "sprint-3"]);
  const measurement = buildPracticeBurstAbilityMeasurement(result);
  assert.equal(measurement.wpm, 140);
  assert.equal(measurement.activeDurationMs, 10_000);
  assert.deepEqual(measurement.selectedSprintIds, ["sprint-5", "sprint-2", "sprint-3"]);
  assert.notEqual(measurement.wpm, 150, "one lucky fastest sprint must not become the burst estimate");

  assert.equal(buildPracticeBurstAbilityMeasurement({ ...result, status: "interrupted", interrupted: true }), null);
  assert.equal(buildPracticeBurstAbilityMeasurement({ ...result, eligibleSprintCount: 2, sprints: result.sprints.map((value, index) => ({ ...value, eligible: index < 2 })) }), null);
});

test("PL27 descriptor is catalog-compatible and delegates canonical estimation to PL13 burst", () => {
  const descriptor = createPracticeBurstSprintsExperiment();
  const catalog = getPracticeExperiment("burst-sprints");
  assert.equal(descriptor.id, "burst-sprints");
  assert.equal(descriptor.category, "speed");
  assert.equal(descriptor.abilityChannel, "burst");
  assert.equal(descriptor.resumable, false);
  assert.equal(catalog.status, "preview");
  assert.equal(catalog.capabilities.includes("robust-top-three"), true);

  const registry = createPracticeExperimentRegistry();
  const runtime = { prepare() {}, getAvailability() {} };
  registerPracticeBurstSprintsExperiment(registry, { runtime });
  const resolved = registry.getResolvedExperiment("burst-sprints");
  assert.equal(resolved.runnable, true);
  assert.equal(resolved.registration.descriptor.abilityChannel, "burst");
  assert.equal(resolved.registration.runtime, runtime, "the registry must retain the runtime used by the PL27 controller");
});

test("PL27 composite measurement produces at most one PL13 burst observation", () => {
  const baseSession = {
    sessionId: "session_1",
    profileId: "profile_1",
    contextId: "context_1",
    status: "completed",
    completionReason: "time-complete",
    completedAtUtc: "2026-09-09T12:00:00.000Z",
    localDayKey: "2026-09-09",
    wpm: 90,
    rawWpm: 95,
    accuracy: 94,
    activeDurationMs: 60_000,
    typedCharacterCount: 450,
    configuration: { correctionBehavior: "allow" },
  };
  const contentPlan = { targetEntities: [] };
  const experiment = {
    abilityChannel: "burst",
    buildAbilityMeasurement() {
      return { wpm: 140, rawWpm: 145, accuracy: 96, activeDurationMs: 10_000, typedCharacterCount: 117 };
    },
  };
  const assessment = buildPracticeAbilityObservation({
    session: baseSession,
    experiment,
    foundationAnalysis: null,
    contentPlan,
    evidenceRole: "diagnostic",
  });
  assert.equal(assessment.status, "eligible");
  assert.equal(assessment.observation.channel, "burst");
  assert.equal(assessment.observation.wpm, 140);
  assert.equal(assessment.observation.activeDurationMs, 10_000);
  assert.equal(assessment.observation.sessionId, baseSession.sessionId);

  const invalid = buildPracticeAbilityObservation({
    session: baseSession,
    experiment: { abilityChannel: "burst", buildAbilityMeasurement: () => null },
    foundationAnalysis: null,
    contentPlan,
    evidenceRole: "diagnostic",
  });
  assert.equal(invalid.status, "not-eligible");
  assert.deepEqual(invalid.reasons, ["protocol-invalid"]);
  assert.equal(invalid.observation, null);
});
