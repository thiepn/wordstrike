import assert from "node:assert/strict";
import { test } from "node:test";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS } from "../js/practiceLab/practiceConstants.js";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";
import {
  PRACTICE_CONTEXT_MODEL_VERSION,
  PRACTICE_CONTEXT_POLICY_VERSION,
  PRACTICE_KEYBOARD_GEOMETRY_VERSION,
  PRACTICE_NORMALIZATION_ANALYSIS_VERSION,
  PRACTICE_TEXT_FEATURE_VERSION,
  PRACTICE_TYPABILITY_MODEL_VERSION,
  PRACTICE_TYPABILITY_REFERENCE_VERSION,
} from "../js/practiceLab/practiceNormalizationConstants.js";
import { validatePracticeNormalizationSummary } from "../js/practiceLab/practiceNormalizationValidation.js";
import { validateSessionSummary } from "../js/practiceLab/practiceValidation.js";

function validNormalizationSummary() {
  return {
    analysisVersion: 1,
    contextModelVersion: 1,
    contextPolicyVersion: 1,
    textFeatureVersion: 1,
    typabilityModelVersion: 1,
    typabilityReferenceVersion: 1,
    frequencyReferenceVersion: null,
    keyboardGeometryVersion: 1,
    context: {
      contextFingerprint: "ctxfp:v1:fixture",
      dataLocale: "en",
      keyboardLayout: "qwerty",
      inputMethod: "unknown",
    },
    transitionNormalization: {
      status: "insufficient-data",
      coverage: {
        traceScope: "complete-session",
        normalizableTransitionCount: 0,
        totalClassifiableTransitionCount: 0,
        normalizationCoverageRate: null,
        geometryKnownCount: 0,
        geometryUnknownCount: 0,
        geometryCoverageRate: null,
        frequencyKnownCount: 0,
        frequencyUnknownCount: 0,
        frequencyCoverageRate: null,
        specificBucketCount: 0,
        coarseBucketCount: 0,
        contextLevelCounts: { global: 0, level1: 0, level2: 0, level3: 0 },
      },
      globalFluentMedianMs: null,
      normalizableTransitionCount: 0,
      normalizedResidualMedianMs: null,
      normalizedResidualP90Ms: null,
      normalizedResidualMedianRatio: null,
      geometryCoverageRate: null,
      frequencyCoverageRate: null,
      contextLevelCounts: { global: 0, level1: 0, level2: 0, level3: 0 },
    },
    textDifficulty: {
      status: "partial",
      modelKind: "heuristic-relative-v1",
      difficultyIndex: 0,
      relativeDifficultyPercentile: 50,
      availableModelWeight: 0.62,
      wordFrequencyCoverageRate: 0,
      bigramFrequencyCoverageRate: 0,
      corpusId: null,
      corpusVersion: null,
      contentId: "practice-content_fixture",
      contentHash: "fnv1a-12345678",
      referenceItemCount: 2,
      staticMetadataUsed: false,
    },
  };
}

test("PL10 model versions remain stable inside the current PL18 storage/session/foundation envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 6);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 11);
  assert.equal(PRACTICE_RECORD_VERSIONS.reviewItem, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.checkpoint, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.skillStat, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.learningState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.evaluationState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.profile, 3);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 9);
  assert.equal(PRACTICE_NORMALIZATION_ANALYSIS_VERSION, 1);
  assert.equal(PRACTICE_CONTEXT_MODEL_VERSION, 1);
  assert.equal(PRACTICE_CONTEXT_POLICY_VERSION, 1);
  assert.equal(PRACTICE_TEXT_FEATURE_VERSION, 1);
  assert.equal(PRACTICE_TYPABILITY_MODEL_VERSION, 1);
  assert.equal(PRACTICE_TYPABILITY_REFERENCE_VERSION, 1);
  assert.equal(PRACTICE_KEYBOARD_GEOMETRY_VERSION, 1);
});

