import test from "node:test";
import assert from "node:assert/strict";

import {
  PRACTICE_WEAKNESS_BOSS_PHASES,
  PRACTICE_WEAKNESS_BOSS_QUOTAS,
  PRACTICE_WEAKNESS_BOSS_VERSION,
  PRACTICE_WEAKNESS_BOSS_POLICY_VERSION,
  PRACTICE_WEAKNESS_BOSS_GENERATOR_VERSION,
  PRACTICE_WEAKNESS_BOSS_PROBE_VERSION,
  PRACTICE_WEAKNESS_BOSS_GAMEPLAY_VERSION,
} from "../js/practiceLab/practiceWeaknessBossConstants.js";
import {
  buildPracticeWeaknessBossCandidates,
  calculatePracticeWeaknessBossTargetUtility,
} from "../js/practiceLab/practiceWeaknessBossSelection.js";
import {
  createPracticeWeaknessBossGameplayState,
  advancePracticeWeaknessBossOpportunity,
} from "../js/practiceLab/practiceWeaknessBossGameplay.js";
import { analyzePracticeWeaknessBossResult } from "../js/practiceLab/practiceWeaknessBossAnalyzer.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";
import { resolvePracticeTreatmentIdentity } from "../js/practiceLab/practiceTreatmentRegistry.js";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS } from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";

const candidate = (patch = {}) => ({
  statId: "skill:key:e",
  entityType: "key",
  entityKey: "e",
  status: "confirmed",
  primaryPhenotype: "slow",
  weaknessScore: 90,
  priorityScore: 80,
  impact: { impactScore: 75 },
  hierarchy: { status: "independent" },
  evidenceMetadata: { primaryDimensionConfidenceScore: 0.9 },
  ...patch,
});
const mastery = (patch = {}) => ({ stage: "learning", ...patch });
const learning = (patch = {}) => ({ saturation: { status: "not-detected" }, acquisition: { marginalGainStatus: "high" }, ...patch });

function repeatPhase(state, entityType, phaseId, hitFactory = () => "clean-hit") {
  const quota = PRACTICE_WEAKNESS_BOSS_QUOTAS[entityType][phaseId];
  let next = state;
  for (let index = 0; index < quota; index += 1) next = advancePracticeWeaknessBossOpportunity(next, { phaseId, hitState: hitFactory(index), targetOpportunity: true });
  return next;
}

test("PL37 exact phase order and fixed-dose quotas are frozen", () => {
  assert.deepEqual(PRACTICE_WEAKNESS_BOSS_PHASES.map((phase) => phase.id), ["opening-probe", "break-guard", "pressure", "final-form", "final-probe"]);
  assert.deepEqual(PRACTICE_WEAKNESS_BOSS_QUOTAS.key, { "opening-probe": 8, "break-guard": 24, pressure: 32, "final-form": 24, "final-probe": 8, battle: 80, total: 96 });
  assert.deepEqual(PRACTICE_WEAKNESS_BOSS_QUOTAS.bigram, { "opening-probe": 5, "break-guard": 15, pressure: 20, "final-form": 15, "final-probe": 5, battle: 50, total: 60 });
  assert.deepEqual(PRACTICE_WEAKNESS_BOSS_QUOTAS.trigram, { "opening-probe": 4, "break-guard": 10, pressure: 15, "final-form": 10, "final-probe": 4, battle: 35, total: 43 });
  assert.deepEqual(PRACTICE_WEAKNESS_BOSS_QUOTAS.word, { "opening-probe": 3, "break-guard": 4, pressure: 7, "final-form": 4, "final-probe": 3, battle: 15, total: 21 });
});

