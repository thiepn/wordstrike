import assert from "node:assert/strict";
import {
  PRACTICE_STORE_DEFINITIONS,
  PRACTICE_STORE_NAMES,
} from "../js/practiceLab/practiceConstants.js";
import {
  applyPracticeDatabaseUpgrade,
  createPracticeIndexedDbStore,
} from "../js/practiceLab/practiceIndexedDbStore.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";

const created = new Map();
const database = {
  objectStoreNames: {
    contains(name) { return created.has(name); },
  },
  createObjectStore(name, options) {
    const indexes = [];
    const store = {
      createIndex(indexName, keyPath, indexOptions) {
        indexes.push({ name: indexName, keyPath, options: indexOptions });
      },
    };
    created.set(name, { options, indexes });
    return store;
  },
};

applyPracticeDatabaseUpgrade(database);
applyPracticeDatabaseUpgrade(database);
assert.deepEqual([...created.keys()], PRACTICE_STORE_NAMES);
for (const [name, definition] of Object.entries(PRACTICE_STORE_DEFINITIONS)) {
  assert.deepEqual(created.get(name).options.keyPath, definition.keyPath);
  assert.deepEqual(created.get(name).indexes, definition.indexes.map((index) => ({
    name: index.name,
    keyPath: index.keyPath,
    options: index.options || {},
  })));
}

const unavailable = createPracticeIndexedDbStore({ indexedDB: null });
await assert.rejects(
  unavailable.open(),
  (error) => error.code === "PRACTICE_STORAGE_UNAVAILABLE",
);
assert.equal(unavailable.isOpen, false);

const memory = createPracticeMemoryStore();
await memory.open();
await memory.put("meta", { key: "health", value: "healthy" });
await memory.put("quarantine", {
  quarantineId: "practice-quarantine_test-12345678",
  sourceStore: "profiles",
});
assert.equal((await memory.get("meta", "health")).value, "healthy");
assert.equal((await memory.list("quarantine")).length, 1);

console.log("Practice IndexedDB store descriptors, deterministic upgrade, indexes, and unavailable-state behavior passed.");
