import test from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_DAILY_TRAINING, PRACTICE_EXPERIMENT_CATALOG, PRACTICE_EXPERIMENT_IDS,
  validatePracticeExperimentCatalog,
} from "../js/practiceLab/practiceExperimentCatalog.js";

test("canonical Practice catalog contains every stable experiment exactly once", () => {
  assert.deepEqual(PRACTICE_EXPERIMENT_CATALOG.map(({ id }) => id), PRACTICE_EXPERIMENT_IDS);
  assert.equal(new Set(PRACTICE_EXPERIMENT_IDS).size, 15);
  assert.equal(validatePracticeExperimentCatalog(PRACTICE_EXPERIMENT_CATALOG).valid, true);
  assert.equal(PRACTICE_EXPERIMENT_CATALOG.every(({ status }) => ["planned", "preview"].includes(status)), true);
});

test("catalog is deeply immutable, JSON-safe, and contains no runtime callbacks", () => {
  assert.equal(Object.isFrozen(PRACTICE_EXPERIMENT_CATALOG), true);
  for (const entry of PRACTICE_EXPERIMENT_CATALOG) {
    assert.equal(Object.isFrozen(entry), true);
    assert.equal(Object.isFrozen(entry.estimatedDurationMinutes), true);
    assert.equal(Object.isFrozen(entry.capabilities), true);
    assert.equal(Object.values(entry).some((value) => typeof value === "function"), false);
  }
  assert.doesNotThrow(() => JSON.stringify(PRACTICE_EXPERIMENT_CATALOG));
});

test("Daily Training is a separate planned guided program and Error Replay is not an experiment", () => {
  assert.equal(PRACTICE_DAILY_TRAINING.id, "daily-training");
  assert.equal(PRACTICE_DAILY_TRAINING.status, "planned");
  assert.equal(PRACTICE_EXPERIMENT_IDS.includes("daily-training"), false);
  assert.equal(PRACTICE_EXPERIMENT_IDS.includes("error-replay"), false);
});

test("catalog validation rejects duplicate and non-serializable entries", () => {
  const base = { ...PRACTICE_EXPERIMENT_CATALOG[0] };
  assert.equal(validatePracticeExperimentCatalog([base, base]).valid, false);
  assert.equal(validatePracticeExperimentCatalog([{ ...base, callback() {} }]).valid, false);
});
