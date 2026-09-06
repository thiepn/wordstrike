import test from "node:test";
import assert from "node:assert/strict";
import { filterPracticeCommitForEvaluation } from "../js/practiceLab/practiceEvaluationAnalysis.js";

const payload = Object.freeze({
  skillEvidenceDeltas: [Object.freeze({ id: "skill" })],
  abilityObservation: Object.freeze({ id: "ability" }),
  learningObservationDeltas: [Object.freeze({ id: "learning" })],
});

function analysis(overrides = {}) {
  return { integrity: {
    skillEvidenceEligible: true,
    abilityEligible: true,
    transferEvidenceEligible: true,
    benchmarkComparisonEligible: false,
    coldVerificationEligible: true,
    ...overrides,
  } };
}

test("PL18 fresh valid cold transfer admits PL11 skill, PL13 ability and PL16 transfer together", () => {
  const filtered = filterPracticeCommitForEvaluation({ payload, evaluationAnalysis: analysis(), evidenceRole: "transfer", evaluationRequested: true });
  assert.equal(filtered.skillEvidenceDeltas.length, 1);
  assert.equal(filtered.abilityObservation.id, "ability");
  assert.equal(filtered.learningObservationDeltas.length, 1);
});

test("PL18 invalid/partial protected evaluation gates all protected evidence explicitly", () => {
  const filtered = filterPracticeCommitForEvaluation({ payload, evaluationAnalysis: analysis({ skillEvidenceEligible:false, abilityEligible:false, transferEvidenceEligible:false }), evidenceRole: "transfer", evaluationRequested: true });
  assert.deepEqual(filtered.skillEvidenceDeltas, []);
  assert.equal(filtered.abilityObservation, null);
  assert.deepEqual(filtered.learningObservationDeltas, []);
});
