import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultPracticeManifest, createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeManifestStore } from "../js/practiceLab/practiceManifestStore.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { createPracticeRepository } from "../js/practiceLab/practiceRepository.js";

const now = () => new Date("2026-07-06T08:00:00.000Z");

function fixture(suffix) {
  const profileId = createPracticeId("profile", { uuid: () => `${suffix}-profile-12345678` });
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  const baseManifestStore = createPracticeManifestStore({
    storage,
    createDefault: (options) => createDefaultPracticeManifest({ profileId, now, ...options }),
    defaultOptions: { profileId, now },
  });
  const dataStore = createPracticeMemoryStore();
  return { profileId, values, baseManifestStore, dataStore };
}

test("idempotent completion retry performs pending manifest reconciliation instead of claiming false success", async () => {
  const context = fixture("reconcile");
  let failNextSave = false;
  const manifestStore = {
    load: () => context.baseManifestStore.load(),
    clear: () => context.baseManifestStore.clear(),
    save(manifest) {
      if (failNextSave) { failNextSave = false; throw new Error("manifest unavailable"); }
      return context.baseManifestStore.save(manifest);
    },
  };
  const repository = createPracticeRepository({ dataStore: context.dataStore, manifestStore, now });
  await repository.initializePracticeStorage();
  failNextSave = true;
  const summary = createDefaultSessionSummary({
    profileId: context.profileId,
    sessionId: createPracticeId("session", { uuid: () => "reconcile-session-12345678" }),
    now,
  });
  const first = await repository.commitCompletedPracticeSession({ sessionSummary: summary });
  assert.equal(first.committed, true);
  assert.equal(first.manifestUpdated, false);
  assert.equal(first.recoveryRequired, true);
  const retried = await repository.commitCompletedPracticeSession({ sessionSummary: summary });
  assert.equal(retried.idempotent, true);
  assert.equal(retried.manifestUpdated, true);
  assert.equal(context.baseManifestStore.load().manifest.lastCompletedSessionAt, summary.completedAtUtc);
  assert.equal((await context.dataStore.get("meta", "manifestReconciliation")).status, "resolved");
});

test("atomic completion rejects cross-profile records before opening its transaction", async () => {
  const context = fixture("identity");
  const repository = createPracticeRepository({ dataStore: context.dataStore, manifestStore: context.baseManifestStore, now });
  await repository.initializePracticeStorage();
  const otherProfileId = createPracticeId("profile", { uuid: () => "other-profile-12345678" });
  const summary = createDefaultSessionSummary({
    profileId: otherProfileId,
    sessionId: createPracticeId("session", { uuid: () => "other-session-12345678" }),
    now,
  });
  await assert.rejects(
    repository.commitCompletedPracticeSession({ sessionSummary: summary }),
    (error) => error.code === "PRACTICE_STORAGE_VALIDATION_FAILED",
  );
  assert.equal(await context.dataStore.get("sessionSummaries", summary.sessionId), null);
});
