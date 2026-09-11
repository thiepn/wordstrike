// WORDSTRIKE V13 — native Typing Test results feature pipeline.
//
// V1-V7 keep their mature rendering/calculation logic, but they no longer boot
// themselves or register MutationObservers. This module is the only semantic
// owner of their ordering and exposes explicit runtime hooks.

import { syncSpeedTestWordProfiler } from "./speedTestWordProfileV4.js";
import { syncSpeedTestPerformanceV1 } from "./speedTestPerformanceV1.js";
import { syncSpeedTestPerformanceV2 } from "./speedTestPerformanceV2.js";
import { syncSpeedTestPerformanceV3 } from "./speedTestPerformanceV3.js";
import { syncSpeedTestPerformanceV4 } from "./speedTestPerformanceV4.js";
import { syncSpeedTestPerformanceV5 } from "./speedTestPerformanceV5.js";
import {
  closeTypingCoachV6PracticeOverlay,
  syncSpeedTestResultsV6,
  syncTypingCoachV6PracticeOverlay,
} from "./speedTestResultsV6b.js";
import {
  handleTypingCoachV7DocumentClick,
  syncSpeedTestResultsV7,
} from "./speedTestResultsV7.js";

export const SPEED_TEST_RESULTS_LIFECYCLE_VERSION = 13;

export const SPEED_TEST_RESULTS_FEATURE_CHAIN = Object.freeze([
  "performance-graph",
  "pace-consistency",
  "flow-trend",
  "word-mistake-inspector",
  "longitudinal-baseline",
  "typing-coach-shell",
  "adaptive-training-plan",
]);

const FEATURE_STEPS = Object.freeze([
  Object.freeze({ id: "word-profiler", sync: syncSpeedTestWordProfiler }),
  Object.freeze({ id: "performance-graph", sync: syncSpeedTestPerformanceV1 }),
  Object.freeze({ id: "pace-consistency", sync: syncSpeedTestPerformanceV2 }),
  Object.freeze({ id: "flow-trend", sync: syncSpeedTestPerformanceV3 }),
  Object.freeze({ id: "word-mistake-inspector", sync: syncSpeedTestPerformanceV4 }),
  Object.freeze({ id: "longitudinal-baseline", sync: syncSpeedTestPerformanceV5 }),
  Object.freeze({ id: "typing-coach-shell", sync: syncSpeedTestResultsV6 }),
  Object.freeze({ id: "typing-coach-practice", sync: syncTypingCoachV6PracticeOverlay }),
  Object.freeze({ id: "adaptive-training-plan", sync: syncSpeedTestResultsV7 }),
]);

let passCount = 0;
let stepInvocations = 0;
let stepErrors = 0;

function reportFeatureError(error, step) {
  stepErrors += 1;
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
    return;
  }
  globalThis.console?.error?.(`Typing Results feature failed: ${step?.id || "unknown"}`, error);
}

export function runSpeedTestResultsFeatures() {
  passCount += 1;
  let invoked = 0;
  for (const step of FEATURE_STEPS) {
    try {
      step.sync();
      invoked += 1;
      stepInvocations += 1;
    } catch (error) {
      reportFeatureError(error, step);
    }
  }
  return invoked;
}

export function handleSpeedTestResultsDocumentClick(event) {
  return handleTypingCoachV7DocumentClick(event);
}

export function closeSpeedTestResultsTransientFeatures() {
  closeTypingCoachV6PracticeOverlay();
}

export function getSpeedTestResultsFeatureDiagnostics() {
  return Object.freeze({
    version: SPEED_TEST_RESULTS_LIFECYCLE_VERSION,
    passCount,
    stepInvocations,
    stepErrors,
    stepIds: Object.freeze(FEATURE_STEPS.map((step) => step.id)),
  });
}
