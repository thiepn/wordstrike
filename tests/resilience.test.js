import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const english = JSON.parse(await readFile(
  new URL("../data/english200.json", import.meta.url),
  "utf8",
));
const common = JSON.parse(await readFile(
  new URL("../data/commonGameplayWords.json", import.meta.url),
  "utf8",
));

let commonFetchCount = 0;
globalThis.fetch = async (url) => {
  if (String(url).includes("commonGameplayWords.json")) {
    commonFetchCount += 1;
    return { ok: true, async json() { return common; } };
  }
  return { ok: false, status: 404, async json() { return {}; } };
};

const cachedWordBankModule = await import("../js/wordBank.js?cache-resilience");
const [campaignBank, commonBank, repeatedCampaignBank] = await Promise.all([
  cachedWordBankModule.loadWordBank(),
  cachedWordBankModule.loadCommonWordBank(),
  cachedWordBankModule.loadWordBank(),
]);
assert.equal(commonFetchCount, 1);
assert.equal(campaignBank.words.length, 3000);
assert.equal(commonBank.words.length, 3000);
assert.equal(repeatedCampaignBank, campaignBank);

globalThis.fetch = async () => {
  throw new Error("network unavailable");
};

const fallbackWordBankModule = await import("../js/wordBank.js?fallback-resilience");
const [fallbackCampaign, fallbackCommon] = await Promise.all([
  fallbackWordBankModule.loadWordBank(),
  fallbackWordBankModule.loadCommonWordBank(),
]);
assert.equal(fallbackCampaign.source, "audited-fallback");
assert.ok(fallbackCampaign.tiers[1].length > 0);
assert.equal(fallbackCommon.source, "audited-fallback");
assert.deepEqual(fallbackCommon.words, fallbackCampaign.tiers[1]);

const speedModule = await import("../js/speedTestWords.js?fallback-resilience");
const fallbackSpeedBank = await speedModule.loadSpeedTestWordBank();
assert.equal(fallbackSpeedBank.source, "embedded-fallback");
assert.equal(fallbackSpeedBank.wordSet.id, "english-200");
assert.deepEqual(fallbackSpeedBank.words, english.words);

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem() { throw new Error("storage read denied"); },
    setItem() { throw new Error("storage write denied"); },
  },
});

const storageModule = await import("../js/storage.js?storage-resilience");
const save = storageModule.loadSave();
assert.equal(save.currentFurthestLevel, 1);
assert.equal(storageModule.saveGame(save), false);
storageModule.updateSetting(save, "particles", false);
assert.equal(save.settings.particles, false);
storageModule.updateLevelResult(save, 1, {
  grade: "S",
  accuracy: 100,
  wpm: 60,
  score: 1000,
  maxCombo: 10,
  isBoss: false,
});
assert.equal(save.currentFurthestLevel, 2);
assert.equal(save.levels["1"].grade, "S");

console.log("Vocabulary loading and browser-storage resilience tests passed.");
