import test from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_STORE_NAMES } from "../js/practiceLab/practiceConstants.js";
import { createDefaultPracticeProfile, createDefaultSkillStat } from "../js/practiceLab/practiceDefaults.js";
import { createDefaultPracticeContext } from "../js/practiceLab/practiceContext.js";
import { createPracticeCustomTextRepository } from "../js/practiceLab/practiceCustomTextRepository.js";
import { createSkillStatId } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

const now = () => new Date("2026-09-14T00:00:00.000Z");

function statFor(profileId, contextId, entityKey) {
  return createDefaultSkillStat({
    statId: createSkillStatId(profileId, contextId, "key", entityKey),
    profileId,
    contextId,
    entityType: "key",
    entityKey,
    now,
  });
}

test("PL39 normal Practice reset is profile-scoped, preserves saved Custom Text, and leaves another profile untouched", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl39-reset-a" });
  const profileA = await harness.repository.getPracticeProfile();
  const contextA = await harness.repository.getPracticeContext(profileA.activeContextId);
  const profileBId = "practice-profile_pl39-reset-b-profile-12345678";
  const profileB = createDefaultPracticeProfile({ profileId: profileBId, now, keyboardLayout: "qwerty" });
  const contextB = createDefaultPracticeContext({ profileId: profileBId, dataLocale: "en", keyboardLayout: "qwerty", now });
  assert.equal(profileB.activeContextId, contextB.contextId);
  await harness.dataStore.put("profiles", profileB);
  await harness.dataStore.put("contexts", contextB);

  const skillA = statFor(profileA.profileId, contextA.contextId, "a");
  const skillB = statFor(profileB.profileId, contextB.contextId, "b");
  await harness.dataStore.put("skillStats", skillA);
  await harness.dataStore.put("skillStats", skillB);

  const custom = createPracticeCustomTextRepository({ dataStore: harness.dataStore, now });
  const customA = await custom.createCustomText({ profileId: profileA.profileId, title: "A saved", sourceText: "saved text owned by profile A", dataLocale: "en" });
  const customB = await custom.createCustomText({ profileId: profileB.profileId, title: "B saved", sourceText: "saved text owned by profile B", dataLocale: "en" });

  await harness.repository.resetPracticeData();

  const reinitializedA = await harness.repository.getPracticeProfile();
  assert.equal(reinitializedA.profileId, profileA.profileId);
  assert.equal((await harness.dataStore.get("skillStats", skillA.statId)), null);
  assert.deepEqual(await harness.dataStore.get("skillStats", skillB.statId), skillB);
  assert.deepEqual(await harness.dataStore.get("profiles", profileB.profileId), profileB);
  assert.deepEqual(await harness.dataStore.get("contexts", contextB.contextId), contextB);
  assert.equal((await custom.getCustomText(customA.customTextId, { profileId: profileA.profileId })).sourceText, customA.sourceText);
  assert.equal((await custom.getCustomText(customB.customTextId, { profileId: profileB.profileId })).sourceText, customB.sourceText);
});

test("PL39 explicit full user-content wipe remains destructive across all Practice stores", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl39-full-wipe" });
  const custom = createPracticeCustomTextRepository({ dataStore: harness.dataStore, now });
  await custom.createCustomText({ profileId: harness.profileId, title: "Delete me", sourceText: "synthetic user content for wipe verification", dataLocale: "en" });
  await harness.repository.resetPracticeData({ deleteUserContent: true });
  for (const storeName of PRACTICE_STORE_NAMES) {
    assert.equal((await harness.dataStore.list(storeName)).length, 0, `${storeName} must be empty after full user-content wipe`);
  }
});
