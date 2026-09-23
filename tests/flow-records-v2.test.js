import assert from "node:assert/strict";
import {
  FLOW_RECORDS_V2_MAX_HISTORY,
  FLOW_RECORDS_V2_STORAGE_KEY,
  getFlowPersonalBestV2,
  getFlowRecentRunsV2,
  loadFlowRecordsV2,
  recordFlowResultV2,
  resetFlowRecordsV2,
} from "../js/flow/flowRecordsV2.js";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

resetFlowRecordsV2();
assert.equal(loadFlowRecordsV2().completedRuns, 0);

function result(sessionId, sessionLength, score, {
  eligible = true,
  accuracy = 98,
  wpm = 100,
  consistency = 90,
  endedAt = 1700000000000,
} = {}) {
  return {
    schemaVersion: 1,
    contractVersion: 1,
    rulesVersion: 2,
    metricVersion: 1,
    modeId: "flow",
    variantId: `flow-${sessionLength}-v2`,
    boardKey: `flow-${sessionLength}-v1`,
    sessionId,
    endedAt,
    sessionLength,
    completed: true,
    recordEligible: eligible,
    score,
    wpm,
    rawWpm: wpm + 2,
    accuracy,
    consistency,
    activeDurationMs: 180000,
    wordsCompleted: 300,
    charactersCompleted: 1500,
    correctKeystrokes: 1480,
    incorrectKeystrokes: 20,
    correctedErrors: 2,
    unresolvedErrors: 0,
    textId: "flow-v2-test",
    seed: "records-test",
    seriesIds: ["station"],
  };
}

const quickFirst = recordFlowResultV2(result("q1", "quick", 80000));
assert.equal(quickFirst.recorded, true);
assert.equal(quickFirst.isPersonalBest, true);
assert.equal(getFlowPersonalBestV2("quick").score, 80000);

const quickLower = recordFlowResultV2(result("q2", "quick", 79000, { wpm: 110 }));
assert.equal(quickLower.isPersonalBest, false);
assert.equal(getFlowPersonalBestV2("quick").score, 80000);

const quickHigher = recordFlowResultV2(result("q3", "quick", 81000, { accuracy: 97 }));
assert.equal(quickHigher.isPersonalBest, true);
assert.equal(quickHigher.previousBest.score, 80000);
assert.equal(getFlowPersonalBestV2("quick").score, 81000);

const lowAccuracy = recordFlowResultV2(result("q4", "quick", 90000, {
  eligible: false,
  accuracy: 89,
}));
assert.equal(lowAccuracy.recorded, true);
assert.equal(lowAccuracy.isPersonalBest, false);
assert.equal(getFlowPersonalBestV2("quick").score, 81000);
assert.equal(getFlowRecentRunsV2(1)[0].sessionId, "q4", "ineligible runs still belong in history");

recordFlowResultV2(result("s1", "standard", 100000));
recordFlowResultV2(result("l1", "long", 110000));
assert.equal(getFlowPersonalBestV2("quick").score, 81000);
assert.equal(getFlowPersonalBestV2("standard").score, 100000);
assert.equal(getFlowPersonalBestV2("long").score, 110000);

const duplicate = recordFlowResultV2(result("l1", "long", 999999));
assert.equal(duplicate.recorded, false);
assert.equal(getFlowPersonalBestV2("long").score, 110000);

for (let index = 0; index < FLOW_RECORDS_V2_MAX_HISTORY + 8; index += 1) {
  recordFlowResultV2(result(`extra-${index}`, "standard", 50000 + index, { endedAt: 1700000010000 + index }));
}
const records = loadFlowRecordsV2();
assert.equal(records.history.length, FLOW_RECORDS_V2_MAX_HISTORY);
assert.ok(store.has(FLOW_RECORDS_V2_STORAGE_KEY));
assert.equal(records.bestByLength.standard.score, 100000, "history pruning cannot destroy PBs");

store.set(FLOW_RECORDS_V2_STORAGE_KEY, "{broken");
assert.equal(loadFlowRecordsV2().completedRuns, 0, "corrupt record data recovers safely");

console.log("Flow Records V2 contracts passed: independent length PBs, ineligible history, idempotency, bounded storage, and corruption recovery.");
