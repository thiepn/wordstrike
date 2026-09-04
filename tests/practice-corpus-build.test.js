import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  auditPracticeCorpusDuplicates,
  buildPracticeCorpusFromInputs,
  stablePracticeCorpusStringify,
  validatePracticeCorpusBuildChecksum,
} from "../scripts/lib/practiceCorpusBuildCore.mjs";

const hashText = (value) => `sha256-${createHash("sha256").update(String(value), "utf8").digest("hex")}`;
const deepClone = (value) => JSON.parse(JSON.stringify(value));
const approvedSource = {
  sourceId: "approved-source", title: "Approved source", sourceType: "wordstrike-original", upstream: null,
  license: { name: "Reviewed source metadata", spdx: null, url: null, attributionRequired: false, notes: null },
  retrievedAt: null, sourceChecksum: null, snapshotPath: null, usageApproval: "practice-display-approved", notes: null,
};
const approvedRegistry = { registryVersion: 1, sources: [approvedSource] };
const baseDocument = {
  schemaVersion: 1, corpusId: "practice-test-v1", language: "en", corpusVersion: 1, partitionPolicyVersion: 1,
  status: "foundation", createdAt: "2026-09-04T00:00:00.000Z", families: [],
};
const family = (familyId, partitionLock, contentId, text, reviewStatus = "approved") => ({
  familyId, sourceId: "approved-source", partitionLock,
  items: [{ contentId, contentType: "sentence", text, reviewStatus, metadata: { tags: ["test"] } }],
});

function build(document, sourceRegistry = approvedRegistry, mode = "production") {
  return buildPracticeCorpusFromInputs({ sourceRegistry, authoringDocuments: [document], hashText, mode });
}

test("checked-in PL6 foundation corpus rebuild is deterministic and validates without rewriting", async () => {
  const sourceRegistry = JSON.parse(await readFile(new URL("../data/practice/provenance/sources.json", import.meta.url), "utf8"));
  const authoring = JSON.parse(await readFile(new URL("../data/practice/authoring/en-v1.source.json", import.meta.url), "utf8"));
  const first = buildPracticeCorpusFromInputs({ sourceRegistry, authoringDocuments: [authoring], hashText });
  const second = buildPracticeCorpusFromInputs({ sourceRegistry: { ...sourceRegistry, sources: [...sourceRegistry.sources].reverse() }, authoringDocuments: [deepClone(authoring)], hashText });
  assert.equal(stablePracticeCorpusStringify(first.manifest), stablePracticeCorpusStringify(second.manifest));
  assert.equal(stablePracticeCorpusStringify(first.artifacts), stablePracticeCorpusStringify(second.artifacts));
  assert.equal(validatePracticeCorpusBuildChecksum({ manifest: first.manifest, inventory: first.inventory, hashText }), true);
  assert.equal(first.manifest.familyCounts.total, 5);
  assert.equal(first.manifest.contentCounts.total, 7);
  assert.deepEqual(first.manifest.contentCounts.byPartition, { training: 2, transfer: 1, benchmark: 1, diagnostic: 2, "research-holdout": 1 });
  const cli = spawnSync(process.execPath, [new URL("../scripts/buildPracticeCorpus.mjs", import.meta.url).pathname, "--validate"], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.stdout, /exactDuplicates=0 hardNearDuplicates=0 warnings=0/);
});

test("exact normalized duplicates are hard build failures across IDs and partitions", () => {
  const document = { ...baseDocument, families: [
    family("family-a", "training", "content-a", "  The same reviewed sentence appears here.  "),
    family("family-b", "benchmark", "content-b", "The same reviewed sentence appears here."),
  ] };
  assert.throws(() => build(document), (error) => error.code === "PRACTICE_CORPUS_EXACT_DUPLICATE");
});

test("hard near duplicates fail, moderate cross-partition similarity warns, and common English does not false-positive", () => {
  const hardDocument = { ...baseDocument, families: [
    family("family-a", "training", "content-a", "The bright train crossed the old bridge before noon."),
    family("family-b", "benchmark", "content-b", "Before noon, the bright train crossed the old bridge."),
  ] };
  assert.throws(() => build(hardDocument), (error) => error.code === "PRACTICE_CORPUS_NEAR_DUPLICATE_CONFLICT");

  const warningItems = [
    { contentId: "a", familyId: "a", partition: "training", text: "The bright train crossed the old bridge before noon." },
    { contentId: "b", familyId: "b", partition: "transfer", text: "The bright train crossed the old bridge before sunset." },
  ];
  const warningAudit = auditPracticeCorpusDuplicates(warningItems);
  assert.equal(warningAudit.hard.length, 0);
  assert.equal(warningAudit.warnings.length, 1);
  assert.ok(warningAudit.warnings[0].score >= 0.75 && warningAudit.warnings[0].score < 0.90);

  const ordinaryAudit = auditPracticeCorpusDuplicates([
    { contentId: "c", familyId: "c", partition: "training", text: "The river is calm and the road is open." },
    { contentId: "d", familyId: "d", partition: "benchmark", text: "The market is busy and the window is clean." },
  ]);
  assert.equal(ordinaryAudit.hard.length, 0);
  assert.equal(ordinaryAudit.warnings.length, 0);
});

test("production build rejects test-only sources while explicit test mode may use fixtures", async () => {
  const fixtureRegistry = JSON.parse(await readFile(new URL("./fixtures/practiceCorpus/sources.json", import.meta.url), "utf8"));
  const fixtureDocument = JSON.parse(await readFile(new URL("./fixtures/practiceCorpus/en-v1.source.json", import.meta.url), "utf8"));
  assert.throws(() => buildPracticeCorpusFromInputs({ sourceRegistry: fixtureRegistry, authoringDocuments: [fixtureDocument], hashText, mode: "production" }), (error) => error.code === "PRACTICE_CORPUS_SOURCE_NOT_APPROVED");
  const testBuild = buildPracticeCorpusFromInputs({ sourceRegistry: fixtureRegistry, authoringDocuments: [fixtureDocument], hashText, mode: "test" });
  assert.equal(testBuild.manifest.contentCounts.total, 1);
});

test("draft/rejected/missing review state and item-level partition overrides cannot enter runtime artifacts", () => {
  for (const reviewStatus of ["draft", "rejected"]) {
    const document = { ...baseDocument, families: [family("family-a", "training", "content-a", "A reviewed boundary test sentence.", reviewStatus)] };
    assert.throws(() => build(document), (error) => error.code === "PRACTICE_CORPUS_UNAPPROVED_CONTENT");
  }
  const missingReview = { ...baseDocument, families: [family("family-a", "training", "content-a", "A missing review state must fail.")] };
  delete missingReview.families[0].items[0].reviewStatus;
  assert.throws(() => build(missingReview), (error) => error.code === "PRACTICE_CORPUS_UNAPPROVED_CONTENT");
  const document = { ...baseDocument, families: [family("family-a", "training", "content-a", "A partition override must fail.")] };
  document.families[0].items[0].partition = "benchmark";
  assert.throws(() => build(document), (error) => error.code === "PRACTICE_CORPUS_ITEM_PARTITION_OVERRIDE");
});
