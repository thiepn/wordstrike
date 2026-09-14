import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PRACTICE_INDEX_REVERSE_PARTITIONS } from "../js/practiceLab/practiceIndexConstants.js";
import { evaluatePracticeEvaluationIntegrity } from "../js/practiceLab/practiceEvaluationIntegrity.js";
import { createDefaultPracticeEvaluationState } from "../js/practiceLab/practiceEvaluationState.js";

const profileId = "practice-profile_pl39-protected-profile-12345678";
const contextId = "practice-context_pl39-protected-context-12345678";
const hash = "a".repeat(64);

test("PL39 protected partitions have no target reverse-index lookup surface", async () => {
  assert.deepEqual(PRACTICE_INDEX_REVERSE_PARTITIONS, ["training", "diagnostic"]);
  for (const partition of ["transfer", "benchmark", "research-holdout"]) assert.equal(PRACTICE_INDEX_REVERSE_PARTITIONS.includes(partition), false, partition);
  const source = await readFile(new URL("../js/practiceLab/practiceTargetIndex.js", import.meta.url), "utf8");
  assert.match(source, /PROTECTED_REVERSE_LOOKUP/);
  assert.match(source, /assertReversePartition/);
});

test("PL39 partial exposure history can never satisfy strict cold verification", () => {
  const evaluationState = createDefaultPracticeEvaluationState({ profileId, historyStatus: "partial", now: () => new Date("2026-09-14T00:00:00.000Z") });
  const binding = Object.freeze({
    evaluationReservationId: "practice-evaluation-reservation_pl39-protected-12345678",
    measurementKind: "cold-transfer",
    poolId: "pool-pl39",
    suiteId: null,
    unitId: "unit-pl39",
    formId: null,
    familyId: "family-pl39",
    contentHash: hash,
    expectedHash: hash,
    artifactHash: hash,
    claimedAt: "2026-09-14T00:01:00.000Z",
    freshnessAtClaim: "fresh",
    contextId,
  });
  const contentPlan = Object.freeze({
    contentId: "practice-content_pl39-protected",
    contentHash: hash,
    metadata: Object.freeze({ partition: "transfer", evaluationBinding: binding }),
  });
  const session = Object.freeze({
    profileId,
    contextId,
    status: "completed",
    completionReason: "content-complete",
    typedCharacterCount: 100,
    accuracy: 99,
    contentHash: hash,
  });
  const artifacts = Object.freeze({
    getExpectedHash: () => hash,
    getPoolHash: () => hash,
    getSuiteHash: () => hash,
  });
  const result = evaluatePracticeEvaluationIntegrity({ session, contentPlan, evaluationState, artifacts, measurementKind: "cold-transfer", now: "2026-09-14T00:02:00.000Z" });
  assert.equal(result.coldVerification, false);
  assert.equal(result.standardized, false);
  assert.equal(result.status, "nonstandard");
  assert.ok(result.reasons.includes("history-status-partial"), JSON.stringify(result.reasons));
});

test("PL39 protected-content state stores only bounded identifiers/hashes, never passage text", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceEvaluationState.js", import.meta.url), "utf8");
  for (const forbidden of ["passageText", "sourceText", "contentText", "rawEvents", "eventTrace"]) assert.equal(source.includes(forbidden), false, forbidden);
});
