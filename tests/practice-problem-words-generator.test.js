import test from "node:test";
import assert from "node:assert/strict";
import { analyzePracticeText } from "../js/practiceLab/practiceTextAnalysis.js";
import { hashPracticeContent } from "../js/practiceLab/practiceIds.js";
import {
  buildPracticeProblemWordsContentPlan,
  buildPracticeProblemWordsTrainingPlan,
  inspectPracticeProblemWordsAvailability,
} from "../js/practiceLab/practiceProblemWordsGenerator.js";

const TEXTS = Object.freeze([
  "calm river paths stay open because tiny birds move softly today",
  "bright garden lamps remain useful because gentle winds arrive after sunset",
  "quiet market streets feel peaceful because local shops close before midnight",
  "small wooden boats move slowly because steady currents shape their route",
  "warm morning light fills windows because clear skies follow the rain",
  "patient students review notes because careful practice builds lasting habits",
  "friendly neighbors share stories because ordinary evenings bring people together",
  "fresh mountain air feels cool because distant clouds cover the valley",
  "simple kitchen tools work well because clean surfaces make cooking easier",
  "young forest trees grow tall because regular rainfall keeps the soil healthy",
  "soft library chairs feel comfortable because readers often stay for hours",
  "early village trains run quietly because most travelers board before sunrise",
  "wide coastal roads stay clear because traffic remains light during winter",
  "green public parks look lively because families gather there every weekend",
]);

const CONTEXT = Object.freeze({
  contextId: "practice-context_pl22-generator-fixture",
  fingerprint: "pl22-generator-fixture-fingerprint",
  dataLocale: "en",
  keyboardLayout: "qwerty",
  inputMethod: "physical-keyboard",
  hardwareProfileId: null,
});
const CORPUS_BINDING = Object.freeze({
  corpusId: "practice-pl22-generator-fixture",
  corpusVersion: 1,
  indexVersion: 1,
  manifestHash: "fixture-manifest",
});

