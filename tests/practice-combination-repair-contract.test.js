import test from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS } from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";
import {
  PRACTICE_COMBINATION_REPAIR_PHASES,
  PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS,
} from "../js/practiceLab/practiceCombinationRepairConstants.js";
import {
  PRACTICE_COMBINATION_REPAIR_POLICY_V1,
  getPracticeCombinationRepairDoseUnits,
  validatePracticeCombinationRepairPolicy,
} from "../js/practiceLab/practiceCombinationRepairPolicy.js";
import {
  buildPracticeCombinationRepairPlan,
  createPracticeCombinationRepairContentPlanMetadata,
} from "../js/practiceLab/practiceCombinationRepairPlan.js";
import {
  normalizePracticeCombinationRepairTarget,
  validatePracticeCombinationRepairPlan,
} from "../js/practiceLab/practiceCombinationRepairValidation.js";
import {
  scorePracticeCombinationRepairProbePair,
  selectPracticeCombinationRepairProbePair,
} from "../js/practiceLab/practiceCombinationRepairProbeMatch.js";
import { buildPracticeCombinationRepairResult } from "../js/practiceLab/practiceCombinationRepairResult.js";
import { buildPracticeCombinationRepairRecommendations } from "../js/practiceLab/practiceCombinationRepairRecommendation.js";
import { getPracticeTrustedRetentionPurpose, getPracticeTrustedEvaluationPurpose } from "../js/practiceLab/practiceSessionPurposeRegistry.js";
import { getPracticeTrustedAssessmentBinding } from "../js/practiceLab/practiceAssessmentRegistry.js";

function unitsFor(phaseId, quota, prefix) {
  const cap = phaseId === "acquire" ? 3 : 2;
  const units = [];
  let remaining = quota;
  let index = 0;
  while (remaining > 0) {
    const count = Math.min(cap, remaining);
    units.push({
      contentId: `${prefix}-content-${index}`,
      contentHash: `fnv1a32-${String(index + 1).padStart(8, "0")}`,
      familyId: `${prefix}-family-${index}`,
      partition: "training",
      targetOpportunityCount: count,
      typabilityScore: 0.5,
      difficultyFeatures: { meanWordLength: 5, p90WordLength: 7, punctuationRatio: 0.05 },
    });
    remaining -= count;
    index += 1;
  }
  return units;
}

function planFor(entityType = "bigram", entityKey = entityType === "bigram" ? "th" : "the") {
  const quotas = PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS[entityType];
  return buildPracticeCombinationRepairPlan({
    entityType,
    entityKey,
    targetSource: "manual",
    language: "en",
    corpusBinding: { corpusId: "foundation-en", corpusVersion: 1, indexVersion: 1, manifestHash: "manifest-fixture" },
    phaseUnits: Object.fromEntries(PRACTICE_COMBINATION_REPAIR_PHASES.map((phase) => [phase.id, unitsFor(phase.id, quotas[phase.id], `${phase.id}-${entityType}`)])),
  });
}

function opportunity(correct, residual = 0) {
  return {
    correct,
    timing: [{ latencyClass: "fluent", observedLatencyMs: 100 + residual, residualLatencyMs: residual }],
  };
}

test("PL20 contracts remain intact inside the PL25 DB8/session13/foundation10 envelope and its fixed policy is exactly one PL16 dose", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 10);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10);
  assert.equal(validatePracticeCombinationRepairPolicy().valid, true);
  assert.equal(getPracticeCombinationRepairDoseUnits("bigram"), 1);
  assert.equal(getPracticeCombinationRepairDoseUnits("trigram"), 1);
  assert.deepEqual(PRACTICE_COMBINATION_REPAIR_POLICY_V1.quality.weights, { accuracy: 0.45, speed: 0.4, disfluency: 0.15 });
  assert.equal(PRACTICE_COMBINATION_REPAIR_POLICY_V1.quality.minimumAvailableWeight, 0.6);
  assert.deepEqual(PRACTICE_COMBINATION_REPAIR_POLICY_V1.phases.map(({ id, label, cue }) => ({ id, label, cue })), [
    { id: "entry-probe", label: "Baseline", cue: "none" },
    { id: "acquire", label: "Focus", cue: "strong" },
    { id: "integrate", label: "Context", cue: "subtle" },
    { id: "interleave", label: "Mix", cue: "none" },
    { id: "exit-probe", label: "Check", cue: "none" },
  ]);
});

test("PL20 accepts exactly one canonical lowercase bigram or trigram target", () => {
  assert.deepEqual(normalizePracticeCombinationRepairTarget({ entityType: "bigram", entityKey: "th" }), { entityType: "bigram", entityKey: "th" });
  assert.deepEqual(normalizePracticeCombinationRepairTarget({ entityType: "trigram", entityKey: "the" }), { entityType: "trigram", entityKey: "the" });
  for (const target of [
    { entityType: "key", entityKey: "t" },
    { entityType: "word", entityKey: "the" },
    { entityType: "bigram", entityKey: "TH" },
    { entityType: "bigram", entityKey: "t h" },
    { entityType: "trigram", entityKey: "then" },
  ]) assert.equal(normalizePracticeCombinationRepairTarget(target), null);
});

