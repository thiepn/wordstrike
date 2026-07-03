import assert from "node:assert/strict";
import { ONBOARDING_VERSIONS } from "../js/onboardingContent.js";
import {
  getOnboardingStorageDiagnostic,
  isHintSeen,
  isTutorialSeen,
  markHintSeen,
  markTutorialSeen,
  resetAllOnboarding,
  resetContextualHints,
} from "../js/onboardingStorage.js";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

values.set("wordstrike.onboarding.general.v2", "seen");
assert.equal(isTutorialSeen("general"), false, "general v2 completion must not suppress general v3");
for (const id of Object.keys(ONBOARDING_VERSIONS)) {
  assert.equal(isTutorialSeen(id), false);
  assert.equal(markTutorialSeen(id), true);
  assert.equal(isTutorialSeen(id), true);
}
markHintSeen("campaign-target");
assert.equal(isHintSeen("campaign-target"), true);
resetContextualHints();
assert.equal(isHintSeen("campaign-target"), false);
values.set("wordstrike.onboarding.hints.v1", "{malformed");
assert.equal(isHintSeen("anything"), false);
resetAllOnboarding();
assert.ok(Object.values(getOnboardingStorageDiagnostic().tutorials).every((seen) => seen === false));
assert.equal(values.has("wordstrike_save"), false, "tutorial reset must not touch game saves");

console.log("Versioned tutorial and hint persistence survives malformed data and resets without touching game saves.");