test("PL37 Boss utility uses PL12 need plus mastery and learning headroom without readiness or response modifiers", () => {
  const result = calculatePracticeWeaknessBossTargetUtility({ candidate: candidate(), mastery: mastery(), learning: learning() });
  assert.equal(result.baseNeed, 80);
  assert.equal(result.masteryModifier, 1);
  assert.equal(result.saturationModifier, 1);
  assert.equal(result.marginalGainModifier, 1);
  assert.equal(result.bossTargetUtility, 80);
  assert.equal("readinessModifier" in result, false);
  assert.equal("treatmentResponseModifier" in result, false);
});

test("PL37 candidate gates exclude non-PL12 targets, explained hierarchy, stable anchors, saturated targets, low utility, and missing content", () => {
  const candidates = [
    candidate(),
    candidate({ statId: "skill:key:a", entityKey: "a", status: "watch" }),
    candidate({ statId: "skill:key:b", entityKey: "b", hierarchy: { status: "explained" } }),
    candidate({ statId: "skill:physical-key:c", entityType: "physical-key", entityKey: "KeyC" }),
    candidate({ statId: "skill:key:d", entityKey: "d", priorityScore: 30 }),
    candidate({ statId: "skill:key:f", entityKey: "f", priorityScore: 95 }),
    candidate({ statId: "skill:key:g", entityKey: "g", priorityScore: 95 }),
  ];
  const masteryByStat = new Map(candidates.map((entry) => [entry.statId, mastery()]));
  masteryByStat.set("skill:key:f", mastery({ anchorEligibility: { stableAnchor: true } }));
  const learningByStat = new Map(candidates.map((entry) => [entry.statId, learning()]));
  learningByStat.set("skill:key:g", learning({ saturation: { status: "supported" } }));
  const contentReadyByStat = new Map(candidates.map((entry) => [entry.statId, true]));
  contentReadyByStat.set("skill:key:d", false);
  const result = buildPracticeWeaknessBossCandidates({ limiterSnapshot: { candidates }, masteryByStat, learningByStat, contentReadyByStat });
  assert.deepEqual(result.map((entry) => entry.statId), ["skill:key:e"]);
  assert.equal(result[0].bossTheme.name, "The Anchor");
});

test("PL37 deterministic tie break is utility then priority, impact, confidence, entity type, and entity key", () => {
  const items = [
    candidate({ statId: "w", entityType: "word", entityKey: "there", priorityScore: 80, impact: { impactScore: 70 }, evidenceMetadata: { primaryDimensionConfidenceScore: 0.8 } }),
    candidate({ statId: "b", entityType: "bigram", entityKey: "th", priorityScore: 80, impact: { impactScore: 70 }, evidenceMetadata: { primaryDimensionConfidenceScore: 0.8 } }),
    candidate({ statId: "k2", entityType: "key", entityKey: "t", priorityScore: 80, impact: { impactScore: 70 }, evidenceMetadata: { primaryDimensionConfidenceScore: 0.8 } }),
    candidate({ statId: "k1", entityType: "key", entityKey: "e", priorityScore: 80, impact: { impactScore: 70 }, evidenceMetadata: { primaryDimensionConfidenceScore: 0.8 } }),
  ];
  const masteryByStat = new Map(items.map((entry) => [entry.statId, mastery()]));
  const learningByStat = new Map(items.map((entry) => [entry.statId, learning()]));
  const contentReadyByStat = new Map(items.map((entry) => [entry.statId, true]));
  const result = buildPracticeWeaknessBossCandidates({ limiterSnapshot: { candidates: items }, masteryByStat, learningByStat, contentReadyByStat });
  assert.deepEqual(result.map((entry) => entry.statId), ["k1", "k2", "b", "w"]);
});

