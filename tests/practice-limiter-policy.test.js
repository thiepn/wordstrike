import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_LIMITER_POLICY_V1,
  scalePracticeLimiterSeverity,
  validatePracticeLimiterPolicy,
} from "../js/practiceLab/practiceLimiterPolicy.js";

test("PL12 canonical limiter policy validates and prevalence authority weights are exact", () => {
  assert.strictEqual(validatePracticeLimiterPolicy(PRACTICE_LIMITER_POLICY_V1), PRACTICE_LIMITER_POLICY_V1);
  assert.deepEqual(PRACTICE_LIMITER_POLICY_V1.prevalenceQualityWeights, {
    reference: 1,
    "practice-proxy": 0.60,
    unavailable: 0,
  });
});

test("PL12 prevalence quality validation rejects alternate weights that merely share the same sum", () => {
  assert.throws(
    () => validatePracticeLimiterPolicy({
      ...PRACTICE_LIMITER_POLICY_V1,
      prevalenceQualityWeights: { reference: 0.9, "practice-proxy": 0.7, unavailable: 0 },
    }),
    /prevalence quality weights/i,
  );
  assert.throws(
    () => validatePracticeLimiterPolicy({
      ...PRACTICE_LIMITER_POLICY_V1,
      prevalenceQualityWeights: { reference: 1, "practice-proxy": 0.6, unavailable: 0, extra: 0 },
    }),
    /prevalence quality weights/i,
  );
});

test("PL12 shared severity scaler has exact deadband, saturation and interpolation semantics", () => {
  assert.equal(scalePracticeLimiterSeverity(-1, 0.03, 0.30), 0);
  assert.equal(scalePracticeLimiterSeverity(0.03, 0.03, 0.30), 0);
  assert.equal(scalePracticeLimiterSeverity(0.30, 0.03, 0.30), 100);
  assert.equal(scalePracticeLimiterSeverity(10, 0.03, 0.30), 100);
  assert.ok(Math.abs(scalePracticeLimiterSeverity(0.165, 0.03, 0.30) - 50) < 1e-12);
});
