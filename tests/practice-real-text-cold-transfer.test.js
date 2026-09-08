import test from "node:test";
import assert from "node:assert/strict";
import { buildPracticeTransferPoolArtifact } from "../js/practiceLab/practiceEvaluationArtifacts.js";
import { createDefaultPracticeEvaluationState } from "../js/practiceLab/practiceEvaluationState.js";
import { reservePracticeColdTransferUnitState } from "../js/practiceLab/practiceEvaluationReservation.js";
import { claimPracticeEvaluationReservationState } from "../js/practiceLab/practiceEvaluationBinding.js";
import { buildPracticeEvaluationPlan } from "../js/practiceLab/practiceEvaluationPlan.js";
import { getRealTextColdTransferAvailability } from "../js/practiceLab/practiceRealTextAvailability.js";
import { PRACTICE_REAL_TEXT_COLD_TRANSFER_DESCRIPTOR } from "../js/practiceLab/practiceRealTextColdTransfer.js";

const NOW = () => new Date("2026-09-08T00:00:00.000Z");
const PROFILE_ID = "practice-profile_fixture-00000001";
const CONTEXT_ID = "practice-context_fixture-00000001";
const SESSION_ID = "practice-session_cold-fixture-00000001";

function poolFixture() {
  const items = Array.from({ length: 16 }, (_, index) => ({
    contentId: `practice-transfer-${index + 1}`,
    familyId: `transfer-family-${index + 1}`,
    sourceId: "source",
    contentType: "passage",
    partition: "transfer",
    language: "en",
    contentHash: `sha256-transfer-${index + 1}`,
    reviewStatus: "approved",
    text: `This protected passage ${index + 1} ` + "ordinary prose words ".repeat(115),
  }));
  const corpus = { corpusId: "transfer-fixture", corpusVersion: 1, language: "en", partition: "transfer", items };
  const pool = buildPracticeTransferPoolArtifact({
    corpus,
    typabilityArtifact: { items: [] },
    scoreComposite: () => ({ features: {}, textDifficulty: { difficultyIndex: 0, relativeDifficultyPercentile: 50, availableModelWeight: 1, standardizedFeatures: {} } }),
  });
  assert.equal(pool.status, "ready");
  assert.equal(pool.units.length, 16);
  return pool;
}

test("PL24 strict Cold Transfer is available only with a ready pool, complete exposure history, and a fresh unit", () => {
  const pool = poolFixture();
  const complete = createDefaultPracticeEvaluationState({ profileId: PROFILE_ID, now: NOW, historyStatus: "complete" });
  assert.equal(getRealTextColdTransferAvailability({ pool, evaluationState: complete, language: "en" }).status, "ready");
  const partial = createDefaultPracticeEvaluationState({ profileId: PROFILE_ID, now: NOW, historyStatus: "partial" });
  assert.equal(getRealTextColdTransferAvailability({ pool, evaluationState: partial, language: "en" }).status, "unavailable");
});

test("PL24 Cold Transfer reservation is target-blind and extra skill-model inputs are rejected by PL18", () => {
  const pool = poolFixture();
  const state = createDefaultPracticeEvaluationState({ profileId: PROFILE_ID, now: NOW, historyStatus: "complete" });
  const allowed = reservePracticeColdTransferUnitState({ profileId: PROFILE_ID, contextId: CONTEXT_ID, poolId: pool.poolId, pool, evaluationState: state, now: NOW });
  assert.equal(allowed.reservation.kind, "cold-transfer");
  assert.throws(() => reservePracticeColdTransferUnitState({ profileId: PROFILE_ID, contextId: CONTEXT_ID, poolId: pool.poolId, pool, evaluationState: state, now: NOW, skillStats: [{ entityKey: "br" }] }));
});

test("PL24 claim burns the fresh unit before reveal and produces one fixed 60-second untargeted evaluation plan", () => {
  const pool = poolFixture();
  const initial = createDefaultPracticeEvaluationState({ profileId: PROFILE_ID, now: NOW, historyStatus: "complete" });
  const reserved = reservePracticeColdTransferUnitState({ profileId: PROFILE_ID, contextId: CONTEXT_ID, poolId: pool.poolId, pool, evaluationState: initial, now: NOW });
  const claim = claimPracticeEvaluationReservationState({ evaluationState: reserved.state, profileId: PROFILE_ID, contextId: CONTEXT_ID, reservationId: reserved.reservation.reservationId, sessionId: SESSION_ID, artifact: pool, now: NOW });
  assert.equal(claim.binding.kind, "cold-transfer");
  assert.equal(claim.binding.freshnessStatus, "fresh");
  assert.equal(claim.state.transferPools[0].claimedUnitIds.includes(claim.binding.unitId), true);
  assert.equal(claim.state.activeReservations.length, 0);
  const plan = buildPracticeEvaluationPlan({ binding: claim.binding, artifact: pool, historyStatus: claim.state.historyStatus });
  assert.equal(plan.protocol.durationMs, 60000);
  assert.equal(plan.protocol.pauseAllowed, false);
  assert.equal(plan.protocol.resumable, false);
  assert.equal(plan.protocol.appendAllowed, false);
  assert.equal(plan.protocol.targeted, false);
  assert.equal(plan.targetEntities.length, 0);
  assert.throws(() => claimPracticeEvaluationReservationState({ evaluationState: claim.state, profileId: PROFILE_ID, contextId: CONTEXT_ID, reservationId: reserved.reservation.reservationId, sessionId: "practice-session_second-cold-fixture-00000001", artifact: pool, now: NOW }));
});

test("PL24 exhausted protected pool disables Cold Transfer without implying Natural Practice is exhausted", () => {
  const pool = poolFixture();
  const state = createDefaultPracticeEvaluationState({ profileId: PROFILE_ID, now: NOW, historyStatus: "complete" });
  const exhausted = { ...state, transferPools: [{ poolId: pool.poolId, poolVersion: pool.poolVersion, claimedUnitIds: pool.units.map((unit) => unit.unitId), claimedCount: pool.units.length, exhaustedAt: NOW().toISOString() }] };
  const availability = getRealTextColdTransferAvailability({ pool, evaluationState: exhausted, language: "en" });
  assert.equal(availability.status, "unavailable");
  assert.equal(availability.freshUnitAvailable, false);
});

test("PL24 hidden Cold Transfer descriptor is a measurement outcome, never a visible treatment descriptor", () => {
  assert.equal(PRACTICE_REAL_TEXT_COLD_TRANSFER_DESCRIPTOR.evaluationMeasurementKind, "cold-transfer");
  assert.equal(PRACTICE_REAL_TEXT_COLD_TRANSFER_DESCRIPTOR.abilityChannel, "cold-natural-text");
  assert.equal(PRACTICE_REAL_TEXT_COLD_TRANSFER_DESCRIPTOR.performanceMeasurementKind, null);
  assert.equal(PRACTICE_REAL_TEXT_COLD_TRANSFER_DESCRIPTOR.retentionMeasurementKind, null);
  assert.equal(PRACTICE_REAL_TEXT_COLD_TRANSFER_DESCRIPTOR.internalRealTextOnly, true);
});
