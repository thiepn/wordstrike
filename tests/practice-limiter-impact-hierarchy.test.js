import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultSkillStat } from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import {
  createPracticeEntityPrevalenceProvider,
  createPracticeTargetIndexPrevalenceProvider,
} from "../js/practiceLab/practiceEntityPrevalence.js";
import {
  computePracticePerformanceBurden,
  assignPracticeImpactPercentiles,
  practiceEmpiricalMidrankPercentile,
} from "../js/practiceLab/practiceImpactModel.js";
import { decomposePracticeEntity, evaluatePracticeCandidateHierarchy } from "../js/practiceLab/practiceEntityHierarchy.js";
import { buildPracticeLimiterSnapshot } from "../js/practiceLab/practiceLimiterSnapshot.js";

const profileId = createPracticeId("profile", { uuid: () => "pl12-profile-impact-123456789" });
const contextId = createPracticeId("context", { uuid: () => "pl12-context-impact-123456789" });
const now = () => new Date("2026-09-05T09:30:00.000Z");
const context = { profileId, contextId, dataLocale: "en-US" };

function aggregate(count, meanMs, recentSamples = []) {
  if (!count) return { count: 0, meanMs: 0, m2: 0, minMs: null, maxMs: null, recentSamples: [] };
  return { count, meanMs, m2: 0, minMs: meanMs, maxMs: meanMs, recentSamples: [...recentSamples] };
}

function stat({ entityType = "bigram", entityKey, opportunities = 100, errorCount = 2, fluentCount = 95, disfluentCount = 5, residualMeanMs = 0, disfluentResidualMeanMs = 50, recoveryEpisodes = errorCount, recoveryMeanMs = 500, launch = null, updatedAt = "2026-09-05T09:30:00.000Z" } = {}) {
  const value = createDefaultSkillStat({ profileId, contextId, entityType, entityKey, now });
  value.updatedAt = updatedAt;
  value.lastObservedAt = updatedAt;
  value.evidence.opportunities = { count: opportunities, correctCount: opportunities - errorCount, errorCount, directTargetedCount: 0, incidentalCount: opportunities };
  value.evidence.observation.sessionCount = 8;
  value.evidence.observation.completedSessionCount = 8;
  value.evidence.observation.dayCount = 8;
  value.evidence.observation.breadthEvidencePoints = 24;
  value.evidence.observation.firstObservedAt = "2026-08-20T09:30:00.000Z";
  value.evidence.observation.lastObservedAt = updatedAt;
  value.evidence.observation.lastObservedDayKey = "2026-09-05";
  value.evidence.timing = {
    eligibleCount: fluentCount + disfluentCount,
    fluentCount,
    disfluentCount,
    fluentLatency: aggregate(fluentCount, 100 + residualMeanMs),
    fluentResidual: aggregate(fluentCount, residualMeanMs, [-5, 5, -5, 5, -5, 5, -5, 5]),
    disfluentResidual: aggregate(disfluentCount, disfluentResidualMeanMs),
    completeTraceSessionCount: 8,
    retainedWindowSessionCount: 0,
  };
  value.evidence.errors.primaryEpisodeCount = recoveryEpisodes;
  value.evidence.errors.correctedEpisodeCount = recoveryEpisodes;
  value.evidence.errors.uncorrectedEpisodeCount = 0;
  value.evidence.errors.structuralCounts = { substitution: recoveryEpisodes, insertion: 0, omission: 0, transposition: 0, compound: 0, unknown: 0 };
  value.evidence.errors.errorToRepair = recoveryEpisodes ? aggregate(recoveryEpisodes, recoveryMeanMs) : aggregate(0, 0);
  value.evidence.errors.correctionInitiation = recoveryEpisodes ? aggregate(recoveryEpisodes, 150) : aggregate(0, 0);
  if (entityType === "word") {
    const lf = launch?.fluentCount ?? 100;
    const ld = launch?.disfluentCount ?? 0;
    const lr = launch?.residualMeanMs ?? 0;
    value.evidence.launchTiming = {
      eligibleCount: lf + ld,
      fluentCount: lf,
      disfluentCount: ld,
      fluentLatency: aggregate(lf, 100 + lr),
      fluentResidual: aggregate(lf, lr),
      disfluentResidual: aggregate(ld, launch?.disfluentResidualMeanMs ?? 50),
      completeTraceSessionCount: 8,
      retainedWindowSessionCount: 0,
    };
  }
  return value;
}

