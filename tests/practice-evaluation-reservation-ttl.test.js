import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultPracticeEvaluationState } from "../js/practiceLab/practiceEvaluationState.js";
import { reservePracticeBenchmarkFormState } from "../js/practiceLab/practiceEvaluationReservation.js";
import { claimPracticeEvaluationReservationState } from "../js/practiceLab/practiceEvaluationBinding.js";
import { PRACTICE_EVALUATION_LIMITS } from "../js/practiceLab/practiceEvaluationConstants.js";

const profileId="practice-profile_123456789";
const contextId="practice-context_123456789";
const suite={suiteId:"S",suiteVersion:1,status:"ready",forms:[{formId:"F1",formVersion:1,formHash:"h1"}]};

test("PL18 reservation TTL is two hours and expired reservations cannot be claimed", () => {
  const start=()=>new Date("2026-09-06T10:00:00Z");
  const state=createDefaultPracticeEvaluationState({profileId,now:start});
  const reserved=reservePracticeBenchmarkFormState({profileId,contextId,suiteId:"S",suite,evaluationState:state,now:start});
  assert.equal(Date.parse(reserved.reservation.expiresAt)-Date.parse(reserved.reservation.createdAt),PRACTICE_EVALUATION_LIMITS.reservationTtlMs);
  assert.equal(PRACTICE_EVALUATION_LIMITS.reservationTtlMs,2*60*60*1000);
  assert.throws(()=>claimPracticeEvaluationReservationState({evaluationState:reserved.state,profileId,contextId,reservationId:reserved.reservation.reservationId,sessionId:"practice-session_123456789",artifact:suite,now:()=>new Date("2026-09-06T12:00:01Z")}),{code:"PRACTICE_EVALUATION_RESERVATION_NOT_FOUND"});
});
