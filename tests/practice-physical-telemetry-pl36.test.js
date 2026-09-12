import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_DEFINITIONS,
} from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_RECORD_VERSIONS as PRACTICE_RECORD_VERSIONS_V31 } from "../js/practiceLab/practiceConstantsV31.js";
import { createDefaultPracticeSettings } from "../js/practiceLab/practiceDefaults.js";
import { normalizePracticeSettings } from "../js/practiceLab/practiceValidation.js";
import {
  getPracticePhysicalCodeMetadata,
  isPracticePhysicalTextCode,
} from "../js/practiceLab/practicePhysicalCodeMap.js";
import { createPracticePhysicalModifierTracker } from "../js/practiceLab/practicePhysicalModifierTracker.js";
import {
  classifyPracticePhysicalOutputClass,
  isPracticePhysicalTelemetryEventEligible,
  normalizePracticePhysicalKeyEvent,
} from "../js/practiceLab/practicePhysicalTelemetryEvent.js";
import { createPracticePhysicalTelemetryAccumulator } from "../js/practiceLab/practicePhysicalTelemetryAccumulator.js";
import { calculatePracticePhysicalTelemetryConfidence } from "../js/practiceLab/practicePhysicalTelemetryConfidence.js";
import {
  getPracticePhysicalTelemetryPersistencePolicy,
  getPracticePhysicalTelemetryRuntimeEligibility,
} from "../js/practiceLab/practicePhysicalTelemetryPolicy.js";
import { renderPracticePhysicalTelemetryPanel } from "../js/practiceLab/practicePhysicalTelemetryUi.js";

assert.equal(PRACTICE_DATABASE_VERSION, 11);
assert.ok(PRACTICE_STORE_DEFINITIONS.physicalTelemetryStats);
assert.ok(PRACTICE_STORE_DEFINITIONS.physicalTelemetrySessions);
assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, PRACTICE_RECORD_VERSIONS_V31.sessionSummary, "PL36 must not bump session-summary version");
assert.equal(createDefaultPracticeSettings().physicalKeyboardTelemetryEnabled, false);
assert.equal(normalizePracticeSettings({ physicalKeyboardTelemetryEnabled: true }).physicalKeyboardTelemetryEnabled, true);
assert.equal(normalizePracticeSettings({}).physicalKeyboardTelemetryEnabled, false);

assert.equal(isPracticePhysicalTextCode("KeyY"), true);
assert.equal(getPracticePhysicalCodeMetadata("KeyY").code, "KeyY");
assert.equal(isPracticePhysicalTextCode("Numpad1"), true);
assert.notEqual(getPracticePhysicalCodeMetadata("Numpad1").row, getPracticePhysicalCodeMetadata("Digit1").row);
assert.equal(isPracticePhysicalTextCode("Backspace"), false);
assert.equal(isPracticePhysicalTextCode("ShiftLeft"), false);

const fakeEvent = (overrides = {}) => ({
  code: "KeyA", key: "a", location: 0, repeat: false, isComposing: false,
  shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
  getModifierState(name) { return name === "AltGraph" ? Boolean(overrides.altGraph) : name === "CapsLock" ? Boolean(overrides.capsLock) : false; },
  ...overrides,
});
const tracker = createPracticePhysicalModifierTracker();
tracker.observeKeyDown(fakeEvent({ code: "ShiftLeft", key: "Shift", shiftKey: true }));
let normalized = normalizePracticePhysicalKeyEvent(fakeEvent({ code: "KeyA", key: "A", shiftKey: true }), tracker, 10);
assert.equal(normalized.shiftSide, "left");
tracker.observeKeyDown(fakeEvent({ code: "ShiftRight", key: "Shift", shiftKey: true }));
normalized = normalizePracticePhysicalKeyEvent(fakeEvent({ code: "KeyA", key: "A", shiftKey: true }), tracker, 11);
assert.equal(normalized.shiftSide, "both");
tracker.reset();
normalized = normalizePracticePhysicalKeyEvent(fakeEvent({ code: "KeyA", key: "A", shiftKey: true }), tracker, 12);
assert.equal(normalized.shiftSide, "unknown");
assert.equal(normalizePracticePhysicalKeyEvent(fakeEvent({ code: "KeyA", key: "a", capsLock: true }), tracker, 13).modifierMask.capsLock, true);