function prevalence(status, rate, quality = status === "reference" ? 1 : status === "practice-proxy" ? 0.6 : 0) {
  return { status, opportunitiesPer1000Graphemes: rate, quality, sourceId: status === "reference" ? "ref-v1" : "practice-en-v1:training", referenceVersion: 1 };
}

function dimension(type, effect, confidence = 90, status = "likely", severityScore = 80) {
  const key = type === "slow" ? "positiveResidualMs"
    : type === "hesitant" ? "excessDisfluency"
      : type === "inaccurate" ? "excessErrorRate"
        : type === "recovery-heavy" ? "recoveryRatio"
          : type === "unstable" ? "instabilityRatio"
            : "positiveLaunchResidualMs";
  return { type, status, severityScore, evidenceConfidenceScore: confidence, evidenceConfidenceLevel: confidence >= 80 ? "high" : "medium", weightedSeverity: severityScore * confidence / 100, effect: { [key]: effect }, baseline: {}, evidence: {}, reasons: [] };
}

function hierarchyCandidate({ statId, entityType, entityKey, slow = null, hesitant = null, inaccurate = null, recovery = null, launch = null, unstable = null }) {
  return {
    statId,
    entityType,
    entityKey,
    dimensions: {
      slow: slow ?? dimension("slow", 0, 90, "not-elevated", 0),
      hesitant: hesitant ?? dimension("hesitant", 0, 90, "not-elevated", 0),
      inaccurate: inaccurate ?? dimension("inaccurate", 0, 90, "not-elevated", 0),
      "recovery-heavy": recovery ?? dimension("recovery-heavy", 0, 90, "not-elevated", 0),
      "launch-limited": launch ?? dimension("launch-limited", 0, 90, "not-elevated", 0),
      unstable: unstable ?? dimension("unstable", 0, 90, "not-elevated", 0),
    },
  };
}

test("PL12 prevalence accepts only approved statistical references, falls back to training proxy, and never maps unknown to zero", async () => {
  const provider = createPracticeEntityPrevalenceProvider({
    fingerprint: "fixture-v1",
    referenceLookup: async ({ entityKey }) => entityKey === "a" ? {
      opportunitiesPer1000Graphemes: 80,
      sourceId: "approved-reference",
      sourceType: "statistical-reference",
      usageApproval: "statistical-only",
      sourceChecksum: "sha256-fixture",
      referenceVersion: 1,
    } : entityKey === "bad" ? {
      opportunitiesPer1000Graphemes: 999,
      sourceId: "unapproved",
      sourceType: "word-list",
      usageApproval: "practice-display-approved",
    } : null,
    proxyLookup: async ({ entityKey }) => entityKey === "bad" || entityKey === "br" ? { opportunitiesPer1000Graphemes: 20, sourceId: "training-proxy" } : null,
  });
  const reference = await provider.getEntityPrevalence({ language: "en-US", entityType: "key", entityKey: "a" });
  assert.equal(reference.status, "reference");
  assert.equal(reference.quality, 1);
  assert.equal(reference.sourceApproval, "statistical-only");
  const rejected = await provider.getEntityPrevalence({ language: "en", entityType: "bigram", entityKey: "bad" });
  assert.equal(rejected.status, "practice-proxy");
  assert.equal(rejected.quality, 0.6);
  const unknown = await provider.getEntityPrevalence({ language: "en", entityType: "word", entityKey: "not-covered" });
  assert.equal(unknown.status, "unavailable");
  assert.equal(unknown.opportunitiesPer1000Graphemes, null);
});

