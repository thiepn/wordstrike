// Semantic owner for the Typing Test results experience.
//
// V1-V7 are historical implementation layers, not public boot entrypoints.
// Their import order is intentional because later layers enhance DOM created by
// earlier layers. V11 captures their legacy MutationObserver construction first,
// then restores the native constructor after every historical layer has booted.
import {
  releaseSpeedTestResultsObserverCapture,
  SPEED_TEST_RESULTS_OBSERVER_HUB_VERSION,
} from "./speedTestResultsObserverHub.js";
import "./speedTestPerformanceV1.js";
import "./speedTestPerformanceV2.js";
import "./speedTestPerformanceV3.js";
import "./speedTestPerformanceV4.js";
import "./speedTestPerformanceV5.js";
import "./speedTestResultsV6b.js";
import "./speedTestResultsV7.js";

releaseSpeedTestResultsObserverCapture();

export const SPEED_TEST_RESULTS_FEATURE_CHAIN = Object.freeze([
  "performance-graph",
  "pace-consistency",
  "flow-trend",
  "word-mistake-inspector",
  "longitudinal-baseline",
  "typing-coach-shell",
  "adaptive-training-plan",
]);

export const SPEED_TEST_RESULTS_LIFECYCLE_VERSION = SPEED_TEST_RESULTS_OBSERVER_HUB_VERSION;
