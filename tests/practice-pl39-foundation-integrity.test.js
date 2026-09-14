import test from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS, PRACTICE_STORE_DEFINITIONS, PRACTICE_STORE_NAMES } from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";
import { getPracticeDataInventory, validatePracticeDataInventory } from "../js/practiceLab/practiceDataInventory.js";
import { auditPracticeRepositoryIntegrity, auditPracticeStoredData } from "../js/practiceLab/practiceIntegrityAudit.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { createDefaultPracticeProfile } from "../js/practiceLab/practiceDefaults.js";
import { createDefaultPracticeContext } from "../js/practiceLab/practiceContext.js";
import { createPracticeCustomTextRepository } from "../js/practiceLab/practiceCustomTextRepository.js";
import { assertPracticeSerializable, PRACTICE_STORAGE_ERROR_CODES } from "../js/practiceLab/practiceStorageContract.js";
import { PRACTICE_TREATMENT_TRACKING_VERSION } from "../js/practiceLab/practiceTreatmentConstants.js";
import { PRACTICE_PHYSICAL_TELEMETRY_VERSION } from "../js/practiceLab/practicePhysicalTelemetryConstants.js";
import { PRACTICE_RESEARCH_VERSION } from "../js/practiceLab/practiceResearchConstants.js";

const now = () => new Date("2026-09-14T00:00:00.000Z");
const profileId = "practice-profile_pl39-profile-12345678";
const privateSentinel = "PL39_PRIVATE_SENTINEL_7F31E8_CERT";
const protectedSentinel = "PL39_PROTECTED_SENTINEL_91A2C4_CERT";

function baseStore() {
  const profile = createDefaultPracticeProfile({ profileId, now, keyboardLayout: "qwerty" });
  const context = createDefaultPracticeContext({ profileId, dataLocale: "en", keyboardLayout: "qwerty", now });
  return { store: createPracticeMemoryStore({ initialData: { profiles: [profile], contexts: [context] } }), profile, context };
}

test("PL39 prerequisite versions and store inventory are the certified PL38 envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 12);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 14);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10);
  assert.equal(PRACTICE_RECORD_VERSIONS.coachPlan, 2);
  assert.equal(PRACTICE_TREATMENT_TRACKING_VERSION, 1);
  assert.equal(PRACTICE_PHYSICAL_TELEMETRY_VERSION, 1);
  assert.equal(PRACTICE_RESEARCH_VERSION, 1);
  assert.equal(PRACTICE_STORE_NAMES.length, 23);
  assert.deepEqual(Object.keys(PRACTICE_STORE_DEFINITIONS), [...PRACTICE_STORE_NAMES]);
});

test("PL39 canonical data inventory covers every real store", () => {
  const result = validatePracticeDataInventory();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const inventory = getPracticeDataInventory();
  assert.deepEqual(Object.keys(inventory), [...PRACTICE_STORE_NAMES]);
  assert.deepEqual(Object.values(inventory).filter((item) => item.rawContentAllowed).map((item) => item.storeName), ["customTexts"]);
  assert.equal(Object.values(inventory).some((item) => item.networkAllowed), false);
});

test("PL39 storage serializer rejects unsafe values", async () => {
  for (const value of [{ key: "nan", value: NaN }, { key: "infinity", value: Infinity }, { key: "undefined", value: undefined }, { key: "bigint", value: 1n }, { key: "date", value: new Date() }]) {
    assert.throws(() => assertPracticeSerializable(value), (error) => error.code === PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED);
  }
  const cyclic = { key: "cycle" }; cyclic.self = cyclic;
  assert.throws(() => assertPracticeSerializable(cyclic), (error) => error.code === PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED);
  const store = createPracticeMemoryStore();
  await assert.rejects(() => store.put("meta", { key: "bad", value: NaN }), (error) => error.code === PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED);
});

test("PL39 private sentinel persists only in saved Custom Text source", async () => {
  const { store, profile, context } = baseStore();
  const repo = createPracticeCustomTextRepository({ dataStore: store, now });
  const sourceText = `alpha ${privateSentinel} omega`;
  const saved = await repo.createCustomText({ profileId: profile.profileId, title: "Synthetic fixture", sourceText, dataLocale: context.dataLocale });
  const audit = await auditPracticeStoredData(store, { privateSentinels: [privateSentinel] });
  assert.equal(audit.valid, true, JSON.stringify(audit.errors));
  assert.deepEqual(audit.sentinelHits, [{ kind: "private", storeName: "customTexts", recordId: saved.customTextId, path: "sourceText" }]);
});

test("PL39 scanner detects protected text and raw sequence fields", async () => {
  const protectedStore = createPracticeMemoryStore({ initialData: { meta: [{ key: "fixture-protected", value: protectedSentinel }] } });
  const protectedAudit = await auditPracticeStoredData(protectedStore, { protectedSentinels: [protectedSentinel] });
  assert.equal(protectedAudit.valid, false);
  assert.ok(protectedAudit.errors.some((finding) => finding.code === "PROTECTED_TEXT_PERSISTED"));
  const rawStore = createPracticeMemoryStore({ initialData: { meta: [{ key: "fixture-sequence", eventKey: "KeyA", keystrokeSequence: ["KeyA", "KeyB"] }] } });
  const rawAudit = await auditPracticeStoredData(rawStore);
  assert.equal(rawAudit.valid, false);
  assert.ok(rawAudit.errors.some((finding) => finding.code === "PROHIBITED_PERSISTED_KEY"));
});

test("PL39 referential auditor accepts clean ownership and rejects an orphan context", async () => {
  const { store } = baseStore();
  assert.equal((await auditPracticeRepositoryIntegrity(store)).valid, true);
  const orphan = createDefaultPracticeContext({ profileId: "practice-profile_missing-owner-12345678", dataLocale: "en", keyboardLayout: "qwerty", now });
  const bad = createPracticeMemoryStore({ initialData: { contexts: [orphan] } });
  const report = await auditPracticeRepositoryIntegrity(bad);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((finding) => finding.code === "ORPHAN_CONTEXT"));
});