test("PL12 PL7 practice proxy queries training only, uses exact per-1000 rate and is language isolated", async () => {
  const calls = [];
  const targetIndex = {
    async getTargetSummary(query) {
      calls.push(query);
      return query.entityKey === "br" ? { corpusOccurrenceCount: 3 } : null;
    },
  };
  const provider = createPracticeTargetIndexPrevalenceProvider({
    targetIndex,
    language: "en",
    trainingGraphemeCount: 145,
    corpusId: "practice-en-v1",
    corpusVersion: 1,
    indexChecksum: "sha256-index",
    segmentationVersion: 1,
    tokenizationVersion: 1,
  });
  const result = await provider.getEntityPrevalence({ language: "en-US", entityType: "bigram", entityKey: "br" });
  assert.equal(result.status, "practice-proxy");
  assert.ok(Math.abs(result.opportunitiesPer1000Graphemes - 1000 * 3 / 145) < 1e-12);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].partition, "training");
  assert.equal(calls[0].purpose, "training");
  const german = await provider.getEntityPrevalence({ language: "de-DE", entityType: "bigram", entityKey: "br" });
  assert.equal(german.status, "unavailable");
  assert.equal(calls.length, 1);
});

test("PL12 burden keeps speed, hesitation, launch and recovery components separate; recovery remains an observed-window proxy", () => {
  const word = stat({ entityType: "word", entityKey: "problem", opportunities: 100, errorCount: 10, fluentCount: 600, disfluentCount: 20, residualMeanMs: 10, disfluentResidualMeanMs: 80, recoveryEpisodes: 10, recoveryMeanMs: 700, launch: { fluentCount: 90, disfluentCount: 10, residualMeanMs: 20, disfluentResidualMeanMs: 100 } });
  const impact = computePracticePerformanceBurden(word, prevalence("reference", 10));
  assert.equal(impact.status, "full");
  assert.ok(impact.fluentSpeedBurdenMsPer1000 > 0);
  assert.ok(impact.hesitationBurdenMsPer1000 > 0);
  assert.ok(impact.launchBurdenMsPer1000 > 0);
  assert.ok(impact.recoveryBurdenMsPer1000 > 0);
  assert.equal(impact.components.recovery.kind, "observed-recovery-window");
  const sum = impact.fluentSpeedBurdenMsPer1000 + impact.hesitationBurdenMsPer1000 + impact.launchBurdenMsPer1000 + impact.recoveryBurdenMsPer1000;
  assert.ok(Math.abs(impact.estimatedPerformanceBurdenMsPer1000 - sum) < 1e-9);
});

test("PL12 missing recovery timing is partial, unavailable prevalence gives null impact, and negative residuals never create benefit credit", () => {
  const value = stat({ entityKey: "missing", opportunities: 100, errorCount: 10, recoveryEpisodes: 10, recoveryMeanMs: 500, residualMeanMs: -15 });
  value.evidence.errors.errorToRepair = aggregate(0, 0);
  const partial = computePracticePerformanceBurden(value, prevalence("reference", 50));
  assert.equal(partial.status, "partial");
  assert.equal(partial.components.recovery.status, "partial");
  assert.equal(partial.fluentSpeedBurdenMsPer1000, 0);
  const unavailable = computePracticePerformanceBurden(value, prevalence("unavailable", null));
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.impactScore, null);
});

test("PL12 common moderate limiter can exceed rare severe limiter impact while weakness remains prevalence-independent", () => {
  const common = stat({ entityKey: "common", opportunities: 100, fluentCount: 100, disfluentCount: 0, residualMeanMs: 10, errorCount: 0, recoveryEpisodes: 0 });
  const rare = stat({ entityKey: "rare", opportunities: 100, fluentCount: 100, disfluentCount: 0, residualMeanMs: 30, errorCount: 0, recoveryEpisodes: 0 });
  const commonImpact = computePracticePerformanceBurden(common, prevalence("reference", 100));
  const rareImpact = computePracticePerformanceBurden(rare, prevalence("reference", 1));
  assert.ok(commonImpact.estimatedPerformanceBurdenMsPer1000 > rareImpact.estimatedPerformanceBurdenMsPer1000);
});

