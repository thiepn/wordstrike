import assert from "node:assert/strict";
import { PRACTICE_DATABASE_VERSION, PRACTICE_STORE_DEFINITIONS } from "../js/practiceLab/practiceConstants.js";
import { createDefaultPracticeManifest } from "../js/practiceLab/practiceDefaults.js";
import { normalizePracticeManifest, validatePracticeManifest } from "../js/practiceLab/practiceValidation.js";

const current = createDefaultPracticeManifest({ nowUtc: "2026-09-12T00:00:00.000Z" });
const legacyDb10 = structuredClone(current);
legacyDb10.databaseVersion = 10;
delete legacyDb10.settings.physicalKeyboardTelemetryEnabled;

const migrated = normalizePracticeManifest(legacyDb10);
assert.equal(PRACTICE_DATABASE_VERSION, 12);
assert.equal(migrated.databaseVersion, 12);
assert.equal(migrated.settings.physicalKeyboardTelemetryEnabled, false, "existing users must remain opted out after PL36 DB10 -> DB11 and the later PL38 DB12 normalization");
assert.equal(validatePracticeManifest(migrated).valid, true);
assert.ok(PRACTICE_STORE_DEFINITIONS.physicalTelemetryStats);
assert.ok(PRACTICE_STORE_DEFINITIONS.physicalTelemetrySessions);
assert.equal(PRACTICE_STORE_DEFINITIONS.physicalTelemetryStats.keyPath, "physicalTelemetryStatId");
assert.equal(PRACTICE_STORE_DEFINITIONS.physicalTelemetrySessions.keyPath, "sessionId");

const optedIn = structuredClone(current);
optedIn.settings.physicalKeyboardTelemetryEnabled = true;
assert.equal(normalizePracticeManifest(optedIn).settings.physicalKeyboardTelemetryEnabled, true, "explicit local opt-in must survive normalization");

console.log("PL36 physical-telemetry opt-in defaults remain intact through current PL38 DB12 normalization.");
