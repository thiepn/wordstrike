import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { isPracticeCommonWordEnglishV1LexicalKey } from "../js/practiceLab/practiceCommonWordsPolicy.js";
import { createPracticeCommonWordsPlan } from "../js/practiceLab/practiceCommonWordsPlan.js";
import { createPracticeCommonWordCheckPlan } from "../js/practiceLab/practiceCommonWordCheckPlan.js";

const read = async (relative) => JSON.parse(await fs.readFile(new URL(`../${relative}`, import.meta.url), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const identity = {
  sessionId: "practice-session_pl28-plan-identity-12345678",
  profileId: "practice-profile_pl28-plan-identity-12345678",
  contextId: "practice-context_pl28-plan-identity-12345678",
};

test("PL28 English v1 lexical policy permits a/i and rejects other one-letter, punctuation, contractions, digits, capitals, and overlong forms", () => {
  for (const value of ["a", "i", "the", "because", "practice"]) assert.equal(isPracticeCommonWordEnglishV1LexicalKey(value), true, value);
  for (const value of ["b", "x", "don't", "well-known", "word2", "Word", "hello!", "abcdefghijklmnop", ""]) {
    assert.equal(isPracticeCommonWordEnglishV1LexicalKey(value), false, value);
  }
});

test("PL28 generated reference and display banks carry exact canonical PL7 word identity", async () => {
  const [reference, practice, check] = await Promise.all([
    read("data/practice/common-words/en-v1/WS-COMMON-EN-1.reference.json"),
    read("data/practice/common-words/en-v1/WS-COMMON-PRACTICE-EN-1.manifest.json"),
    read("data/practice/common-words/en-v1/WS-COMMON-CHECK-EN-1.manifest.json"),
  ]);
  for (const words of [reference.words, practice.words, check.diagnosticPool, ...check.forms.map((form) => form.words)]) {
    for (const word of words) assert.equal(word.wordId, `word:${word.lexicalKey}`);
  }
});

test("PL28 Practice plan is deterministic and binds word IDs, lexical keys, exact order, and separator into planHash", async () => {
  const bank = await read("data/practice/common-words/en-v1/WS-COMMON-PRACTICE-EN-1.manifest.json");
  const first = createPracticeCommonWordsPlan({ ...identity, bank, skillStats: [], wordCount: 80 });
  const second = createPracticeCommonWordsPlan({ ...identity, bank, skillStats: [], wordCount: 80 });
  assert.equal(first.plan.planHash, second.plan.planHash);
  assert.deepEqual(first.plan.wordIds, second.plan.wordIds);
  assert.deepEqual(first.plan.lexicalKeys, second.plan.lexicalKeys);
  assert.equal(first.plan.wordIds.length, 80);
  assert.equal(new Set(first.plan.wordIds).size, 80);
  assert.equal(first.contentPlan.text, first.plan.lexicalKeys.join(" "));
  for (const unit of first.contentPlan.units.filter((value) => value.type === "word")) {
    assert.equal(unit.metadata.commonWords.wordId, `word:${unit.metadata.commonWords.lexicalKey}`);
  }

  const mutated = clone(bank);
  const selectedKey = first.plan.lexicalKeys[0];
  const selected = mutated.words.find((word) => word.lexicalKey === selectedKey);
  assert.ok(selected);
  selected.wordId = `word:tampered-${selected.lexicalKey}`;
  const changed = createPracticeCommonWordsPlan({ ...identity, bank: mutated, skillStats: [], wordCount: 80 });
  assert.deepEqual(changed.plan.lexicalKeys, first.plan.lexicalKeys);
  assert.notDeepEqual(changed.plan.wordIds, first.plan.wordIds);
  assert.notEqual(changed.plan.planHash, first.plan.planHash);
});

test("PL28 Check plan preserves canonical form identity and exact 200-word diagnostic order", async () => {
  const formSet = await read("data/practice/common-words/en-v1/WS-COMMON-CHECK-EN-1.manifest.json");
  const first = createPracticeCommonWordCheckPlan({ ...identity, formSet });
  const second = createPracticeCommonWordCheckPlan({ ...identity, formSet });
  assert.equal(first.plan.formId, second.plan.formId);
  assert.equal(first.plan.formHash, second.plan.formHash);
  assert.equal(first.plan.planHash, second.plan.planHash);
  assert.equal(first.plan.wordCount, 200);
  assert.equal(first.form.words.length, 200);
  assert.equal(first.contentPlan.text, first.form.words.map((word) => word.lexicalKey).join(" "));
  const units = first.contentPlan.units.filter((value) => value.type === "word");
  assert.equal(units.length, 200);
  for (let index = 0; index < units.length; index += 1) {
    assert.equal(units[index].metadata.commonWords.wordId, first.form.words[index].wordId);
    assert.equal(units[index].metadata.commonWords.lexicalKey, first.form.words[index].lexicalKey);
  }
});
