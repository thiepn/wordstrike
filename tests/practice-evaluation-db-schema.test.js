import test from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_DATABASE_VERSION, PRACTICE_STORE_DEFINITIONS } from "../js/practiceLab/practiceConstants.js";

test("PL18 evaluationStates remain structurally unchanged inside the PL31 DB9 envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 9);
  assert.deepEqual(PRACTICE_STORE_DEFINITIONS.evaluationStates, {
    keyPath: "evaluationStateId",
    indexes: [
      { name: "profileId", keyPath: "profileId", options: { unique: true } },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  });
});
