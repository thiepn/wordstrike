import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FLOW_CORPUS_V2_DOCUMENTS,
  FLOW_CORPUS_V2_STATS,
  FLOW_CORPUS_V2_THEMES,
  createFlowCorpusExcerpt,
  selectFlowCorpusDocuments,
  validateFlowCorpusV2,
} from "../js/flow/flowCorpusV2.js";
import {
  clearFlowCorpusHistory,
  loadFlowCorpusHistory,
  recordFlowCorpusRun,
} from "../js/flow/flowCorpusHistory.js";
import {
  FLOW_PUBLIC_LONGFORM_PROFILES,
  createPublicFlowRunPlan,
} from "../js/flow/flowRunPlan.js";

assert.equal(FLOW_CORPUS_V2_STATS.valid, true);
assert.equal(FLOW_CORPUS_V2_DOCUMENTS.length, 120);
assert.equal(FLOW_CORPUS_V2_THEMES.length, 12);
assert.ok(FLOW_CORPUS_V2_STATS.totalWords >= 65000);
assert.ok(FLOW_CORPUS_V2_STATS.averageWords >= 500);
assert.ok(FLOW_CORPUS_V2_STATS.averageTypability >= 45);
assert.deepEqual(FLOW_CORPUS_V2_STATS.difficultyCoverage, {
  smooth: 24,
  natural: 48,
  advanced: 48,
});
assert.deepEqual(validateFlowCorpusV2(), FLOW_CORPUS_V2_STATS);

const ids = new Set(FLOW_CORPUS_V2_DOCUMENTS.map((document) => document.id));
assert.equal(ids.size, FLOW_CORPUS_V2_DOCUMENTS.length);
for (const document of FLOW_CORPUS_V2_DOCUMENTS) {
  assert.ok(document.paragraphs.length >= 5);
  assert.ok(document.wordCount >= 150);
  assert.ok(document.typabilityScore >= 45);
  assert.ok(["smooth", "natural", "advanced"].includes(document.difficulty));
}

const deterministicA = selectFlowCorpusDocuments({ seed: "same-seed", count: 3 });
const deterministicB = selectFlowCorpusDocuments({ seed: "same-seed", count: 3 });
assert.deepEqual(
  deterministicA.map((document) => document.id),
  deterministicB.map((document) => document.id),
);
assert.equal(new Set(deterministicA.map((document) => document.theme)).size, 3);

for (const difficulty of ["smooth", "natural", "advanced"]) {
  for (let index = 0; index < 100; index += 1) {
    const [selected] = selectFlowCorpusDocuments({
      seed: "difficulty-" + difficulty + "-" + index,
      count: 1,
      targetDifficulty: difficulty,
    });
    assert.equal(selected.difficulty, difficulty);
  }
}

const avoidedIds = FLOW_CORPUS_V2_DOCUMENTS.slice(0, 30).map((document) => document.id);
const avoidedSelection = selectFlowCorpusDocuments({
  seed: "avoid-recent",
  count: 5,
  recentDocumentIds: avoidedIds,
});
assert.equal(avoidedSelection.some((document) => avoidedIds.includes(document.id)), false);

const source = FLOW_CORPUS_V2_DOCUMENTS[0];
const excerptA = createFlowCorpusExcerpt(source, { seed: "excerpt-seed", paragraphCount: 3 });
const excerptB = createFlowCorpusExcerpt(source, { seed: "excerpt-seed", paragraphCount: 3 });
assert.equal(excerptA.id, excerptB.id);
assert.equal(excerptA.passages.length, 3);
const alternateExcerpt = createFlowCorpusExcerpt(source, {
  seed: "excerpt-seed",
  paragraphCount: 3,
  recentExcerptIds: [excerptA.id],
});
assert.notEqual(alternateExcerpt.id, excerptA.id);

for (const [length, expected] of Object.entries({
  quick: { documents: 1, paragraphs: 3 },
  standard: { documents: 2, paragraphs: 5 },
  long: { documents: 3, paragraphs: 10 },
})) {
  const profile = FLOW_PUBLIC_LONGFORM_PROFILES[length];
  const plan = createPublicFlowRunPlan({
    sessionLength: length,
    seed: "profile-" + length,
    history: { recentDocumentIds: [], recentExcerptIds: [], recentRuns: [] },
  });
  assert.equal(plan.corpusVersion, 2);
  assert.equal(plan.gameplayVersion, 2);
  assert.equal(plan.structure, "continuous-longform");
  assert.equal(plan.documentCount, expected.documents);
  assert.equal(plan.paragraphCount, expected.paragraphs);
  assert.equal(plan.targetMinutes, profile.targetMinutes);
  assert.equal(plan.documents.length, expected.documents);
  assert.equal(plan.seriesIds.length, expected.documents);
  assert.equal(plan.corpusExcerptIds.length, expected.documents);
  assert.equal(plan.fullText.length > 300, true);
}

const standardSignatures = new Set();
for (let index = 0; index < 400; index += 1) {
  const plan = createPublicFlowRunPlan({
    sessionLength: "standard",
    seed: "variety-" + index,
    history: { recentDocumentIds: [], recentExcerptIds: [], recentRuns: [] },
  });
  standardSignatures.add(plan.corpusExcerptIds.join("|"));
}
assert.ok(standardSignatures.size >= 300, "standard Flow should expose thousands of possible combinations, not a tiny fixed rotation");

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

const storage = new MemoryStorage();
clearFlowCorpusHistory(storage);
const firstPlan = createPublicFlowRunPlan({
  sessionLength: "long",
  seed: "history-first",
  history: loadFlowCorpusHistory(storage),
});
recordFlowCorpusRun(firstPlan, { storage, completedAt: 1234 });
const savedHistory = loadFlowCorpusHistory(storage);
assert.deepEqual(savedHistory.recentDocumentIds.slice(0, firstPlan.documentCount), firstPlan.corpusDocumentIds);
assert.deepEqual(savedHistory.recentExcerptIds.slice(0, firstPlan.documentCount), firstPlan.corpusExcerptIds);

const secondPlan = createPublicFlowRunPlan({
  sessionLength: "long",
  seed: "history-second",
  history: savedHistory,
});
assert.equal(
  secondPlan.corpusDocumentIds.some((id) => firstPlan.corpusDocumentIds.includes(id)),
  false,
  "the next run should avoid recently completed source documents while the corpus has fresh options",
);

const loader = await readFile(new URL("../js/flow/flowRuntimeLoader.js", import.meta.url), "utf8");
const phase1 = await readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8");
assert.match(loader, /flowCorpusV2\.js\?v=20260923a/);
assert.match(loader, /flowCorpusHistory\.js\?v=20260923a/);
assert.match(loader, /wordstrike-flow-release-v22/);
assert.match(phase1, /recordFlowCorpusRun/);
assert.match(phase1, /corpusVersion === 2/);

console.log("Flow Phase 4 corpus contracts passed: 120 sources, themed deterministic excerpts, calibration, history avoidance, and offline assets are wired.");
