import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { AUDITED_FALLBACK_WORDS } from "../js/auditedFallbackWords.js";
import { EMERGENCY_BOSS_WORDS } from "../js/bossGenerator.js";
import { createArcadeRushVocabulary, generateArcadeRushPlan } from "../js/arcadeRush/index.js";
import { createEndlessVocabulary, createEndlessWordGenerator } from "../js/endlessWords.js";
import { generateLevel } from "../js/levelGenerator.js";
import {
  createNormalWordAttempt,
  loadBossWordBank,
  loadCommonWordBank,
  loadWordBank,
} from "../js/wordBank.js";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const common = await readJson("../data/commonGameplayWords.json");
const review = await readJson("../data/commonGameplayWords.manual-review.json");
const rules = await readJson("../data/vocabularyQualityRules.json");
const names = await readJson("../data/personalNameExclusions.json");
const bossLong = await readJson("../data/bossCommonLongWords.json");
const selected = new Set(common.words.map(({ word }) => word));
const allowedExceptions = new Set([
  ...rules.allowedGeographicNames,
  ...rules.ambiguousOrdinaryWords,
]);

for (const term of ["uniprotkb", "epson", "siemens", "cleveland", "missouri"]) {
  assert.equal(selected.has(term), false, `${term} must not be selectable`);
}
for (const words of Object.values(rules.exclusions)) {
  for (const word of words) {
    if (!allowedExceptions.has(word)) assert.equal(selected.has(word), false, `${word} is explicitly excluded`);
  }
}
for (const name of names.names) {
  if (!allowedExceptions.has(name)) assert.equal(selected.has(name), false, `${name} is a blocked personal name`);
}
for (const state of [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma",
  "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota",
  "tennessee", "texas", "utah", "vermont", "virginia", "washington",
  "west virginia", "wisconsin", "wyoming", "district of columbia",
]) assert.equal(selected.has(state), false, `${state} must not be in general gameplay`);
assert.ok(common.statistics.geographicNamesIncluded.length / common.words.length < 0.02);

const kept = review.entries.filter(({ decision }) => decision === "KEEP");
assert.equal(kept.length, 3000);
assert.deepEqual(new Set(kept.map(({ word }) => word)), selected);
assert.ok(AUDITED_FALLBACK_WORDS.every((word) => selected.has(word)));
const curatedBossWords = new Set([...selected, ...bossLong.words]);
assert.ok(EMERGENCY_BOSS_WORDS.every((word) => curatedBossWords.has(word)));

const level83 = generateLevel(83);
for (let seed = 1; seed <= 500; seed += 1) {
  const attempt = createNormalWordAttempt(common, level83, seed);
  assert.ok(attempt.selectedWords.every((word) => selected.has(word)));
}

const realFetch = globalThis.fetch;
const jsonResponse = (value) => ({ ok: true, async json() { return value; } });
globalThis.fetch = async (url) => (
  String(url).includes("bossCommonLongWords") ? jsonResponse(bossLong) : jsonResponse(common)
);
const [campaignBank, commonBank, bossBank] = await Promise.all([
  loadWordBank(),
  loadCommonWordBank(),
  loadBossWordBank(),
]);
assert.deepEqual(campaignBank, common);
assert.deepEqual(new Set(commonBank.words), selected);
assert.ok(bossBank.typingWords.every((word) => selected.has(word)));
assert.ok(bossBank.longWords.every((word) => bossLong.words.includes(word)));

const rushVocabulary = createArcadeRushVocabulary({
  commonWords: commonBank.words,
  campaignBank,
});
const rushPlan = generateArcadeRushPlan({ seed: 0x12345678, vocabulary: rushVocabulary });
assert.ok(rushPlan);
assert.equal(rushPlan.waves.length, 6);
assert.ok(rushPlan.waves.flatMap((wave) => wave.entries).every(({ word }) => selected.has(word)));

const endlessVocabulary = createEndlessVocabulary({
  commonWords: commonBank.words,
  campaignBank,
  bossBank,
});
const endlessAllowed = new Set([...selected, ...bossLong.words]);
const endlessGenerator = createEndlessWordGenerator(endlessVocabulary, 12345);
for (const stage of [1, 10, 25, 40]) {
  for (let index = 0; index < 100; index += 1) {
    assert.equal(endlessAllowed.has(endlessGenerator.next(stage)), true);
  }
}

let warnings = 0;
const realWarn = console.warn;
console.warn = () => { warnings += 1; };
globalThis.fetch = async () => { throw new Error("offline"); };
const [campaignFallback, bossFallback] = await Promise.all([loadWordBank(), loadBossWordBank()]);
assert.deepEqual(campaignFallback.tiers[1], AUDITED_FALLBACK_WORDS);
assert.ok(bossFallback.typingWords.every((word) => curatedBossWords.has(word)));
assert.ok(bossFallback.longWords.every((word) => bossLong.words.includes(word)));
assert.equal(warnings, 2);
console.warn = realWarn;
globalThis.fetch = realFetch;

const legacyTypingRaw = await readFile(new URL("../data/typingTestWords.json", import.meta.url), "utf8");
assert.equal(
  createHash("sha256").update(legacyTypingRaw).digest("hex"),
  "ef87f74d6a5fbdf396b93a25cd40e74b0205908a74449a02332b7cd393f63abf",
);
const mainSource = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
assert.match(mainSource, /commonWords:\s*appState\.commonWordBank\.words/g);
assert.match(mainSource, /campaignBank:\s*appState\.wordBank/g);
assert.match(mainSource, /bossBank:\s*appState\.bossWordBank/g);
assert.doesNotMatch(mainSource, /commonWords:\s*appState\.speedTestWordBank\.words/);
assert.doesNotMatch(mainSource, /dailyGenerator|createDailyVocabulary|generateDailyPlan/);

console.log("Campaign, level 83, Boss, Endless, Arcade Rush, and offline fallbacks use audited vocabulary sources.");
