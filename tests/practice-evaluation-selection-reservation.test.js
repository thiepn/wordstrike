import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultPracticeEvaluationState } from "../js/practiceLab/practiceEvaluationState.js";
import { selectPracticeColdTransferUnit } from "../js/practiceLab/practiceTransferSelection.js";
import { reservePracticeBenchmarkFormState, reservePracticeColdTransferUnitState } from "../js/practiceLab/practiceEvaluationReservation.js";
import { claimPracticeEvaluationReservationState } from "../js/practiceLab/practiceEvaluationBinding.js";

const profileId = "practice-profile_123456789";
const contextA = "practice-context_123456789";
const contextB = "practice-context_987654321";
const now = () => new Date("2026-09-06T12:00:00.000Z");
const form = (id) => ({ formId: id, formVersion: 1, formHash: `hash-${id}` });
const unit = (id) => ({ unitId: id, unitVersion: 1, unitHash: `hash-${id}` });
const suite = { suiteId: "S", suiteVersion: 1, status: "ready", forms: [form("F1"), form("F2"), form("F3")] };
const pool = { poolId: "P", poolVersion: 1, status: "ready", units: [unit("U1"), unit("U2"), unit("U3")] };

test("PL18 transfer selection is deterministic and target-like options are rejected", () => {
  const state = createDefaultPracticeEvaluationState({ profileId, now });
  const a = selectPracticeColdTransferUnit({ profileId, contextId: contextA, poolId: "P", pool, evaluationState: state });
  const b = selectPracticeColdTransferUnit({ profileId, contextId: contextA, poolId: "P", pool, evaluationState: state });
  assert.equal(a.unitId, b.unitId);
  assert.throws(() => selectPracticeColdTransferUnit({ profileId, contextId: contextA, poolId: "P", pool, evaluationState: state, targetEntity: "br" }), { code: "PRACTICE_EVALUATION_TARGET_INPUT_FORBIDDEN" });
  assert.throws(() => selectPracticeColdTransferUnit({ profileId, contextId: contextA, poolId: "P", pool, evaluationState: state, unexpected: true }), { code: "PRACTICE_EVALUATION_UNKNOWN_SELECTION_FIELD" });
});

test("PL18 benchmark exposure is profile-wide and fresh before repeat", () => {
  let state = createDefaultPracticeEvaluationState({ profileId, now });
  const firstReservation = reservePracticeBenchmarkFormState({ profileId, contextId: contextA, suiteId: "S", suite, evaluationState: state, now });
  const firstId = firstReservation.reservation.selectedUnitId;
  const firstClaim = claimPracticeEvaluationReservationState({ evaluationState: firstReservation.state, profileId, contextId: contextA, reservationId: firstReservation.reservation.reservationId, sessionId: "practice-session_111111111", artifact: suite, now });
  assert.equal(firstClaim.binding.freshnessStatus, "fresh");
  assert.equal(firstClaim.binding.exposureOrdinal, 1);
  state = firstClaim.state;
  const secondReservation = reservePracticeBenchmarkFormState({ profileId, contextId: contextB, suiteId: "S", suite, evaluationState: state, now });
  assert.notEqual(secondReservation.reservation.selectedUnitId, firstId);
  const secondClaim = claimPracticeEvaluationReservationState({ evaluationState: secondReservation.state, profileId, contextId: contextB, reservationId: secondReservation.reservation.reservationId, sessionId: "practice-session_222222222", artifact: suite, now });
  assert.equal(secondClaim.binding.freshnessStatus, "fresh");
});

test("PL18 cold transfer claims are single-use and pool exhaustion is real", () => {
  let state = createDefaultPracticeEvaluationState({ profileId, now });
  for (let i = 0; i < pool.units.length; i += 1) {
    const reserved = reservePracticeColdTransferUnitState({ profileId, contextId: contextA, poolId: "P", pool, evaluationState: state, now });
    const claimed = claimPracticeEvaluationReservationState({ evaluationState: reserved.state, profileId, contextId: contextA, reservationId: reserved.reservation.reservationId, sessionId: `practice-session_${String(i).padEnd(9, "1")}`, artifact: pool, now });
    assert.equal(claimed.binding.freshnessStatus, "fresh");
    state = claimed.state;
  }
  assert.throws(() => reservePracticeColdTransferUnitState({ profileId, contextId: contextA, poolId: "P", pool, evaluationState: state, now }), { code: "COLD_TRANSFER_POOL_EXHAUSTED" });
});