test("PL20 frozen plans enforce exact phase order, opportunity quotas, training partition and content completion", () => {
  for (const [entityType, total] of [["bigram", 50], ["trigram", 35]]) {
    const plan = planFor(entityType);
    assert.equal(validatePracticeCombinationRepairPlan(plan).valid, true);
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(plan.partition, "training");
    assert.deepEqual(plan.phases.map((phase) => phase.id), PRACTICE_COMBINATION_REPAIR_PHASES.map((phase) => phase.id));
    assert.equal(plan.phases.reduce((sum, phase) => sum + phase.targetOpportunityCount, 0), total);
    assert.equal(new Set(plan.phases[0].units.map((unit) => unit.familyId)).intersection?.(new Set())?.size ?? 0, 0);
    const metadata = createPracticeCombinationRepairContentPlanMetadata(plan);
    assert.deepEqual(metadata.targetEntities, [{ entityType, entityKey: entityType === "bigram" ? "th" : "the", directTarget: true }]);
    assert.equal(metadata.combinationRepair.resumable, false);
    assert.equal(metadata.combinationRepair.completionMode, "content");
  }
});

test("PL20 probe matching is deterministic, opportunity-matched, family-disjoint and bounded by typability/difficulty", () => {
  const entry = { probeId: "entry-b", units: unitsFor("entry-probe", 5, "entry") };
  const exit = { probeId: "exit-b", units: unitsFor("exit-probe", 5, "exit") };
  const match = scorePracticeCombinationRepairProbePair(entry, exit);
  assert.equal(match.valid, true);
  assert.equal(match.opportunityDelta, 0);
  assert.deepEqual(match.familyOverlap, []);
  const selected = selectPracticeCombinationRepairProbePair({ entryCandidates: [entry], exitCandidates: [exit] });
  assert.equal(selected.entry.probeId, "entry-b");
  assert.equal(selected.exit.probeId, "exit-b");
  const overlap = { probeId: "exit-overlap", units: entry.units };
  assert.equal(scorePracticeCombinationRepairProbePair(entry, overlap).valid, false);
});

test("PL20 immediate result reuses shared phase quality and explicitly refuses mastery/retention/transfer/causal claims", () => {
  const entry = [opportunity(false, 30), opportunity(true, 20), opportunity(true, 10), opportunity(true, 10), opportunity(true, 10)];
  const exit = [opportunity(true, 0), opportunity(true, 0), opportunity(true, 0), opportunity(true, 0), opportunity(true, 0)];
  const result = buildPracticeCombinationRepairResult({ entityType: "bigram", entityKey: "th", entryOpportunities: entry, exitOpportunities: exit });
  assert.equal(Number.isFinite(result.entryQuality), true);
  assert.equal(Number.isFinite(result.exitQuality), true);
  assert.equal(result.immediateQualityChange > 0, true);
  assert.equal(result.immediateDirection, "higher-at-check");
  assert.equal(result.interpretation.scope, "same-session-check");
  assert.deepEqual(result.interpretation.doesNotEstablish, ["mastery", "retention", "transfer", "causal-improvement"]);
});

test("PL20 recommendations are deterministic, bounded, canonical and context-isolated", () => {
  const profileId = "practice-profile_123456789";
  const contextId = "practice-context_123456789";
  const stats = [
    { statId: "s1", profileId, contextId, entityType: "bigram", entityKey: "th" },
    { statId: "s2", profileId, contextId, entityType: "trigram", entityKey: "the" },
    { statId: "s3", profileId, contextId, entityType: "word", entityKey: "their" },
  ];
  const limiterSnapshot = { profileId, contextId, candidates: [
    { statId: "s1", status: "confirmed", priorityScore: 80, weaknessScore: 90, evidenceConfidenceScore: 90 },
    { statId: "s2", status: "likely", priorityScore: 60, weaknessScore: 70, evidenceConfidenceScore: 80 },
  ] };
  const masterySnapshot = { profileId, contextId, entities: [
    { statId: "s1", stage: "learning", evidenceSummary: { generalConfidenceScore: 90 } },
    { statId: "s2", stage: "learning", evidenceSummary: { generalConfidenceScore: 80 } },
  ] };
  const first = buildPracticeCombinationRepairRecommendations({ profileId, contextId, skillStats: stats, limiterSnapshot, masterySnapshot });
  const second = buildPracticeCombinationRepairRecommendations({ profileId, contextId, skillStats: [...stats].reverse(), limiterSnapshot, masterySnapshot });
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((entry) => entry.entityKey), ["th", "the"]);
  assert.equal(first.length <= 8, true);
  assert.throws(() => buildPracticeCombinationRepairRecommendations({ profileId, contextId, skillStats: stats, limiterSnapshot: { ...limiterSnapshot, contextId: "other" } }), /context mismatch/);
});

test("PL20 ordinary plan carries no trusted retention, protected evaluation or PL19 assessment purpose", () => {
  const plan = planFor();
  assert.equal(getPracticeTrustedRetentionPurpose(plan), null);
  assert.equal(getPracticeTrustedEvaluationPurpose(plan), null);
  assert.equal(getPracticeTrustedAssessmentBinding(plan), null);
  assert.equal(PRACTICE_COMBINATION_REPAIR_POLICY_V1.completion.timeBased, false);
  assert.equal(PRACTICE_COMBINATION_REPAIR_POLICY_V1.completion.resumable, false);
});
