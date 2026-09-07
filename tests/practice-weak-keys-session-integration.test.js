import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
import { buildPracticeWeakKeysPlan } from "../js/practiceLab/practiceWeakKeysPlan.js";
import { buildPracticeWeakKeysContentPlan } from "../js/practiceLab/practiceWeakKeysGenerator.js";
import { createPracticeWeakKeysRegistration } from "../js/practiceLab/practiceWeakKeysExperiment.js";
import { resolvePracticeEvidenceRole } from "../js/practiceLab/practiceEvidenceRole.js";
import { assertPracticeWeakKeysSessionContext } from "../js/practiceLab/practiceWeakKeysTrust.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

const TARGET_WORDS = Object.freeze(["rain", "road", "green", "crisp", "drum", "frame", "bread", "star"]);
const NEUTRAL_WORDS = Object.freeze(["calm", "soft", "blue", "quiet", "kind", "swift"]);

function targetUnit(id, targetCount, familyId) {
  const words = Array.from({ length: targetCount }, (_, index) => TARGET_WORDS[(index + Number(id.replace(/\D/g, "") || 0)) % TARGET_WORDS.length]);
  return Object.freeze({
    candidateId: `candidate-${id}`,
    generatedUnitId: `generated-${id}`,
    kind: "generated-word-sequence",
    compositionMode: "generated-word-sequence",
    targetOpportunityCount: targetCount,
    wordKeys: words,
    lexicalKeys: words,
    sourceContentIds: [`source-${id}`],
    sourceContentHashes: [`hash-${id}`],
    sourceFamilyIds: [familyId],
    positionCounts: { "word-start": targetCount > 0 ? 1 : 0, "word-middle": Math.max(0, targetCount - 2), "word-end": targetCount > 1 ? 1 : 0 },
    geometryCounts: { "same-side-near": targetCount > 0 ? 1 : 0, "same-side-far": targetCount > 1 ? 1 : 0, "cross-side": Math.max(0, targetCount - 2) },
    precedingContextCount: Math.min(targetCount, 4),
    followingContextCount: Math.min(targetCount, 4),
    typabilityScore: 0.5,
    typabilityPercentile: 50,
    difficultyFeatures: { meanWordLength: 4, p90WordLength: 5, uppercaseRatio: 0, punctuationRatio: 0, digitRatio: 0, symbolRatio: 0, lexicalRarityScore: 0.2, bigramRarityScore: 0.2 },
  });
}

function neutralUnit(id) {
  return Object.freeze({
    candidateId: `neutral-${id}`,
    generatedUnitId: `neutral-generated-${id}`,
    kind: "generated-word-sequence",
    compositionMode: "generated-neutral-word-sequence",
    targetOpportunityCount: 0,
    wordKeys: [...NEUTRAL_WORDS],
    lexicalKeys: [...NEUTRAL_WORDS],
    sourceContentIds: [`neutral-source-${id}`],
    sourceContentHashes: [`neutral-hash-${id}`],
    sourceFamilyIds: [`neutral-family-${id}`],
    positionCounts: {},
    geometryCounts: {},
    precedingContextCount: 0,
    followingContextCount: 0,
    typabilityScore: null,
    typabilityPercentile: null,
    difficultyFeatures: {},
  });
}

function targetUnits(prefix, quota, familyPrefix) {
  const units = [];
  let remaining = quota;
  let index = 1;
  while (remaining > 0) {
    const count = Math.min(4, remaining);
    units.push(targetUnit(`${prefix}-${index}`, count, `${familyPrefix}-${index}`));
    remaining -= count;
    index += 1;
  }
  return units;
}

