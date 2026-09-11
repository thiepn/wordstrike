import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  attachPracticeTreatmentOutcome,
} from "../js/practiceLab/practiceTreatmentOutcome.js";
import { buildPracticeTargetRetestCandidate } from "../js/practiceLab/practiceTreatmentOutcomeRegistry.js";
import {
  buildPracticeTreatmentResponseSample,
  createPracticeTreatmentResponseState,
  mergePracticeTreatmentResponseSample,
} from "../js/practiceLab/practiceTreatmentResponseState.js";

function episode(outcomeKey) {
  return {
    treatmentEpisodeId: `episode-${outcomeKey}`,
    assignmentKind: "manual",
    baseline: { status: "available" },
    treatment: { targetStatId: null },
    outcomes: [{ outcomeKey, status: "pending" }],
    status: "tracking",
  };
}

function attach({ outcomeKey, measurementGrade = "independent", response }) {
  return attachPracticeTreatmentOutcome(episode(outcomeKey), {
    contract: { outcomeKey, measurementGrade },
    candidate: { candidateId: `candidate-${outcomeKey}`, observedAt: "2026-09-10T10:00:00.000Z", validity: {} },
    evaluation: { delayMs: 86_400_000, delayBucket: "next-day" },
    contamination: { level: "none", reasons: [], auditedAt: "2026-09-10T10:00:00.000Z" },
    response,
  }).outcomes[0];
}

test("consistency tradeoff responses remain descriptive but cannot enter aggregation", () => {
  const outcome = attach({
    outcomeKey: "consistency",
    measurementGrade: "hybrid",
    response: { responseValue: 3, responseUnit: "percentage-points", tradeoff: true },
  });
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.primaryEligible, false);
  assert.equal(outcome.aggregateEligible, false);
  assert.equal(outcome.reason, "response-tradeoff");
});

test("uncertainty-heavy ability responses remain descriptive but cannot enter aggregation", () => {
  const outcome = attach({
    outcomeKey: "ability",
    response: { responseValue: 8, responseUnit: "percent", classification: "uncertain", z: 0.3 },
  });
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.primaryEligible, false);
  assert.equal(outcome.aggregateEligible, false);
  assert.equal(outcome.reason, "response-uncertain");
});

test("clean usable hybrid response can aggregate but never becomes primary independent evidence", () => {
  const outcome = attach({
    outcomeKey: "consistency",
    measurementGrade: "hybrid",
    response: { responseValue: 2, responseUnit: "percentage-points", tradeoff: false },
  });
  assert.equal(outcome.evidenceGrade, "hybrid-measurement");
  assert.equal(outcome.primaryEligible, false);
  assert.equal(outcome.aggregateEligible, true);
});

test("response state trusts explicit aggregation eligibility instead of inferring it from hybrid grade", () => {
  const outcome = attach({
    outcomeKey: "consistency",
    measurementGrade: "hybrid",
    response: { responseValue: 3, responseUnit: "percentage-points", tradeoff: true },
  });
  const sourceEpisode = { treatmentEpisodeId: "episode-consistency", assignmentKind: "manual", treatment: { targetStatId: null } };
  const sample = buildPracticeTreatmentResponseSample({ episode: sourceEpisode, outcome, localDayKey: "2026-09-10" });
  assert.equal(sample.aggregateEligible, false);
  let state = createPracticeTreatmentResponseState({
    profileId: "profile",
    contextId: "context",
    treatmentFamilyKey: "family",
    outcomeKey: "consistency",
    delayBucket: "next-day",
    responseUnit: "percentage-points",
    now: "2026-09-10T10:00:00.000Z",
  });
  state = mergePracticeTreatmentResponseSample(state, sample);
  assert.equal(state.summary.count, 0);
  assert.equal(state.summary.responsePattern, "insufficient");
});

test("targeted retest candidates require usable quality coverage and opportunities", () => {
  const common = {
    profileId: "profile",
    contextId: "context",
    sessionId: "session",
    observedAt: "2026-09-10T10:00:00.000Z",
    localDayKey: "2026-09-10",
    entityType: "key",
    entityKey: "e",
    protocolFingerprint: "protocol",
  };
  assert.equal(buildPracticeTargetRetestCandidate({ ...common, metrics: { quality: 80, qualityCoverage: 0.59, opportunityCount: 8 } }), null);
  assert.equal(buildPracticeTargetRetestCandidate({ ...common, metrics: { quality: 80, qualityCoverage: 0.8, opportunityCount: 0 } }), null);
  assert.ok(buildPracticeTargetRetestCandidate({ ...common, metrics: { quality: 80, qualityCoverage: 0.8, opportunityCount: 8 } }));
});

test("current treatment finalization and abandonment close any still-preserved prior outcome", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceTreatmentService.js", import.meta.url), "utf8");
  const matches = source.match(/preserveCompatibleMeasurement:\s*false/g) ?? [];
  assert.equal(matches.length, 2, "both canonical finalization and abandonment must close unresolved preserved outcomes");
});
