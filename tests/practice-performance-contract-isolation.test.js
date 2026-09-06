import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION, withPracticePerformanceAnalysis } from "../js/practiceLab/practiceFoundationAnalysis.js";
import { validatePracticeExperimentDescriptor, validatePracticeSessionConfiguration, createGenericPracticeExperimentDescriptor } from "../js/practiceLab/practiceSessionContract.js";

const validFrontierCallback = () => ({ stages: [] });

test("PL14 trusted descriptor separates ability, state probe and frontier roles", () => {
  assert.equal(validatePracticeExperimentDescriptor(createGenericPracticeExperimentDescriptor()).valid, true);
  assert.equal(validatePracticeExperimentDescriptor(createGenericPracticeExperimentDescriptor({ performanceMeasurementKind: "state-probe", performanceReferenceChannel: "controlled-speed" })).valid, true);
  assert.equal(validatePracticeExperimentDescriptor(createGenericPracticeExperimentDescriptor({ performanceMeasurementKind: "control-frontier", performanceReferenceChannel: "controlled-speed", buildPerformanceMeasurement: validFrontierCallback })).valid, true);
  const conflict = createGenericPracticeExperimentDescriptor({ abilityChannel: "controlled-speed", performanceMeasurementKind: "state-probe", performanceReferenceChannel: "controlled-speed" });
  assert.equal(validatePracticeExperimentDescriptor(conflict).valid, false);
  const wrongFrontier = createGenericPracticeExperimentDescriptor({ performanceMeasurementKind: "control-frontier", performanceReferenceChannel: "burst", buildPerformanceMeasurement: validFrontierCallback });
  assert.equal(validatePracticeExperimentDescriptor(wrongFrontier).valid, false);
  const missingCallback = createGenericPracticeExperimentDescriptor({ performanceMeasurementKind: "control-frontier", performanceReferenceChannel: "controlled-speed" });
  assert.equal(validatePracticeExperimentDescriptor(missingCallback).valid, false);
  const stateCallback = createGenericPracticeExperimentDescriptor({ performanceMeasurementKind: "state-probe", performanceReferenceChannel: "controlled-speed", buildPerformanceMeasurement: validFrontierCallback });
  assert.equal(validatePracticeExperimentDescriptor(stateCallback).valid, false);
});

test("PL14 session configuration cannot spoof trusted performance metadata", () => {
  assert.equal(validatePracticeSessionConfiguration({ performanceMeasurementKind: "state-probe" }).valid, false);
  assert.equal(validatePracticeSessionConfiguration({ performanceReferenceChannel: "controlled-speed" }).valid, false);
  assert.equal(validatePracticeSessionConfiguration({ abilityChannel: "controlled-speed" }).valid, false);
});

test("PL14 performance attachment remains immutable inside PL18 foundation analysis v9", () => {
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 9);
  const base = Object.freeze({ version: 9, latency: null, errors: null, normalization: null, skills: null, ability: null, performance: null, learning: null, retention: null, evaluation: null });
  const performance = { version: 1, status: "not-requested", reasons: [], measurementKind: null, stateProbe: null, warmup: null, frontier: null, sessionSummary: null, performanceStateDelta: null };
  const attached = withPracticePerformanceAnalysis(base, performance);
  assert.equal(attached.performance.status, "not-requested");
  assert.equal(Object.isFrozen(attached), true);
  assert.equal(Object.isFrozen(attached.performance), true);
});

test("PL14 pure modules import with zero storage/network/listener/timer side effects", async () => {
  const original = { indexedDB: globalThis.indexedDB, localStorage: globalThis.localStorage, fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval, document: globalThis.document, window: globalThis.window };
  const counts = { open: 0, storage: 0, fetch: 0, timer: 0, listener: 0 };
  globalThis.indexedDB = { open() { counts.open += 1; throw new Error("unexpected IndexedDB open"); } };
  globalThis.localStorage = { getItem() { return null; }, setItem() { counts.storage += 1; }, removeItem() { counts.storage += 1; } };
  globalThis.fetch = async () => { counts.fetch += 1; throw new Error("unexpected fetch"); };
  globalThis.setTimeout = () => { counts.timer += 1; return 1; };
  globalThis.setInterval = () => { counts.timer += 1; return 1; };
  globalThis.document = { addEventListener() { counts.listener += 1; } };
  globalThis.window = { addEventListener() { counts.listener += 1; } };
  try {
    const stamp = Date.now();
    for (const module of ["practiceAdjustedPerformance", "practicePerformanceConstants", "practicePerformancePolicy", "practiceStateProbe", "practiceWarmupModel", "practiceControlFrontier", "practicePerformanceState", "practicePerformanceAnalysis", "practicePerformanceValidation"]) await import(`../js/practiceLab/${module}.js?pl14=${stamp}`);
    assert.deepEqual(counts, { open: 0, storage: 0, fetch: 0, timer: 0, listener: 0 });
  } finally {
    Object.assign(globalThis, original);
  }
});

test("PL14 model modules have no ranked, auth, Supabase, limiter, or UI dependency", async () => {
  for (const module of ["practiceAdjustedPerformance", "practicePerformancePolicy", "practiceStateProbe", "practiceWarmupModel", "practiceControlFrontier", "practicePerformanceState", "practicePerformanceAnalysis", "practicePerformanceValidation"]) {
    const source = await readFile(new URL(`../js/practiceLab/${module}.js`, import.meta.url), "utf8");
    assert.equal(/leaderboard|supabase|authService|practiceLimiter|practiceUI|renderPractice/i.test(source), false, `${module} crossed an isolation boundary`);
  }
});
