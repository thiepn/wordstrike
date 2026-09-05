import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultSkillStat } from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticePeerReferenceIndex, shrinkPracticeResidualMean } from "../js/practiceLab/practicePeerReference.js";
import {
  evaluatePracticeSlowDimension,
  evaluatePracticeHesitantDimension,
  evaluatePracticeInaccurateDimension,
  evaluatePracticeRecoveryDimension,
  evaluatePracticeUnstableDimension,
  evaluatePracticeLimiterDimensions,
} from "../js/practiceLab/practiceLimiterDimensions.js";

const profileId = createPracticeId("profile", { uuid: () => "pl12-profile-dimensions-123456" });
const contextId = createPracticeId("context", { uuid: () => "pl12-context-dimensions-123456" });
const now = () => new Date("2026-09-05T09:00:00.000Z");

function aggregate(count, meanMs, recentSamples = []) {
  if (!count) return { count: 0, meanMs: 0, m2: 0, minMs: null, maxMs: null, recentSamples: [] };
  return { count, meanMs, m2: 0, minMs: meanMs, maxMs: meanMs, recentSamples: [...recentSamples] };
}

function makeStat({
  entityType = "bigram",
  entityKey,
  opportunities = 100,
  errorCount = 2,
  fluentCount = 95,
  disfluentCount = 5,
  residualMeanMs = 0,
  expectedMeanMs = 100,
  disfluentResidualMeanMs = 50,
  recoveryEpisodes = errorCount,
  recoveryMeanMs = 500,
  correctCharactersRemovedCount = 0,
  recentResiduals = [-5, 5, -5, 5, -5, 5, -5, 5],
  sessions = 8,
  days = 8,
  breadth = 24,
  launch = null,
} = {}) {
  const stat = createDefaultSkillStat({ profileId, contextId, entityType, entityKey, now });
  stat.updatedAt = now().toISOString();
  stat.lastObservedAt = now().toISOString();
  stat.evidence.opportunities = {
    count: opportunities,
    correctCount: opportunities - errorCount,
    errorCount,
    directTargetedCount: 0,
    incidentalCount: opportunities,
  };
  stat.evidence.observation.sessionCount = sessions;
  stat.evidence.observation.completedSessionCount = sessions;
  stat.evidence.observation.dayCount = days;
  stat.evidence.observation.breadthEvidencePoints = breadth;
  stat.evidence.observation.firstObservedAt = "2026-08-20T09:00:00.000Z";
  stat.evidence.observation.lastObservedAt = now().toISOString();
  stat.evidence.observation.lastObservedDayKey = "2026-09-05";
  stat.evidence.timing = {
    eligibleCount: fluentCount + disfluentCount,
    fluentCount,
    disfluentCount,
    fluentLatency: aggregate(fluentCount, expectedMeanMs + residualMeanMs),
    fluentResidual: aggregate(fluentCount, residualMeanMs, recentResiduals),
    disfluentResidual: aggregate(disfluentCount, disfluentResidualMeanMs),
    completeTraceSessionCount: sessions,
    retainedWindowSessionCount: 0,
  };
  stat.evidence.errors.primaryEpisodeCount = recoveryEpisodes;
  stat.evidence.errors.correctedEpisodeCount = recoveryEpisodes;
  stat.evidence.errors.uncorrectedEpisodeCount = 0;
  stat.evidence.errors.structuralCounts = { substitution: recoveryEpisodes, insertion: 0, omission: 0, transposition: 0, compound: 0, unknown: 0 };
  stat.evidence.errors.errorToRepair = recoveryEpisodes ? aggregate(recoveryEpisodes, recoveryMeanMs) : aggregate(0, 0);
  stat.evidence.errors.correctionInitiation = recoveryEpisodes ? aggregate(recoveryEpisodes, 150) : aggregate(0, 0);
  stat.evidence.errors.correctCharactersRemovedCount = correctCharactersRemovedCount;
  if (entityType === "word") {
    const launchFluent = launch?.fluentCount ?? 100;
    const launchDisfluent = launch?.disfluentCount ?? 0;
    const launchResidual = launch?.residualMeanMs ?? 0;
    const launchExpected = launch?.expectedMeanMs ?? 100;
    stat.evidence.launchTiming = {
      eligibleCount: launchFluent + launchDisfluent,
      fluentCount: launchFluent,
      disfluentCount: launchDisfluent,
      fluentLatency: aggregate(launchFluent, launchExpected + launchResidual),
      fluentResidual: aggregate(launchFluent, launchResidual),
      disfluentResidual: aggregate(launchDisfluent, launch?.disfluentResidualMeanMs ?? 50),
      completeTraceSessionCount: sessions,
      retainedWindowSessionCount: 0,
    };
  }
  return stat;
}

function peersFor(target, peerOptions = {}) {
  const peers = Array.from({ length: 8 }, (_, index) => makeStat({
    entityType: target.entityType,
    entityKey: `${target.entityKey}-peer-${index}`,
    ...peerOptions,
  }));
  const index = createPracticePeerReferenceIndex([target, ...peers]);
  return { peers, reference: index.forStat(target) };
}

