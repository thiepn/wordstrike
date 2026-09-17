import assert from "node:assert/strict";
import { FLOW_CATEGORIES, FLOW_DIFFICULTIES } from "../js/flow/flowConfig.js";
import { FLOW_PASSAGE_CATALOG, FLOW_SEED_PASSAGES } from "../js/flow/flowCatalog.js";
import {
  FLOW_CONTENT_CATEGORIES,
  createFlowCatalog,
  getFlowCatalogCoverage,
  normalizeFlowKeyboardText,
  queryFlowPassages,
  selectFlowPassage,
  validateFlowPassage,
} from "../js/flow/flowContent.js";
import { resolveFlowSelection } from "../js/flow/flowSelection.js";

assert.equal(FLOW_SEED_PASSAGES.length, 32, "Phase 2 seed catalog remains stable after later content expansion");
assert.ok(FLOW_PASSAGE_CATALOG.length >= FLOW_SEED_PASSAGES.length, "later phases may expand the validated production catalog");
assert.deepEqual(FLOW_CONTENT_CATEGORIES, FLOW_CATEGORIES.filter((category) => category !== "mixed"));
assert.equal(FLOW_CONTENT_CATEGORIES.length, 7);
assert.equal(FLOW_DIFFICULTIES.length, 4);

const ids = new Set();
for (const passage of FLOW_PASSAGE_CATALOG) {
  assert.equal(Object.isFrozen(passage), true);
  assert.equal(Object.isFrozen(passage.tags), true);
  assert.equal(ids.has(passage.id), false, `duplicate id ${passage.id}`);
  ids.add(passage.id);
  assert.equal(passage.characters, [...passage.text].length);
  assert.ok(passage.wordCount >= 4, passage.id);
  assert.ok(passage.sentenceCount >= 1 || passage.category === "quotes", passage.id);
  assert.ok(FLOW_CONTENT_CATEGORIES.includes(passage.category));
  assert.ok(FLOW_DIFFICULTIES.includes(passage.difficulty));
  assert.match(passage.text, /^[\x20-\x7E]+$/, `${passage.id} must use only standard printable English-keyboard characters`);
}

const coverage = getFlowCatalogCoverage(FLOW_PASSAGE_CATALOG);
for (const category of FLOW_CONTENT_CATEGORIES) {
  for (const difficulty of FLOW_DIFFICULTIES) {
    assert.ok(coverage[category][difficulty] >= 1, `missing ${category}/${difficulty}`);
  }
}

const naturalDialogue = queryFlowPassages(FLOW_PASSAGE_CATALOG, {
  category: "dialogue",
  difficulty: "natural",
});
assert.ok(naturalDialogue.length >= 1);
assert.ok(naturalDialogue.some(({ id }) => id === "dialogue-natural-01"));

const workPassages = queryFlowPassages(FLOW_PASSAGE_CATALOG, { tags: ["work"] });
assert.ok(workPassages.length >= 4);
assert.equal(workPassages.every((passage) => passage.tags.includes("work")), true);

const withoutOne = queryFlowPassages(FLOW_SEED_PASSAGES, {
  category: "professional",
  difficulty: "advanced",
  excludeIds: ["professional-advanced-01"],
});
assert.deepEqual(withoutOne.map(({ id }) => id), ["professional-advanced-02"]);

const selectedA = selectFlowPassage(FLOW_SEED_PASSAGES, {
  category: "professional",
  difficulty: "advanced",
}, "repeatable-seed");
const selectedB = selectFlowPassage(FLOW_SEED_PASSAGES, {
  category: "professional",
  difficulty: "advanced",
}, "repeatable-seed");
assert.equal(selectedA.id, selectedB.id, "selection must be deterministic for a seed");

const seen = new Set();
for (let seed = 0; seed < 20; seed += 1) {
  seen.add(selectFlowPassage(FLOW_SEED_PASSAGES, {
    category: "professional",
    difficulty: "advanced",
  }, seed)?.id);
}
assert.equal(seen.size, 2, "seeded selection should be able to reach each matching Phase 2 passage");

const defaultSelection = resolveFlowSelection("");
assert.equal(defaultSelection.source, "phase1-validation");
assert.equal(defaultSelection.passage.id, "phase1-natural-typing-validation");

const filteredSelection = resolveFlowSelection("?flowCatalog=1&flowCategory=academic&flowDifficulty=expert&flowSeed=42");
assert.equal(filteredSelection.source, "catalog-filter");
assert.equal(filteredSelection.category, "academic");
assert.equal(filteredSelection.difficulty, "expert");
assert.equal(filteredSelection.passage.category, "academic");
assert.equal(filteredSelection.passage.difficulty, "expert");
assert.ok(filteredSelection.matchCount >= 2);

const exactSelection = resolveFlowSelection("?flowPassage=numbers-symbols-expert-01");
assert.equal(exactSelection.source, "catalog-id");
assert.equal(exactSelection.passage.id, "numbers-symbols-expert-01");
assert.equal(resolveFlowSelection("?flowPassage=does-not-exist"), null);

const validBase = {
  id: "validator-sample",
  category: "everyday",
  difficulty: "natural",
  tags: ["sample"],
  text: "This passage is long enough, balanced, and valid for the Flow content validator.",
};
assert.equal(validateFlowPassage(validBase).id, validBase.id);
assert.throws(() => validateFlowPassage({ ...validBase, id: "Bad Id" }), /lowercase slug/);
assert.throws(() => validateFlowPassage({ ...validBase, text: "This  passage contains repeated spacing and should be rejected." }), /repeated whitespace/);
assert.throws(() => validateFlowPassage({ ...validBase, text: "This passage contains a hidden\u200B character and must be rejected." }), /invisible or control/);
assert.throws(() => validateFlowPassage({ ...validBase, text: 'This passage has an "unclosed quotation mark and must fail validation.' }), /quotation/);
assert.throws(() => validateFlowPassage({ ...validBase, text: "This passage has an unclosed parenthesis (and must fail validation." }), /parentheses/);
assert.throws(() => validateFlowPassage({ ...validBase, text: "This passage includes an em dash — and must fail direct validation." }), /unsupported character/);
assert.equal(
  validateFlowPassage({ ...validBase, text: "This passage includes a standard keyboard backslash \\ and remains valid." }).id,
  validBase.id,
);
assert.equal(
  normalizeFlowKeyboardText('Cost €5 — “fine”…'),
  'Cost EUR 5 - "fine"...',
);
const legacyNormalized = createFlowCatalog([{
  ...validBase,
  id: "legacy-keyboard-normalization",
  text: "The old corpus used €5 and an em dash — here, but playable Flow normalizes both.",
}])[0];
assert.equal(
  legacyNormalized.text,
  "The old corpus used EUR 5 and an em dash - here, but playable Flow normalizes both.",
);
assert.match(legacyNormalized.text, /^[\x20-\x7E]+$/);
assert.throws(() => createFlowCatalog([validBase, validBase]), /Duplicate Flow passage id/);

console.log("Flow Phase 2 content contracts passed: stable seed library, ASCII keyboard validation, legacy text normalization, matrix coverage, deterministic selection, and developer-route resolution.");
