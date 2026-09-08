import test from "node:test";
import assert from "node:assert/strict";
import { analyzePracticeText } from "../js/practiceLab/practiceTextAnalysis.js";
import { hashPracticeContent } from "../js/practiceLab/practiceIds.js";
import { buildPracticeAccuracyRecoveryTrainingPlan } from "../js/practiceLab/practiceAccuracyRecoveryGenerator.js";
import { trustPracticeAccuracyRecoveryContentPlan } from "../js/practiceLab/practiceAccuracyRecoveryTrust.js";
import { resolvePracticeTrustedLearningPhaseBounds } from "../js/practiceLab/practiceLearningObservation.js";

const TARGET_WORDS = ["echo","east","edit","gear","pear","fear","near","wear","meat","lean","late","fine","rope","hope","tape","same","dome"];
const NEUTRAL_WORDS = ["calm","soft","kind","bold","dark","loud","warm","pink","fast","slow","tall","thin","tiny","vast","cool","fair","mild"];
const CONTEXT = Object.freeze({ contextId: "practice-context_pl23-generator", fingerprint: "pl23-generator-fingerprint", dataLocale: "en", keyboardLayout: "custom-layout", inputMethod: "physical-keyboard", hardwareProfileId: null });
const CORPUS = Object.freeze({ corpusId: "practice-pl23-fixture", corpusVersion: 1, indexVersion: 1, manifestHash: "fixture-manifest" });

function fixture() {
  const contentItems = []; const annotations = new Map(); const targetRefs = []; const wordSummaries = new Map(); const calls = [];
  TARGET_WORDS.forEach((word, index) => {
    const text = `${word} ${NEUTRAL_WORDS[index]}`; const contentId = `pl23-${index}`; const familyId = `pl23-family-${index}`; const contentHash = hashPracticeContent(text); const analysis = analyzePracticeText({ text, language: "en" }); const occurrence = analysis.keyOccurrences.find((entry) => entry.target === "e"); assert.ok(occurrence); const targetWord = analysis.words.find((entry) => entry.lexicalKey === word); const content = Object.freeze({ contentId, familyId, sourceId: `source-${index}`, language: "en", corpusVersion: 1, partition: "training", contentType: "sentence", text, contentHash, reviewStatus: "approved", metadata: {} }); contentItems.push(content); annotations.set(contentId, Object.freeze({ ...analysis, contentId, familyId, sourceId: content.sourceId, corpusId: CORPUS.corpusId, corpusVersion: 1, partition: "training", contentHash })); targetRefs.push(Object.freeze({ contentId, familyId, count: 1, positions: [occurrence.startIndex] })); wordSummaries.set(word, Object.freeze({ entityType: "word", entityKey: word, lexicalKey: word, contents: [Object.freeze({ contentId, familyId, count: 1, positions: [targetWord.startIndex] })] }));
  });
  const targetIndex = Object.freeze({
    async getTargetContentRefs(query) { calls.push(query); assert.equal(query.partition, "training"); assert.equal(query.purpose, "training"); return targetRefs; },
    async getTargetWordRefs(query) { calls.push(query); assert.equal(query.partition, "training"); assert.equal(query.purpose, "training"); return TARGET_WORDS; },
    async getWordSummary({ partition, lexicalKey, purpose }) { calls.push({ partition, purpose }); assert.equal(partition, "training"); assert.equal(purpose, "training"); return wordSummaries.get(lexicalKey) ?? null; },
    async getContentAnnotations({ partition, contentId, purpose, content }) { calls.push({ partition, purpose }); assert.equal(partition, "training"); assert.equal(purpose, "training"); const value = annotations.get(contentId); assert.equal(content?.contentHash, value.contentHash); return value; },
  });
  return { contentItems, targetIndex, calls };
}

async function build(sessionId, data) { return buildPracticeAccuracyRecoveryTrainingPlan({ sessionId, context: CONTEXT, targetIndex: data.targetIndex, contentItems: data.contentItems, corpusBinding: CORPUS, entityType: "key", entityKey: "e", manualType: "key", targetSource: "manual", language: "en" }); }

test("PL23 key adapter preserves exact 8/24/20/20/8 dose and remaps cues without changing content semantics", async () => {
  const data = fixture(); const prepared = await build("practice-session_pl23-a", data); const { plan, contentPlan } = prepared;
  assert.equal(plan.targetOpportunityBudget, 80);
  assert.deepEqual(plan.phases.map((phase) => phase.opportunityQuota), [8,24,20,20,8]);
  assert.deepEqual(plan.phases.map((phase) => phase.id), ["baseline","control","repair","mix","check"]);
  assert.deepEqual(plan.phases.map((phase) => phase.cue), ["none","subtle","subtle","none","none"]);
  assert.deepEqual(contentPlan.metadata.accuracyRecovery.phaseRanges.map((phase) => phase.targetRanges.length), [8,24,20,20,8]);
  assert.equal(contentPlan.metadata.partition, "training");
  assert.deepEqual(contentPlan.targetEntities, [{ entityType: "key", entityKey: "e", directTarget: true }]);
  assert.equal(data.calls.every((query) => query.partition === "training" && query.purpose === "training"), true);
  trustPracticeAccuracyRecoveryContentPlan(contentPlan, plan);
  assert.deepEqual(resolvePracticeTrustedLearningPhaseBounds(contentPlan), { kind: "trusted-intervention", entry: { phaseId: "baseline", startIndex: contentPlan.metadata.accuracyRecovery.phaseRanges[0].startIndex, endIndex: contentPlan.metadata.accuracyRecovery.phaseRanges[0].endIndex }, exit: { phaseId: "check", startIndex: contentPlan.metadata.accuracyRecovery.phaseRanges[4].startIndex, endIndex: contentPlan.metadata.accuracyRecovery.phaseRanges[4].endIndex } });
});

test("PL23 plan is deterministic for one session and rotates with a new session id", async () => {
  const data = fixture(); const first = await build("practice-session_pl23-fixed", data); const second = await build("practice-session_pl23-fixed", data); const rotated = await build("practice-session_pl23-rotated", data);
  assert.deepEqual(first.plan, second.plan);
  assert.equal(first.plan.planHash, second.plan.planHash);
  assert.notEqual(rotated.plan.planHash, first.plan.planHash);
  assert.notEqual(rotated.contentPlan.contentHash, first.contentPlan.contentHash);
});
