import test from "node:test";
import assert from "node:assert/strict";
import { buildPracticeRealTextPool, validatePracticeRealTextPool } from "../js/practiceLab/practiceRealTextPool.js";
import { buildPracticeRealTextPlan } from "../js/practiceLab/practiceRealTextPlan.js";
import { getRealTextPracticeAvailability } from "../js/practiceLab/practiceRealTextAvailability.js";

function fixture(count = 16) {
  const corpusChecksum = "sha256-corpus-fixture";
  const indexChecksum = "sha256-index-fixture";
  const sourceId = "source-approved";
  const items = [];
  const indexItems = [];
  const typabilityItems = [];
  for (let i = 0; i < count; i += 1) {
    const contentId = `practice-fixture-realtext-${String(i + 1).padStart(2, "0")}`;
    const familyId = `family-${String(i + 1).padStart(2, "0")}`;
    const contentHash = `sha256-fixture-${i + 1}`;
    const graphemeCount = 1600;
    const wordCount = 220;
    items.push({ contentId, familyId, sourceId, contentType: "passage", partition: "training", language: "en", contentHash, reviewStatus: "approved", text: "x".repeat(graphemeCount) });
    indexItems.push({ contentId, familyId, sourceId, contentType: "passage", partition: "training", language: "en", contentHash, graphemeCount, wordCount, digitCount: 0, punctuationCount: 20 });
    typabilityItems.push({
      contentId, contentHash, partition: "training",
      features: { nonWhitespaceGraphemeCount: 1500, digitRatio: 0, symbolRatio: 0 },
      textDifficulty: { difficultyIndex: i / 100, relativeDifficultyPercentile: 20 + (i % 7) * 10, availableModelWeight: 0.95 },
    });
  }
  return {
    trainingCorpus: { corpusId: "practice-fixture-en-v1", corpusVersion: 1, language: "en", partition: "training", items },
    corpusManifest: { corpusId: "practice-fixture-en-v1", corpusVersion: 1, buildChecksum: corpusChecksum },
    indexContent: { corpusId: "practice-fixture-en-v1", corpusVersion: 1, corpusChecksum, language: "en", partition: "training", items: indexItems },
    indexManifest: { indexSchemaVersion: 1, indexChecksum, corpusChecksum },
    typabilityArtifact: { corpusId: "practice-fixture-en-v1", corpusVersion: 1, corpusChecksum, partition: "training", items: typabilityItems },
    typabilityManifest: { corpusChecksum, indexChecksum, modelVersion: 1, featureVersion: 1, referenceVersion: 1, referenceChecksum: "sha256-reference", artifactChecksums: [{ path: "training.json", sha256: "sha256-training-model" }] },
    sourceRegistry: { sources: [{ sourceId, usageApproval: "practice-display-approved" }] },
  };
}

test("PL24 pool build is deterministic, target-blind, family-unique, and ready only with sufficient approved natural text", () => {
  const input = fixture();
  const a = buildPracticeRealTextPool(input);
  const b = buildPracticeRealTextPool({ ...input, trainingCorpus: { ...input.trainingCorpus, items: [...input.trainingCorpus.items].reverse() } });
  assert.deepEqual(a, b);
  assert.equal(a.status, "ready");
  assert.equal(a.units.length, 16);
  assert.equal(new Set(a.units.flatMap((unit) => unit.familyIds)).size, 16);
  assert.equal(validatePracticeRealTextPool(a).valid, true);
  assert.equal(JSON.stringify(a).includes("target"), false);
  assert.equal(JSON.stringify(a).includes("limiter"), false);
  assert.equal(JSON.stringify(a).includes("mastery"), false);
  assert.equal(JSON.stringify(a).includes("learningState"), false);
});

test("PL24 pool checksum/version binding fails closed when corpus/index/model provenance changes", () => {
  const input = fixture();
  const pool = buildPracticeRealTextPool(input);
  const stale = structuredClone(pool);
  stale.indexBinding.indexChecksum = "sha256-changed-index";
  assert.equal(validatePracticeRealTextPool(stale).valid, false);
  const changed = buildPracticeRealTextPool({ ...input, typabilityManifest: { ...input.typabilityManifest, referenceChecksum: "sha256-new-reference" } });
  assert.notEqual(changed.checksum, pool.checksum);
});

test("PL24 duration availability reports 3/5/10 independently from actual target-blind capacity", () => {
  const pool = buildPracticeRealTextPool(fixture());
  const availability = getRealTextPracticeAvailability({ pool, language: "en" });
  assert.equal(availability.status, "ready");
  assert.deepEqual(availability.supportedDurationsMs, [180000, 300000, 600000]);
  const smaller = buildPracticeRealTextPool(fixture(7));
  assert.equal(smaller.status, "draft");
});

test("PL24 plan selects deterministic target-free unique-family bundles and rotates with session ID", () => {
  const pool = buildPracticeRealTextPool(fixture());
  const base = { profileId: "practice-profile_fixture-12345678", contextId: "practice-context_fixture-12345678", language: "en", durationMs: 300000, pool };
  const first = buildPracticeRealTextPlan({ ...base, sessionId: "practice-session_fixture-one-12345678" });
  const same = buildPracticeRealTextPlan({ ...base, sessionId: "practice-session_fixture-one-12345678" });
  const rotated = buildPracticeRealTextPlan({ ...base, sessionId: "practice-session_fixture-two-12345678" });
  assert.deepEqual(first, same);
  assert.deepEqual(first.targetEntities, []);
  assert.equal(first.requiredGraphemes, 11000);
  assert.ok(first.selectedGraphemeCapacity >= 11000);
  assert.equal(new Set(first.selectedUnits.flatMap((unit) => unit.familyIds)).size, first.selectedUnits.length);
  assert.notDeepEqual(first.selectedUnits.map((unit) => unit.unitId), rotated.selectedUnits.map((unit) => unit.unitId));
});

test("PL24 plan result is invariant to unrelated skill-model objects because they are not permitted inputs", () => {
  const pool = buildPracticeRealTextPool(fixture());
  const allowed = { sessionId: "practice-session_targetblind-12345678", profileId: "practice-profile_fixture-12345678", contextId: "practice-context_fixture-12345678", language: "en", durationMs: 180000, pool };
  const first = buildPracticeRealTextPlan(allowed);
  const changedExternalModels = { skillStats: [{ entityKey: "br" }], limiterSnapshot: { primary: "br" }, masterySnapshot: { stage: "Learning" }, learningState: { saturationStatus: "supported" } };
  const second = buildPracticeRealTextPlan({ ...allowed, ignored: changedExternalModels });
  assert.deepEqual(first, second);
});
