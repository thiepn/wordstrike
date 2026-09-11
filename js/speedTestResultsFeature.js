// Semantic owner for the Typing Test results experience.
//
// V1-V7 are historical implementation layers, not public boot entrypoints.
// Their import order is intentional because later layers enhance DOM created by
// earlier layers. New result features should be integrated through this file
// instead of adding another <script> tag to index.html.
import "./speedTestPerformanceV1.js";
import "./speedTestPerformanceV2.js";
import "./speedTestPerformanceV3.js";
import "./speedTestPerformanceV4.js";
import "./speedTestPerformanceV5.js";
import "./speedTestResultsV6b.js";
import "./speedTestResultsV7.js";

export const SPEED_TEST_RESULTS_FEATURE_CHAIN = Object.freeze([
  "performance-graph",
  "pace-consistency",
  "flow-trend",
  "word-mistake-inspector",
  "longitudinal-baseline",
  "typing-coach-shell",
  "adaptive-training-plan",
]);
