import test from "node:test";
import assert from "node:assert/strict";
import { buildPracticeFoundationAnalysis, PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";

test("PL18 evaluation remains explicit inside PL19 foundation analysis v10", () => {
  const analysis = buildPracticeFoundationAnalysis({ events: [], traceMetadata: {} });
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10);
  assert.equal(analysis.version, 10);
  assert.deepEqual(Object.keys(analysis), ["version", "latency", "errors", "normalization", "skills", "ability", "performance", "learning", "retention", "evaluation", "assessment"]);
  assert.equal(analysis.evaluation.kind, null);
  assert.equal(analysis.evaluation.status, "not-requested");
  assert.equal(analysis.assessment.status, "not-requested");
});
