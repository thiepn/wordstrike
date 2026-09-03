import assert from "node:assert/strict";
import {
  createDefaultCheckpoint,
  createDefaultCustomText,
  createDefaultPracticeManifest,
  createDefaultPreset,
  createDefaultReviewItem,
  createDefaultSessionSummary,
  createDefaultSkillStat,
} from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeManifestStore } from "../js/practiceLab/practiceManifestStore.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { createPracticeRepository } from "../js/practiceLab/practiceRepository.js";

const now = () => new Date("2026-07-05T18:42:13.000Z");
const profileId = createPracticeId("profile", { uuid: () => "repository-profile-12345678" });
const sessionId = createPracticeId("session", { uuid: () => "repository-session-12345678" });
const reviewItemId = createPracticeId("review", { uuid: () => "repository-review-12345678" });
const customTextId = createPracticeId("customText", { uuid: () => "repository-text-12345678" });
const presetId = createPracticeId("preset", { uuid: () => "repository-preset-12345678" });

const values = new Map([["unrelated", "keep-me"]]);
const storage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); },
};
const manifestStore = createPracticeManifestStore({
  storage,
  createDefault: (options) => createDefaultPracticeManifest({ profileId, now, ...options }),
  defaultOptions: { profileId, now },
});
const dataStore = createPracticeMemoryStore();
const repository = createPracticeRepository({ dataStore, manifestStore, now });

const initialized = await repository.initializePracticeStorage();
assert.equal(initialized.profile.profileId, profileId);
assert.equal(initialized.backend, "memory");
assert.equal((await repository.getPracticeProfile()).profileId, profileId);
assert.equal(repository.getPracticeSettings().dailySessionLengthMinutes, 12);
const settings = { ...repository.getPracticeSettings(), dailySessionLengthMinutes: 20 };
assert.equal(repository.savePracticeSettings(settings).dailySessionLengthMinutes, 20);

const stat = createDefaultSkillStat({ profileId, entityType: "bigram", entityKey: "ou", now });
await repository.saveSkillStat(stat);
assert.deepEqual(await repository.getSkillStat(profileId, initialized.profile.activeContextId, "bigram", "ou"), stat);
assert.equal((await repository.listSkillStats()).length, 1);

const review = createDefaultReviewItem({ profileId, reviewItemId, now });
await repository.saveReviewItem(review);
assert.deepEqual(await repository.getReviewItem(reviewItemId), review);
assert.equal((await repository.listDueReviewItems()).length, 1);
await assert.rejects(
  repository.saveReviewItem(createDefaultReviewItem({
    profileId,
    reviewItemId: createPracticeId("review", { uuid: () => "duplicate-review-12345678" }),
    now,
  })),
  (error) => error.code === "PRACTICE_STORAGE_DUPLICATE",
);

const customText = createDefaultCustomText({ profileId, customTextId, text: "local words only", now });
await repository.saveCustomText(customText);
assert.equal((await repository.getCustomText(customTextId)).privacy, "local-only");
assert.equal((await repository.listCustomTexts()).length, 1);

const preset = createDefaultPreset({ profileId, presetId, now });
await repository.savePreset(preset);
assert.equal((await repository.listPresets()).length, 1);
const extraPresetIds = [];
for (let index = 0; index < 9; index += 1) {
  const extraId = createPracticeId("preset", { uuid: () => `extra-${index}-12345678` });
  extraPresetIds.push(extraId);
  await repository.savePreset(createDefaultPreset({
    profileId,
    presetId: extraId,
    name: `Extra ${index}`,
    now,
  }));
}
await assert.rejects(
  repository.savePreset(createDefaultPreset({
    profileId,
    presetId: createPracticeId("preset", { uuid: () => "over-limit-12345678" }),
    now,
  })),
  (error) => error.code === "PRACTICE_STORAGE_LIMIT_REACHED",
);

const checkpointA = createDefaultCheckpoint({ profileId, sessionId, now, overrides: { typedBuffer: "a" } });
const checkpointB = { ...checkpointA, typedBuffer: "ab" };
await repository.saveActiveCheckpoint(checkpointA);
await repository.saveActiveCheckpoint(checkpointB);
assert.equal((await repository.getActiveCheckpoint()).typedBuffer, "ab");

const summary = createDefaultSessionSummary({ profileId, sessionId, now });
assert.deepEqual(await repository.saveSessionSummary(summary), {
  saved: true,
  idempotent: false,
  summary,
});
assert.equal((await repository.saveSessionSummary(summary)).idempotent, true);
await assert.rejects(
  repository.saveSessionSummary({ ...summary, wpm: 1 }),
  (error) => error.code === "PRACTICE_STORAGE_DUPLICATE",
);
assert.equal((await repository.listSessionSummaries()).length, 1);

const committedId = createPracticeId("session", { uuid: () => "atomic-session-12345678" });
const committed = createDefaultSessionSummary({ profileId, sessionId: committedId, now });
const atomic = await repository.commitCompletedPracticeSession({
  sessionSummary: committed,
  updatedSkillStats: [{ ...stat, sampleCount: 1, correctCount: 1 }],
  clearCheckpoint: true,
});
assert.equal(atomic.committed, true);
assert.equal(atomic.manifestUpdated, true);
assert.equal(await repository.getActiveCheckpoint(), null);
assert.equal((await repository.commitCompletedPracticeSession({ sessionSummary: committed })).idempotent, true);

await repository.deleteCustomText(customTextId);
await repository.deletePreset(presetId);
for (const id of extraPresetIds) await repository.deletePreset(id);
assert.equal((await repository.listCustomTexts()).length, 0);
assert.equal((await repository.listPresets()).length, 0);
assert.equal(repository.getStorageHealth().backend, "memory");

await repository.resetPracticeData();
assert.equal(values.get("unrelated"), "keep-me");
assert.equal((await dataStore.list("sessionSummaries")).length, 0);

console.log("Practice memory repository CRUD, duplicate guards, checkpoint replacement, atomic commit, and scoped reset passed.");
