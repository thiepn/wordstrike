import assert from "node:assert/strict";
import { FLOW_CATEGORIES, FLOW_DIFFICULTIES } from "../js/flow/flowConfig.js";
import {
  FLOW_PASSAGE_CATALOG,
  FLOW_SEED_PASSAGES,
} from "../js/flow/flowCatalog.js";
import { FLOW_EXPANSION_PASSAGES } from "../js/flow/flowContentExpansion.js";
import {
  FLOW_CONTENT_CATEGORIES,
  getFlowCatalogCoverage,
  queryFlowPassages,
} from "../js/flow/flowContent.js";
import {
  FLOW_WEAKNESS_DEFINITIONS,
  getAdaptivePassageFit,
} from "../js/flow/flowAdaptive.js";
import { createFlowRunPlan } from "../js/flow/flowRunPlan.js";

assert.equal(FLOW_SEED_PASSAGES.length, 32, "Phase 2 seed library must remain stable");
assert.equal(FLOW_EXPANSION_PASSAGES.length, 80, "Phase 12 adds exactly 80 production passages");
assert.equal(FLOW_PASSAGE_CATALOG.length, 112, "Phase 12 production catalog size");
assert.equal(FLOW_CONTENT_CATEGORIES.length, 7);
assert.equal(FLOW_DIFFICULTIES.length, 4);

const coverage = getFlowCatalogCoverage(FLOW_PASSAGE_CATALOG);
for (const category of FLOW_CONTENT_CATEGORIES) {
  const categoryPassages = queryFlowPassages(FLOW_PASSAGE_CATALOG, { category });
  assert.equal(categoryPassages.length, 16, `${category} must contain 16 passages`);
  for (const difficulty of FLOW_DIFFICULTIES) {
    assert.equal(
      coverage[category][difficulty],
      4,
      `${category}/${difficulty} must contain exactly four passages`,
    );
  }
}

for (const difficulty of FLOW_DIFFICULTIES) {
  const count = FLOW_PASSAGE_CATALOG.filter((passage) => passage.difficulty === difficulty).length;
  assert.equal(count, 28, `${difficulty} must contain 28 passages`);
}

const texts = new Set();
const ids = new Set();
for (const passage of FLOW_PASSAGE_CATALOG) {
  assert.equal(ids.has(passage.id), false, `duplicate id ${passage.id}`);
  assert.equal(texts.has(passage.text), false, `duplicate text ${passage.id}`);
  ids.add(passage.id);
  texts.add(passage.text);
  assert.ok(passage.characters >= 60, `${passage.id} is too short for sustained Flow`);
  assert.ok(passage.characters <= 420, `${passage.id} is too long for a single Flow segment`);
  assert.ok(passage.wordCount >= 10, `${passage.id} needs enough words for cadence analysis`);
}

// Each measured Phase 10 weakness except typo-pair should have a broad candidate pool.
for (const weakness of Object.values(FLOW_WEAKNESS_DEFINITIONS)) {
  if (weakness.key === "typo-pair") continue;
  const matching = FLOW_PASSAGE_CATALOG.filter((passage) => getAdaptivePassageFit(passage, weakness) > 0);
  assert.ok(matching.length >= 16, `${weakness.key} has only ${matching.length} useful passages`);
}

const typoPair = {
  ...FLOW_WEAKNESS_DEFINITIONS["typo-pair"],
  expected: "e",
  actual: "r",
  score: 80,
};
assert.ok(
  FLOW_PASSAGE_CATALOG.filter((passage) => getAdaptivePassageFit(passage, typoPair) > 0).length >= 24,
  "common typo-pair practice needs a broad candidate pool",
);

// Long sessions should not repeat content now that the library is production-sized.
for (const category of FLOW_CATEGORIES) {
  for (const difficulty of FLOW_DIFFICULTIES) {
    for (const seed of ["phase12-a", "phase12-b"] ) {
      const plan = createFlowRunPlan({ category, difficulty, sessionLength: "long", seed });
      assert.equal(plan.passageCount, 24, `${category}/${difficulty} long passage count`);
      assert.equal(plan.repeatedPassageCount, 0, `${category}/${difficulty}/${seed} repeated a passage`);
      assert.equal(new Set(plan.segments.map(({ passageId }) => passageId)).size, plan.passageCount);
    }
  }
}

// Adaptive long runs also need enough variety to target a weakness without repetition.
for (const weakness of Object.values(FLOW_WEAKNESS_DEFINITIONS)) {
  const profileWeakness = weakness.key === "typo-pair"
    ? { ...weakness, score: 80, expected: "e", actual: "r" }
    : { ...weakness, score: 80 };
  const plan = createFlowRunPlan({
    category: "mixed",
    difficulty: "expert",
    sessionLength: "long",
    seed: `phase12-adaptive-${weakness.key}`,
    adaptiveProfile: { version: 1, weaknesses: [profileWeakness] },
  });
  assert.equal(plan.adaptive.enabled, true, weakness.key);
  assert.equal(plan.adaptive.targetedPassageCount, 5, weakness.key);
  assert.equal(plan.repeatedPassageCount, 0, `${weakness.key} adaptive run repeated content`);
}

console.log("Flow Phase 12 content expansion contracts passed: 112 passages, balanced matrix, adaptive breadth, and repetition-free long runs.");
