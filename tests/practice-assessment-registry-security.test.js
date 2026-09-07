import assert from "node:assert/strict";
import { test } from "node:test";
import { PRACTICE_EXPERIMENT_CATALOG } from "../js/practiceLab/practiceExperimentCatalog.js";
import {
  PRACTICE_ASSESSMENT_CHILD_DESCRIPTORS,
  getPracticeTrustedAssessmentBinding,
  registerPracticeTrustedAssessmentBinding,
} from "../js/practiceLab/practiceAssessmentRegistry.js";

test("PL19 trusted child descriptors have exact measurement roles and are not catalog cards", () => {
  const benchmark = PRACTICE_ASSESSMENT_CHILD_DESCRIPTORS.benchmark;
  const diagnostic = PRACTICE_ASSESSMENT_CHILD_DESCRIPTORS.diagnostic;
  const transfer = PRACTICE_ASSESSMENT_CHILD_DESCRIPTORS.coldTransfer;
  assert.equal(benchmark.id, "full-assessment-benchmark");
  assert.equal(benchmark.evaluationMeasurementKind, "benchmark");
  assert.equal(benchmark.abilityChannel, "cold-natural-text");
  assert.equal(benchmark.resumable, false);
  assert.equal(diagnostic.id, "full-assessment-diagnostic");
  assert.equal(diagnostic.evaluationMeasurementKind, null);
  assert.equal(diagnostic.abilityChannel, null);
  assert.equal(diagnostic.performanceMeasurementKind, null);
  assert.equal(diagnostic.retentionMeasurementKind, null);
  assert.equal(transfer.id, "full-assessment-transfer");
  assert.equal(transfer.evaluationMeasurementKind, "cold-transfer");
  assert.equal(transfer.abilityChannel, null);
  assert.equal(transfer.resumable, false);
  const catalogIds = new Set(PRACTICE_EXPERIMENT_CATALOG.map((entry) => entry.id));
  assert.equal(catalogIds.has(benchmark.id), false);
  assert.equal(catalogIds.has(diagnostic.id), false);
  assert.equal(catalogIds.has(transfer.id), false);
  assert.equal(catalogIds.has("full-assessment"), true);
});

test("PL19 assessment privilege is object-bound and cannot be spoofed by serializing configuration", () => {
  const contentPlan = {};
  const binding = {
    assessmentRunId: "practice-assessment_security-12345678",
    blockId: "diagnostic-core-keys",
    blockOrdinal: 2,
    protocolVersion: 1,
    planVersion: 1,
    planHash: "fnv1a32-12345678",
    expectedExperimentId: "full-assessment-diagnostic",
  };
  registerPracticeTrustedAssessmentBinding(contentPlan, binding);
  assert.equal(getPracticeTrustedAssessmentBinding(contentPlan).assessmentRunId, binding.assessmentRunId);
  assert.equal(getPracticeTrustedAssessmentBinding(JSON.parse(JSON.stringify(contentPlan))), null);
  assert.equal(getPracticeTrustedAssessmentBinding({ assessmentBinding: binding }), null);
});
