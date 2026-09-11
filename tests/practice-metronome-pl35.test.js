import assert from "node:assert/strict";
import test from "node:test";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS } from "../js/practiceLab/practiceConstants.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";
import {
  PRACTICE_METRONOME_ANALYSIS_VERSION,
  PRACTICE_METRONOME_COUNT_IN_BEATS,
  PRACTICE_METRONOME_DEFAULT_DURATION_MS,
  PRACTICE_METRONOME_DURATIONS_MS,
  PRACTICE_METRONOME_OUTCOME_DOMAIN,
  PRACTICE_METRONOME_VERSION,
} from "../js/practiceLab/practiceMetronomeConstants.js";
import { calculatePracticeMetronomeGrossCpm, getPracticeMetronomeProtocol, resolvePracticeMetronomeCueMode, selectPracticeMetronomeTempo } from "../js/practiceLab/practiceMetronomePolicy.js";
import { buildPracticeMetronomeSchedule } from "../js/practiceLab/practiceMetronomeSchedule.js";
import { createPracticeMetronomePlan, validatePracticeMetronomePlan } from "../js/practiceLab/practiceMetronomePlan.js";
import { createPracticeMetronomeCueScheduler } from "../js/practiceLab/practiceMetronomeCue.js";
import { analyzePracticeMetronome } from "../js/practiceLab/practiceMetronomeAnalysis.js";
import { buildPracticeMetronomeTreatmentBaseline, createPracticeMetronomeSilentOutcomeCandidate } from "../js/practiceLab/practiceMetronomeTreatment.js";
import { resolvePracticeTreatmentIdentity } from "../js/practiceLab/practiceTreatmentRegistry.js";
import { createPracticeTreatmentEpisode, finalizePracticeTreatmentEpisode, markPracticeTreatmentExposureStarted, updatePracticeTreatmentEpisode } from "../js/practiceLab/practiceTreatmentEpisode.js";
import { evaluatePracticeTreatmentOutcomeCandidate } from "../js/practiceLab/practiceTreatmentOutcome.js";
import { getPracticeTreatmentResponseThreshold } from "../js/practiceLab/practiceTreatmentResponseState.js";

const DAY = 24 * 60 * 60 * 1000;

test("PL35 freezes DB10 and experiment v1 without a storage migration", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 10);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13);
  assert.equal(PRACTICE_METRONOME_VERSION, 1);
  assert.equal(PRACTICE_METRONOME_ANALYSIS_VERSION, 1);
  assert.deepEqual(PRACTICE_METRONOME_DURATIONS_MS, [120000, 300000, 480000]);
  assert.equal(PRACTICE_METRONOME_DEFAULT_DURATION_MS, 300000);
});

test("PL35 catalog exposes the target-blind fixed-tempo experiment", () => {
  const experiment = getPracticeExperiment("metronome-typing");
  assert.equal(experiment.status, "preview");
  assert.deepEqual(experiment.estimatedDurationMinutes, { minimum: 2, recommended: 5, maximum: 8 });
  for (const capability of ["self-calibrated-fixed-tempo", "audio-with-visual-fallback", "counterbalanced-pulse-silent", "target-blind"]) assert.ok(experiment.capabilities.includes(capability));
  assert.doesNotMatch(experiment.longDescription, /one[- ]key[- ]per[- ]beat/i);
});

test("PL35 calibration retains 90-180 BPM candidates and chooses nearest 120", () => {
  assert.equal(calculatePracticeMetronomeGrossCpm({ acceptedForwardInsertions: 180, durationMs: 30000 }), 360);
  const exact = selectPracticeMetronomeTempo(360);
  assert.equal(exact.charsPerBeat, 3);
  assert.equal(exact.bpm, 120);
  assert.equal(exact.fixedForSession, true);
  const nearest = selectPracticeMetronomeTempo(300);
  assert.equal(nearest.charsPerBeat, 3);
  assert.equal(nearest.bpm, 100);
  assert.equal(selectPracticeMetronomeTempo(80), null);
});