assert.equal(isPracticePhysicalTelemetryEventEligible(normalizePracticePhysicalKeyEvent(fakeEvent({ repeat: true }), tracker)), false);
assert.equal(isPracticePhysicalTelemetryEventEligible(normalizePracticePhysicalKeyEvent(fakeEvent({ isComposing: true }), tracker)), false);
assert.equal(isPracticePhysicalTelemetryEventEligible(normalizePracticePhysicalKeyEvent(fakeEvent({ key: "Dead" }), tracker)), false);
assert.equal(isPracticePhysicalTelemetryEventEligible(normalizePracticePhysicalKeyEvent(fakeEvent({ ctrlKey: true }), tracker)), false);
assert.equal(isPracticePhysicalTelemetryEventEligible(normalizePracticePhysicalKeyEvent(fakeEvent({ ctrlKey: true, altKey: true, altGraph: true }), tracker)), true, "AltGraph must not be treated as a Ctrl shortcut");
assert.equal(classifyPracticePhysicalOutputClass("A"), "uppercase-letter");
assert.equal(classifyPracticePhysicalOutputClass("7"), "digit");
assert.equal(classifyPracticePhysicalOutputClass("!"), "punctuation");
assert.equal(classifyPracticePhysicalOutputClass(" "), "whitespace");

const physicalA = normalizePracticePhysicalKeyEvent(fakeEvent({ code: "KeyA", key: "q" }), tracker, 100);
const physicalB = normalizePracticePhysicalKeyEvent(fakeEvent({ code: "KeyB", key: "x" }), tracker, 200);
const accumulator = createPracticePhysicalTelemetryAccumulator();
accumulator.recordProcessedInput({
  physicalEvent: physicalA,
  processedInput: { type: "character", accepted: true, expected: "q", correctness: "incorrect", isFirstAttempt: true, position: 0, event: { type: "character", correctness: "incorrect", isFirstAttempt: true, timingSegmentId: 1, latencyFromPriorInsertionMs: null } },
});
accumulator.recordProcessedInput({
  physicalEvent: physicalB,
  processedInput: { type: "character", accepted: true, expected: "u", correctness: "correct", isFirstAttempt: true, position: 1, event: { type: "character", correctness: "correct", isFirstAttempt: true, timingSegmentId: 1, latencyFromPriorInsertionMs: 100 } },
});
const delta = accumulator.snapshotDelta();
assert.equal(delta.eligibleTextEventCount, 2);
assert.equal(delta.validCodeEventCount, 2);
assert.equal(delta.keys.find((item) => item.entityKey === "KeyA").firstPassErrorOriginCount, 1);
assert.equal(JSON.stringify(delta).includes('"key"'), false, "raw KeyboardEvent.key must not be persisted in aggregate delta");
assert.equal(JSON.stringify(delta).includes("q>"), false, "textual character sequences must not become transition identities");

const coverageInput = { type: "character", accepted: true, expected: "a", correctness: "correct", isFirstAttempt: true, event: { type: "character", correctness: "correct", isFirstAttempt: true, timingSegmentId: 1, latencyFromPriorInsertionMs: null } };
const coverageAccumulator = createPracticePhysicalTelemetryAccumulator();
for (const excluded of [
  normalizePracticePhysicalKeyEvent(fakeEvent({ repeat: true }), tracker, 300),
  normalizePracticePhysicalKeyEvent(fakeEvent({ isComposing: true }), tracker, 301),
  normalizePracticePhysicalKeyEvent(fakeEvent({ key: "Dead" }), tracker, 302),
  normalizePracticePhysicalKeyEvent(fakeEvent({ ctrlKey: true }), tracker, 303),
]) coverageAccumulator.recordProcessedInput({ physicalEvent: excluded, processedInput: coverageInput });
let coverageDelta = coverageAccumulator.snapshotDelta();
assert.equal(coverageDelta.eligibleTextEventCount, 0, "repeat/composition/dead/shortcut events must be excluded before the code-coverage denominator");
assert.equal(coverageDelta.validCodeEventCount, 0);
coverageAccumulator.recordProcessedInput({ physicalEvent: null, processedInput: coverageInput });
coverageDelta = coverageAccumulator.snapshotDelta();
assert.equal(coverageDelta.eligibleTextEventCount, 1, "missing physical code must reduce code coverage");
assert.equal(coverageDelta.validCodeEventCount, 0);
coverageAccumulator.recordProcessedInput({ physicalEvent: physicalA, processedInput: coverageInput });
coverageDelta = coverageAccumulator.snapshotDelta();
assert.equal(coverageDelta.eligibleTextEventCount, 2);
assert.equal(coverageDelta.validCodeEventCount, 1);
assert.equal(coverageDelta.codeCoverage, 0.5);

