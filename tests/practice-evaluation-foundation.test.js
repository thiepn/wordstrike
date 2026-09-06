import test from "node:test";
import assert from "node:assert/strict";
import { buildPracticeFoundationAnalysis, PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";

test("PL18 foundation analysis v9 always owns explicit evaluation component", () => {
  const analysis = buildPracticeFoundationAnalysis({ events: [], traceMetadata: {} });
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 9);
  assert.equal(analysis.version, 9);
  assert.deepEqual(Object.keys(analysis), ["version", "latency", "errors", "normalization", "skills", "ability", "performance", "learning", "retention", "evaluation"]);
  assert.equal(analysis.evaluation.kind, null);
  assert.equal(analysis.evaluation.status, "not-requested");
});
