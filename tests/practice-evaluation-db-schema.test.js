import test from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_DATABASE_VERSION, PRACTICE_STORE_DEFINITIONS } from "../js/practiceLab/practiceConstants.js";

test("PL18 evaluationStates remain structurally unchanged inside the PL32 DB10 envelope", () => {
  assert.ok(PRACTICE_DATABASE_VERSION >= 10);
  assert.deepEqual(PRACTICE_STORE_DEFINITIONS.evaluationStates, {
    keyPath: "evaluationStateId",
    indexes: [
      { name: "profileId", keyPath: "profileId", options: { unique: true } },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  });
});