assert.equal(calculatePracticePhysicalTelemetryConfidence({ entityType: "physical-key", observation: { activationCount: 20, distinctSessionCount: 2 } }), "low");
assert.equal(calculatePracticePhysicalTelemetryConfidence({ entityType: "physical-key", observation: { activationCount: 150, distinctSessionCount: 5 } }), "high");
assert.equal(calculatePracticePhysicalTelemetryConfidence({ entityType: "physical-transition", observation: { timingEligibleCount: 30, distinctSessionCount: 3 } }), "medium");

const settingsOn = { physicalKeyboardTelemetryEnabled: true };
assert.equal(getPracticePhysicalTelemetryRuntimeEligibility({ settings: settingsOn, context: { inputMethod: "physical" }, evidenceRole: "training", contentPlan: { metadata: { partition: "training" } } }).eligible, true);
for (const inputMethod of ["unknown", "software"]) assert.equal(getPracticePhysicalTelemetryRuntimeEligibility({ settings: settingsOn, context: { inputMethod }, evidenceRole: "training", contentPlan: { metadata: { partition: "training" } } }).eligible, false);
assert.equal(getPracticePhysicalTelemetryRuntimeEligibility({ settings: settingsOn, context: { inputMethod: "physical" }, evidenceRole: "custom", contentPlan: { metadata: { partition: "custom" } } }).eligible, false);
for (const role of ["transfer", "benchmark", "research-holdout"]) assert.equal(getPracticePhysicalTelemetryRuntimeEligibility({ settings: settingsOn, context: { inputMethod: "physical" }, evidenceRole: role, contentPlan: { metadata: { partition: role } } }).eligible, false);

let policy = getPracticePhysicalTelemetryPersistencePolicy({ settings: settingsOn, inputMethod: "physical", sessionStatus: "completed", evidenceRole: "training", contentPlan: { metadata: { partition: "training" } }, eligibleTextEventCount: 30, validCodeEventCount: 24 });
assert.equal(policy.eligible, true);
policy = getPracticePhysicalTelemetryPersistencePolicy({ settings: settingsOn, inputMethod: "physical", sessionStatus: "completed", evidenceRole: "training", contentPlan: { metadata: { partition: "training" } }, eligibleTextEventCount: 30, validCodeEventCount: 23 });
assert.equal(policy.eligible, false);
assert.ok(policy.reasons.includes("insufficient-code-coverage"));

const html = renderPracticePhysicalTelemetryPanel({ availability: { enabled: true, contextEligible: true, inputMethod: "physical" }, snapshot: { coverage: {}, keys: [], transitions: [], modifierRoutes: [] } });
assert.match(html, /Physical Keyboard/);
assert.match(html, /Local only/);
assert.match(html, /observed routes, not recommended techniques/i);
assert.match(html, /scope="col"/);
assert.doesNotMatch(html, /accuracy<\/th>/i);

const here = path.dirname(fileURLToPath(import.meta.url));
const physicalFiles = fs.readdirSync(path.join(here, "../js/practiceLab")).filter((name) => name.startsWith("practicePhysical"));
for (const file of physicalFiles) {
  const source = fs.readFileSync(path.join(here, "../js/practiceLab", file), "utf8");
  assert.doesNotMatch(source, /supabase|leaderboard|fetch\s*\(|WebHID|WebUSB/i, `${file} must remain local-only`);
}
const controllerSource = fs.readFileSync(path.join(here, "../js/appKeyboardController.js"), "utf8");
const runtimeSource = fs.readFileSync(path.join(here, "../js/practiceLab/practicePhysicalTelemetryRuntime.js"), "utf8");
assert.match(controllerSource, /observePracticePhysicalTelemetryKeyDown\(event\)/, "PL36 must reuse the existing global Practice keydown pipeline");
assert.doesNotMatch(runtimeSource, /addEventListener\?*\.?\(\s*["']keydown["']/, "PL36 must not create a second global text keydown listener");
for (const name of ["practiceAbilityEstimator.js", "practiceLearningService.js", "practiceCoachPersonalization.js", "practiceTreatmentService.js"]) {
  const source = fs.readFileSync(path.join(here, "../js/practiceLab", name), "utf8");
  assert.doesNotMatch(source, /practicePhysical|physicalTelemetry/i, `${name} must not consume PL36 telemetry`);
}
console.log("PL36 physical keyboard telemetry core, privacy, eligibility, modifier, code, confidence, and UI contracts passed.");
