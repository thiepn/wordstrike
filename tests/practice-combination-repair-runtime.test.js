import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildPracticeCombinationRepairContentPlan,
  buildPracticeCombinationRepairTrainingPlan,
  inspectPracticeCombinationRepairAvailability,
} from "../js/practiceLab/practiceCombinationRepairGenerator.js";
import { analyzePracticeCombinationRepairResult } from "../js/practiceLab/practiceCombinationRepairAnalyzer.js";
import { createPracticeCombinationRepairRuntime } from "../js/practiceLab/practiceCombinationRepairRuntime.js";
import {
  createPracticeCombinationRepairDescriptor,
  registerPracticeCombinationRepairExperiment,
} from "../js/practiceLab/practiceCombinationRepairExperiment.js";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistry.js";

const TARGET = Object.freeze({ entityType: "bigram", entityKey: "th" });

function fixtureContent(id, familyId, text) {
  return Object.freeze({
    contentId: id,
    familyId,
    partition: "training",
    text,
    contentHash: `fixture-${id}`,
    graphemeCount: 13,
    wordCount: 3,
    uppercaseCount: 0,
    punctuationCount: 1,
    digitCount: 0,
    metadata: {},
  });
}

const CONTENT = Object.freeze([
  fixtureContent("practice-fixture-a", "family-a", "the calm cat."),
  fixtureContent("practice-fixture-b", "family-b", "the warm dog."),
]);

const refs = Object.freeze(CONTENT.map((item) => Object.freeze({
  contentId: item.contentId,
  familyId: item.familyId,
  count: 1,
  positions: Object.freeze([0]),
})));

const targetIndex = Object.freeze({
  async getTargetContentRefs(query) {
    assert.equal(query.partition, "training");
    assert.equal(query.purpose, "training");
    assert.equal(query.entityType, TARGET.entityType);
    assert.equal(query.entityKey, TARGET.entityKey);
    return refs;
  },
  async getTargetWordRefs() {
    return Object.freeze(["the", "thing", "other"]);
  },
});

function corpusBinding() {
  return {
    corpusId: "practice-fixture-en-v1",
    corpusVersion: 1,
    indexVersion: 1,
    manifestHash: "fixture-manifest",
  };
}

function completeTrace(contentPlan) {
  return Array.from(contentPlan.text).map((expected, position) => Object.freeze({
    eventIndex: position + 1,
    type: expected === " " ? "space" : "character",
    entered: expected,
    expected,
    textPosition: position,
    correctness: "correct",
    monotonicTimestampMs: position * 100,
    relativeActiveTimestampMs: position * 100,
    latencyFromPriorInsertionMs: position === 0 ? null : 100,
    source: "test",
    isFirstAttempt: true,
    timingSegmentId: 1,
  }));
}

async function fileFetch(path) {
  try {
    const text = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    return {
      ok: true,
      status: 200,
      async text() { return text; },
      async json() { return JSON.parse(text); },
    };
  } catch {
    return {
      ok: false,
      status: 404,
      async text() { return ""; },
      async json() { throw new Error("not found"); },
    };
  }
}

test("PL20 generator deterministically builds one exact training dose with matched disjoint probes", async () => {
  const availability = await inspectPracticeCombinationRepairAvailability({
    targetIndex,
    contentItems: CONTENT,
    ...TARGET,
  });
  assert.equal(availability.status, "ready");
  assert.equal(availability.familyCount, 2);

  const first = await buildPracticeCombinationRepairTrainingPlan({
    targetIndex,
    contentItems: CONTENT,
    corpusBinding: corpusBinding(),
    targetSource: "manual",
    ...TARGET,
  });
  const second = await buildPracticeCombinationRepairTrainingPlan({
    targetIndex,
    contentItems: [...CONTENT].reverse(),
    corpusBinding: corpusBinding(),
    targetSource: "manual",
    ...TARGET,
  });
  assert.deepEqual(first, second);
  assert.equal(first.phases.reduce((sum, phase) => sum + phase.targetOpportunityCount, 0), 50);
  const entryFamilies = new Set(first.phases[0].units.map((unit) => unit.familyId));
  const exitFamilies = new Set(first.phases[4].units.map((unit) => unit.familyId));
  assert.equal([...entryFamilies].some((familyId) => exitFamilies.has(familyId)), false);
  assert.equal(first.phases.every((phase) => phase.units.every((unit) => unit.partition === "training")), true);
});

