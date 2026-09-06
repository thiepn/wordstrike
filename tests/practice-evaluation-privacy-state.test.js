import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultPracticeEvaluationState } from "../js/practiceLab/practiceEvaluationState.js";
import { validatePracticeEvaluationState } from "../js/practiceLab/practiceEvaluationValidation.js";
import { PRACTICE_LIMITS } from "../js/practiceLab/practiceConstants.js";

const profileId = "practice-profile_123456789";

test("PL18 evaluation state is profile-wide, bounded and contains no protected/typed payload", () => {
  const state = createDefaultPracticeEvaluationState({ profileId, now: () => new Date("2026-09-06T12:00:00Z") });
  const validation = validatePracticeEvaluationState(state);
  assert.equal(validation.valid, true);
  assert.equal(state.contextId, undefined);
  assert.equal(Buffer.byteLength(JSON.stringify(state), "utf8") < PRACTICE_LIMITS.evaluationStateBytes, true);
  for (const forbidden of ["typedText", "contentText", "mistyped", "eventTrace", "rawEvents"]) assert.equal(JSON.stringify(state).includes(forbidden), false);
});

test("PL18 state validation rejects private text payload rather than silently keeping it", () => {
  const state = createDefaultPracticeEvaluationState({ profileId, now: () => new Date("2026-09-06T12:00:00Z") });
  const contaminated = { ...state, typedText: "secret passage" };
  assert.equal(validatePracticeEvaluationState(contaminated).valid, false);
});