function fixturePlan(sessionId) {
  const mixTargets = targetUnits("mix", 20, "mix-family");
  const mix = [];
  mixTargets.forEach((unit, index) => {
    mix.push(unit, neutralUnit(index + 1));
  });
  return buildPracticeWeakKeysPlan({
    sessionId,
    context: {
      contextId: "practice-context_pl21-plan-fixture",
      fingerprint: "pl21-plan-fixture-fingerprint",
      dataLocale: "en",
      keyboardLayout: "qwerty",
      inputMethod: "physical-keyboard",
      hardwareProfileId: null,
    },
    language: "en",
    entityKey: "r",
    targetSource: "manual",
    corpusBinding: { corpusId: "practice-pl21-engine-fixture", corpusVersion: 1, indexVersion: 1, manifestHash: "fixture-manifest" },
    phaseUnits: {
      "entry-probe": [targetUnit("entry-1", 4, "entry-family-1"), targetUnit("entry-2", 4, "entry-family-2")],
      focus: targetUnits("focus", 24, "focus-family"),
      context: targetUnits("context", 20, "context-family"),
      interleave: mix,
      "exit-probe": [targetUnit("exit-1", 4, "exit-family-1"), targetUnit("exit-2", 4, "exit-family-2")],
    },
    contextCoveragePlan: {
      positionCoverage: { classCount: 3, counts: { "word-start": 18, "word-middle": 22, "word-end": 16 } },
      precedingContextCount: 8,
      followingContextCount: 8,
      geometryCoverage: { status: "available", classCount: 3, counts: { "same-side-near": 18, "same-side-far": 18, "cross-side": 20 } },
      neutralUnitCount: mixTargets.length,
      neutralLexicalCount: NEUTRAL_WORDS.length,
      probeMatch: { valid: true, typabilityDelta: 0, featureRms: 0, positionProfileDistance: 0, geometryProfileDistance: 0 },
      probeCompositionMode: "generated-word-sequence",
    },
  });
}

async function preparedSession(sessionId) {
  const plan = fixturePlan(sessionId);
  const contentPlan = buildPracticeWeakKeysContentPlan({ plan, contentItems: [] });
  const registration = createPracticeWeakKeysRegistration({ runtime: { prepare() { throw new Error("not used"); } } });
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

test("PL21 plan/content are immutable, fixed-dose, cue-faded, and contain no isolated-key spam", async () => {
  const session = await preparedSession("practice-session_pl21-plan-fixture");
  const { weakKeysPlan: plan, contentPlan } = session;
  assert.equal(Object.isFrozen(plan), true);
  assert.deepEqual(plan.phases.map((phase) => phase.targetOpportunityCount), [8, 24, 20, 20, 8]);
  assert.deepEqual(plan.phases.map((phase) => phase.cue), ["none", "strong", "subtle", "none", "none"]);
  assert.equal(plan.targetOpportunityBudget, 80);
  assert.equal(plan.contextBinding.contextId, "practice-context_pl21-plan-fixture");
  assert.deepEqual(plan.phaseBoundaries.map((phase) => [phase.targetOpportunityStart, phase.targetOpportunityEnd]), [[0, 8], [8, 32], [32, 52], [52, 72], [72, 80]]);
  assert.equal(contentPlan.metadata.weakKeys.contextBinding.fingerprint, "pl21-plan-fixture-fingerprint");
  assert.equal(contentPlan.metadata.partition, "training");
  assert.equal(contentPlan.metadata.weakKeys.resumable, false);
  assert.equal(contentPlan.completion.mode, "content");
  assert.equal(contentPlan.targetEntities.length, 1);
  assert.deepEqual(contentPlan.targetEntities[0], { entityType: "key", entityKey: "r", directTarget: true });
  assert.doesNotMatch(contentPlan.text, /r{2,}/u);
  assert.ok(contentPlan.metadata.weakKeys.phaseRanges.every((phase) => phase.targetPositions.length === phase.opportunityQuota));
});

test("PL21 trusted training role is object-bound and a serialized metadata clone cannot spoof it", async () => {
  const session = await preparedSession("practice-session_pl21-trust-fixture");
  assert.equal(resolvePracticeEvidenceRole({ contentPlan: session.contentPlan }), "training");
  const clone = JSON.parse(JSON.stringify(session.contentPlan));
  assert.equal(resolvePracticeEvidenceRole({ contentPlan: clone }), "unclassified");
});

test("PL21 rejects a session when the active PL5 context changed after plan generation", async () => {
  const session = await preparedSession("practice-session_pl21-context-fixture");
  assert.equal(assertPracticeWeakKeysSessionContext(session.weakKeysPlan, session.weakKeysPlan.contextBinding), true);
  assert.throws(
    () => assertPracticeWeakKeysSessionContext(session.weakKeysPlan, { ...session.weakKeysPlan.contextBinding, fingerprint: "different-fingerprint" }),
    (error) => error.code === "PRACTICE_WEAK_KEYS_CONTEXT_MISMATCH",
  );
});

test("PL21 completes through the shared Practice engine with exactly one direct PL16 key dose", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl21-shared-engine", text: "stub" });
  const session = await preparedSession(harness.sessionId);
  const engine = createPracticeSessionEngine({
    repository: harness.repository,
    sessionId: harness.sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });

  await engine.prepare({ experiment: session.experiment, configuration: session.configuration, contentPlan: session.contentPlan });
  await engine.start();
  await typeContent(engine, harness, session.contentPlan.text);
  const result = await engine.complete("content-complete");

  assert.equal(result.summary.experimentId, "weak-keys");
  assert.equal(result.summary.status, "completed");
  assert.equal(result.summary.completionReason, "content-complete");
  assert.equal(result.summary.trainingQuality.kind, "weak-keys");
  assert.equal(result.summary.trainingQuality.targetOpportunityCount, 80);
  assert.equal(result.summary.trainingQuality.doseUnits, 1);
  assert.equal(result.summary.beforeMetrics.opportunityCount, 8);
  assert.equal(result.summary.afterMetrics.opportunityCount, 8);
  assert.equal(result.summary.transferMetrics, null);
  assert.equal(result.summary.retentionReviewSummary, null);
  assert.equal(result.summary.evaluationSummary, null);
  assert.equal(result.summary.assessmentBinding, null);
  assert.equal(result.summary.abilityMeasurementSummary, null);
  assert.equal(result.summary.performanceMeasurementSummary, null);

  const skill = await harness.repository.getSkillStat(harness.profileId, harness.contextId, "key", "r");
  assert.ok(skill, "PL11 must persist the selected direct key target");
  assert.equal(skill.evidence.opportunities.count, 80);
  assert.equal(skill.evidence.opportunities.directTargetedCount, 80);
  assert.equal(skill.evidence.opportunities.incidentalCount, 0);

  assert.ok(result.summary.learningEvidenceSummary);
  assert.equal(result.summary.learningEvidenceSummary.acquisitionObservationCount, 1);
  assert.equal(result.summary.learningEvidenceSummary.transferObservationCount, 0);
  const learning = await harness.repository.getLearningState(harness.profileId, harness.contextId, "key", "r");
  assert.ok(learning, "PL16 must persist key acquisition state");
  assert.equal(learning.acquisition.cumulativeTargetOpportunities, 80);
  assert.equal(learning.acquisition.cumulativeDoseUnits, 1);
  assert.equal(learning.transfer.observationCount, 0);

  assert.equal(engine.getTrustedRetentionMeasurementKind(), null);
  assert.equal(engine.getTrustedEvaluationMeasurementKind(), null);
  assert.equal(engine.getTrustedAssessmentBinding(), null);
});

