import test from "node:test";
import assert from "node:assert/strict";
import { analyzePracticeText } from "../js/practiceLab/practiceTextAnalysis.js";
import { hashPracticeContent } from "../js/practiceLab/practiceIds.js";
import {
  buildPracticeWeakKeysContentPlan,
  buildPracticeWeakKeysTrainingPlan,
  inspectPracticeWeakKeysAvailability,
} from "../js/practiceLab/practiceWeakKeysGenerator.js";

const TARGET_WORDS = Object.freeze([
  "echo", "east", "edit",
  "gear", "pear", "fear", "near", "wear", "meat", "lean",
  "late", "fine", "rope", "hope", "tape", "same", "dome",
]);
const NEUTRAL_WORDS = Object.freeze([
  "calm", "soft", "kind", "bold", "dark", "loud", "warm", "pink", "fast",
  "slow", "tall", "thin", "tiny", "vast", "cool", "fair", "mild",
]);

const CONTEXT = Object.freeze({
  contextId: "practice-context_pl21-generator-fixture",
  fingerprint: "pl21-generator-fixture-fingerprint",
  dataLocale: "en",
  keyboardLayout: "custom-layout",
  inputMethod: "physical-keyboard",
  hardwareProfileId: null,
});
const CORPUS_BINDING = Object.freeze({
  corpusId: "practice-pl21-generator-fixture",
  corpusVersion: 1,
  indexVersion: 1,
  manifestHash: "fixture-manifest",
});

function buildFixture() {
  const contentItems = [];
  const annotations = new Map();
  const targetRefs = [];
  const wordSummaries = new Map();

  TARGET_WORDS.forEach((targetWord, index) => {
    const neutralWord = NEUTRAL_WORDS[index];
    const text = `${targetWord} ${neutralWord}`;
    const contentId = `practice-pl21-generator-${String(index + 1).padStart(2, "0")}`;
    const familyId = `practice-pl21-family-${String(index + 1).padStart(2, "0")}`;
    const contentHash = hashPracticeContent(text);
    const analysis = analyzePracticeText({ text, language: "en" });
    const targetOccurrences = analysis.keyOccurrences.filter((occurrence) => occurrence.target === "e");
    assert.equal(targetOccurrences.length, 1, `${targetWord} must contain one lowercase e`);
    const targetUnit = analysis.words.find((word) => word.lexicalKey === targetWord);
    assert.ok(targetUnit);
    const content = Object.freeze({
      contentId,
      familyId,
      sourceId: `source-${index + 1}`,
      language: "en",
      corpusVersion: 1,
      partition: "training",
      contentType: "sentence",
      text,
      contentHash,
      reviewStatus: "approved",
      metadata: { tags: ["fixture"] },
    });
    contentItems.push(content);
    annotations.set(contentId, Object.freeze({
      ...analysis,
      contentId,
      familyId,
      sourceId: content.sourceId,
      corpusId: CORPUS_BINDING.corpusId,
      corpusVersion: 1,
      partition: "training",
      contentHash,
    }));
    targetRefs.push(Object.freeze({
      contentId,
      familyId,
      count: 1,
      positions: Object.freeze([targetOccurrences[0].startIndex]),
    }));
    wordSummaries.set(targetWord, Object.freeze({
      entityType: "word",
      entityKey: targetWord,
      lexicalKey: targetWord,
      contents: Object.freeze([Object.freeze({
        contentId,
        familyId,
        count: 1,
        positions: Object.freeze([targetUnit.startIndex]),
      })]),
    }));
  });

  const calls = [];
  const targetIndex = Object.freeze({
    async getTargetContentRefs(query) {
      calls.push(["target-content", { ...query }]);
      assert.equal(query.partition, "training");
      assert.equal(query.purpose, "training");
      assert.equal(query.entityType, "key");
      assert.equal(query.entityKey, "e");
      return Object.freeze(targetRefs);
    },
    async getTargetWordRefs(query) {
      calls.push(["target-words", { ...query }]);
      assert.equal(query.partition, "training");
      assert.equal(query.purpose, "training");
      assert.equal(query.entityType, "key");
      assert.equal(query.entityKey, "e");
      return TARGET_WORDS;
    },
    async getWordSummary({ partition, lexicalKey, purpose }) {
      calls.push(["word-summary", { partition, lexicalKey, purpose }]);
      assert.equal(partition, "training");
      assert.equal(purpose, "training");
      return wordSummaries.get(lexicalKey) ?? null;
    },
    async getContentAnnotations({ partition, contentId, purpose, content }) {
      calls.push(["annotations", { partition, contentId, purpose }]);
      assert.equal(partition, "training");
      assert.equal(purpose, "training");
      const annotation = annotations.get(contentId);
      assert.ok(annotation);
      assert.equal(content?.contentHash, annotation.contentHash);
      assert.equal(content?.familyId, annotation.familyId);
      return annotation;
    },
  });
  return Object.freeze({ contentItems: Object.freeze(contentItems), targetIndex, calls });
}

