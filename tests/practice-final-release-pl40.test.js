import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MODE_IDS, getEnabledModes, getModeDefinition } from "../js/modes.js";
import {
  PRACTICE_LAB_PUBLIC_ENABLED,
  PRACTICE_LAB_ROUTE,
  createPracticeFeatureGate,
  isPracticeLabAvailable,
} from "../js/practiceLab/practiceFeatureGate.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("PL40 enables the authorized public Practice Lab release", () => {
  const practiceMode = getModeDefinition(MODE_IDS.PRACTICE);

  assert.ok(practiceMode, "Practice Lab mode must remain registered");
  assert.equal(PRACTICE_LAB_PUBLIC_ENABLED, true);
  assert.equal(PRACTICE_LAB_ROUTE, "practice-lab");
  assert.equal(isPracticeLabAvailable(), true);

  assert.equal(practiceMode.enabled, true);
  assert.equal(practiceMode.visible, true);
  assert.equal(practiceMode.status, "available");
  assert.equal(practiceMode.route, PRACTICE_LAB_ROUTE);
  assert.equal(
    getEnabledModes().some((mode) => mode.id === MODE_IDS.PRACTICE),
    true,
    "Practice Lab must appear in the enabled public mode set",
  );
});

test("PL40 developer preview is explicit and cannot mutate the canonical mode", () => {
  const practiceMode = getModeDefinition(MODE_IDS.PRACTICE);
  const gate = createPracticeFeatureGate({ developerMode: true });
  const [previewMode] = gate.resolveModeDefinitions([practiceMode]);

  assert.equal(gate.canAccess(), true);
  assert.deepEqual(gate.getSnapshot(), {
    developerMode: true,
    publicEnabled: true,
    allowed: true,
    reason: "developer-preview",
  });

  assert.notEqual(previewMode, practiceMode);
  assert.equal(previewMode.enabled, true);
  assert.equal(previewMode.status, "preview");
  assert.equal(previewMode.route, PRACTICE_LAB_ROUTE);

  assert.equal(practiceMode.enabled, true);
  assert.equal(practiceMode.status, "available");
  assert.equal(practiceMode.route, PRACTICE_LAB_ROUTE);
});

test("PL40 retains every cumulative Practice Lab certification entry point", () => {
  const requiredScripts = [
    "test",
    "validate:practice-corpus",
    "validate:practice-indexes",
    "validate:practice-typability",
    "validate:practice-sustained",
    "validate:practice-special-domains",
    "test:pl31-custom-text",
    "test:pl32-treatment-response",
    "test:pl33-coach-personalization",
    "test:pl34-read-ahead",
    "test:pl35-metronome",
    "test:pl36-physical-telemetry",
    "test:pl37-weakness-boss",
    "test:pl38-research-ab",
    "audit:practice-privacy-security",
    "test:practice-migrations",
    "test:pl39-integrity",
    "test:practice-integrity",
  ];

  for (const scriptName of requiredScripts) {
    assert.equal(
      typeof packageJson.scripts?.[scriptName],
      "string",
      `Missing required Practice Lab certification script: ${scriptName}`,
    );
    assert.ok(
      packageJson.scripts[scriptName].trim().length > 0,
      `Practice Lab certification script must not be empty: ${scriptName}`,
    );
  }
});
