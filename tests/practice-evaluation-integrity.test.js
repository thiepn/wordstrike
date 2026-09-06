import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePracticeEvaluationIntegrity, applyPracticeEvaluationConfigurationOverrides } from "../js/practiceLab/practiceEvaluationIntegrity.js";
import { filterPracticeCommitForEvaluation } from "../js/practiceLab/practiceEvaluationAnalysis.js";
import { PRACTICE_EVALUATION_PROTOCOL_V1 } from "../js/practiceLab/practiceEvaluationConstants.js";

const baseBinding = Object.freeze({
  frameworkVersion: 1,
  reservationId: "practice-evaluation-reservation_123456789",
  profileId: "practice-profile_123456789",
  contextId: "practice-context_123456789",
  sessionId: "practice-session_123456789",
  kind: "benchmark",
  protocolId: "ws-benchmark-60s-v1",
  protocolVersion: 1,
  suiteId: "S",
  suiteVersion: 1,
  formId: "F1",
  formVersion: 1,
  poolId: null,
  poolVersion: null,
  unitId: null,
  unitVersion: null,
  exposureOrdinal: 1,
  freshnessStatus: "fresh",
  reservedAtUtc: "2026-09-06T11:00:00.000Z",
  claimedAtUtc: "2026-09-06T11:05:00.000Z",
  contentBindingHash: "hash-F1",
});
const session = Object.freeze({
  profileId: baseBinding.profileId,
  contextId: baseBinding.contextId,
  sessionId: baseBinding.sessionId,
  completionReason: "time-complete",
  pausedDurationMs: 0,
  configuration: applyPracticeEvaluationConfigurationOverrides({}, "benchmark"),
});
const content = Object.freeze({ targetEntities: [], completion: { mode: "duration", value: 60000 }, metadata: { partition: "benchmark", evaluationContentBindingHash: "hash-F1" } });
const plan = Object.freeze({ kind: "benchmark", binding: baseBinding, measurementProtocol: PRACTICE_EVALUATION_PROTOCOL_V1.benchmark });

test("PL18 fresh valid benchmark explicitly admits skill/ability/comparison evidence", () => {
  const integrity = evaluatePracticeEvaluationIntegrity({ plan, session, contentPlan: content, historyStatus: "complete" });
  assert.equal(integrity.status, "valid");
  assert.equal(integrity.skillEvidenceEligible, true);
  assert.equal(integrity.abilityEligible, true);
  assert.equal(integrity.benchmarkComparisonEligible, true);
  assert.equal(integrity.transferEvidenceEligible, false);
});

test("PL18 repeated benchmark and partial history never become strict protected evidence", () => {
  const repeatBinding = { ...baseBinding, exposureOrdinal: 2, freshnessStatus: "repeat" };
  const repeatPlan = { ...plan, binding: repeatBinding };
  const repeated = evaluatePracticeEvaluationIntegrity({ plan: repeatPlan, session, contentPlan: content, historyStatus: "complete" });
  assert.equal(repeated.status, "nonstandard");
  assert.equal(repeated.skillEvidenceEligible, false);
  assert.equal(repeated.abilityEligible, false);
  const partial = evaluatePracticeEvaluationIntegrity({ plan, session, contentPlan: content, historyStatus: "partial" });
  assert.equal(partial.status, "nonstandard");
  assert.equal(partial.skillEvidenceEligible, false);
});

test("PL18 targeted, paused and wrong-partition evaluation is invalid", () => {
  const targeted = evaluatePracticeEvaluationIntegrity({ plan, session, contentPlan: { ...content, targetEntities: [{ entityType: "bigram", entityKey: "br" }] } });
  assert.equal(targeted.status, "invalid");
  assert.ok(targeted.reasons.includes("targeted-content"));
  const paused = evaluatePracticeEvaluationIntegrity({ plan, session, contentPlan: content, runtime: { pauseObserved: true } });
  assert.equal(paused.status, "invalid");
  const wrongPartition = evaluatePracticeEvaluationIntegrity({ plan, session, contentPlan: { ...content, metadata: { ...content.metadata, partition: "training" } } });
  assert.equal(wrongPartition.status, "invalid");
});

test("PL18 commit admission cannot let unbound protected roles update canonical skill or transfer state", () => {
  const payload = { skillEvidenceDeltas: [1], abilityObservation: { ok: true }, learningObservationDeltas: [2] };
  const filtered = filterPracticeCommitForEvaluation({ payload, evidenceRole: "transfer", evaluationRequested: false });
  assert.deepEqual(filtered.skillEvidenceDeltas, []);
  assert.deepEqual(filtered.learningObservationDeltas, []);
  assert.deepEqual(filtered.abilityObservation, { ok: true });
});