test("PL12 slow severity uses shrunk PL10 residual, relative expected latency, negative clamp and engineering thresholds", () => {
  const target = makeStat({ entityKey: "br", residualMeanMs: 20, expectedMeanMs: 100, fluentCount: 100 });
  const { reference } = peersFor(target, { residualMeanMs: 0 });
  const result = evaluatePracticeSlowDimension(target, reference);
  const shrunk = 100 / 112 * 20;
  const relative = shrunk / 100;
  const expectedSeverity = 100 * (relative - 0.03) / (0.30 - 0.03);
  assert.ok(Math.abs(result.effect.shrunkResidualMs - shrunk) < 1e-12);
  assert.ok(Math.abs(result.effect.relativeSlowdown - relative) < 1e-12);
  assert.ok(Math.abs(result.severityScore - expectedSeverity) < 1e-10);
  assert.equal(result.effect.effectMode, "relative-expected");
  assert.ok(["likely", "confirmed"].includes(result.status));

  const faster = makeStat({ entityKey: "fa", residualMeanMs: -15, expectedMeanMs: 100, fluentCount: 100 });
  const fasterReference = peersFor(faster, { residualMeanMs: 0 }).reference;
  assert.equal(evaluatePracticeSlowDimension(faster, fasterReference).severityScore, 0);
});

test("PL12 residual shrinkage strongly discounts two observations relative to one hundred", () => {
  assert.equal(shrinkPracticeResidualMean(aggregate(2, 100), 12), 2 / 14 * 100);
  assert.equal(shrinkPracticeResidualMean(aggregate(100, 100), 12), 100 / 112 * 100);
  assert.ok(shrinkPracticeResidualMean(aggregate(2, 100), 12) < shrinkPracticeResidualMean(aggregate(100, 100), 12));
});

test("PL12 slow robust fallback uses peer residual reference when compatible raw/normalized overlap is unavailable", () => {
  const target = makeStat({ entityKey: "fallback", residualMeanMs: 40, fluentCount: 100 });
  target.evidence.timing.fluentLatency = aggregate(99, 140);
  const { reference } = peersFor(target, { residualMeanMs: 0, expectedMeanMs: 100 });
  const result = evaluatePracticeSlowDimension(target, reference);
  assert.equal(result.effect.effectMode, "peer-robust-fallback");
  assert.ok(result.effect.peerZ > 3);
  assert.equal(result.severityScore, 100);
});

test("PL12 hesitation uses exact leave-one-out peer rate, shrinkage and does not confuse globally high disfluency with entity-specific elevation", () => {
  const target = makeStat({ entityKey: "hes", fluentCount: 80, disfluentCount: 20 });
  const { reference } = peersFor(target, { fluentCount: 95, disfluentCount: 5 });
  assert.equal(reference.hesitation.rate, 0.05);
  const result = evaluatePracticeHesitantDimension(target, reference);
  const expected = (20 + 20 * 0.05) / 120;
  assert.ok(Math.abs(result.effect.smoothedRate - expected) < 1e-12);
  assert.ok(Math.abs(result.effect.excessDisfluency - (expected - 0.05)) < 1e-12);
  assert.ok(result.severityScore > 70);

  const nearlyGlobal = makeStat({ entityKey: "global-hes", fluentCount: 79, disfluentCount: 21 });
  const highPeers = peersFor(nearlyGlobal, { fluentCount: 80, disfluentCount: 20 }).reference;
  assert.equal(highPeers.hesitation.rate, 0.20);
  assert.equal(evaluatePracticeHesitantDimension(nearlyGlobal, highPeers).severityScore, 0);
});

test("PL12 inaccuracy is first-pass peer-relative and self-excluding, including globally poor accuracy", () => {
  const target = makeStat({ entityKey: "acc", opportunities: 100, errorCount: 8 });
  const { reference } = peersFor(target, { opportunities: 100, errorCount: 2 });
  assert.equal(reference.accuracy.rate, 0.02);
  const result = evaluatePracticeInaccurateDimension(target, reference);
  const expected = (8 + 30 * 0.02) / 130;
  assert.ok(Math.abs(result.effect.smoothedErrorRate - expected) < 1e-12);
  assert.ok(result.severityScore > 40);

  const global = makeStat({ entityKey: "global-acc", opportunities: 100, errorCount: 11 });
  const globalRef = peersFor(global, { opportunities: 100, errorCount: 10 }).reference;
  assert.equal(globalRef.accuracy.rate, 0.10);
  assert.equal(evaluatePracticeInaccurateDimension(global, globalRef).severityScore, 0);
});

