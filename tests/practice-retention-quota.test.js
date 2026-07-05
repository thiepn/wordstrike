import assert from "node:assert/strict";
import {
  PRACTICE_LIMITS,
  QUOTA_RECOVERY_STEPS,
} from "../js/practiceLab/practiceConstants.js";
import {
  createDefaultPracticeManifest,
  createDefaultSkillStat,
} from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeManifestStore } from "../js/practiceLab/practiceManifestStore.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { createPracticeRepository } from "../js/practiceLab/practiceRepository.js";
import {
  buildPracticeRetentionPlan,
  hasMeaningfulAbandonedActivity,
} from "../js/practiceLab/practiceRetention.js";

const nowMs = Date.parse("2026-07-05T18:42:13.000Z");
const iso = (offset) => new Date(nowMs + offset).toISOString();
const sessions = Array.from({ length: PRACTICE_LIMITS.sessionSummarySoftCap + 2 }, (_, index) => ({
  sessionId: `session-${index}`,
  experimentId: "drill",
  completedAtUtc: iso(-index * 1000),
}));
const checkpoints = [
  { profileId: "expired", expiresAt: iso(-1) },
  { profileId: "current", expiresAt: iso(1000) },
];
const keyStats = Array.from({ length: 100 }, (_, index) => ({
  statId: `key-${index}`,
  entityType: "key",
  confidenceScore: 0,
  sampleCount: 0,
  updatedAt: iso(-index),
}));
const trigramStats = Array.from({ length: PRACTICE_LIMITS.trigramStats + 1 }, (_, index) => ({
  statId: `trigram-${index}`,
  entityType: "trigram",
  confidenceScore: index === 0 ? 0 : 1,
  sampleCount: index,
  updatedAt: iso(index),
}));
const plan = buildPracticeRetentionPlan({
  now: nowMs,
  checkpoints,
  sessionSummaries: sessions,
  skillStats: [...keyStats, ...trigramStats],
  reviewItems: [],
  quarantine: Array.from({ length: 101 }, (_, index) => ({
    quarantineId: `q-${index}`,
    detectedAt: iso(index),
  })),
});
assert.deepEqual(plan.order, QUOTA_RECOVERY_STEPS);
assert.deepEqual(plan.activeSessionCheckpoints, ["expired"]);
assert.equal(plan.sessionSummaries.length, 2);
assert.deepEqual(plan.skillStats, ["trigram-0"]);
assert.equal(plan.skillStats.some((id) => id.startsWith("key-")), false);
assert.equal(plan.quarantine.length, 1);
assert.deepEqual(plan.customTexts, []);
assert.equal(hasMeaningfulAbandonedActivity({ typedCharacterCount: 20 }), true);
assert.equal(hasMeaningfulAbandonedActivity({ activeDurationMs: 30000 }), true);
assert.equal(hasMeaningfulAbandonedActivity({ typedCharacterCount: 19, activeDurationMs: 29999 }), false);

const profileId = createPracticeId("profile", { uuid: () => "quota-profile-12345678" });
const values = new Map();
const storage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); },
};
const manifestStore = createPracticeManifestStore({
  storage,
  createDefault: (options) => createDefaultPracticeManifest({
    profileId,
    now: () => new Date(nowMs),
    ...options,
  }),
  defaultOptions: { profileId, now: () => new Date(nowMs) },
});
const base = createPracticeMemoryStore();
let quotaFailures = 0;
let putAttempts = 0;
const flaky = {
  kind: "memory-test",
  get isOpen() { return base.isOpen; },
  open: (...args) => base.open(...args),
  close: (...args) => base.close(...args),
  get: (...args) => base.get(...args),
  delete: (...args) => base.delete(...args),
  list: (...args) => base.list(...args),
  query: (...args) => base.query(...args),
  clearStore: (...args) => base.clearStore(...args),
  deleteDatabase: (...args) => base.deleteDatabase(...args),
  runTransaction: (...args) => base.runTransaction(...args),
  put: async (...args) => {
    putAttempts += 1;
    if (quotaFailures > 0) {
      quotaFailures -= 1;
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    return base.put(...args);
  },
};
const repository = createPracticeRepository({
  dataStore: flaky,
  manifestStore,
  now: () => new Date(nowMs),
});
await repository.initializePracticeStorage();
const stat = createDefaultSkillStat({ profileId, now: () => new Date(nowMs) });
quotaFailures = 2;
putAttempts = 0;
await assert.rejects(
  repository.saveSkillStat(stat),
  (error) => error.code === "PRACTICE_STORAGE_QUOTA_EXCEEDED",
);
assert.equal(putAttempts, 2);
assert.equal(repository.getStorageHealth().status, "quota-exceeded");

console.log("Practice retention ordering/caps, protected key/custom data, abandonment threshold, and one-retry quota behavior passed.");

