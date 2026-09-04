import assert from "node:assert/strict";
import { test } from "node:test";
import { enrichPracticeErrorEpisodesWithLatency } from "../js/practiceLab/practiceRecoveryAnalyzer.js";
import { createPracticeErrorTracker } from "../js/practiceLab/practiceErrorTracker.js";

function insertion({ index, position, expected = "a", entered = expected, activeMs }) {
  return {
    eventIndex: index,
    eventTraceVersion: 3,
    timingSegmentId: 1,
    type: "character",
    entered,
    expected,
    textPosition: position,
    cursorBefore: position,
    cursorAfter: position + 1,
    correctness: entered === expected ? "correct" : "incorrect",
    relativeActiveTimestampMs: activeMs,
  };
}

function backspace({ index, before, activeMs, incorrect = 1 }) {
  return {
    eventIndex: index,
    eventTraceVersion: 3,
    timingSegmentId: 1,
    type: "backspace",
    cursorBefore: before,
    cursorAfter: before - 1,
    removedCount: 1,
    removedIncorrectCount: incorrect,
    removedCorrectCount: 1 - incorrect,
    correctionPolicy: "allow",
    relativeActiveTimestampMs: activeMs,
  };
}

test("PL9 resumeToFluentMs uses the first later PL8-fluent transition within bounded lookahead", () => {
  const episode = {
    episodeId: 1,
    repairCompleteEventIndex: 3,
    repairCompleteActiveMs: 300,
  };
  const events = [
    { eventIndex: 4, relativeActiveTimestampMs: 350 },
    { eventIndex: 5, relativeActiveTimestampMs: 420 },
    { eventIndex: 6, relativeActiveTimestampMs: 500 },
  ];
  const latencyAnalysis = {
    classifiedTransitions: [
      { eventIndex: 4, classification: "disfluent" },
      { eventIndex: 5, classification: "fluent" },
      { eventIndex: 6, classification: "fluent" },
    ],
  };
  const result = enrichPracticeErrorEpisodesWithLatency({ episodes: [episode], events, latencyAnalysis });
  assert.equal(result.episodes[0].resumeToFluentMs, 120);
  assert.deepEqual(result.resumeToFluentSamples, [120]);
});

test("PL9 resumeToFluentMs remains null when no later fluent transition exists in the bounded window", () => {
  const episode = { episodeId: 1, repairCompleteEventIndex: 3, repairCompleteActiveMs: 300 };
  const events = Array.from({ length: 12 }, (_, offset) => ({ eventIndex: offset + 4, relativeActiveTimestampMs: 350 + offset * 50 }));
  const latencyAnalysis = {
    classifiedTransitions: events.map((event) => ({ eventIndex: event.eventIndex, classification: "disfluent" })),
  };
  const result = enrichPracticeErrorEpisodesWithLatency({ episodes: [episode], events, latencyAnalysis });
  assert.equal(result.episodes[0].resumeToFluentMs, null);
  assert.deepEqual(result.resumeToFluentSamples, []);
});

test("PL9 repair at content end is corrected evidence but does not fabricate repairToResumeMs", () => {
  const tracker = createPracticeErrorTracker();
  tracker.consume(insertion({ index: 1, position: 0, expected: "a", entered: "x", activeMs: 100 }));
  tracker.consume(backspace({ index: 2, before: 1, activeMs: 150 }));
  tracker.consume(insertion({ index: 3, position: 0, expected: "a", activeMs: 200 }));
  const snapshot = tracker.finalizeSnapshot();
  assert.equal(snapshot.errorEpisodeCount, 1);
  assert.equal(snapshot.correctedEpisodeCount, 1);
  assert.equal(snapshot.recentEpisodes[0].repairToResumeMs, null);
  assert.equal(snapshot.recentEpisodes[0].errorToRepairMs, 100);
});

test("PL9 does not align an active episode on every input; classification occurs at closure/finalization", () => {
  const tracker = createPracticeErrorTracker();
  tracker.consume(insertion({ index: 1, position: 0, expected: "a", entered: "x", activeMs: 10 }));
  for (let index = 1; index < 20; index += 1) {
    tracker.consume(insertion({ index: index + 1, position: index, expected: "a", entered: "x", activeMs: 10 + index * 10 }));
  }
  const live = tracker.getSnapshot();
  assert.equal(live.errorEpisodeCount, 0);
  assert.equal(live.recentEpisodes.length, 0);
  assert.ok(live.activeEpisode);
  const finalized = tracker.finalizeSnapshot();
  assert.equal(finalized.errorEpisodeCount, 1);
  assert.equal(finalized.recentEpisodes.length, 1);
});
