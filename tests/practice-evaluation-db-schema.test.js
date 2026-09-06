import test from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_DATABASE_VERSION, PRACTICE_STORE_DEFINITIONS } from "../js/practiceLab/practiceConstants.js";

test("PL18 DB6 adds evaluationStates with only declared profile-wide indexes", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 6);
  assert.deepEqual(PRACTICE_STORE_DEFINITIONS.evaluationStates, {
    keyPath: "evaluationStateId",
    indexes: [
      { name: "profileId", keyPath: "profileId", options: { unique: true } },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  });
});
