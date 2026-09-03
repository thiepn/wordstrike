import assert from "node:assert/strict";
import {
  PRACTICE_STORE_DEFINITIONS,
  PRACTICE_STORE_NAMES,
} from "../js/practiceLab/practiceConstants.js";
import { applyPracticeDatabaseUpgrade } from "../js/practiceLab/practiceIndexedDbStore.js";

function makeStore(keyPath, indexDefinitions = []) {
  const indexes = new Map(indexDefinitions.map((index) => [index.name, { ...index }]));
  return {
    keyPath,
    indexNames: { contains: (name) => indexes.has(name), [Symbol.iterator]: function* () { yield* indexes.keys(); } },
    createIndex(name, nextKeyPath, options = {}) { indexes.set(name, { name, keyPath: nextKeyPath, options }); },
    deleteIndex(name) { indexes.delete(name); },
    snapshot() { return [...indexes.values()]; },
  };
}
function makeDatabase(initialStores = new Map()) {
  const stores = initialStores;
  return {
    objectStoreNames: { contains: (name) => stores.has(name), [Symbol.iterator]: function* () { yield* stores.keys(); } },
    createObjectStore(name, { keyPath }) { const store = makeStore(keyPath); stores.set(name, store); return store; },
    stores,
  };
}
const v1Stores = new Map();
for (const [name, definition] of Object.entries(PRACTICE_STORE_DEFINITIONS)) {
  if (name === "contexts") continue;
  const legacyIndexes = definition.indexes
    .filter((index) => !["contextId", "profileContextEntity", "profileFingerprint"].includes(index.name))
    .map((index) => ({ name: index.name, keyPath: index.keyPath, options: index.options || {} }));
  if (name === "skillStats" || name === "reviewItems") legacyIndexes.push({ name: "profileEntity", keyPath: ["profileId", "entityType", "entityKey"], options: { unique: true } });
  v1Stores.set(name, makeStore(definition.keyPath, legacyIndexes));
}
const upgraded = makeDatabase(v1Stores);
applyPracticeDatabaseUpgrade(upgraded, { objectStore: (name) => upgraded.stores.get(name) });
assert.equal(upgraded.stores.has("contexts"), true);
for (const storeName of ["skillStats", "reviewItems"]) {
  const indexes = upgraded.stores.get(storeName).snapshot();
  assert.equal(indexes.some((index) => index.name === "profileEntity"), false);
  assert.equal(indexes.some((index) => index.name === "contextId"), true);
  assert.equal(indexes.find((index) => index.name === "profileContextEntity")?.options?.unique, true);
}
assert.equal(upgraded.stores.get("sessionSummaries").snapshot().some((index) => index.name === "contextId"), true);

const fresh = makeDatabase();
applyPracticeDatabaseUpgrade(fresh);
assert.deepEqual([...fresh.stores.keys()], PRACTICE_STORE_NAMES);
for (const [name, definition] of Object.entries(PRACTICE_STORE_DEFINITIONS)) {
  const actual = fresh.stores.get(name).snapshot().map((index) => ({ name: index.name, keyPath: index.keyPath, options: index.options || {} }));
  const expected = definition.indexes.map((index) => ({ name: index.name, keyPath: index.keyPath, options: index.options || {} }));
  assert.deepEqual(actual, expected);
}
console.log("PL5 exact v1-to-v2 IndexedDB reconciliation and fresh-v2 convergence passed.");