test("PL35 protocols and schedules are balanced, deterministic and not randomized assignment", () => {
  const expected = {
    120000: [20000, 4, 20000, 20000],
    300000: [30000, 6, 40000, 30000],
    480000: [30000, 6, 70000, 30000],
  };
  for (const durationMs of PRACTICE_METRONOME_DURATIONS_MS) {
    const protocol = getPracticeMetronomeProtocol(durationMs);
    assert.deepEqual([protocol.baselineMs, protocol.conditionBlockCount, protocol.conditionBlockMs, protocol.integrationMs], expected[durationMs]);
    assert.equal(protocol.countInBeats, PRACTICE_METRONOME_COUNT_IN_BEATS);
    const a = buildPracticeMetronomeSchedule({ sessionId: `practice-session_pl35-${durationMs}-abcdefgh`, durationMs });
    const b = buildPracticeMetronomeSchedule({ sessionId: `practice-session_pl35-${durationMs}-abcdefgh`, durationMs });
    assert.deepEqual(a, b);
    assert.equal(a.randomized, false);
    assert.equal(a.assignmentKind, "counterbalanced-deterministic");
    assert.equal(a.conditions.filter((x) => x === "pulse").length, a.conditions.filter((x) => x === "silent").length);
    assert.equal(a.blocks.at(-1).kind, "integration");
    assert.equal(a.blocks.at(-1).condition, "silent");
    assert.equal(a.blocks.at(-1).cueEnabled, false);
  }
});

test("PL35 plan binds cue mode, calibration, schedule and target-blind content", () => {
  const plan = createPracticeMetronomePlan({ sessionId: "practice-session_pl35-plan-12345678", durationMs: 300000, cueMode: "visual", baselineGrossCpm: 360, contentId: "natural-form-1", contentHash: "sha256-fixture" });
  assert.equal(plan.tempo.bpm, 120);
  assert.equal(plan.content.targetBlind, true);
  assert.equal(plan.randomizedAssignment, false);
  assert.equal(validatePracticeMetronomePlan(plan).valid, true);
  const changed = structuredClone(plan);
  changed.cueMode = "audio";
  assert.equal(validatePracticeMetronomePlan(changed).valid, false);
});

test("PL35 prefers audio, falls back to visual, and cancels scheduled cues at transition", () => {
  assert.equal(resolvePracticeMetronomeCueMode({ audioSupported: true, audioUnlocked: true, visualSupported: true }), "audio");
  assert.equal(resolvePracticeMetronomeCueMode({ audioSupported: true, audioUnlocked: false, visualSupported: true }), "visual");
  assert.equal(resolvePracticeMetronomeCueMode({ audioSupported: false, visualSupported: false }), null);
  const scheduled = []; const cancelled = [];
  const scheduler = createPracticeMetronomeCueScheduler({
    scheduleAudioCue: (cue) => { const handle = `a${scheduled.length}`; scheduled.push({ handle, cue }); return handle; },
    scheduleVisualCue: (cue) => { const handle = `v${scheduled.length}`; scheduled.push({ handle, cue }); return handle; },
    cancelCue: (handle) => cancelled.push(handle),
  });
  const block = { blockId: "condition-1", condition: "pulse", startMs: 0, endMs: 2000 };
  const active = scheduler.start({ block, bpm: 120, cueMode: "audio", startAtMs: 1000, includeCountIn: true });
  assert.equal(active.countInBeats, 4);
  assert.equal(active.scheduledCueCount, 8);
  assert.equal(scheduled.filter((x) => x.cue.phase === "count-in").length, 4);
  scheduler.transition();
  assert.equal(cancelled.length, 8);
  assert.equal(scheduler.getScheduledCount(), 0);
});

function metricBlock(block, condition = block.condition) {
  const duration = block.endMs - block.startMs;
  const windowCount = Math.max(1, Math.round(duration / 5000));
  const windows = Array.from({ length: windowCount }, (_, index) => ({
    ordinal: index,
    startMs: block.startMs + index * 5000,
    endMs: Math.min(block.endMs, block.startMs + (index + 1) * 5000),
    observedDurationMs: Math.min(5000, duration - index * 5000),
    acceptedForwardInsertions: condition === "pulse" ? 12 : index % 2 ? 16 : 8,
    firstPassOpportunityCount: condition === "pulse" ? 12 : index % 2 ? 16 : 8,
    correctFirstPassAttempts: condition === "pulse" ? 12 : index % 2 ? 16 : 8,
    eligibleTimingCount: 4,
    disfluentTimingCount: 0,
  }));
  const correct = windows.reduce((sum, x) => sum + x.correctFirstPassAttempts, 0);
  const timing = windows.reduce((sum, x) => sum + x.eligibleTimingCount, 0);
  return { ...block, observedDurationMs: duration, acceptedForwardInsertions: correct, firstPassOpportunityCount: correct, correctFirstPassAttempts: correct, eligibleTimingCount: timing, disfluentTimingCount: 0, correctionCostMs: 0, protocolCorrupt: false, contentExhausted: false, windows };
}

function analyzedFixture() {
  const schedule = buildPracticeMetronomeSchedule({ sessionId: "practice-session_pl35-analysis-12345678", durationMs: 300000 });
  const blocks = schedule.blocks.map((block) => metricBlock(block, block.kind === "condition" ? block.condition : "pulse"));
  return analyzePracticeMetronome({ blockSnapshot: { blocks }, durationMs: 300000, scheduleVariant: schedule.variant, cueMode: "audio", bpm: 120, charsPerBeat: 3 });
}

