import {
  FLOW_CORPUS_V2_DOCUMENTS,
  FLOW_CORPUS_V2_STATS,
  createFlowCorpusExcerpt,
  selectFlowCorpusDocuments,
  validateFlowCorpusV2,
} from "../js/flow/flowCorpusV2.js";
import { createPublicFlowRunPlan } from "../js/flow/flowRunPlan.js";

const stats = validateFlowCorpusV2(FLOW_CORPUS_V2_DOCUMENTS);
const expected = {
  quick: { documents: 1, paragraphs: 3, minWords: 200 },
  standard: { documents: 2, paragraphs: 5, minWords: 400 },
  long: { documents: 3, paragraphs: 10, minWords: 800 },
};

for (const [length, contract] of Object.entries(expected)) {
  const signatures = new Set();
  for (let index = 0; index < 250; index += 1) {
    const seed = "validation-" + length + "-" + index;
    const first = createPublicFlowRunPlan({
      sessionLength: length,
      seed,
      history: { recentDocumentIds: [], recentExcerptIds: [], recentRuns: [] },
    });
    const second = createPublicFlowRunPlan({
      sessionLength: length,
      seed,
      history: { recentDocumentIds: [], recentExcerptIds: [], recentRuns: [] },
    });
    if (first.fullText !== second.fullText || first.id !== second.id) {
      throw new Error(length + " run generation is not deterministic for seed " + seed);
    }
    if (first.documentCount !== contract.documents || first.paragraphCount !== contract.paragraphs) {
      throw new Error(length + " run shape failed validation");
    }
    if (first.wordCount < contract.minWords) {
      throw new Error(length + " run is below the longform word floor: " + first.wordCount);
    }
    signatures.add(first.corpusExcerptIds.join("|"));
  }
  if (length !== "quick" && signatures.size < 200) {
    throw new Error(length + " run variety is unexpectedly low: " + signatures.size);
  }
}

for (const difficulty of ["smooth", "natural", "advanced"]) {
  for (let index = 0; index < 100; index += 1) {
    const selected = selectFlowCorpusDocuments({
      seed: "difficulty-" + difficulty + "-" + index,
      count: 1,
      targetDifficulty: difficulty,
    });
    if (selected[0]?.difficulty !== difficulty) {
      throw new Error("Difficulty calibration failed for " + difficulty);
    }
  }
}

const sample = FLOW_CORPUS_V2_DOCUMENTS[0];
const firstExcerpt = createFlowCorpusExcerpt(sample, { seed: "avoidance", paragraphCount: 3 });
const secondExcerpt = createFlowCorpusExcerpt(sample, {
  seed: "avoidance",
  paragraphCount: 3,
  recentExcerptIds: [firstExcerpt.id],
});
if (firstExcerpt.id === secondExcerpt.id) {
  throw new Error("Recent excerpt avoidance failed");
}

console.log(JSON.stringify({
  ...FLOW_CORPUS_V2_STATS,
  validation: "passed",
}, null, 2));
