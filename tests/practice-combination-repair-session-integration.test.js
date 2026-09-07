import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
import {
  buildPracticeCombinationRepairContentPlan,
  buildPracticeCombinationRepairTrainingPlan,
} from "../js/practiceLab/practiceCombinationRepairGenerator.js";
import { createPracticeCombinationRepairRegistration } from "../js/practiceLab/practiceCombinationRepairExperiment.js";
import { hashPracticeContent } from "../js/practiceLab/practiceIds.js";
import { resolvePracticeEvidenceRole } from "../js/practiceLab/practiceEvidenceRole.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function fixtureContent(contentId, familyId, text) {
  return Object.freeze({
    contentId,
    familyId,
    partition: "training",
    text,
    contentHash: hashPracticeContent(text),
    graphemeCount: Array.from(text).length,
    wordCount: text.trim().split(/\s+/u).length,
    uppercaseCount: 0,
    punctuationCount: 1,
    digitCount: 0,
    metadata: {},
  });
}

const CONTENT = Object.freeze([
  fixtureContent("practice-pl20-engine-a", "family-a", "the calm cat."),
  fixtureContent("practice-pl20-engine-b", "family-b", "the warm dog."),
]);

const TARGET_INDEX = Object.freeze({
  async getTargetContentRefs(query) {
    assert.equal(query.partition, "training");
    assert.equal(query.purpose, "training");
    assert.equal(query.entityType, "bigram");
    assert.equal(query.entityKey, "th");
    return Object.freeze(CONTENT.map((item) => Object.freeze({
      contentId: item.contentId,
      familyId: item.familyId,
      count: 1,
      positions: Object.freeze([0]),
    })));
  },
  async getTargetWordRefs() {
    return Object.freeze(["the", "thing", "other"]);
  },
});

async function preparedSession() {
  const plan = await buildPracticeCombinationRepairTrainingPlan({
    targetIndex: TARGET_INDEX,
    contentItems: CONTENT,
    corpusBinding: {
      corpusId: "practice-pl20-engine-fixture",
      corpusVersion: 1,
      indexVersion: 1,
      manifestHash: "fixture-manifest",
    },
    entityType: "bigram",
    entityKey: "th",
    targetSource: "manual",
  });
  const contentPlan = buildPracticeCombinationRepairContentPlan({ plan, contentItems: CONTENT });
  const registration = createPracticeCombinationRepairRegistration({ runtime: { prepare() { throw new Error("not used"); } } });
  return registration.sessionFactory({ plan, contentPlan });
}

async function typeContent(engine, harness, text) {
  for (const [index, character] of Array.from(text).entries()) {
    if (index > 0) await harness.time.advance(100, { runTimers: false });
    const outcome = engine.handleInput(harness.input(character === " " ? "space" : "character", character));
    assert.equal(outcome.accepted, true, `input ${index} (${JSON.stringify(character)}) must be accepted`);
  }
  await Promise.resolve();
}

test("PL20 trusted aggregate training binding is object-bound and cannot be spoofed by metadata alone", async () => {
  const session = await preparedSession();
  assert.equal(resolvePracticeEvidenceRole({ contentPlan: session.contentPlan }), "training");
  const serializedClone = JSON.parse(JSON.stringify(session.contentPlan));
  assert.equal(resolvePracticeEvidenceRole({ contentPlan: serializedClone }), "unclassified");
});

test("PL20 completes through the normal Practice engine and contributes exactly one PL16 bigram acquisition dose", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl20-shared-engine", text: "stub" });
  const session = await preparedSession();
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
    experiment: session.experiment,
    configuration: session.configuration,
    contentPlan: session.contentPlan,
  });
  await engine.start();
  await typeContent(engine, harness, session.contentPlan.text);
  const result = await engine.complete("content-complete");

  assert.equal(result.summary.experimentId, "combination-repair");
  assert.equal(result.summary.status, "completed");
  assert.equal(result.summary.completionReason, "content-complete");
  assert.equal(result.summary.evidenceRole, "training");
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
