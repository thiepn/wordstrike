import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeIndexedDbStore } from "../js/practiceLab/practiceIndexedDbStore.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { createPracticeCustomTextRepository } from "../js/practiceLab/practiceCustomTextRepository.js";
import { createPracticeResearchService } from "../js/practiceLab/practiceResearchService.js";
import { PRACTICE_STORAGE_ERROR_CODES } from "../js/practiceLab/practiceStorageContract.js";

const profileId = "practice-profile_pl39-failure-profile-12345678";
const now = () => new Date("2026-09-14T00:00:00.000Z");

test("PL39 IndexedDB unavailable fails explicitly instead of claiming persistence", async () => {
  const store = createPracticeIndexedDbStore({ indexedDB: null });
  await assert.rejects(
    () => store.open(),
    (error) => error?.code === PRACTICE_STORAGE_ERROR_CODES.UNAVAILABLE && error?.recoverable === true,
  );
  assert.equal(store.isOpen, false);
});

test("PL39 memory transaction failure rolls back every staged write", async () => {
  const store = createPracticeMemoryStore();
  await assert.rejects(
    () => store.runTransaction(["meta"], "readwrite", async (transaction) => {
      await transaction.put("meta", { key: "pl39-partial-write", value: "must-rollback" });
      throw new Error("PL39_INJECTED_TRANSACTION_ABORT");
    }),
    (error) => error?.code === PRACTICE_STORAGE_ERROR_CODES.TRANSACTION_FAILED,
  );
  assert.equal(await store.get("meta", "pl39-partial-write"), null);
});

test("PL39 Custom Text quota failure preserves existing user-authored text and performs no compensating delete", async () => {
  const base = createPracticeMemoryStore();
  const normal = createPracticeCustomTextRepository({ dataStore: base, now });
  const existing = await normal.createCustomText({
    profileId,
    title: "Existing",
    sourceText: "existing user authored text must survive quota failure",
    dataLocale: "en",
  });
  let deleteCalls = 0;
  const quotaStore = {
    ...base,
    runTransaction(storeNames, mode, callback) {
      return base.runTransaction(storeNames, mode, (transaction) => callback({
        ...transaction,
        async put(storeName, record) {
          if (storeName === "customTexts" && record.customTextId !== existing.customTextId) {
            throw new DOMException("synthetic quota", "QuotaExceededError");
          }
          return transaction.put(storeName, record);
        },
        async delete(...args) { deleteCalls += 1; return transaction.delete(...args); },
      }));
    },
  };
  const constrained = createPracticeCustomTextRepository({ dataStore: quotaStore, now });
  await assert.rejects(() => constrained.createCustomText({
    profileId,
    title: "Second",
    sourceText: "this save must fail without sacrificing the first record",
    dataLocale: "en",
  }), (error) => error?.name === "QuotaExceededError");
  assert.equal(deleteCalls, 0);
  const retained = await normal.getCustomText(existing.customTextId, { profileId });
  assert.equal(retained.sourceText, existing.sourceText);
  assert.equal((await normal.listCustomTexts(profileId)).length, 1);
});

test("PL39 one corrupt Custom Text record degrades locally and is not auto-deleted", async () => {
  const store = createPracticeMemoryStore();
  const repo = createPracticeCustomTextRepository({ dataStore: store, now });
  const valid = await repo.createCustomText({ profileId, title: "Valid", sourceText: "valid local text remains readable", dataLocale: "en" });
  const corruptId = "practice-custom-text_pl39-corrupt-record-12345678";
  await store.put("customTexts", {
    customTextId: corruptId,
    profileId,
    recordVersion: 1,
    revision: 1,
    title: "Corrupt",
    sourceText: "bad\u0000control",
    sourceHash: "0".repeat(64),
    dataLocale: "en",
    sourceByteLength: 11,
    sourceGraphemeCount: 11,
    typingProjectionVersion: 1,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
    lastPractisedAt: null,
  });
  const list = await repo.listCustomTexts(profileId);
  assert.deepEqual(list.map((item) => item.customTextId), [valid.customTextId]);
  assert.ok(await store.get("customTexts", corruptId), "corrupt user-authored record must not be auto-deleted");
});

test("PL39 research follow-up timing fails conservatively on clock rollback and expires on a large forward jump", () => {
  const completedAt = "2026-09-13T12:00:00.000Z";
  const record = { treatment: { completedAt } };
  const rolledBack = createPracticeResearchService({ repository: {}, now: () => new Date("2026-09-13T11:00:00.000Z") });
  assert.equal(rolledBack.getFollowupState(record), "waiting");
  const tooEarly = createPracticeResearchService({ repository: {}, now: () => new Date("2026-09-14T11:59:59.999Z") });
  assert.equal(tooEarly.getFollowupState(record), "waiting");
  const ready = createPracticeResearchService({ repository: {}, now: () => new Date("2026-09-14T12:00:00.000Z") });
  assert.equal(ready.getFollowupState(record), "ready");
  const jumpedForward = createPracticeResearchService({ repository: {}, now: () => new Date("2026-09-16T12:00:00.001Z") });
  assert.equal(jumpedForward.getFollowupState(record), "expired");
});