test("PL12 empirical midrank ties are stable and prevalence quality down-weights otherwise identical impact percentile", () => {
  assert.equal(practiceEmpiricalMidrankPercentile([1, 2, 2, 4], 2), 50);
  const candidates = assignPracticeImpactPercentiles([
    { statId: "ref", impact: { status: "full", prevalence: prevalence("reference", 10), estimatedPerformanceBurdenMsPer1000: 100 } },
    { statId: "proxy", impact: { status: "prevalence-proxy", prevalence: prevalence("practice-proxy", 10), estimatedPerformanceBurdenMsPer1000: 100 } },
  ]);
  assert.equal(candidates[0].impact.impactPercentile, 50);
  assert.equal(candidates[1].impact.impactPercentile, 50);
  assert.equal(candidates[0].impact.impactScore, 50);
  assert.equal(candidates[1].impact.impactScore, 30);
});

test("PL12 canonical hierarchy follows terminal-transition semantics for bigram and trigram", () => {
  assert.deepEqual(decomposePracticeEntity({ entityType: "bigram", entityKey: "br" }).terminal, { entityType: "key", entityKey: "r" });
  assert.deepEqual(decomposePracticeEntity({ entityType: "trigram", entityKey: "str" }).terminal, { entityType: "bigram", entityKey: "tr" });

  const key = hierarchyCandidate({ statId: "key-r", entityType: "key", entityKey: "r", slow: dimension("slow", 28) });
  const bigram = hierarchyCandidate({ statId: "bigram-br", entityType: "bigram", entityKey: "br", slow: dimension("slow", 30) });
  const map = new Map([["key|r", key], ["bigram|br", bigram]]);
  const result = evaluatePracticeCandidateHierarchy(bigram, map);
  assert.equal(result.status, "explained");
  assert.ok(result.explanationRatio > 0.9);
  assert.equal(result.explainedBy[0].statId, "key-r");
  assert.equal(result.penalty, 0.40);

  const tr = hierarchyCandidate({ statId: "bigram-tr", entityType: "bigram", entityKey: "tr", slow: dimension("slow", 27) });
  const str = hierarchyCandidate({ statId: "trigram-str", entityType: "trigram", entityKey: "str", slow: dimension("slow", 30) });
  const triMap = new Map([["bigram|tr", tr], ["trigram|str", str]]);
  assert.equal(evaluatePracticeCandidateHierarchy(str, triMap).status, "explained");
});

test("PL12 hierarchy remains independent when child effect is absent or child confidence is materially weaker", () => {
  const healthyChild = hierarchyCandidate({ statId: "key-r", entityType: "key", entityKey: "r", slow: dimension("slow", 0, 90, "not-elevated", 0) });
  const parent = hierarchyCandidate({ statId: "bigram-br", entityType: "bigram", entityKey: "br", slow: dimension("slow", 30, 90) });
  assert.equal(evaluatePracticeCandidateHierarchy(parent, new Map([["key|r", healthyChild]])).status, "independent");
  const weakConfidenceChild = hierarchyCandidate({ statId: "key-r2", entityType: "key", entityKey: "r", slow: dimension("slow", 29, 70) });
  assert.equal(evaluatePracticeCandidateHierarchy(parent, new Map([["key|r", weakConfidenceChild]])).status, "independent");
});

test("PL12 word hierarchy uses constituent bigrams with multiplicity, keeps independent words visible, and launch can use first-key explanation", () => {
  const word = hierarchyCandidate({ statId: "word-problem", entityType: "word", entityKey: "problem", slow: dimension("slow", 30) });
  const parts = ["pr", "ro", "ob", "bl", "le", "em"];
  const map = new Map([["word|problem", word]]);
  for (const part of parts) map.set(`bigram|${part}`, hierarchyCandidate({ statId: `bi-${part}`, entityType: "bigram", entityKey: part, slow: dimension("slow", 28) }));
  const explained = evaluatePracticeCandidateHierarchy(word, map);
  assert.equal(explained.status, "explained");
  assert.ok(explained.explainedBy.length <= 3);

  const independent = evaluatePracticeCandidateHierarchy(word, new Map([["word|problem", word]]));
  assert.equal(independent.status, "independent");

  const launchWord = hierarchyCandidate({ statId: "word-launch", entityType: "word", entityKey: "bright", launch: dimension("launch-limited", 40) });
  const firstKey = hierarchyCandidate({ statId: "key-b", entityType: "key", entityKey: "b", slow: dimension("slow", 35) });
  const launchMap = new Map([["word|bright", launchWord], ["key|b", firstKey]]);
  assert.equal(evaluatePracticeCandidateHierarchy(launchWord, launchMap).status, "explained");
});

