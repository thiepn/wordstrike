import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import {
  validatePracticeCommonWordReference,
  validatePracticeCommonWordPracticeBank,
  validatePracticeCommonWordCheckFormSet,
} from "../js/practiceLab/practiceCommonWordReference.js";
import { PRACTICE_COMMON_WORD_BANDS, PRACTICE_COMMON_WORD_CHECK_MATCHING } from "../js/practiceLab/practiceCommonWordsConstants.js";

const base = new URL("../data/practice/common-words/en-v1/", import.meta.url);
const read = async (name) => JSON.parse(await fs.readFile(new URL(name, base), "utf8"));
const checksum = (value) => `sha256-${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const withoutChecksum = (value) => { const copy = { ...value }; delete copy.checksum; return copy; };
const spread = (values) => Math.max(...values) - Math.min(...values);

test("PL28 reference is exactly 1200 ranked unique English lexical keys with canonical bands", async () => {
  const reference = await read("WS-COMMON-EN-1.reference.json");
  const validation = validatePracticeCommonWordReference(reference);
  assert.deepEqual(validation.reasons, []);
  assert.equal(reference.words.length, 1200);
  assert.equal(new Set(reference.words.map((word) => word.lexicalKey)).size, 1200);
  assert.deepEqual(reference.words.map((word) => word.rank), Array.from({ length: 1200 }, (_, index) => index + 1));
  assert.equal(reference.rankingSource.sourceType, "statistical-reference");
  assert.equal(reference.rankingSource.usageApproval, "statistical-only");
  assert.equal(reference.checksum, checksum(withoutChecksum(reference)));
});

test("PL28 Practice and Check display sources are independently display-approved and never statistical-only", async () => {
  const practice = await read("WS-COMMON-PRACTICE-EN-1.manifest.json");
  const check = await read("WS-COMMON-CHECK-EN-1.manifest.json");
  assert.equal(validatePracticeCommonWordPracticeBank(practice).valid, true);
  assert.equal(validatePracticeCommonWordCheckFormSet(check).valid, true);
  assert.equal(practice.partition, "training");
  assert.equal(check.partition, "diagnostic");
  for (const artifact of [practice, check]) {
    assert.equal(artifact.displayProvenance.usageApproval, "practice-display-approved");
    assert.notEqual(artifact.displayProvenance.sourceType, "statistical-reference");
    assert.equal(artifact.checksum, checksum(withoutChecksum(artifact)));
  }
});

test("PL28 ships eight engineering-matched 200-word Check forms", async () => {
  const check = await read("WS-COMMON-CHECK-EN-1.manifest.json");
  assert.equal(check.forms.length, 8);
  for (const form of check.forms) {
    assert.equal(form.status, "ready");
    assert.equal(form.words.length, 200);
    assert.equal(new Set(form.words.map((word) => word.lexicalKey)).size, 200);
    for (const band of PRACTICE_COMMON_WORD_BANDS) assert.equal(form.words.filter((word) => word.band === band).length, 50);
    for (let offset = 0; offset < 200; offset += 20) {
      const block = form.words.slice(offset, offset + 20);
      for (const band of PRACTICE_COMMON_WORD_BANDS) assert.equal(block.filter((word) => word.band === band).length, 5);
      let run = 1;
      for (let index = 1; index < block.length; index += 1) { run = block[index].band === block[index - 1].band ? run + 1 : 1; assert.ok(run <= 2); }
    }
  }
  const total = check.forms.map((form) => form.metrics.totalGraphemes);
  const median = total.slice().sort((a, b) => a - b)[Math.floor(total.length / 2)];
  assert.ok(spread(total) / median <= PRACTICE_COMMON_WORD_CHECK_MATCHING.totalGraphemeToleranceRatio);
  assert.ok(spread(check.forms.map((form) => form.metrics.meanWordLength)) <= PRACTICE_COMMON_WORD_CHECK_MATCHING.meanWordLengthSpread);
  assert.ok(spread(check.forms.map((form) => form.metrics.p90WordLength)) <= PRACTICE_COMMON_WORD_CHECK_MATCHING.p90WordLengthSpread);
  for (const band of PRACTICE_COMMON_WORD_BANDS) assert.ok(spread(check.forms.map((form) => form.metrics.bandMeanWordLength[band])) <= PRACTICE_COMMON_WORD_CHECK_MATCHING.bandMeanWordLengthSpread);
  assert.ok(check.matching.maximumPairwiseLexicalOverlapRatio <= PRACTICE_COMMON_WORD_CHECK_MATCHING.maximumPairwiseLexicalOverlapRatio);
  assert.equal(check.matching.empiricalEquating, false);
});
