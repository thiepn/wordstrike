import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeContentPlan } from "../js/practiceLab/practiceSessionContract.js";
import { createPracticeCombinationRepairDescriptor } from "../js/practiceLab/practiceCombinationRepairExperiment.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

const PHASES = Object.freeze([
  { id: "entry-probe", ordinal: 1, label: "Baseline", cue: "none", quota: 5 },
  { id: "acquire", ordinal: 2, label: "Focus", cue: "strong", quota: 15 },
  { id: "integrate", ordinal: 3, label: "Context", cue: "subtle", quota: 12 },
  { id: "interleave", ordinal: 4, label: "Mix", cue: "none", quota: 13 },
  { id: "exit-probe", ordinal: 5, label: "Check", cue: "none", quota: 5 },
]);

function fixedBigramContentPlan() {
  let text = "";
  const phaseRanges = [];
  for (const phase of PHASES) {
    if (text) text += " ";
    const startIndex = text.length;
    text += Array.from({ length: phase.quota }, () => "th").join(" ");
    phaseRanges.push({
      id: phase.id,
      ordinal: phase.ordinal,
      label: phase.label,
      cue: phase.cue,
      startIndex,
      endIndex: text.length,
      opportunityQuota: phase.quota,
    });
  }
  return createPracticeContentPlan({
    contentId: "practice-content_pl20-shared-engine",
    contentGeneratorVersion: 1,
    text,
    targetEntities: [{ entityType: "bigram", entityKey: "th", directTarget: true }],
    completion: { mode: "content", value: null },
    metadata: {
      language: "en",
      sourceType: "generated",
      partition: "training",
      corpusBinding: {
        corpusId: "practice-pl20-integration-fixture",
        corpusVersion: 1,
        indexVersion: 1,
        manifestHash: "fixture",
      },
      combinationRepair: {
        version: 1,
        policyVersion: 1,
        generatorVersion: 1,
        selectionVersion: 1,
        planHash: "integration-fixture",
        targetSource: "manual",
        target: { entityType: "bigram", entityKey: "th" },
        phaseSequence: PHASES.map((phase) => ({
          id: phase.id,
          ordinal: phase.ordinal,
          cue: phase.cue,
          opportunityQuota: phase.quota,
        })),
        phaseRanges,
        totalTargetOpportunities: 50,
        resumable: false,
        completionMode: "content",
      },
    },
  });
}

async function typeContent(engine, harness, text) {
  for (const [index, character] of Array.from(text).entries()) {
    if (index > 0) await harness.time.advance(100, { runTimers: false });
    const outcome = engine.handleInput(harness.input(character === " " ? "space" : "character", character));
    assert.equal(outcome.accepted, true, `input ${index} (${JSON.stringify(character)}) must be accepted`);
  }
  await Promise.resolve();
}

test("PL20 completes through the normal Practice engine and contributes exactly one PL16 bigram acquisition dose", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl20-shared-engine", text: "stub" });
  const contentPlan = fixedBigramContentPlan();
  const experiment = createPracticeCombinationRepairDescriptor({ contentPlan });
  const engine = createPracticeSessionEngine({
    repository: harness.repository,
    sessionId: harness.sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });

  await engine.prepare({
    experiment,
    configuration: { correctionBehavior: "allow", timingMode: "on-first-input" },
    contentPlan,
  });
  await engine.start();
  await typeContent(engine, harness, contentPlan.text);
  const result = await engine.complete("content-complete");

  assert.equal(result.summary.experimentId, "combination-repair");
  assert.equal(result.summary.status, "completed");
  assert.equal(result.summary.completionReason, "content-complete");
  assert.equal(result.summary.trainingQuality.kind, "combination-repair");
  assert.equal(result.summary.trainingQuality.integrity.status, "complete");
  assert.deepEqual(result.summary.trainingQuality.phases.map((phase) => phase.opportunityCount), [5, 15, 12, 13, 5]);
  assert.equal(result.summary.beforeMetrics.phaseId, "entry-probe");
  assert.equal(result.summary.afterMetrics.phaseId, "exit-probe");
  assert.equal(result.summary.retentionReviewSummary, null);
  assert.equal(result.summary.evaluationSummary, null);

  const skill = await harness.repository.getSkillStat(harness.profileId, harness.contextId, "bigram", "th");
  assert.ok(skill, "PL11 must persist the direct target bigram");
  assert.equal(skill.evidence.opportunities.count, 50);
  assert.equal(skill.evidence.opportunities.directTargetedCount, 50);
  assert.equal(skill.evidence.opportunities.incidentalCount, 0);

  assert.ok(result.summary.learningEvidenceSummary);
  assert.equal(result.summary.learningEvidenceSummary.acquisitionObservationCount, 1);
  assert.equal(result.summary.learningEvidenceSummary.transferObservationCount, 0);

  const learning = await harness.repository.getLearningState(harness.profileId, harness.contextId, "bigram", "th");
  assert.ok(learning, "PL16 must persist an acquisition learning state for the direct target");
  assert.equal(learning.acquisition.cumulativeTargetOpportunities, 50);
  assert.equal(learning.acquisition.cumulativeDoseUnits, 1);
  assert.equal(learning.transfer.observationCount, 0);

  assert.equal(engine.getTrustedRetentionMeasurementKind(), null);
  assert.equal(engine.getTrustedEvaluationMeasurementKind(), null);
  assert.equal(engine.getTrustedAssessmentBinding(), null);
});