test("PL12 recovery hierarchy is capped at partial and instability is not hierarchy-suppressed in v1", () => {
  const child = hierarchyCandidate({ statId: "key-r", entityType: "key", entityKey: "r", recovery: dimension("recovery-heavy", 2), unstable: dimension("unstable", 5) });
  const parent = hierarchyCandidate({ statId: "bigram-br", entityType: "bigram", entityKey: "br", recovery: dimension("recovery-heavy", 2), unstable: dimension("unstable", 5) });
  const result = evaluatePracticeCandidateHierarchy(parent, new Map([["key|r", child]]));
  assert.equal(result.status, "partially-explained");
  const unstableOnly = hierarchyCandidate({ statId: "bigram-unstable", entityType: "bigram", entityKey: "br", unstable: dimension("unstable", 5) });
  const unstableChild = hierarchyCandidate({ statId: "key-unstable", entityType: "key", entityKey: "r", unstable: dimension("unstable", 5) });
  assert.equal(evaluatePracticeCandidateHierarchy(unstableOnly, new Map([["key|r", unstableChild]])).status, "independent");
});

test("PL12 snapshot reports exact model versions, bounds output, strips raw sample arrays, separates weak from important and is deterministic", () => {
  const peers = Array.from({ length: 8 }, (_, index) => stat({ entityKey: `peer-${index}`, opportunities: 200, errorCount: 2, fluentCount: 198, disfluentCount: 2, residualMeanMs: 0 }));
  const common = stat({ entityKey: "common", opportunities: 200, errorCount: 20, fluentCount: 180, disfluentCount: 20, residualMeanMs: 15 });
  const rare = stat({ entityKey: "rare", opportunities: 200, errorCount: 40, fluentCount: 160, disfluentCount: 40, residualMeanMs: 40 });
  const all = [...peers, common, rare];
  const rates = new Map(all.map((value) => [value.statId, prevalence("reference", value.entityKey === "common" ? 100 : value.entityKey === "rare" ? 1 : 20)]));
  const first = buildPracticeLimiterSnapshot({ skillStats: all, context, prevalenceByStat: rates, generatedAt: "2026-09-05T10:00:00.000Z", maxCandidates: 5 });
  const second = buildPracticeLimiterSnapshot({ skillStats: all, context, prevalenceByStat: rates, generatedAt: "2026-09-05T10:00:00.000Z", maxCandidates: 5 });
  assert.deepEqual(first, second);
  assert.equal(first.snapshotVersion, 1);
  assert.equal(first.modelVersion, 1);
  assert.equal(first.policyVersion, 1);
  assert.equal(first.impactModelVersion, 1);
  assert.equal(first.hierarchyModelVersion, 1);
  assert.equal(first.prevalenceModelVersion, 1);
  assert.ok(first.candidates.length <= 5);
  assert.equal(JSON.stringify(first).includes("recentSamples"), false);
  const commonCandidate = first.candidates.find((value) => value.entityKey === "common");
  const rareCandidate = first.candidates.find((value) => value.entityKey === "rare");
  if (commonCandidate && rareCandidate) {
    assert.ok(rareCandidate.weaknessScore >= commonCandidate.weaknessScore);
    assert.ok(commonCandidate.impact.estimatedPerformanceBurdenMsPer1000 > rareCandidate.impact.estimatedPerformanceBurdenMsPer1000);
  }
});
