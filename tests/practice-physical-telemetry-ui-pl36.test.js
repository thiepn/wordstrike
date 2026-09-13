import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRACTICE_LAB_ROUTES, PRACTICE_LAB_PUBLIC_ROUTES, createPracticeLabRoute, normalizePracticeLabRoute } from "../js/practiceLab/practiceLabRoutes.js";
import { renderPracticePhysicalKeyboardPage } from "../js/practiceLab/practiceLabRendererV36.js";

assert.equal(PRACTICE_LAB_ROUTES.PHYSICAL_KEYBOARD, "physical-keyboard");
assert.ok(PRACTICE_LAB_PUBLIC_ROUTES.includes(PRACTICE_LAB_ROUTES.PHYSICAL_KEYBOARD));
const normalized = normalizePracticeLabRoute(createPracticeLabRoute(PRACTICE_LAB_ROUTES.PHYSICAL_KEYBOARD), { featureGate: { canAccess: () => true } });
assert.equal(normalized.name, PRACTICE_LAB_ROUTES.PHYSICAL_KEYBOARD);

const root = {
  innerHTML: "",
  querySelector() { return null; },
};
renderPracticePhysicalKeyboardPage(root, {
  status: "ready",
  availability: { enabled: true, contextEligible: true, inputMethod: "physical" },
  snapshot: {
    coverage: { eligibleSessions: 2, physicalKeyActivations: 80, physicalCodesObserved: 2, transitionsObserved: 1, latestTelemetryDate: "2026-09-12T00:00:00.000Z" },
    keys: [{ entityKey: "KeyA", observation: { activationCount: 50 }, observedMisstrikeOriginRate: 0.02, medianResidualMs: 4, disfluencyRate: 0.1, confidence: "medium" }],
    transitions: [{ entityKey: "KeyA>KeyB", observation: { timingEligibleCount: 30 }, medianResidualMs: 8, disfluencyRate: 0.1, confidence: "medium" }],
    modifierRoutes: [{ entityKey: "uppercase-letter|shift|left", observation: { opportunityCount: 12, timingEligibleCount: 10 }, medianResidualMs: 3, confidence: "low" }],
  },
  hasStoredData: true,
});
assert.match(root.innerHTML, /Physical Keyboard/);
assert.match(root.innerHTML, /Local only/);
assert.match(root.innerHTML, /Physical code/);
assert.match(root.innerHTML, /KeyA/);
assert.match(root.innerHTML, /KeyB/);
assert.match(root.innerHTML, /Modifier Patterns/);
assert.match(root.innerHTML, /data-practice-physical-toggle/);
assert.match(root.innerHTML, /data-practice-physical-clear/);
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
const latestRuntime = loader.match(/practiceLabControllerRuntimeV(\d+)\.js/);
assert.ok(latestRuntime, "current Practice Lab loader must use a versioned runtime wrapper");
assert.ok(Number(latestRuntime[1]) >= 36, "current Practice Lab loader must preserve PL36 through all later runtime wrappers");
assert.doesNotMatch(controller, /registerPractice.*Physical/i, "PL36 must not register an experiment card");

console.log("PL36 Physical Keyboard route, physical-context discovery, local diagnostics UI, settings, and clear controls passed.");
