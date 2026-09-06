import test from "node:test";
import assert from "node:assert/strict";
import { reconstructPracticeEvaluationStateFromSessionSummaries } from "../js/practiceLab/practiceEvaluationState.js";

const profileId="practice-profile_123456789";

test("PL18 reconstructed exposure history remains partial and never silently becomes strict cold history", () => {
  const state=reconstructPracticeEvaluationStateFromSessionSummaries({profileId,sessionSummaries:[{profileId,sessionId:"practice-session_123456789",completedAtUtc:"2026-09-06T12:00:00Z",evaluationSummary:{kind:"cold-transfer",poolId:"P",poolVersion:1,unitId:"U1",exposureOrdinal:1}}],now:()=>new Date("2026-09-07T00:00:00Z")});
  assert.equal(state.historyStatus,"partial");
  assert.deepEqual(state.transferPools[0].claimedUnitIds,["U1"]);
});
