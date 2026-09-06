import test from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_STORE_DEFINITIONS, PRACTICE_STORE_NAMES, QUOTA_RECOVERY_STEPS } from "../js/practiceLab/practiceConstants.js";

test("PL18 evaluationStates is structural, reset-scoped, and absent from ordinary quota recovery", () => {
  assert.ok(PRACTICE_STORE_NAMES.includes("evaluationStates"));
  assert.equal(PRACTICE_STORE_DEFINITIONS.evaluationStates.keyPath, "evaluationStateId");
  assert.equal(QUOTA_RECOVERY_STEPS.some((step) => /evaluation/i.test(step)), false);
});