function buildFixture() {
  const contentItems = [];
  const annotations = new Map();
  const refs = [];
  TEXTS.forEach((text, index) => {
    const contentId = `practice-pl22-generator-${String(index + 1).padStart(2, "0")}`;
    const familyId = `practice-pl22-family-${String(index + 1).padStart(2, "0")}`;
    const contentHash = hashPracticeContent(text);
    const analysis = analyzePracticeText({ text, language: "en" });
    const targetWords = analysis.words.filter((word) => word.lexicalKey === "because");
    assert.equal(targetWords.length, 1);
    assert.equal(targetWords[0].surfaceText, "because");
    const content = Object.freeze({
      contentId, familyId, sourceId: `source-${index + 1}`, language: "en", corpusVersion: 1,
      partition: "training", contentType: "sentence", text, contentHash, reviewStatus: "approved", metadata: { tags: ["fixture"] },
    });
    contentItems.push(content);
    annotations.set(contentId, Object.freeze({ ...analysis, contentId, familyId, sourceId: content.sourceId, corpusId: CORPUS_BINDING.corpusId, corpusVersion: 1, partition: "training", contentHash }));
    refs.push(Object.freeze({ contentId, familyId, count: 1, positions: Object.freeze([targetWords[0].startIndex]) }));
  });
  const calls = [];
  const targetIndex = Object.freeze({
    async getWordSummary({ partition, lexicalKey, purpose }) {
      calls.push(["word-summary", { partition, lexicalKey, purpose }]);
      assert.equal(partition, "training");
      assert.equal(purpose, "training");
      if (lexicalKey !== "because") return null;
      return Object.freeze({ entityType: "word", entityKey: "because", lexicalKey: "because", contents: Object.freeze(refs) });
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
  return buildPracticeProblemWordsTrainingPlan({
    sessionId, context: CONTEXT, targetIndex: fixture.targetIndex, contentItems: fixture.contentItems,
    corpusBinding: CORPUS_BINDING, entityKey: "because", targetSource: "manual", language: "en",
  });
}

function sourceFamilies(units) {
  return new Set(units.flatMap((unit) => [unit.familyId, ...(unit.sourceFamilyIds ?? [])]).filter(Boolean));
}

test("PL22 generator builds exact 3/4/3/2/3 training-only lexical dose", async () => {
  const fixture = buildFixture();
  const plan = await build("practice-session_pl22-generator-a", fixture);
  assert.deepEqual(plan.phases.map((phase) => phase.opportunityQuota), [3, 4, 3, 2, 3]);
  assert.equal(plan.phases.flatMap((phase) => phase.units).reduce((sum, unit) => sum + unit.targetOpportunityCount, 0), 15);
  assert.equal(plan.targetOpportunityBudget, 15);
  assert.deepEqual(plan.target, { entityType: "word", entityKey: "because" });
  assert.equal(plan.partition, "training");
  assert.equal(plan.phases.every((phase) => phase.units.every((unit) => unit.partition === "training")), true);

  const entryFamilies = sourceFamilies(plan.phases[0].units);
  const exitFamilies = sourceFamilies(plan.phases[4].units);
  assert.equal([...entryFamilies].some((family) => exitFamilies.has(family)), false);
  const entryContents = new Set(plan.phases[0].units.flatMap((unit) => [unit.contentId, ...(unit.sourceContentIds ?? [])]).filter(Boolean));
  const exitContents = new Set(plan.phases[4].units.flatMap((unit) => [unit.contentId, ...(unit.sourceContentIds ?? [])]).filter(Boolean));
  assert.equal([...entryContents].some((id) => exitContents.has(id)), false);

  const focus = plan.phases[1];
  assert.equal(focus.units.reduce((sum, unit) => sum + unit.targetOpportunityCount, 0), 4);
  assert.ok(focus.units.every((unit) => !unit.wordKeys || !unit.wordKeys.join(" ").includes("because because")));
  const mix = plan.phases[3];
  assert.equal(mix.units.reduce((sum, unit) => sum + unit.targetOpportunityCount, 0), 2);
  assert.ok(mix.units.some((unit) => unit.targetOpportunityCount === 0));
  assert.ok(mix.units.filter((unit) => unit.targetOpportunityCount === 0).every((unit) => !unit.wordKeys.includes("because")));
  assert.ok(plan.contextCoveragePlan.launchContextCount >= 2);
  assert.ok(plan.contextCoveragePlan.neutralWordCount >= 12);

  const contentPlan = buildPracticeProblemWordsContentPlan({ plan, contentItems: fixture.contentItems });
  assert.equal(contentPlan.metadata.partition, "training");
  assert.deepEqual(contentPlan.targetEntities, [{ entityType: "word", entityKey: "because", directTarget: true }]);
  assert.deepEqual(contentPlan.metadata.problemWords.phaseRanges.map((phase) => phase.targetWordRanges.length), [3, 4, 3, 2, 3]);
  assert.equal(contentPlan.metadata.problemWords.learningPhaseBounds.entryPhaseId, "entry-probe");
  assert.equal(contentPlan.metadata.problemWords.learningPhaseBounds.exitPhaseId, "exit-probe");
  assert.equal(fixture.calls.every(([, query]) => query.partition === "training" && query.purpose === "training"), true);
});

test("PL22 generation is deterministic per session and rotates with a new session id", async () => {
  const fixture = buildFixture();
  const first = await build("practice-session_pl22-fixed", fixture);
  const second = await build("practice-session_pl22-fixed", fixture);
  assert.deepEqual(first, second);
  const rotated = await build("practice-session_pl22-rotated", fixture);
  assert.notEqual(rotated.planHash, first.planHash);
  assert.notDeepEqual(rotated.phases[1].units.map((unit) => unit.candidateId), first.phases[1].units.map((unit) => unit.candidateId));
});

test("PL22 full indexed fixture is ready without protected fallback", async () => {
  const fixture = buildFixture();
  const result = await inspectPracticeProblemWordsAvailability({ sessionId: "practice-session_pl22-availability", context: CONTEXT, targetIndex: fixture.targetIndex, contentItems: fixture.contentItems, entityKey: "Because", language: "en" });
  assert.equal(result.status, "ready");
  assert.equal(result.entityKey, "because");
  assert.equal(result.eligible, true);
  assert.equal(fixture.calls.every(([, query]) => query.partition === "training" && query.purpose === "training"), true);
});

test("lexical target counting never treats a substring as a Problem Word opportunity", () => {
  const analysis = analyzePracticeText({ text: "the theme helps he rest", language: "en" });
  assert.equal(analysis.words.filter((word) => word.lexicalKey === "he").length, 1);
  assert.equal(analysis.words.filter((word) => word.lexicalKey === "he").some((word) => word.surfaceText === "the"), false);
});