test("PL37 HP is protocol progress only and hit outcome cannot change damage", () => {
  let clean = createPracticeWeaknessBossGameplayState({ entityType: "key" });
  let mixed = createPracticeWeaknessBossGameplayState({ entityType: "key" });
  clean = repeatPhase(clean, "key", "opening-probe");
  mixed = repeatPhase(mixed, "key", "opening-probe", (index) => index % 2 ? "unresolved-hit" : "recovered-hit");
  assert.equal(clean.bossHp, 100);
  assert.equal(mixed.bossHp, 100);
  for (const phaseId of ["break-guard", "pressure", "final-form"]) {
    clean = repeatPhase(clean, "key", phaseId);
    mixed = repeatPhase(mixed, "key", phaseId, (index) => ["clean-hit", "recovered-hit", "unresolved-hit"][index % 3]);
    assert.equal(clean.bossHp, mixed.bossHp);
  }
  assert.equal(Math.round(clean.bossHp), 10);
  clean = repeatPhase(clean, "key", "final-probe");
  mixed = repeatPhase(mixed, "key", "final-probe", () => "unresolved-hit");
  assert.equal(clean.bossHp, 0);
  assert.equal(mixed.bossHp, 0);
  assert.equal(clean.defeated, true);
  assert.equal(mixed.defeated, true);
});

test("PL37 result reports same-session delta without mastery claim", () => {
  const plan = {
    target: { entityType: "key", statId: "skill:key:e", entityKey: "e" },
    bossTheme: { id: "anchor", name: "The Anchor" },
    acquisitionDose: { opportunities: 80 },
  };
  const result = analyzePracticeWeaknessBossResult({
    plan,
    completed: true,
    gameplay: { defeated: true, battle: { targetOpportunityCount: 80, cleanHitCount: 72, recoveredHitCount: 5, unresolvedHitCount: 3, maxCleanTargetStreak: 14 } },
    openingProbe: { quality: 55, qualityCoverage: 0.8, opportunityCount: 8, firstPassAccuracy: 0.75 },
    finalProbe: { quality: 64, qualityCoverage: 0.8, opportunityCount: 8, firstPassAccuracy: 0.875 },
  });
  assert.equal(result.clearStatus, "defeated");
  assert.equal(result.immediateQualityDelta, 9);
  assert.equal(result.immediateQualityDeltaLabel, "Final probe vs opening probe in this encounter.");
  assert.equal(result.masteryClaim, false);
  assert.equal(result.battle.battleFirstPassAccuracy, 0.9);
});

test("PL37 is a distinct advanced catalog experiment and PL32 targeted family excludes cosmetic theme", () => {
  const catalog = getPracticeExperiment("weakness-boss");
  assert.equal(catalog?.category, "advanced");
  assert.equal(catalog?.status, "preview");
  const configuration = {
    weaknessBossVersion: PRACTICE_WEAKNESS_BOSS_VERSION,
    policyVersion: PRACTICE_WEAKNESS_BOSS_POLICY_VERSION,
    generatorVersion: PRACTICE_WEAKNESS_BOSS_GENERATOR_VERSION,
    probeVersion: PRACTICE_WEAKNESS_BOSS_PROBE_VERSION,
    gameplayVersion: PRACTICE_WEAKNESS_BOSS_GAMEPLAY_VERSION,
  };
  const base = { experiment: { id: "weakness-boss", version: 1 }, configuration };
  const one = resolvePracticeTreatmentIdentity({ ...base, contentPlan: { targetEntities: [{ entityType: "key", entityKey: "e", directTarget: true }], metadata: { weaknessBoss: { bossTheme: { id: "anchor" } } } } });
  const two = resolvePracticeTreatmentIdentity({ ...base, contentPlan: { targetEntities: [{ entityType: "key", entityKey: "e", directTarget: true }], metadata: { weaknessBoss: { bossTheme: { id: "chimera" } } } } });
  assert.equal(one.treatmentClass, "targeted");
  assert.equal(one.protocolVariant, "one-boss-dose-v1");
  assert.equal(one.treatmentFamilyKey, two.treatmentFamilyKey);
  assert.equal(one.protocolFingerprint, two.protocolFingerprint);
});

test("PL37 preserves frozen storage, session record, and foundation versions", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 11);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10);
});