test("PL10 sessionSummary v4 migration preserves null normalization evidence through current PL18 v11", () => {
  const current = createDefaultSessionSummary();
  const historical = { ...current, recordVersion: 4 };
  delete historical.normalizationSummary;
  delete historical.skillEvidenceSummary;
  delete historical.abilityMeasurementSummary;
  delete historical.performanceMeasurementSummary;
  delete historical.learningEvidenceSummary;
  delete historical.retentionReviewSummary;
  delete historical.evaluationSummary;
  const source = structuredClone(historical);
  const migrated = migratePracticeRecord("sessionSummary", historical);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.fromVersion, 4);
  assert.equal(migrated.toVersion, 11);
  assert.deepEqual(migrated.steps, ["sessionSummary:4->5", "sessionSummary:5->6", "sessionSummary:6->7", "sessionSummary:7->8", "sessionSummary:8->9", "sessionSummary:9->10", "sessionSummary:10->11"]);
  assert.equal(migrated.value.normalizationSummary, null);
  assert.equal(migrated.value.skillEvidenceSummary, null);
  assert.equal(migrated.value.abilityMeasurementSummary, null);
  assert.equal(migrated.value.performanceMeasurementSummary, null);
  assert.equal(migrated.value.learningEvidenceSummary, null);
  assert.equal(migrated.value.retentionReviewSummary, null);
  assert.equal(migrated.value.evaluationSummary, null);
  assert.deepEqual(historical, source);
});

test("PL10 normalization remains null in the complete historical v1 -> v11 migration chain", () => {
  const current = createDefaultSessionSummary();
  const historical = { ...current, recordVersion: 1 };
  for (const key of ["contextId", "fluencySummary", "errorSummary", "normalizationSummary", "skillEvidenceSummary", "abilityMeasurementSummary", "performanceMeasurementSummary", "learningEvidenceSummary", "retentionReviewSummary", "evaluationSummary"]) delete historical[key];
  const migrated = migratePracticeRecord("sessionSummary", historical);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.steps, [
    "sessionSummary:1->2",
    "sessionSummary:2->3",
    "sessionSummary:3->4",
    "sessionSummary:4->5",
    "sessionSummary:5->6",
    "sessionSummary:6->7",
    "sessionSummary:7->8",
    "sessionSummary:8->9",
    "sessionSummary:9->10",
    "sessionSummary:10->11",
  ]);
  assert.equal(migrated.value.recordVersion, 11);
  assert.equal(migrated.value.fluencySummary, null);
  assert.equal(migrated.value.errorSummary, null);
  assert.equal(migrated.value.normalizationSummary, null);
  assert.equal(migrated.value.skillEvidenceSummary, null);
  assert.equal(migrated.value.abilityMeasurementSummary, null);
  assert.equal(migrated.value.performanceMeasurementSummary, null);
  assert.equal(migrated.value.learningEvidenceSummary, null);
  assert.equal(migrated.value.retentionReviewSummary, null);
  assert.equal(migrated.value.evaluationSummary, null);
});

test("PL10 durable normalizationSummary validates compact context/coverage/difficulty only", () => {
  const summary = validNormalizationSummary();
  assert.equal(validatePracticeNormalizationSummary(summary).valid, true);
  const session = { ...createDefaultSessionSummary(), normalizationSummary: summary };
  assert.equal(validateSessionSummary(session).valid, true);
  for (const forbidden of ["normalizedTransitions", "transitionModel", "features", "rawText", "entityResiduals"]) {
    const invalid = structuredClone(summary);
    invalid[forbidden] = [];
    assert.equal(validatePracticeNormalizationSummary(invalid).valid, false, forbidden);
  }
});

test("PL10 durable context refuses inferred hardware/browser/device identity", () => {
  for (const field of ["hardwareProfileId", "hardwareNickname", "browserFingerprint", "deviceFingerprint"]) {
    const invalid = validNormalizationSummary();
    invalid.context[field] = "invented";
    assert.equal(validatePracticeNormalizationSummary(invalid).valid, false, field);
  }
});

test("PL10 validation rejects impossible coverage/status relationships", () => {
  const badCount = validNormalizationSummary();
  badCount.transitionNormalization.coverage.totalClassifiableTransitionCount = 1;
  assert.equal(validatePracticeNormalizationSummary(badCount).valid, false);
  const badPartial = validNormalizationSummary();
  badPartial.textDifficulty.availableModelWeight = 0.2;
  assert.equal(validatePracticeNormalizationSummary(badPartial).valid, false);
  const badUnsupported = validNormalizationSummary();
  badUnsupported.textDifficulty.status = "unsupported-language";
  assert.equal(validatePracticeNormalizationSummary(badUnsupported).valid, false);
});