test("PL12 recovery-heavy is distinct from error frequency and applies only a bounded over-deletion modifier", () => {
  const target = makeStat({ entityKey: "rec", opportunities: 200, errorCount: 20, recoveryEpisodes: 20, recoveryMeanMs: 1000, correctCharactersRemovedCount: 20 });
  const { reference } = peersFor(target, { opportunities: 200, errorCount: 20, recoveryEpisodes: 20, recoveryMeanMs: 500 });
  const result = evaluatePracticeRecoveryDimension(target, reference);
  assert.equal(result.effect.recoveryRatio, 1);
  assert.equal(result.effect.overDeletionPerEpisode, 1);
  assert.ok(result.effect.overDeletionBoost > 0 && result.effect.overDeletionBoost <= 15);
  assert.ok(result.severityScore > 60 && result.severityScore <= 75);

  const noTiming = makeStat({ entityKey: "rec-missing", opportunities: 200, errorCount: 20, recoveryEpisodes: 20, recoveryMeanMs: 500 });
  noTiming.evidence.errors.errorToRepair = aggregate(0, 0);
  const missingRef = peersFor(noTiming, { opportunities: 200, errorCount: 20, recoveryEpisodes: 20, recoveryMeanMs: 500 }).reference;
  assert.equal(evaluatePracticeRecoveryDimension(noTiming, missingRef).status, "insufficient-evidence");
});

test("PL12 instability uses robust recent-residual MAD and requires both sample/session evidence and peer variability", () => {
  const target = makeStat({ entityKey: "unstable", recentResiduals: [-15, 15, -15, 15, -15, 15, -15, 15] });
  const { reference } = peersFor(target, { recentResiduals: [-5, 5, -5, 5, -5, 5, -5, 5] });
  const result = evaluatePracticeUnstableDimension(target, reference);
  assert.equal(result.effect.recentResidualMadMs, 15);
  assert.equal(result.effect.instabilityRatio, 3);
  assert.equal(result.severityScore, 100);

  const thin = makeStat({ entityKey: "thin", recentResiduals: [-10, 10, -10, 10], sessions: 1 });
  const thinRef = peersFor(thin, { recentResiduals: [-5, 5, -5, 5, -5, 5, -5, 5] }).reference;
  assert.equal(evaluatePracticeUnstableDimension(thin, thinRef).status, "insufficient-evidence");
});

test("PL12 word launch phenotype separates launch impairment from internal execution", () => {
  const launchLimited = makeStat({
    entityType: "word", entityKey: "problem", opportunities: 100,
    fluentCount: 600, disfluentCount: 0, residualMeanMs: 3,
    launch: { fluentCount: 100, disfluentCount: 0, residualMeanMs: 40, expectedMeanMs: 100 },
  });
  const { reference } = peersFor(launchLimited, { opportunities: 100, fluentCount: 600, disfluentCount: 0, residualMeanMs: 0, launch: { fluentCount: 100, disfluentCount: 0, residualMeanMs: 0, expectedMeanMs: 100 } });
  const result = evaluatePracticeLimiterDimensions(launchLimited, reference);
  assert.equal(result.dimensions["launch-limited"].effect.ruleSatisfied, true);
  assert.equal(result.primaryPhenotype, "launch-limited");

  const bothSlow = makeStat({
    entityType: "word", entityKey: "internal", opportunities: 100,
    fluentCount: 600, disfluentCount: 0, residualMeanMs: 22,
    launch: { fluentCount: 100, disfluentCount: 0, residualMeanMs: 25, expectedMeanMs: 100 },
  });
  const bothRef = peersFor(bothSlow, { opportunities: 100, fluentCount: 600, disfluentCount: 0, residualMeanMs: 0, launch: { fluentCount: 100, disfluentCount: 0, residualMeanMs: 0, expectedMeanMs: 100 } }).reference;
  const both = evaluatePracticeLimiterDimensions(bothSlow, bothRef);
  assert.equal(both.dimensions["launch-limited"].effect.ruleSatisfied, false);
  assert.notEqual(both.primaryPhenotype, "launch-limited");
});

test("PL12 confidence gates high effects and mixed phenotype uses confidence-weighted severity", () => {
  const low = makeStat({ entityKey: "low-conf", opportunities: 2, errorCount: 1, fluentCount: 2, disfluentCount: 0, residualMeanMs: 100, sessions: 1, days: 1, breadth: 1 });
  const lowRef = peersFor(low, { opportunities: 100, errorCount: 2, fluentCount: 100, disfluentCount: 0, residualMeanMs: 0 }).reference;
  const lowResult = evaluatePracticeLimiterDimensions(low, lowRef);
  assert.equal(lowResult.dimensions.slow.status, "insufficient-evidence");
  assert.notEqual(lowResult.dimensions.slow.status, "confirmed");

  const mixed = makeStat({ entityKey: "mixed", opportunities: 200, errorCount: 30, fluentCount: 180, disfluentCount: 20, residualMeanMs: 40 });
  const mixedRef = peersFor(mixed, { opportunities: 200, errorCount: 2, fluentCount: 198, disfluentCount: 2, residualMeanMs: 0 }).reference;
  const result = evaluatePracticeLimiterDimensions(mixed, mixedRef);
  assert.equal(result.primaryPhenotype, "mixed");
  assert.equal(result.mixedTypes.length, 2);
  const maxWeighted = Math.max(...Object.values(result.dimensions).map((entry) => entry.weightedSeverity));
  assert.ok(Math.abs(result.weaknessScore - maxWeighted) < 1e-12);
});
