import test from "node:test";
import assert from "node:assert/strict";
import {
  filterPracticeFiniteValues,
  practiceMad,
  practiceMedian,
  practiceQuantile,
  practiceRobustScale,
} from "../js/practiceLab/practiceRobustStats.js";

test("PL8 median, quantile, MAD and robust scale are deterministic and non-mutating", () => {
  assert.equal(practiceMedian([1]), 1);
  assert.equal(practiceMedian([1, 3]), 2);
  assert.equal(practiceMedian([3, 1, 2]), 2);
  assert.equal(practiceMedian([]), null);
  assert.equal(practiceQuantile([0, 10], 0.9), 9);
  assert.equal(practiceQuantile([], 0.5), null);
  assert.equal(practiceMad([1, 2, 3]), 1);
  assert.ok(Math.abs(practiceRobustScale([1, 2, 3]) - 1.4826) < 1e-12);

  const source = [3, Number.NaN, 1, Infinity, 2, -1];
  const copy = [...source];
  assert.deepEqual(filterPracticeFiniteValues(source, { min: 0 }), [3, 1, 2]);
  assert.equal(practiceMedian(source, { min: 0 }), 2);
  assert.deepEqual(source, copy);
});

test("PL8 robust center resists one extreme latency outlier", () => {
  const values = [80, 82, 85, 87, 90, 94, 100, 1400];
  assert.equal(practiceMedian(values), 88.5);
  assert.ok(practiceMad(values) < 10);
  assert.ok(practiceRobustScale(values) < 15);
});
