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
  buildPracticeResearchProbeContentPlan,
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

function countOccurrences(text, needle) {
  let count = 0;
  for (let index = 0; index <= text.length - needle.length; index += 1) {
    if (text.slice(index, index + needle.length) === needle) count += 1;
  }
  return count;
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
  assert.equal(prepared.contentPlan.metadata.researchProbe.familyIds.length, 1);
  assert.match(prepared.contentPlan.metadata.researchProbe.familyIds[0], /^ws-research-probe-baseline-/);
  assert.equal(prepared.contentPlan.metadata.researchProbeMaterial.familyId, prepared.contentPlan.metadata.researchProbe.familyIds[0]);
  assert.equal(typeof prepared.contentPlan.metadata.researchProbeMaterial.materialHash, "string");
  assert.equal(prepared.contentPlan.metadata.researchProbe.difficultyIndex, null);
  assert.equal(prepared.contentPlan.metadata.researchProbe.weightedFeatureRms, null);
  assert.equal(prepared.contentPlan.metadata.researchProbe.positionProfileTvd, null);
  assert.equal(prepared.contentPlan.metadata.researchProbe.geometryTvd, null);
  assert.equal(prepared.configuration.liveWpm, false);
  assert.equal(prepared.configuration.aggregateAccuracy, false);
  assert.equal(prepared.configuration.targetCues, false);
  assert.equal(prepared.configuration.metronome, false);
  assert.equal(resolvePracticeEvidenceRole({ contentPlan: prepared.contentPlan }), "diagnostic");
  assert.deepEqual(getPracticeTrustedResearchBinding(prepared.contentPlan), baselineBinding);
  assert.equal(resolvePracticeTreatmentIdentity({ experiment: prepared.experiment, configuration: prepared.configuration, contentPlan: prepared.contentPlan }), null);
});

test("PL38 probe material gives exact target opportunities and disjoint baseline/follow-up families", () => {
  const fixtures = [
    { entityType: "key", statId: "stat:key:k", entityKey: "k", quota: 12 },
    { entityType: "bigram", statId: "stat:bigram:st", entityKey: "st", quota: 8 },
    { entityType: "trigram", statId: "stat:trigram:cal", entityKey: "cal", quota: 6 },
    { entityType: "word", statId: "stat:word:calm", entityKey: "calm", quota: 4 },
  ];
  for (const fixture of fixtures) {
    const baseline = buildPracticeResearchProbeContentPlan({ target: fixture, phase: "baseline", sessionId: `practice-session_pl38-${fixture.entityType}-baseline` });
    const followup = buildPracticeResearchProbeContentPlan({ target: fixture, phase: "followup", sessionId: `practice-session_pl38-${fixture.entityType}-followup` });
    assert.equal(baseline.contentPlan.metadata.partition, "diagnostic");
    assert.equal(followup.contentPlan.metadata.partition, "diagnostic");
    assert.equal(baseline.contentPlan.metadata.researchProbe.targetSpans.length, fixture.quota);
    assert.equal(followup.contentPlan.metadata.researchProbe.targetSpans.length, fixture.quota);
    assert.equal(countOccurrences(baseline.contentPlan.text, fixture.entityKey), fixture.quota);
    assert.equal(countOccurrences(followup.contentPlan.text, fixture.entityKey), fixture.quota);
    assert.notEqual(baseline.probePlan.familyIds[0], followup.probePlan.familyIds[0]);
    assert.match(baseline.probePlan.familyIds[0], /^ws-research-probe-baseline-/);
    assert.match(followup.probePlan.familyIds[0], /^ws-research-probe-followup-/);
  }
});
