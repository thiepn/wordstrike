import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PRACTICE_DATABASE_VERSION, PRACTICE_OBSOLETE_INDEXES, PRACTICE_STORE_DEFINITIONS } from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_DATABASE_VERSION as PRACTICE_DATABASE_VERSION_V31 } from "../js/practiceLab/practiceConstantsV31.js";
import { PRACTICE_CUSTOM_TEXT_ERROR_CODES, requiredPracticeCustomTextTimedGraphemes } from "../js/practiceLab/practiceCustomTextConstants.js";
import { normalizePracticeCustomTextSource, inspectPracticeCustomTextSource } from "../js/practiceLab/practiceCustomTextValidation.js";
import { buildPracticeCustomTypingProjection } from "../js/practiceLab/practiceCustomTextProjection.js";
import { buildPracticeCustomTextPlan, getPracticeCustomTextRenderWindow } from "../js/practiceLab/practiceCustomTextPlan.js";
import { createPracticeCustomTextRepository } from "../js/practiceLab/practiceCustomTextRepository.js";
import { createPracticeCustomTextExperiment, createPracticeCustomTextRegistration } from "../js/practiceLab/practiceCustomTextExperiment.js";
import { importPracticeCustomTextFile } from "../js/practiceLab/practiceCustomTextImportExport.js";
import { PRACTICE_SKILL_EVIDENCE_POLICY_V1 } from "../js/practiceLab/practiceSkillEvidencePolicy.js";
import { validatePracticeExperimentDescriptor } from "../js/practiceLab/practiceSessionContract.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";

const longText = (count) => "alpha beta gamma delta ".repeat(Math.ceil(count / 23)).slice(0, count);
const memoryStore = () => {
  const rows = new Map();
  const clone = (value) => structuredClone(value);
  const api = {
    async get(_store, key) { return rows.has(key) ? clone(rows.get(key)) : null; },
    async put(_store, value) { rows.set(value.customTextId, clone(value)); return value; },
    async delete(_store, key) { rows.delete(key); return true; },
    async query(_store, index, query) { return [...rows.values()].filter((row) => index === "profileId" ? row.profileId === query : row[index] === query).map((row) => clone(row)); },
    async list() { return [...rows.values()].map((row) => clone(row)); },
  };
  api.runTransaction = async (_stores, _mode, callback) => callback(api);
  return api;
};

test("PL31 DB9 snapshot remains intact inside the PL32 DB10 envelope and obsolete Custom Text indexes stay replaced", () => {
  assert.equal(PRACTICE_DATABASE_VERSION_V31, 9);
  assert.equal(PRACTICE_DATABASE_VERSION, 10);
  assert.deepEqual(PRACTICE_STORE_DEFINITIONS.customTexts.indexes.map((entry) => entry.name), ["profileId", "updatedAt", "createdAt"]);
  assert.deepEqual(PRACTICE_OBSOLETE_INDEXES.customTexts, ["lastUsedAt", "normalizedTitle"]);
});

test("PL31 source normalization preserves source layout except newline form and NFC", () => {
  assert.equal(normalizePracticeCustomTextSource("e\u0301\r\nA\rB\t C"), "é\nA\nB\t C");
  assert.equal(buildPracticeCustomTypingProjection("  A\n\nB\t C  ").text, "A B C");
});

test("PL31 rejects unsupported C0 controls without embedding source excerpts", () => {
  assert.throws(() => inspectPracticeCustomTextSource("safe\u0000private"), (error) => error.code === PRACTICE_CUSTOM_TEXT_ERROR_CODES.INVALID_CONTROL_CHARACTER && !error.message.includes("private"));
});

test("PL31 timed capacity uses the 400 WPM engineering ceiling plus ten percent", () => {
  assert.equal(requiredPracticeCustomTextTimedGraphemes(60_000), 2200);
  assert.equal(requiredPracticeCustomTextTimedGraphemes(30 * 60_000), 66000);
});

test("PL31 descriptor is non-resumable and owns no standardized measurement channel", () => {
  const descriptor = createPracticeCustomTextExperiment();
  assert.equal(validatePracticeExperimentDescriptor(descriptor).valid, true);
  assert.equal(descriptor.resumable, false);
  assert.equal(descriptor.abilityChannel, null);
  assert.equal(descriptor.performanceMeasurementKind, null);
  assert.equal(descriptor.retentionMeasurementKind, null);
  assert.equal(descriptor.evaluationMeasurementKind, null);
  assert.equal(getPracticeExperiment("custom-text").status, "preview");
  assert.equal(PRACTICE_SKILL_EVIDENCE_POLICY_V1.allowCustomWordEvidence, false);
});

test("PL31 custom plan is custom-role, target-free, corpus-free and serialization-safe", async () => {
  const sourceText = longText(12_000);
  const built = await buildPracticeCustomTextPlan({ sessionId: "session_pl31-test", profileId: "profile_test", contextId: "context_test", dataLocale: "en", sourceText, sourceKind: "ephemeral", sessionMode: "timed", timedDurationMs: 5 * 60_000 });
  assert.equal(built.contentPlan.metadata.evidenceRole, "custom");
  assert.equal(built.contentPlan.metadata.contentPurpose, "custom");
  assert.equal(built.contentPlan.metadata.partition, null);
  assert.equal(built.contentPlan.metadata.corpusContentId, null);
  assert.deepEqual(built.contentPlan.targetEntities, []);
  assert.equal(built.contentPlan.completion.mode, "duration");
  const session = createPracticeCustomTextRegistration({ runtime: {} }).sessionFactory({ status: "ready", ...built, customTextPlan: built, contentPlan: built.contentPlan });
  const serialized = JSON.stringify(session.configuration);
  assert.equal(serialized.includes(sourceText.slice(0, 80)), false);
  assert.equal(Object.hasOwn(session.configuration, "sourceText"), false);
  assert.equal(Object.hasOwn(session.configuration, "title"), false);
});