test("PL21 errors/retries do not add direct target dose opportunities", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl21-retry-dose", text: "stub" });
  const session = await preparedSession(harness.sessionId);
  const engine = createPracticeSessionEngine({
    repository: harness.repository,
    sessionId: harness.sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await engine.prepare({ experiment: session.experiment, configuration: session.configuration, contentPlan: session.contentPlan });
  await engine.start();
  const characters = Array.from(session.contentPlan.text);
  const firstTarget = characters.indexOf("r");
  for (let index = 0; index < characters.length; index += 1) {
    const expected = characters[index];
    if (index === firstTarget) {
      const wrong = engine.handleInput(harness.input("character", "x"));
      assert.equal(wrong.accepted, true);
      const backspace = engine.handleInput(harness.input("backspace", ""));
      assert.equal(backspace.accepted, true);
    }
    const outcome = engine.handleInput(harness.input(expected === " " ? "space" : "character", expected));
    assert.equal(outcome.accepted, true);
  }
  await Promise.resolve();
  const result = await engine.complete("content-complete");
  const skill = await harness.repository.getSkillStat(harness.profileId, harness.contextId, "key", "r");
  const learning = await harness.repository.getLearningState(harness.profileId, harness.contextId, "key", "r");
  assert.equal(skill.evidence.opportunities.count, 80);
  assert.equal(skill.evidence.opportunities.directTargetedCount, 80);
  assert.equal(learning.acquisition.cumulativeTargetOpportunities, 80);
  assert.equal(learning.acquisition.cumulativeDoseUnits, 1);
  assert.equal(result.summary.incorrectCharacterCount >= 1, true);
});
