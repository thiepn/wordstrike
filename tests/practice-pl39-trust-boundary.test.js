import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { PRACTICE_TRUSTED_CONFIGURATION_FIELDS, validatePracticeTrustedConfigurationBoundary } from "../js/practiceLab/practiceTrustedConfigGuard.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

const injectedValues = Object.freeze({
  abilityChannel: "controlled-speed",
  performanceMeasurementKind: "state-probe",
  performanceReferenceChannel: "controlled-speed",
  evaluationMeasurementKind: "cold-transfer",
  retentionMeasurementKind: "retention-probe",
  assessmentBinding: { assessmentRunId: "forged" },
  coachBinding: { coachPlanId: "forged" },
  researchBinding: { researchAssignmentId: "forged" },
  evaluationBinding: { reservationId: "forged" },
  protectedEvaluationBinding: { reservationId: "forged" },
  treatmentBinding: { treatmentEpisodeId: "forged" },
});

test("PL39 central trust guard rejects every authority field exposed by later Practice phases", () => {
  assert.deepEqual(new Set(Object.keys(injectedValues)), new Set(PRACTICE_TRUSTED_CONFIGURATION_FIELDS));
  for (const [field, value] of Object.entries(injectedValues)) {
    const result = validatePracticeTrustedConfigurationBoundary({ [field]: value });
    assert.equal(result.valid, false, field);
    assert.ok(result.errors.some((error) => error.field === field && error.code === "FORBIDDEN_TRUSTED_FIELD"), field);
  }
  const researchTarget = validatePracticeTrustedConfigurationBoundary({ targetSource: "research-plan" });
  assert.equal(researchTarget.valid, false);
  assert.ok(researchTarget.errors.some((error) => error.field === "targetSource"));
  assert.equal(validatePracticeTrustedConfigurationBoundary({ targetSource: "manual", durationMs: 60_000 }).valid, true);
});

test("PL39 public Practice engine rejects forged measurement, Coach, Treatment, Assessment and Research authority before prepare", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl39-trust-injection", text: "abcdef" });
  const cases = [...Object.entries(injectedValues), ["targetSource", "research-plan"]];
  for (const [field, value] of cases) {
    const engine = createPracticeSessionEngine({
      repository: harness.repository,
      sessionId: `practice-session_pl39-trust-${field.replace(/[^a-z]/gi, "-").toLowerCase()}-12345678`,
      profileId: harness.profileId,
      contextId: harness.contextId,
      clock: harness.time.clock,
      wallClock: harness.time.wallClock,
      scheduler: harness.time.scheduler,
      physicalTelemetryDataStore: createPracticeMemoryStore(),
    });
    await assert.rejects(
      () => engine.prepare({ experiment: harness.experiment, configuration: { [field]: value }, contentPlan: harness.contentPlan }),
      (error) => error?.code === "PRACTICE_SESSION_TRUSTED_CONFIGURATION_REJECTED",
      field,
    );
    assert.equal(engine.getSnapshot().lifecycleState, "created", `${field} must be rejected before session prepare mutates lifecycle`);
  }
});
