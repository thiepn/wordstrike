import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeContentPlan, validatePracticeExperimentDescriptor } from "../js/practiceLab/practiceSessionContract.js";
import {
  createPracticeResearchBinding,
  getPracticeTrustedResearchBinding,
  trustPracticeResearchContentPlan,
} from "../js/practiceLab/practiceResearchBinding.js";
import {
  PRACTICE_RESEARCH_PROBE_EXPERIMENT,
  createPreparedPracticeResearchProbeSession,
} from "../js/practiceLab/practiceResearchProbeExperiment.js";
import { resolvePracticeEvidenceRole } from "../js/practiceLab/practiceEvidenceRole.js";
import { resolvePracticeTreatmentIdentity } from "../js/practiceLab/practiceTreatmentRegistry.js";

const cryptoImpl = globalThis.crypto;
const assignment = Object.freeze({
  studyId: "WS-AB-WEAKNESS-BOSS-1",
  studyVersion: 1,
  researchEnrollmentId: "research-enrollment:test",
  researchAssignmentId: "research-assignment:test:000",
  assignedArm: "focused-practice",
  assignmentIndex: 0,
  target: Object.freeze({ entityType: "key", statId: "stat:key:k", entityKey: "k" }),
});

function targetedPlan() {
  return createPracticeContentPlan({
    contentId: "practice-content_pl38-treatment-test",
    contentGeneratorVersion: 1,
    text: "keep kind keys",
    targetEntities: [{ entityType: "key", entityKey: "k", statId: "stat:key:k", directTarget: true }],
    completion: { mode: "content", value: null },
    metadata: { sourceType: "generated", partition: "training", language: "en" },
  });
}

test("PL38 randomized assignment identity is derived only from trusted content-plan binding", async () => {
  const binding = await createPracticeResearchBinding(assignment, "treatment", cryptoImpl);
  const contentPlan = targetedPlan();
  trustPracticeResearchContentPlan(contentPlan, binding);
  assert.deepEqual(getPracticeTrustedResearchBinding(contentPlan), binding);

  const identity = resolvePracticeTreatmentIdentity({
    experiment: { id: "weak-keys", version: 1 },
    configuration: {},
    contentPlan,
  });
  assert.equal(identity.assignmentKind, "randomized");
  assert.equal(identity.targetEntityType, "key");
  assert.equal(identity.targetEntityKey, "k");

  const copiedPlan = JSON.parse(JSON.stringify(contentPlan));
  const copiedIdentity = resolvePracticeTreatmentIdentity({
    experiment: { id: "weak-keys", version: 1 },
    configuration: { researchBinding: binding },
    contentPlan: copiedPlan,
  });
  assert.equal(copiedIdentity.assignmentKind, "manual");
  assert.equal(getPracticeTrustedResearchBinding(copiedPlan), null);
});

test("PL38 common probe is a valid hidden diagnostic session and never a PL32 treatment", async () => {
  const baselineBinding = await createPracticeResearchBinding(assignment, "baseline", cryptoImpl);
  const prepared = createPreparedPracticeResearchProbeSession({ assignment, phase: "baseline", binding: baselineBinding, sessionId: "practice-session_pl38-probe-test" });
  const validation = validatePracticeExperimentDescriptor(PRACTICE_RESEARCH_PROBE_EXPERIMENT);
  assert.equal(validation.valid, true, validation.errors?.[0]?.message);
  assert.equal(prepared.experiment.id, "research-target-probe");
  assert.equal(prepared.experiment.resumable, false);
  assert.equal(prepared.experiment.abilityChannel, null);
  assert.equal(prepared.experiment.performanceMeasurementKind, null);
  assert.equal(prepared.experiment.retentionMeasurementKind, null);
  assert.equal(prepared.contentPlan.metadata.partition, "diagnostic");
  assert.equal(prepared.contentPlan.metadata.sourceType, "research-target-probe");
  assert.equal(prepared.contentPlan.metadata.researchProbe.targetSpans.length, 12);
  assert.equal(prepared.contentPlan.metadata.researchProbe.targetOpportunityQuota, 12);
  assert.equal(prepared.configuration.liveWpm, false);
  assert.equal(prepared.configuration.aggregateAccuracy, false);
  assert.equal(prepared.configuration.targetCues, false);
  assert.equal(prepared.configuration.metronome, false);
  assert.equal(resolvePracticeEvidenceRole({ contentPlan: prepared.contentPlan }), "diagnostic");
  assert.deepEqual(getPracticeTrustedResearchBinding(prepared.contentPlan), baselineBinding);
  assert.equal(resolvePracticeTreatmentIdentity({ experiment: prepared.experiment, configuration: prepared.configuration, contentPlan: prepared.contentPlan }), null);
});
