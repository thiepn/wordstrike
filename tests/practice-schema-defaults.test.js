import assert from "node:assert/strict";
import {
  PRACTICE_DATABASE_NAME,
  PRACTICE_DATABASE_VERSION,
  PRACTICE_LIMITS,
  PRACTICE_MANIFEST_KEY,
  PRACTICE_STORE_DEFINITIONS,
} from "../js/practiceLab/practiceConstants.js";
import { createDefaultPracticeAbilityState } from "../js/practiceLab/practiceAbilityEstimator.js";
import { validatePracticeAbilityState } from "../js/practiceLab/practiceAbilityValidation.js";
import {
  createDefaultCheckpoint,
  createDefaultCustomText,
  createDefaultPracticeManifest,
  createDefaultPracticeProfile,
  createDefaultPracticeSettings,
  createDefaultPreset,
  createDefaultReviewItem,
  createDefaultSessionSummary,
  createDefaultSkillStat,
} from "../js/practiceLab/practiceDefaults.js";
import {
  createPracticeCustomTextId,
  createPracticeId,
  createPracticePresetId,
  createPracticeProfileId,
  createPracticeReviewItemId,
  createPracticeSessionId,
} from "../js/practiceLab/practiceIds.js";
import {
  validateCheckpoint,
  validateCustomText,
  validatePracticeManifest,
  validatePracticeProfile,
  validatePracticeSettings,
  validatePreset,
  validateReviewItem,
  validateSessionSummary,
  validateSkillStat,
} from "../js/practiceLab/practiceValidation.js";
import {
  getPracticeLocalDayKey,
  getPracticeTimeContext,
  isValidPracticeUtcIso,
  toPracticeUtcIso,
} from "../js/practiceLab/practiceTime.js";

const now = () => new Date("2026-07-05T18:42:13.000Z");
const id = (kind, suffix) => createPracticeId(kind, { uuid: () => suffix });
const profileId = id("profile", "11111111-1111-4111-8111-111111111111");
const sessionId = id("session", "22222222-2222-4222-8222-222222222222");
const reviewItemId = id("review", "33333333-3333-4333-8333-333333333333");
const customTextId = id("customText", "44444444-4444-4444-8444-444444444444");
const presetId = id("preset", "55555555-5555-4555-8555-555555555555");

const settings = createDefaultPracticeSettings();
const manifest = createDefaultPracticeManifest({ profileId, now });
const profile = createDefaultPracticeProfile({ profileId, now });
const skill = createDefaultSkillStat({ profileId, now });
const ability = createDefaultPracticeAbilityState({ profileId, contextId: profile.activeContextId, channel: "controlled-speed", now });
const summary = createDefaultSessionSummary({ profileId, sessionId, now });
const review = createDefaultReviewItem({ profileId, reviewItemId, now });
const customText = createDefaultCustomText({ profileId, customTextId, title: "My Text", text: "one two", now });
const preset = createDefaultPreset({ profileId, presetId, now });
const checkpoint = createDefaultCheckpoint({ profileId, sessionId, now });

for (const [name, validation] of [
  ["settings", validatePracticeSettings(settings)],
  ["manifest", validatePracticeManifest(manifest)],
  ["profile", validatePracticeProfile(profile)],
  ["skill", validateSkillStat(skill)],
  ["ability", validatePracticeAbilityState(ability)],
  ["summary", validateSessionSummary(summary)],
  ["review", validateReviewItem(review)],
  ["customText", validateCustomText(customText)],
  ["preset", validatePreset(preset)],
  ["checkpoint", validateCheckpoint(checkpoint)],
]) assert.equal(validation.valid, true, `${name}: ${JSON.stringify(validation.errors)}`);

const manifest2 = createDefaultPracticeManifest({ profileId, now });
manifest.settings.preferredContentTypes.push("real-text");
manifest.dashboardSummary.primaryLimiterIds.push("key:a");
assert.deepEqual(manifest2.settings.preferredContentTypes, ["common-words"]);
assert.deepEqual(manifest2.dashboardSummary.primaryLimiterIds, []);

assert.equal(createPracticeProfileId({ uuid: () => "abc-def-12345678" }), "practice-profile_abc-def-12345678");
assert.match(createPracticeSessionId({ cryptoObject: null, now: () => 1, random: () => 0.5 }), /^practice-session_/);
assert.match(createPracticeReviewItemId({ uuid: () => "review-12345678" }), /^practice-review_/);
assert.match(createPracticeCustomTextId({ uuid: () => "text-12345678" }), /^practice-text_/);
assert.match(createPracticePresetId({ uuid: () => "preset-12345678" }), /^practice-preset_/);

assert.equal(PRACTICE_MANIFEST_KEY, "wordstrike.practice.manifest.v1");
assert.equal(PRACTICE_DATABASE_NAME, "wordstrike-practice-lab");
assert.equal(PRACTICE_DATABASE_VERSION, 3);
assert.equal(PRACTICE_LIMITS.manifestBytes, 65536);
assert.deepEqual(Object.keys(PRACTICE_STORE_DEFINITIONS), [
  "meta", "profiles", "contexts", "skillStats", "abilityStates", "sessionSummaries", "reviewItems",
  "customTexts", "presets", "activeSessionCheckpoints", "quarantine",
]);
assert.equal(toPracticeUtcIso(now), "2026-07-05T18:42:13.000Z");
assert.equal(isValidPracticeUtcIso("2026-07-05T18:42:13.000Z"), true);
assert.equal(isValidPracticeUtcIso("2026-07-05 18:42:13"), false);
assert.match(getPracticeLocalDayKey(now), /^2026-07-05$/);
assert.equal(getPracticeTimeContext(now).timezoneOffsetMinutes, new Date(now()).getTimezoneOffset());

console.log("Practice defaults, injected IDs/clocks, independent nested values, ability state, and DB3 schema descriptors passed.");