test("PL20 materializes only bound training text and emits a valid direct-target content plan", async () => {
  const plan = await buildPracticeCombinationRepairTrainingPlan({
    targetIndex,
    contentItems: CONTENT,
    corpusBinding: corpusBinding(),
    ...TARGET,
  });
  const contentPlan = buildPracticeCombinationRepairContentPlan({ plan, contentItems: CONTENT });
  assert.equal(contentPlan.completion.mode, "content");
  assert.deepEqual(contentPlan.targetEntities, [{ entityType: "bigram", entityKey: "th", directTarget: true }]);
  assert.equal(contentPlan.metadata.partition, "training");
  assert.equal(contentPlan.metadata.combinationRepair.phaseRanges.length, 5);
  assert.equal(contentPlan.text.includes("\n"), false);
  assert.equal(contentPlan.units.every((unit) => unit.type === "segment"), true);
  assert.equal(contentPlan.units.every((unit) => ["family-a", "family-b"].includes(unit.metadata.combinationRepair.sourceFamilyId)), true);
});

test("PL20 analyzer reconstructs exact phase opportunities and keeps the check same-session only", async () => {
  const plan = await buildPracticeCombinationRepairTrainingPlan({
    targetIndex,
    contentItems: CONTENT,
    corpusBinding: corpusBinding(),
    ...TARGET,
  });
  const contentPlan = buildPracticeCombinationRepairContentPlan({ plan, contentItems: CONTENT });
  const analysis = analyzePracticeCombinationRepairResult({
    contentPlan,
    eventTrace: completeTrace(contentPlan),
    foundationAnalysis: null,
  });
  assert.equal(analysis.integrity.status, "complete");
  assert.deepEqual(analysis.phases.map((phase) => phase.opportunityCount), [5, 15, 12, 13, 5]);
  assert.equal(analysis.phases.every((phase) => phase.quotaSatisfied), true);
  assert.equal(analysis.sameSessionCheck.immediateDirection, "similar-at-check");
  assert.deepEqual(analysis.sameSessionCheck.interpretation.doesNotEstablish, ["mastery", "retention", "transfer", "causal-improvement"]);
  assert.deepEqual(analysis.reviewItemChanges, []);
});

test("PL20 analyzer refuses a Baseline/Check claim when retained trace evidence is incomplete", async () => {
  const plan = await buildPracticeCombinationRepairTrainingPlan({
    targetIndex,
    contentItems: CONTENT,
    corpusBinding: corpusBinding(),
    ...TARGET,
  });
  const contentPlan = buildPracticeCombinationRepairContentPlan({ plan, contentItems: CONTENT });
  const trace = completeTrace(contentPlan).slice(-100);
  const analysis = analyzePracticeCombinationRepairResult({ contentPlan, eventTrace: trace, foundationAnalysis: null });
  assert.equal(analysis.integrity.status, "insufficient");
  assert.equal(analysis.sameSessionCheck, null);
  assert.equal(analysis.integrity.reasons.some((reason) => reason.endsWith("quota-incomplete")), true);
});

test("PL20 registry descriptor is an ordinary non-resumable training experiment", () => {
  const descriptor = createPracticeCombinationRepairDescriptor();
  assert.equal(descriptor.id, "combination-repair");
  assert.equal(descriptor.resumable, false);
  assert.deepEqual(descriptor.supportedCompletionModes, ["content"]);
  assert.equal(descriptor.retentionMeasurementKind, null);
  assert.equal(descriptor.abilityChannel, null);
  assert.equal(descriptor.performanceMeasurementKind, null);

  const registry = createPracticeExperimentRegistry({
    featureGate: { canAccess: () => true },
  });
  const registration = registerPracticeCombinationRepairExperiment(registry, {
    runtime: { prepare() { throw new Error("not used"); } },
  });
  assert.equal(registration.experimentId, "combination-repair");
  assert.equal(registry.hasImplementation("combination-repair"), true);
});

test("PL20 shipped English corpus remains fail-closed while only one training family exists", async () => {
  const runtime = createPracticeCombinationRepairRuntime({ fetchImpl: fileFetch });
  const diagnostics = await runtime.getDiagnostics();
  assert.equal(diagnostics.ready, true);
  assert.equal(diagnostics.trainingFamilyCount, 1);

  const availability = await runtime.inspectTarget({ entityType: "bigram", entityKey: "nt" });
  assert.equal(availability.status, "limited-content");
  assert.equal(availability.reasons.length > 0, true);
  await assert.rejects(
    runtime.prepare({ entityType: "bigram", entityKey: "nt", targetSource: "manual" }),
    (error) => ["INSUFFICIENT_TARGET_CONTENT", "INSUFFICIENT_PROBE_MATCH"].includes(error.code),
  );
});