async function build(sessionId, fixture) {
  return buildPracticeWeakKeysTrainingPlan({
    sessionId,
    context: CONTEXT,
    targetIndex: fixture.targetIndex,
    contentItems: fixture.contentItems,
    corpusBinding: CORPUS_BINDING,
    entityKey: "e",
    targetSource: "manual",
    language: "en",
  });
}

test("PL21 full generator builds the exact 80-opportunity training-only protocol from PL7-style indexed evidence", async () => {
  const fixture = buildFixture();
  const plan = await build("practice-session_pl21-generator-a", fixture);
  assert.deepEqual(plan.phases.map((phase) => phase.targetOpportunityCount), [8, 24, 20, 20, 8]);
  assert.equal(plan.targetOpportunityBudget, 80);
  assert.equal(plan.phases.reduce((sum, phase) => sum + phase.targetOpportunityCount, 0), 80);
  assert.equal(plan.phases.every((phase) => phase.units.every((unit) => unit.partition === "training")), true);
  assert.deepEqual(plan.phaseBoundaries.map((phase) => [phase.targetOpportunityStart, phase.targetOpportunityEnd]), [[0, 8], [8, 32], [32, 52], [52, 72], [72, 80]]);
  assert.equal(plan.contextBinding.contextId, CONTEXT.contextId);
  assert.equal(plan.contextBinding.fingerprint, CONTEXT.fingerprint);

  const entryFamilies = new Set(plan.phases[0].units.flatMap((unit) => unit.familyId ? [unit.familyId] : unit.sourceFamilyIds));
  const exitFamilies = new Set(plan.phases[4].units.flatMap((unit) => unit.familyId ? [unit.familyId] : unit.sourceFamilyIds));
  assert.equal([...entryFamilies].some((familyId) => exitFamilies.has(familyId)), false);

  const contextPhase = plan.phases[2];
  const contextClasses = new Set(contextPhase.units.flatMap((unit) => Object.entries(unit.positionCounts ?? {}).filter(([, count]) => count > 0).map(([name]) => name)));
  assert.ok(contextClasses.size >= 2, "Context must retain the available word-position diversity");

  const mix = plan.phases[3];
  assert.ok(mix.units.some((unit) => unit.targetOpportunityCount > 0));
  assert.ok(mix.units.some((unit) => unit.targetOpportunityCount === 0));
  const neutral = mix.units.filter((unit) => unit.targetOpportunityCount === 0);
  assert.ok(neutral.length > 0);
  assert.ok(neutral.every((unit) => unit.kind === "generated-word-sequence"), "all corpus items contain e, so Mix must use the safe generated neutral fallback");
  assert.ok(neutral.every((unit) => unit.wordKeys.every((word) => !word.includes("e"))));
  assert.ok(new Set(neutral.flatMap((unit) => unit.wordKeys)).size >= 6);

  const contentPlan = buildPracticeWeakKeysContentPlan({ plan, contentItems: fixture.contentItems });
  assert.equal(contentPlan.metadata.partition, "training");
  assert.equal(contentPlan.targetEntities.length, 1);
  assert.deepEqual(contentPlan.targetEntities[0], { entityType: "key", entityKey: "e", directTarget: true });
  assert.deepEqual(contentPlan.metadata.weakKeys.phaseRanges.map((phase) => phase.targetPositions.length), [8, 24, 20, 20, 8]);
  assert.equal(fixture.calls.every(([, query]) => query.partition === "training" && query.purpose === "training"), true);
});

test("PL21 full generator is deterministic for the same session and rotates ordered practice material for a new session", async () => {
  const fixture = buildFixture();
  const first = await build("practice-session_pl21-generator-fixed", fixture);
  const second = await build("practice-session_pl21-generator-fixed", fixture);
  assert.deepEqual(first, second);
  assert.equal(first.planHash, second.planHash);

  const rotated = await build("practice-session_pl21-generator-rotated", fixture);
  assert.notEqual(rotated.planHash, first.planHash);
  const firstFocus = first.phases[1].units.map((unit) => unit.wordKeys?.[0] ?? unit.candidateId);
  const rotatedFocus = rotated.phases[1].units.map((unit) => unit.wordKeys?.[0] ?? unit.candidateId);
  assert.notDeepEqual(rotatedFocus, firstFocus, "a new session ID should rotate deterministic Focus ordering where alternatives exist");
});

test("PL21 availability reports the full indexed fixture ready without protected fallback", async () => {
  const fixture = buildFixture();
  const availability = await inspectPracticeWeakKeysAvailability({
    sessionId: "practice-session_pl21-generator-availability",
    context: CONTEXT,
    targetIndex: fixture.targetIndex,
    contentItems: fixture.contentItems,
    entityKey: "e",
    language: "en",
  });
  assert.equal(availability.status, "ready");
  assert.equal(availability.eligible, true);
  assert.equal(availability.trainingEvidence.targetWordCount, TARGET_WORDS.length);
  assert.ok(availability.contextCoverage.neutralLexicalCount >= 6);
  assert.equal(fixture.calls.every(([, query]) => query.partition === "training" && query.purpose === "training"), true);
});
