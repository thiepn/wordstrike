import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeContentPlan } from "../js/practiceLab/practiceSessionContract.js";
import { buildPracticeAccuracyRecoveryProbeProfile, buildPracticeAccuracyRecoveryRecoveryProfile } from "../js/practiceLab/practiceAccuracyRecoveryMetrics.js";
import { analyzePracticeAccuracyRecoveryResult } from "../js/practiceLab/practiceAccuracyRecoveryAnalyzer.js";

const profileId = "practice-profile_pl23-metrics";
const contextId = "practice-context_pl23-metrics";
function contentPlan() {
  const text = "r r r r r";
  return createPracticeContentPlan({ contentId: "practice-content_pl23-metrics", contentGeneratorVersion: 1, text, units: [{ unitId: "u", type: "segment", startIndex: 0, endIndex: text.length, text }], targetEntities: [{ entityType: "key", entityKey: "r", directTarget: true }], completion: { mode: "content", value: null }, metadata: { language: "en", partition: "training", accuracyRecovery: { target: { entityType: "key", entityKey: "r" }, targetOpportunityBudget: 80, phaseRanges: [ { id: "baseline", startIndex: 0, endIndex: 2, targetRanges: [{ startIndex: 0, endIndex: 1 }] }, { id: "control", startIndex: 2, endIndex: 4, targetRanges: [{ startIndex: 2, endIndex: 3 }] }, { id: "repair", startIndex: 4, endIndex: 6, targetRanges: [{ startIndex: 4, endIndex: 5 }] }, { id: "mix", startIndex: 6, endIndex: 8, targetRanges: [{ startIndex: 6, endIndex: 7 }] }, { id: "check", startIndex: 8, endIndex: 9, targetRanges: [{ startIndex: 8, endIndex: 9 }] } ] } } });
}
function transition(position, correctness, residual, latencyClass = "fluent") { return { eventIndex: position + 1, textPosition: position, isFirstAttempt: true, correctness, latencyClass, observedLatencyMs: 100 + residual, residualLatencyMs: residual }; }
function foundation() { return { normalization: { normalizedTransitions: [transition(0, "incorrect", 20, "disfluent"), transition(2, "correct", 10), transition(4, "correct", 5), transition(6, "correct", 0), transition(8, "correct", -10)] }, errors: { recentEpisodes: [ { episodeId: 1, primaryPosition: 2, editClass: "substitution", confidence: "high", corrected: true, correctionInitiationMs: 100, errorToRepairMs: 400, repairToResumeMs: 80, resumeToFluentMs: 150, correctCharactersRemoved: 0, correctionActionCount: 1, charactersRemoved: 1 }, { episodeId: 2, primaryPosition: 4, editClass: "substitution", confidence: "high", corrected: true, correctionInitiationMs: 200, errorToRepairMs: 600, repairToResumeMs: 100, resumeToFluentMs: 250, correctCharactersRemoved: 1, correctionActionCount: 2, charactersRemoved: 2 }, { episodeId: 3, primaryPosition: 6, editClass: "substitution", confidence: "high", corrected: true, correctionInitiationMs: 300, errorToRepairMs: 800, repairToResumeMs: 120, resumeToFluentMs: 350, correctCharactersRemoved: 0, correctionActionCount: 1, charactersRemoved: 1 }, { episodeId: 4, primaryPosition: 1, editClass: "substitution", confidence: "high", corrected: true, correctionInitiationMs: 999, errorToRepairMs: 999, correctCharactersRemoved: 9 } ] } }; }

test("PL23 recovery profile uses only target-attributed Control/Repair/Mix episodes and transparent denominators", () => {
  const profile = buildPracticeAccuracyRecoveryRecoveryProfile({ profileId, contextId, contentPlan: contentPlan(), foundationAnalysis: foundation(), target: { entityType: "key", entityKey: "r" } });
  assert.equal(profile.errorEpisodeCount, 3);
  assert.equal(profile.correctedEpisodeCount, 3);
  assert.equal(profile.uncorrectedEpisodeCount, 0);
  assert.equal(profile.correctedRate, 1);
  assert.equal(profile.coverage, "usable");
  assert.equal(profile.correctionInitiationMedianMs, 200);
  assert.equal(profile.errorToRepairMedianMs, 600);
  assert.equal(profile.correctCharactersRemoved, 1);
  assert.equal(profile.correctCharactersRemovedPerCorrectedEpisode, 1 / 3);
  assert.equal(JSON.stringify(profile).includes("entered"), false);
});

test("PL23 Baseline/Check profiles keep first-pass accuracy, normalized timing, and disfluency separate", () => {
  const plan = contentPlan(); const data = foundation();
  const baseline = buildPracticeAccuracyRecoveryProbeProfile({ phaseId: "baseline", profileId, contextId, contentPlan: plan, foundationAnalysis: data, target: { entityType: "key", entityKey: "r" } });
  const check = buildPracticeAccuracyRecoveryProbeProfile({ phaseId: "check", profileId, contextId, contentPlan: plan, foundationAnalysis: data, target: { entityType: "key", entityKey: "r" } });
  assert.equal(baseline.firstPassAccuracy, 0);
  assert.equal(check.firstPassAccuracy, 1);
  assert.equal(check.timing.fluentResidualMedianMs, -10);
  assert.equal(baseline.timing.disfluencyRate, null, "Incorrect first attempts do not fabricate timing/disfluency evidence when canonical timing coverage is unavailable");
  assert.equal(check.timing.disfluencyRate, 0);
});

test("PL23 result uses percentage-point accuracy delta, null transfer, and no arbitrary combined control score", () => {
  const plan = contentPlan(); const data = foundation();
  const result = analyzePracticeAccuracyRecoveryResult({ sessionSnapshot: { profileId, contextId }, contentPlan: plan, foundationAnalysis: data, eventTrace: [] });
  assert.equal(result.accuracyDeltaPp, 100);
  assert.equal(result.residualDeltaMs, null, "Baseline has no fluent correct residual, so timing delta must remain unavailable rather than fabricated");
  assert.equal(result.transferMetrics, null);
  assert.equal(result.recoveryProfile.coverage, "usable");
  assert.equal(Object.hasOwn(result, "accuracyRecoveryScore"), false);
  assert.deepEqual(result.interpretation.doesNotEstablish, ["mastery", "retention", "transfer", "causal-improvement"]);
});
