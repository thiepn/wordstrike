import test from "node:test";
import assert from "node:assert/strict";

import { ENTITY_TYPES, PRACTICE_DATABASE_VERSION } from "../js/practiceLab/practiceConstants.js";
import { createSkillStatId, createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import {
  PRACTICE_PL30_MODEL_BOUNDARY_REPAIR_META_KEY,
  PRACTICE_PL30_RETIRED_PERSISTENT_ENTITY_TYPES,
  reconcilePracticePl30ModelBoundary,
} from "../js/practiceLab/practicePl30ModelBoundaryRepair.js";
import { validatePracticeEntityKey } from "../js/practiceLab/practiceValidation.js";
import { validatePracticeSkillStatV3 } from "../js/practiceLab/practiceSkillEvidenceValidation.js";
import { validatePracticeReviewItemV3 } from "../js/practiceLab/practiceReviewValidation.js";

const now = () => new Date("2026-09-16T13:00:00.000Z");

function ids() {
  const profileId = createPracticeId("profile", { uuid: () => "gc2-profile-12345678" });
  const contextId = createPracticeId("context", { uuid: () => "gc2-context-12345678" });
  return { profileId, contextId };
}

test("GC2 makes the active PL11 entity allowlist exactly canonical key/bigram/trigram/word", () => {
  assert.deepEqual(ENTITY_TYPES, ["key", "bigram", "trigram", "word"]);
  assert.equal(PRACTICE_DATABASE_VERSION, 13);

  for (const [entityType, entityKey] of [
    ["key", "a"],
    ["bigram", "as"],
    ["trigram", "the"],
    ["word", "practice"],
  ]) assert.equal(validatePracticeEntityKey(entityType, entityKey).valid, true);

  for (const entityType of PRACTICE_PL30_RETIRED_PERSISTENT_ENTITY_TYPES) {
    const result = validatePracticeEntityKey(entityType, "legacy-pattern");
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((entry) => entry.path === "entityType" && entry.code === "INVALID_ENUM"));
  }
});

test("GC2 persistent skill/review validators reject retired PL30 pattern entity types", () => {
  const { profileId, contextId } = ids();
  for (const entityType of PRACTICE_PL30_RETIRED_PERSISTENT_ENTITY_TYPES) {
    const entityKey = "legacy-pattern";
    const skill = validatePracticeSkillStatV3({
      profileId,
      contextId,
      entityType,
      entityKey,
      statId: createSkillStatId(profileId, contextId, entityType, entityKey),
    });
    assert.ok(skill.errors.some((entry) => entry.path === "entityKey" && entry.code === "INVALID_ENTITY"), entityType);

    const review = validatePracticeReviewItemV3({
      reviewItemId: `review:${entityType}`,
      profileId,
      contextId,
      entityType,
      entityKey,
    });
    assert.ok(review.errors.some((entry) => entry.path === "entityType" && entry.code === "INVALID_ENUM"), entityType);
  }
});

test("GC2 explicit DB13 cleanup removes only retired entity records and preserves canonical evidence, abilities, and sessions", async () => {
  const canonicalSkill = { statId: "canonical-skill", entityType: "word", entityKey: "practice", payload: "keep" };
  const retiredSkill = { statId: "retired-skill", entityType: "punctuation-transition", entityKey: "comma-space" };
  const canonicalLearning = { learningStateId: "canonical-learning", entityType: "bigram", entityKey: "th", payload: "keep" };
  const retiredLearning = { learningStateId: "retired-learning", entityType: "number-pattern", entityKey: "digits" };
  const canonicalReview = { reviewItemId: "canonical-review", entityType: "key", entityKey: "a", payload: "keep" };
  const retiredReview = { reviewItemId: "retired-review", entityType: "symbol-pattern", entityKey: "symbols" };
  const punctuationAbility = { abilityStateId: "ability-punctuation", channel: "punctuation", payload: "keep" };
  const numbersAbility = { abilityStateId: "ability-numbers-symbols", channel: "numbers-symbols", payload: "keep" };
  const session = { sessionId: "session-pl30", experimentId: "punctuation-capitals", payload: "keep" };

  const dataStore = createPracticeMemoryStore({
    initialData: {
      skillStats: [canonicalSkill, retiredSkill],
      learningStates: [canonicalLearning, retiredLearning],
      reviewItems: [canonicalReview, retiredReview],
      abilityStates: [punctuationAbility, numbersAbility],
      sessionSummaries: [session],
    },
  });
  await dataStore.open();

  const repair = await reconcilePracticePl30ModelBoundary(dataStore, { now });
  assert.equal(repair.strategy, "explicit-cleanup-migration");
  assert.equal(repair.databaseVersion, 12);
  assert.deepEqual(repair.removedByStore, { skillStats: 1, learningStates: 1, reviewItems: 1 });
  assert.deepEqual(repair.removedEntityTypes, ["number-pattern", "punctuation-transition", "symbol-pattern"]);

  assert.deepEqual(await dataStore.get("skillStats", canonicalSkill.statId), canonicalSkill);
  assert.equal(await dataStore.get("skillStats", retiredSkill.statId), null);
  assert.deepEqual(await dataStore.get("learningStates", canonicalLearning.learningStateId), canonicalLearning);
  assert.equal(await dataStore.get("learningStates", retiredLearning.learningStateId), null);
  assert.deepEqual(await dataStore.get("reviewItems", canonicalReview.reviewItemId), canonicalReview);
  assert.equal(await dataStore.get("reviewItems", retiredReview.reviewItemId), null);
  assert.deepEqual(await dataStore.get("abilityStates", punctuationAbility.abilityStateId), punctuationAbility);
  assert.deepEqual(await dataStore.get("abilityStates", numbersAbility.abilityStateId), numbersAbility);
  assert.deepEqual(await dataStore.get("sessionSummaries", session.sessionId), session);

  const marker = await dataStore.get("meta", PRACTICE_PL30_MODEL_BOUNDARY_REPAIR_META_KEY);
  assert.equal(marker.status, "complete");
  assert.equal(marker.completedAt, "2026-09-16T13:00:00.000Z");

  const second = await reconcilePracticePl30ModelBoundary(dataStore, { now });
  assert.equal(second.alreadyComplete, true);
  assert.deepEqual(second.removedByStore, repair.removedByStore);
});

test("GC2 fresh DB13 cleanup is an idempotent no-op", async () => {
  const dataStore = createPracticeMemoryStore();
  await dataStore.open();
  const first = await reconcilePracticePl30ModelBoundary(dataStore, { now });
  assert.deepEqual(first.removedByStore, { skillStats: 0, learningStates: 0, reviewItems: 0 });
  const second = await reconcilePracticePl30ModelBoundary(dataStore, { now });
  assert.equal(second.alreadyComplete, true);
});
