import test from "node:test";
import assert from "node:assert/strict";
import { selectPracticeColdTransferUnit } from "../js/practiceLab/practiceTransferSelection.js";
import { createDefaultPracticeEvaluationState } from "../js/practiceLab/practiceEvaluationState.js";

const profileId = "practice-profile_123456789";
const state = createDefaultPracticeEvaluationState({ profileId, now: () => new Date("2026-09-06T12:00:00Z") });
const pool = { poolId:"P", poolVersion:1, status:"ready", units:[{unitId:"no-br",unitVersion:1,unitHash:"h1",annotations:{br:0}},{unitId:"many-br",unitVersion:1,unitHash:"h2",annotations:{br:99}}] };

test("PL18 cold transfer selection never resamples based on target occurrence", () => {
  const first = selectPracticeColdTransferUnit({ profileId, contextId:"practice-context_123456789", poolId:"P", pool, evaluationState:state });
  const annotatedDifferently = { ...pool, units: pool.units.map((unit) => ({ ...unit, annotations: unit.unitId === "no-br" ? { br:999 } : { br:0 } })) };
  const second = selectPracticeColdTransferUnit({ profileId, contextId:"practice-context_123456789", poolId:"P", pool:annotatedDifferently, evaluationState:state });
  assert.equal(second.unitId, first.unitId);
});
