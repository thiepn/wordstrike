import assert from "node:assert/strict";
import { test } from "node:test";
import { createPracticeContentPlan } from "../js/practiceLab/practiceSessionContract.js";
import {
  buildPracticeAcquisitionObservationDelta,
  extractPracticeLearningPhaseOpportunities,
} from "../js/practiceLab/practiceLearningObservation.js";

const profileId = "practice-profile_pl16-phase-profile-12345678";
const contextId = "practice-context_pl16-phase-context-12345678";
const sessionId = "practice-session_pl16-phase-session-12345678";

function transition(position, { residual = 0, correct = true, latencyClass = "fluent" } = {}) {
  return {
    eventIndex: position + 1,
    textPosition: position,
    isFirstAttempt: true,
    correctness: correct ? "correct" : "error",
    latencyClass,
    observedLatencyMs: latencyClass === "fluent" ? 100 + residual : 150,
    expectedLatencyMs: 100,
    residualLatencyMs: latencyClass === "fluent" ? residual : 50,
  };
}

function keyDelta(opportunities = 12) {
  return {
    sessionId,
    profileId,
    contextId,
    statId: "practice-stat_phase-test",
    entityType: "key",
    entityKey: "a",
    evidenceRole: "training",
    directTarget: true,
    observedAt: "2026-09-05T10:00:00.000Z",
    localDayKey: "2026-09-05",
    opportunities: {
      count: opportunities,
      correctCount: opportunities,
      errorCount: 0,
      directTargetedCount: opportunities,
      incidentalCount: 0,
    },
    timing: {
      eligibleCount: opportunities,
      fluentCount: opportunities,
      disfluentCount: 0,
      fluentLatency: { count: opportunities, meanMs: 100, m2: 0, minMs: 100, maxMs: 100, recentSamples: [] },
      fluentResidual: { count: opportunities, meanMs: 0, m2: 0, minMs: 0, maxMs: 0, recentSamples: [] },
      disfluentResidual: { count: 0, meanMs: 0, m2: 0, minMs: null, maxMs: null, recentSamples: [] },
    },
  };
}

test("PL16 12 targeted key opportunities split into first four entry and last four exit opportunities", () => {
  const contentPlan = createPracticeContentPlan({
    text: "aaaaaaaaaaaa",
    targetEntities: [{ entityType: "key", entityKey: "a" }],
    completion: { mode: "content", value: null },
    metadata: { language: "en" },
  });
  const normalizedTransitions = Array.from({ length: 12 }, (_, position) => transition(position, {
    residual: position < 4 ? 20 : position >= 8 ? 0 : 10,
  }));
  const map = extractPracticeLearningPhaseOpportunities({
    profileId,
    contextId,
    contentPlan,
    normalizedTransitions,
  });
  const records = map.get("key\u0000a");
  assert.equal(records.length, 12);

  const built = buildPracticeAcquisitionObservationDelta({
    delta: keyDelta(),
    experimentId: "pl16-phase",
    phaseRecords: records,
  });
  assert.equal(built.observation.phaseCoverage.status, "complete");
  assert.equal(built.observation.phaseCoverage.entryOpportunityCount, 4);
  assert.equal(built.observation.phaseCoverage.exitOpportunityCount, 4);
  assert.ok(built.observation.exitQuality > built.observation.entryQuality);
  assert.equal(
    built.observation.practiceGain,
    built.observation.exitQuality - built.observation.entryQuality,
  );
});

test("PL16 middle opportunities do not affect the entry/exit split", () => {
  const contentPlan = createPracticeContentPlan({
    text: "aaaaaaaaaaaa",
    targetEntities: [{ entityType: "key", entityKey: "a" }],
    completion: { mode: "content", value: null },
    metadata: { language: "en" },
  });
  const base = Array.from({ length: 12 }, (_, position) => transition(position, { residual: position < 4 ? 20 : 0 }));
  const changedMiddle = base.map((record, index) => index >= 4 && index < 8
    ? { ...record, correctness: "error", latencyClass: "disfluent", observedLatencyMs: 500, residualLatencyMs: 400 }
    : record);
  const first = extractPracticeLearningPhaseOpportunities({ profileId, contextId, contentPlan, normalizedTransitions: base }).get("key\u0000a");
  const second = extractPracticeLearningPhaseOpportunities({ profileId, contextId, contentPlan, normalizedTransitions: changedMiddle }).get("key\u0000a");
  const a = buildPracticeAcquisitionObservationDelta({ delta: keyDelta(), experimentId: "pl16-phase", phaseRecords: first });
  const b = buildPracticeAcquisitionObservationDelta({ delta: keyDelta(), experimentId: "pl16-phase", phaseRecords: second });
  assert.equal(a.observation.entryQuality, b.observation.entryQuality);
  assert.equal(a.observation.exitQuality, b.observation.exitQuality);
});

test("PL16 phase analysis refuses overlap rather than fabricating entry/exit quality", () => {
  const tinyRecordSet = Array.from({ length: 5 }, (_, position) => ({
    order: position,
    textPosition: position,
    correct: true,
    timing: [{ latencyClass: "fluent", observedLatencyMs: 100, residualLatencyMs: 0 }],
  }));
  const built = buildPracticeAcquisitionObservationDelta({
    delta: keyDelta(12),
    experimentId: "pl16-phase",
    phaseRecords: tinyRecordSet,
  });
  assert.equal(built.observation.entryQuality, null);
  assert.equal(built.observation.exitQuality, null);
  assert.equal(built.observation.practiceGain, null);
  assert.equal(built.observation.phaseCoverage.reason, "phase-overlap");
});

test("PL16 restored or truncated chronology may still add dose/whole quality but never fabricates entry/exit", () => {
  const records = Array.from({ length: 12 }, (_, position) => ({
    order: position,
    textPosition: position,
    correct: true,
    timing: [{ latencyClass: "fluent", observedLatencyMs: 100, residualLatencyMs: 0 }],
  }));
  const built = buildPracticeAcquisitionObservationDelta({
    delta: keyDelta(),
    experimentId: "pl16-restored",
    phaseRecords: records,
    phaseContinuityComplete: false,
  });
  assert.equal(built.observation.doseUnits, 12 / 80);
  assert.ok(Number.isFinite(built.observation.wholeQuality));
  assert.equal(built.observation.entryQuality, null);
  assert.equal(built.observation.exitQuality, null);
  assert.equal(built.observation.practiceGain, null);
  assert.equal(built.observation.phaseCoverage.status, "partial");
  assert.equal(built.observation.phaseCoverage.reason, "chronology-unavailable");
});
