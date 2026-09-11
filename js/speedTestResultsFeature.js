// Semantic owner for the Typing Test results experience.
//
// V1-V7 remain historical implementation layers rather than public boot
// entrypoints. Their boot-time MutationObserver callbacks are captured as inert
// compatibility steps, then TypingResultsRuntime invokes those steps explicitly
// from the application's shared presentation lifecycle.
import {
  releaseSpeedTestResultsObserverCapture,
} from "./speedTestResultsObserverHub.js";
import "./speedTestPerformanceV1.js";
import "./speedTestPerformanceV2.js";
import "./speedTestPerformanceV3.js";
import "./speedTestPerformanceV4.js";
import "./speedTestPerformanceV5.js";
import "./speedTestResultsV6b.js";
import "./speedTestResultsV7.js";
import { TYPING_RESULTS_RUNTIME_VERSION } from "./typingResultsRuntime.js";

// Restore the browser-native constructor before normal application runtime.
// The captured historical observers stay inert until TypingResultsRuntime runs
// their callbacks as ordered compatibility feature steps.
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

export const SPEED_TEST_RESULTS_LIFECYCLE_VERSION = TYPING_RESULTS_RUNTIME_VERSION;
