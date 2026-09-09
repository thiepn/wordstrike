import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { verifyPracticeCommonWordArtifactIntegrity } from "../js/practiceLab/practiceCommonWordReference.js";
import { getPracticeCommonWordsAvailability } from "../js/practiceLab/practiceCommonWordsAvailability.js";

const base = new URL("../data/practice/common-words/en-v1/", import.meta.url);
const read = async (name) => JSON.parse(await fs.readFile(new URL(name, base), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));

async function artifacts() {
  const [reference, practiceBank, checkFormSet] = await Promise.all([
    read("WS-COMMON-EN-1.reference.json"),
    read("WS-COMMON-PRACTICE-EN-1.manifest.json"),
    read("WS-COMMON-CHECK-EN-1.manifest.json"),
  ]);
  return { reference, practiceBank, checkFormSet };
}

const availability = (loaded, integrity) => getPracticeCommonWordsAvailability({
  context: { language: "en" },
  artifacts: { ...loaded, integrity },
});

test("PL28 generated artifacts pass runtime SHA-256, binding, rank/band, and form-hash integrity", async () => {
  const loaded = await artifacts();
  const integrity = await verifyPracticeCommonWordArtifactIntegrity(loaded);
  assert.deepEqual(integrity.reference.reasons, []);
  assert.deepEqual(integrity.practice.reasons, []);
  assert.deepEqual(integrity.check.reasons, []);
  assert.equal(integrity.reference.valid, true);
  assert.equal(integrity.practice.valid, true);
  assert.equal(integrity.check.valid, true);
  const state = availability(loaded, integrity);
  assert.equal(state.practiceAvailable, true);
  assert.equal(state.checkAvailable, true);
});

test("PL28 stale Practice artifact disables Practice without disabling Check", async () => {
  const loaded = await artifacts();
  loaded.practiceBank = clone(loaded.practiceBank);
  loaded.practiceBank.words[0].lexicalKey = "zzzzzzzzzz";
  const integrity = await verifyPracticeCommonWordArtifactIntegrity(loaded);
  assert.equal(integrity.reference.valid, true);
  assert.equal(integrity.practice.valid, false);
  assert.equal(integrity.check.valid, true);
  assert.ok(integrity.practice.reasons.includes("checksum-mismatch"));
  assert.ok(integrity.practice.reasons.includes("practice-unknown-word"));
  const state = availability(loaded, integrity);
  assert.equal(state.practiceAvailable, false);
  assert.deepEqual(state.practiceSizes, []);
  assert.equal(state.checkAvailable, true);
});

test("PL28 stale Check artifact disables Check without disabling Practice", async () => {
  const loaded = await artifacts();
  loaded.checkFormSet = clone(loaded.checkFormSet);
  loaded.checkFormSet.forms[0].words[0].lexicalKey = "zzzzzzzzzz";
  const integrity = await verifyPracticeCommonWordArtifactIntegrity(loaded);
  assert.equal(integrity.reference.valid, true);
  assert.equal(integrity.practice.valid, true);
  assert.equal(integrity.check.valid, false);
  assert.ok(integrity.check.reasons.includes("checksum-mismatch"));
  assert.ok(integrity.check.reasons.includes("form-hash-mismatch"));
  assert.ok(integrity.check.reasons.includes("text-hash-mismatch"));
  assert.ok(integrity.check.reasons.includes("form-unknown-word"));
  const state = availability(loaded, integrity);
  assert.equal(state.practiceAvailable, true);
  assert.equal(state.checkAvailable, false);
});

test("PL28 stale statistical reference disables both Practice and Check", async () => {
  const loaded = await artifacts();
  loaded.reference = clone(loaded.reference);
  loaded.reference.rankingSource.reviewStatement += " tampered";
  const integrity = await verifyPracticeCommonWordArtifactIntegrity(loaded);
  assert.equal(integrity.reference.valid, false);
  assert.ok(integrity.reference.reasons.includes("checksum-mismatch"));
  const state = availability(loaded, integrity);
  assert.equal(state.practiceAvailable, false);
  assert.equal(state.checkAvailable, false);
});

test("PL28 fails closed when SHA-256 verification is unavailable", async () => {
  const loaded = await artifacts();
  const integrity = await verifyPracticeCommonWordArtifactIntegrity({ ...loaded, cryptoObject: {} });
  for (const key of ["reference", "practice", "check"]) {
    assert.equal(integrity[key].valid, false);
    assert.ok(integrity[key].reasons.includes("checksum-verification-unavailable"));
  }
  const state = availability(loaded, integrity);
  assert.equal(state.practiceAvailable, false);
  assert.equal(state.checkAvailable, false);
});
