import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PRACTICE_INDEX_REVERSE_PARTITIONS } from "../js/practiceLab/practiceIndexConstants.js";
import { applyPracticeEvaluationConfigurationOverrides, evaluatePracticeEvaluationIntegrity } from "../js/practiceLab/practiceEvaluationIntegrity.js";
import { PRACTICE_EVALUATION_PROTOCOL_V1 } from "../js/practiceLab/practiceEvaluationConstants.js";

const profileId = "practice-profile_pl39-protected-profile-12345678";
const contextId = "practice-context_pl39-protected-context-12345678";
const sessionId = "practice-session_pl39-protected-session-12345678";

test("PL39 protected partitions have no target reverse-index lookup surface", async () => {
  assert.deepEqual(PRACTICE_INDEX_REVERSE_PARTITIONS, ["training", "diagnostic"]);
  for (const partition of ["transfer", "benchmark", "research-holdout"]) assert.equal(PRACTICE_INDEX_REVERSE_PARTITIONS.includes(partition), false, partition);
  const source = await readFile(new URL("../js/practiceLab/practiceTargetIndex.js", import.meta.url), "utf8");
  assert.match(source, /PROTECTED_REVERSE_LOOKUP/);
  assert.match(source, /assertReversePartition/);
});

test("PL39 partial exposure history can never satisfy strict cold verification", () => {
  const binding = Object.freeze({
    frameworkVersion: 1,
    reservationId: "practice-evaluation-reservation_pl39-protected-12345678",
    profileId,
    contextId,
    sessionId,
    kind: "cold-transfer",
    protocolId: PRACTICE_EVALUATION_PROTOCOL_V1["cold-transfer"].protocolId,
    protocolVersion: 1,
    suiteId: null,
    suiteVersion: null,
    formId: null,
    formVersion: null,
    poolId: "pool-pl39",
    poolVersion: 1,
    unitId: "unit-pl39",
    unitVersion: 1,
    exposureOrdinal: 1,
    freshnessStatus: "fresh",
    reservedAtUtc: "2026-09-14T00:00:00.000Z",
    claimedAtUtc: "2026-09-14T00:01:00.000Z",
    contentBindingHash: "pl39-binding-hash",
  });
  const plan = Object.freeze({
    kind: "cold-transfer",
    binding,
    measurementProtocol: PRACTICE_EVALUATION_PROTOCOL_V1["cold-transfer"],
  });
  const contentPlan = Object.freeze({
    targetEntities: Object.freeze([]),
    completion: Object.freeze({ mode: "duration", value: 60_000 }),
    metadata: Object.freeze({ partition: "transfer", evaluationContentBindingHash: binding.contentBindingHash }),
  });
  const session = Object.freeze({
    profileId,
    contextId,
    sessionId,
    completionReason: "time-complete",
    pausedDurationMs: 0,
    configuration: applyPracticeEvaluationConfigurationOverrides({}, "cold-transfer"),
  });
  const result = evaluatePracticeEvaluationIntegrity({ plan, session, contentPlan, historyStatus: "partial" });
  assert.equal(result.status, "nonstandard");
  assert.equal(result.coldVerificationEligible, false);
  assert.equal(result.transferEvidenceEligible, false);
  assert.equal(result.skillEvidenceEligible, false);
  assert.equal(result.abilityEligible, false);
  assert.ok(result.reasons.includes("history-partial"), JSON.stringify(result.reasons));
});

test("PL39 protected-content state stores only bounded identifiers/hashes, never passage text", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceEvaluationState.js", import.meta.url), "utf8");
  for (const forbidden of ["passageText", "sourceText", "contentText", "rawEvents", "eventTrace"]) assert.equal(source.includes(forbidden), false, forbidden);
});
