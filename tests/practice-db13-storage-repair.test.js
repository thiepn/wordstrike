import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_STORE_DEFINITIONS,
} from "../js/practiceLab/practiceConstants.js";
import {
  applyPracticeDatabaseUpgrade,
  getPracticeDatabaseSchemaIssues,
} from "../js/practiceLab/practiceIndexedDbStore.js";

function collection(map) {
  return {
    contains: (name) => map.has(name),
    [Symbol.iterator]: function* () { yield* map.keys(); },
  };
}

function makeStore(keyPath, indexes = []) {
  const indexMap = new Map(indexes.map((index) => [index.name, { ...index, options: { ...(index.options || {}) } }]));
  return {
    keyPath,
    get indexNames() { return collection(indexMap); },
    index(name) {
      const value = indexMap.get(name);
      if (!value) throw new Error("missing index");
      return {
        keyPath: value.keyPath,
        unique: Boolean(value.options?.unique),
        multiEntry: Boolean(value.options?.multiEntry),
      };
    },
    createIndex(name, nextKeyPath, options = {}) {
      indexMap.set(name, { name, keyPath: nextKeyPath, options: { ...options } });
    },
    deleteIndex(name) { indexMap.delete(name); },
    snapshot() { return [...indexMap.values()]; },
  };
}

function makeDatabase(stores) {
  return {
    objectStoreNames: collection(stores),
    createObjectStore(name, { keyPath }) {
      const store = makeStore(keyPath);
      stores.set(name, store);
      return store;
    },
    transaction(names) {
      return {
        objectStore(name) {
          const store = stores.get(name);
          if (!store) throw new Error("missing store");
          return store;
        },
      };
    },
  };
}

test("DB13 repairs the Daily Coach compound index instead of leaving a stale DB12 definition", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 13);
  const coach = PRACTICE_STORE_DEFINITIONS.coachPlans;
  const staleIndexes = coach.indexes.map((index) => index.name === "profileContextDay"
    ? { name: index.name, keyPath: ["profileId", "localDayKey"], options: { unique: false } }
    : { name: index.name, keyPath: index.keyPath, options: index.options || {} });
  const stores = new Map([["coachPlans", makeStore(coach.keyPath, staleIndexes)]]);
  const database = makeDatabase(stores);
  const transaction = { objectStore: (name) => stores.get(name) };

  applyPracticeDatabaseUpgrade(database, transaction);

  const repaired = stores.get("coachPlans").index("profileContextDay");
  assert.deepEqual(repaired.keyPath, ["profileId", "contextId", "localDayKey"]);
  assert.equal(repaired.unique, true);
  assert.deepEqual(getPracticeDatabaseSchemaIssues(database), []);
});

test("DB13 upgrade restores a missing Daily Coach index while preserving other coach indexes", () => {
  const coach = PRACTICE_STORE_DEFINITIONS.coachPlans;
  const withoutDay = coach.indexes
    .filter((index) => index.name !== "profileContextDay")
    .map((index) => ({ name: index.name, keyPath: index.keyPath, options: index.options || {} }));
  const stores = new Map([["coachPlans", makeStore(coach.keyPath, withoutDay)]]);
  const database = makeDatabase(stores);
  const transaction = { objectStore: (name) => stores.get(name) };

  applyPracticeDatabaseUpgrade(database, transaction);

  const names = stores.get("coachPlans").snapshot().map((index) => index.name);
  assert.ok(names.includes("profileContextDay"));
  assert.ok(names.includes("profileId"));
  assert.ok(names.includes("contextId"));
  assert.deepEqual(getPracticeDatabaseSchemaIssues(database), []);
});
