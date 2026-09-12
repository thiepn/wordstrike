import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderPracticePhysicalTelemetryPage } from "../js/practiceLab/practicePhysicalTelemetryUi.js";

const root = {
  innerHTML: "",
  querySelector() { return null; },
};

renderPracticePhysicalTelemetryPage(root, {
  enabled: false,
  contextEligible: true,
  hasHistoricalData: true,
  coverage: { eligibleTextEventCount: 100, validCodeEventCount: 90, validCodeCoverage: 0.9, persisted: true },
  evidenceConfidence: { label: "moderate", score: 0.6 },
  keyStats: [{ entityKey: "KeyT", attempts: 50, observedMisstrikeOriginRate: 0.04, averageNormalizedResidualMs: 20 }],
  transitionStats: [{ entityKey: "KeyT→KeyH", attempts: 30, averageNormalizedResidualMs: 35 }],
  modifierStats: [{ entityKey: "shift-left:letter", attempts: 20, observedMisstrikeOriginRate: 0.05 }],
});

assert.match(root.innerHTML, /Physical Keyboard/);
assert.match(root.innerHTML, /local/i);
assert.match(root.innerHTML, /does not save raw physical keystroke sequences/i);
assert.doesNotMatch(root.innerHTML, />Physical accuracy</i);

const here = path.dirname(fileURLToPath(import.meta.url));
const controller = fs.readFileSync(path.join(here, "../js/practiceLab/practiceLabControllerRuntimeV36.js"), "utf8");
const loader = fs.readFileSync(path.join(here, "../js/practiceLab/practiceLabController.js"), "utf8");
assert.match(controller, /contextEligible !== true/);
assert.match(controller, /title: "Physical Keyboard"/);
assert.match(controller, /data-practice-physical-enable/);
assert.match(controller, /data-practice-physical-clear/);
assert.match(controller, /confirm\?\.\("Clear all locally stored physical keyboard telemetry/);
assert.match(loader, /practiceLabControllerRuntimeV37\.js/, "current Practice Lab loader must preserve PL36 through the latest runtime wrapper");
assert.doesNotMatch(controller, /registerPractice.*Physical/i, "PL36 must not register an experiment card");

console.log("PL36 Physical Keyboard route, physical-context discovery, local diagnostics UI, settings, and clear controls passed.");
