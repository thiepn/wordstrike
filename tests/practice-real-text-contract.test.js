import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PRACTICE_REAL_TEXT_VERSION,
  PRACTICE_REAL_TEXT_POLICY_VERSION,
  PRACTICE_REAL_TEXT_POOL_SCHEMA_VERSION,
  PRACTICE_REAL_TEXT_GENERATOR_VERSION,
  PRACTICE_REAL_TEXT_SELECTION_VERSION,
  PRACTICE_REAL_TEXT_RESULT_VERSION,
  PRACTICE_COLD_TRANSFER_LAUNCH_VERSION,
  PRACTICE_REAL_TEXT_DURATIONS_MS,
  PRACTICE_REAL_TEXT_DEFAULT_DURATION_MS,
} from "../js/practiceLab/practiceRealTextConstants.js";
import { getPracticeRealTextRequiredGraphemes } from "../js/practiceLab/practiceRealTextPolicy.js";
import { createPracticeRealTextDescriptor } from "../js/practiceLab/practiceRealTextExperiment.js";
import { PRACTICE_REAL_TEXT_COLD_TRANSFER_DESCRIPTOR } from "../js/practiceLab/practiceRealTextColdTransfer.js";
import { getPracticeExperiment, PRACTICE_EXPERIMENT_CATALOG } from "../js/practiceLab/practiceExperimentCatalog.js";
import { getRealTextPracticeAvailability } from "../js/practiceLab/practiceRealTextAvailability.js";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS } from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";

test("PL24 contracts remain intact inside the PL25 DB8/session13/foundation10 envelope and all PL24 protocols stay v1", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 8);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10);
  assert.deepEqual([
    PRACTICE_REAL_TEXT_VERSION,
    PRACTICE_REAL_TEXT_POLICY_VERSION,
    PRACTICE_REAL_TEXT_POOL_SCHEMA_VERSION,
    PRACTICE_REAL_TEXT_GENERATOR_VERSION,
    PRACTICE_REAL_TEXT_SELECTION_VERSION,
    PRACTICE_REAL_TEXT_RESULT_VERSION,
    PRACTICE_COLD_TRANSFER_LAUNCH_VERSION,
  ], [1, 1, 1, 1, 1, 1, 1]);
});

test("PL24 Natural Practice duration enum and engineering capacity are exact", () => {
  assert.deepEqual(PRACTICE_REAL_TEXT_DURATIONS_MS, [180_000, 300_000, 600_000]);
  assert.equal(PRACTICE_REAL_TEXT_DEFAULT_DURATION_MS, 300_000);
  assert.equal(getPracticeRealTextRequiredGraphemes(180_000), 6600);
  assert.equal(getPracticeRealTextRequiredGraphemes(300_000), 11000);
  assert.equal(getPracticeRealTextRequiredGraphemes(600_000), 22000);
  assert.equal(getPracticeRealTextRequiredGraphemes(60_000), null);
});

test("PL24 keeps one visible real-text card and the cold-transfer descriptor internal", () => {
  assert.equal(PRACTICE_EXPERIMENT_CATALOG.filter((entry) => entry.id === "real-text").length, 1);
  assert.equal(PRACTICE_EXPERIMENT_CATALOG.some((entry) => entry.id === "real-text-cold-transfer"), false);
  const entry = getPracticeExperiment("real-text");
  assert.equal(entry.status, "preview");
  assert.equal(entry.category, "real-world");
  assert.deepEqual(entry.capabilities, ["duration-options", "broad-training", "cold-transfer-launch"]);
});

test("PL24 Natural Practice has no protected measurement privilege or target configuration", () => {
  const descriptor = createPracticeRealTextDescriptor();
  assert.equal(descriptor.id, "real-text");
  assert.equal(descriptor.resumable, false);
  assert.equal(descriptor.abilityChannel, null);
  assert.equal(descriptor.performanceMeasurementKind, null);
  assert.equal(descriptor.retentionMeasurementKind, null);
  assert.equal(descriptor.evaluationMeasurementKind, null);
  assert.deepEqual(descriptor.supportedCompletionModes, ["duration"]);
  assert.equal(descriptor.validateConfiguration({ realTextVersion: 1, policyVersion: 1, generatorVersion: 1, durationMs: 300000, correctionBehavior: "allow" }), true);
  assert.equal(descriptor.validateConfiguration({ realTextVersion: 1, policyVersion: 1, generatorVersion: 1, durationMs: 300000, correctionBehavior: "allow", target: "br" }), false);
});

test("PL24 hidden Cold Transfer descriptor requests exactly PL18 cold-transfer plus one cold-natural ability channel", () => {
  const descriptor = PRACTICE_REAL_TEXT_COLD_TRANSFER_DESCRIPTOR;
  assert.equal(descriptor.id, "real-text-cold-transfer");
  assert.equal(descriptor.resumable, false);
  assert.equal(descriptor.evaluationMeasurementKind, "cold-transfer");
  assert.equal(descriptor.abilityChannel, "cold-natural-text");
  assert.equal(descriptor.performanceMeasurementKind, null);
  assert.equal(descriptor.retentionMeasurementKind, null);
  assert.deepEqual(descriptor.supportedCompletionModes, ["duration"]);
});

test("PL24 checked-in production Real Text pool is an honest draft, not fabricated capacity", async () => {
  const pool = JSON.parse(await readFile(new URL("../data/practice/real-text/en-v1/WS-REALTEXT-EN-1.manifest.json", import.meta.url), "utf8"));
  assert.equal(pool.poolId, "WS-REALTEXT-EN-1");
  assert.equal(pool.status, "draft");
  assert.equal(pool.units.length, 0);
  assert.equal(pool.releaseReport.releaseBlockers.includes("minimum-ready-unit-count:0/16"), true);
  const availability = getRealTextPracticeAvailability({ pool, language: "en" });
  assert.equal(availability.status, "unavailable");
  assert.deepEqual(availability.supportedDurationsMs, []);
});