test("PL35 analysis compares pulse vs silent descriptively with no score or ranking surface", () => {
  const result = analyzedFixture();
  assert.equal(result.pattern, "pulse-associated-steadier");
  assert.ok(result.conditions.pulse.paceVariationPercent < result.conditions.silent.paceVariationPercent);
  assert.equal(result.interpretation, "within-session descriptive association only");
  const serialized = JSON.stringify(result).toLowerCase();
  for (const forbidden of ["leaderboard", "personalbest", "highscore", "rank\""]) assert.equal(serialized.includes(forbidden), false);
});

test("PL35 Treatment identity keeps duration and cue mode as separate dimensions", () => {
  const experiment = getPracticeExperiment("metronome-typing");
  const audio = resolvePracticeTreatmentIdentity({ experiment, configuration: { durationMs: 300000, cueMode: "audio", policyVersion: 1 } });
  const visual = resolvePracticeTreatmentIdentity({ experiment, configuration: { durationMs: 300000, cueMode: "visual", policyVersion: 1 } });
  const shortAudio = resolvePracticeTreatmentIdentity({ experiment, configuration: { durationMs: 120000, cueMode: "audio", policyVersion: 1 } });
  assert.equal(audio.outcomeDomain, PRACTICE_METRONOME_OUTCOME_DOMAIN);
  assert.deepEqual(audio.responseDimensions, { durationMs: 300000, cueMode: "audio" });
  assert.equal(audio.assignmentKind, "manual");
  assert.notEqual(audio.treatmentFamilyKey, visual.treatmentFamilyKey);
  assert.notEqual(audio.treatmentFamilyKey, shortAudio.treatmentFamilyKey);
});

test("PL35 creates one delayed silent-baseline contract at >=24h and rejects same-session integration", () => {
  const analysis = analyzedFixture();
  const experiment = getPracticeExperiment("metronome-typing");
  const identity = resolvePracticeTreatmentIdentity({ experiment, configuration: { durationMs: 300000, cueMode: "audio", policyVersion: 1 } });
  const baseline = buildPracticeMetronomeTreatmentBaseline({ analysis, observedAt: "2026-09-01T10:00:00.000Z" });
  assert.equal(baseline.status, "available");
  let episode = createPracticeTreatmentEpisode({ profileId: "profile-12345678", contextId: "context-12345678", treatmentSessionId: "practice-session_pl35-old-12345678", identity, plannedAt: "2026-09-01T09:59:00.000Z", baseline });
  assert.equal(episode.outcomeContracts.length, 1);
  assert.equal(episode.outcomeContracts[0].outcomeKey, "metronome-silent");
  assert.equal(episode.outcomeContracts[0].sourceKind, "consistency-result");
  assert.equal(episode.outcomeContracts[0].minimumDelayMs, DAY);
  episode = markPracticeTreatmentExposureStarted(episode, "2026-09-01T10:01:00.000Z");
  episode = updatePracticeTreatmentEpisode(episode, { treatment: { ...episode.treatment, completedLocalDayKey: "2026-09-01" } }, "2026-09-01T10:05:00.000Z");
  episode = finalizePracticeTreatmentEpisode(episode, { completedAt: "2026-09-01T10:05:00.000Z", actualDurationMs: 300000, treatmentExposureEligible: true });
  assert.equal(episode.status, "tracking");
  assert.equal(createPracticeMetronomeSilentOutcomeCandidate({ profileId: episode.profileId, contextId: episode.contextId, sessionId: "practice-session_same-12345678", observedAt: "2026-09-02T10:06:00.000Z", localDayKey: "2026-09-02", analysis, role: "integration" }), null);
  const early = createPracticeMetronomeSilentOutcomeCandidate({ profileId: episode.profileId, contextId: episode.contextId, sessionId: "practice-session_future-12345678", observedAt: "2026-09-02T09:00:00.000Z", localDayKey: "2026-09-02", analysis });
  assert.equal(evaluatePracticeTreatmentOutcomeCandidate(episode, episode.outcomeContracts[0], early).reason, "too-early");
  const eligible = createPracticeMetronomeSilentOutcomeCandidate({ profileId: episode.profileId, contextId: episode.contextId, sessionId: "practice-session_future-12345678", observedAt: "2026-09-02T10:06:00.000Z", localDayKey: "2026-09-02", analysis });
  assert.equal(evaluatePracticeTreatmentOutcomeCandidate(episode, episode.outcomeContracts[0], eligible).eligible, true);
  assert.equal(getPracticeTreatmentResponseThreshold({ responseUnit: "percentage-points", outcomeKey: "metronome-silent" }), 1.5);
});