test("PL31 selection is isolated and short content cannot satisfy timed mode by looping", async () => {
  const sourceText = "prefix " + longText(100) + " suffix";
  const start = 7; const end = sourceText.length - 7;
  const selected = await buildPracticeCustomTextPlan({ sessionId: "session_pl31-selection", profileId: "profile_test", contextId: "context_test", dataLocale: "en", sourceText, sessionMode: "selection", selectionRange: { start, end } });
  assert.equal(selected.contentPlan.text, buildPracticeCustomTypingProjection(sourceText.slice(start, end)).text);
  await assert.rejects(() => buildPracticeCustomTextPlan({ sessionId: "session_pl31-short", profileId: "profile_test", contextId: "context_test", dataLocale: "en", sourceText: longText(3000), sessionMode: "timed", timedDurationMs: 5 * 60_000 }), (error) => error.code === PRACTICE_CUSTOM_TEXT_ERROR_CODES.TIMED_CAPACITY);
});

test("PL31 repository enforces explicit create/update identity and optimistic conflicts", async () => {
  const dataStore = memoryStore();
  let clock = Date.parse("2026-09-10T10:00:00.000Z");
  const repo = createPracticeCustomTextRepository({ dataStore, now: () => clock });
  const created = await repo.createCustomText({ profileId: "profile-a", title: "Private", sourceText: "A private local passage with enough content to persist.", dataLocale: "en" });
  assert.equal(created.revision, 1); assert.equal(created.sourceHash.length, 64); assert.equal((await repo.listCustomTexts("profile-a")).length, 1);
  clock += 1000;
  const updated = await repo.updateCustomText({ customTextId: created.customTextId, profileId: "profile-a", expectedRevision: 1, title: "Renamed", sourceText: created.sourceText, dataLocale: "en" });
  assert.equal(updated.revision, 2); assert.equal(updated.title, "Renamed");
  await assert.rejects(() => repo.updateCustomText({ customTextId: created.customTextId, profileId: "profile-a", expectedRevision: 1, title: "Conflict", sourceText: created.sourceText, dataLocale: "en" }), (error) => error.code === PRACTICE_CUSTOM_TEXT_ERROR_CODES.CONFLICT);
  assert.equal(await repo.markCustomTextPractised({ customTextId: created.customTextId, profileId: "profile-a", revision: 1, sourceHash: created.sourceHash, completedAt: "2026-09-10T10:05:00.000Z" }), false);
  assert.equal(await repo.markCustomTextPractised({ customTextId: created.customTextId, profileId: "profile-a", revision: 2, sourceHash: updated.sourceHash, completedAt: "2026-09-10T10:05:00.000Z" }), true);
});

test("PL31 UTF-8 import is local, explicit and strict", async () => {
  const bytes = new TextEncoder().encode("hello local custom text");
  const file = { name: "notes.txt", size: bytes.byteLength, arrayBuffer: async () => bytes.buffer };
  const imported = await importPracticeCustomTextFile(file);
  assert.equal(imported.sourceText, "hello local custom text");
  const invalid = Uint8Array.of(0xc3, 0x28);
  await assert.rejects(() => importPracticeCustomTextFile({ name: "bad.txt", size: 2, arrayBuffer: async () => invalid.buffer }), (error) => error.code === PRACTICE_CUSTOM_TEXT_ERROR_CODES.INVALID_ENCODING);
});

test("PL31 renderer window remains bounded with one global expected index", () => {
  const text = longText(100_000);
  const graphemes = buildPracticeCustomTypingProjection(text).graphemes;
  const window = getPracticeCustomTextRenderWindow(graphemes, 50_000);
  assert.ok(window.graphemes.length <= 2_000);
  assert.ok(window.start > 0);
  assert.ok(window.end < window.total);
});

test("PL31 controller discards confirmed dirty drafts and runtime can reopen after close", () => {
  const controller = fs.readFileSync(new URL("../js/practiceLab/practiceLabControllerRuntimeV31.js", import.meta.url), "utf8");
  const runtime = fs.readFileSync(new URL("../js/practiceLab/practiceCustomTextRuntime.js", import.meta.url), "utf8");
  assert.match(controller, /const discardEditor/);
  assert.match(controller, /if \(dirty\(\)\) discardEditor\(\)/);
  assert.match(runtime, /initializedPromise = null; ownedDataStore/);
});

test("PL31 retention and ordinary reset code do not prune Custom Text", () => {
  const legacyRepository = fs.readFileSync(new URL("../js/practiceLab/practiceRepositoryLegacyV17.js", import.meta.url), "utf8");
  const repositoryV31 = fs.readFileSync(new URL("../js/practiceLab/practiceRepositoryV31.js", import.meta.url), "utf8");
  const currentWrapper = fs.readFileSync(new URL("../js/practiceLab/practiceRepository.js", import.meta.url), "utf8");
  const retentionBody = legacyRepository.slice(legacyRepository.indexOf("const runRetention"), legacyRepository.indexOf("const writeWithQuotaRecovery"));
  assert.equal(retentionBody.includes("customTexts"), false);
  assert.match(repositoryV31, /deleteUserContent/);
  assert.match(repositoryV31, /rawCustomTexts/);
  assert.match(currentWrapper, /createPracticeRepositoryV31/);
});
