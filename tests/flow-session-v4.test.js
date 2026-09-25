import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FLOW_SESSION_V4_VERSION,
  createFlowSessionV4,
  formatFlowSessionDurationV4,
  getFlowSessionLiveSummaryV4,
  recordFlowSessionRunV4,
} from "../js/flow/flowSessionV4.js";

function run(overrides = {}) {
  return {
    sessionId: "session-flow-v4-" + Math.random().toString(36).slice(2),
    score: 10_000,
    wpm: 80,
    accuracy: 98,
    consistency: 90,
    wordsCompleted: 100,
    correctCharacters: 500,
    activeDurationMs: 60_000,
    endedAt: 1_700_000_000_000,
    endedReason: "reset",
    recordEligible: true,
    ...overrides,
  };
}

const existingPb = run({
  sessionId: "session-flow-v4-existing-pb",
  score: 20_000,
  wordsCompleted: 180,
  correctCharacters: 900,
});

let session = createFlowSessionV4({ startedAt: 1234, personalBest: existingPb });
assert.equal(session.version, FLOW_SESSION_V4_VERSION);
assert.equal(session.startedAt, 1234);
assert.equal(session.runCount, 0);
assert.equal(session.personalBestScore, 20_000);

const initialLive = getFlowSessionLiveSummaryV4(session, {
  score: 1_500,
  words: 15,
  correctCharacters: 75,
  durationMs: 5_000,
});
assert.deepEqual(initialLive, {
  currentRunNumber: 1,
  completedRuns: 0,
  eligibleRuns: 0,
  totalScore: 1_500,
  totalWords: 15,
  totalCorrectCharacters: 75,
  activeDurationMs: 5_000,
  bestScore: 1_500,
  personalBestScore: 20_000,
  momentumStreak: 0,
});

const first = run({
  sessionId: "session-flow-v4-first",
  score: 12_000,
  wordsCompleted: 110,
  correctCharacters: 550,
  activeDurationMs: 70_000,
});
let update = recordFlowSessionRunV4(session, first, {
  isPersonalBest: false,
  previousPersonalBest: existingPb,
});
session = update.session;
assert.equal(update.feedback.title, "NEW SESSION BEST");
assert.equal(update.feedback.tone, "session-best");
assert.equal(update.feedback.runNumber, 1);
assert.equal(update.feedback.scoreDelta, 0);
assert.equal(update.feedback.isSessionBest, true);
assert.equal(session.runCount, 1);
assert.equal(session.totalScore, 12_000);
assert.equal(session.totalWords, 110);
assert.equal(session.activeDurationMs, 70_000);

const second = run({
  sessionId: "session-flow-v4-second",
  score: 15_500,
  wordsCompleted: 140,
  correctCharacters: 700,
  activeDurationMs: 80_000,
});
update = recordFlowSessionRunV4(session, second, {
  isPersonalBest: false,
  previousPersonalBest: existingPb,
});
session = update.session;
assert.equal(update.feedback.title, "NEW SESSION BEST");
assert.equal(update.feedback.scoreDelta, 3_500);
assert.equal(update.feedback.momentumStreak, 1);
assert.equal(session.bestRun.score, 15_500);
assert.equal(session.totalScore, 27_500);
assert.equal(session.totalWords, 250);

const third = run({
  sessionId: "session-flow-v4-third",
  score: 14_000,
  wordsCompleted: 120,
  correctCharacters: 600,
  activeDurationMs: 75_000,
});
update = recordFlowSessionRunV4(session, third);
session = update.session;
assert.equal(update.feedback.title, "RUN SAVED");
assert.equal(update.feedback.tone, "saved");
assert.equal(update.feedback.scoreDelta, -1_500);
assert.equal(update.feedback.momentumStreak, 0);
assert.equal(session.bestRun.score, 15_500);

const momentumRun = run({
  sessionId: "session-flow-v4-momentum",
  score: 15_000,
  wordsCompleted: 130,
  correctCharacters: 650,
  activeDurationMs: 78_000,
});
update = recordFlowSessionRunV4(session, momentumRun);
session = update.session;
assert.equal(update.feedback.title, "MOMENTUM UP");
assert.equal(update.feedback.tone, "momentum");
assert.equal(update.feedback.scoreDelta, 1_000);
assert.equal(update.feedback.momentumStreak, 1);
assert.equal(update.feedback.isSessionBest, false);
assert.equal(session.bestRun.score, 15_500);

const pbRun = run({
  sessionId: "session-flow-v4-pb",
  score: 22_500,
  wordsCompleted: 190,
  correctCharacters: 950,
  activeDurationMs: 90_000,
});
update = recordFlowSessionRunV4(session, pbRun, {
  isPersonalBest: true,
  previousPersonalBest: existingPb,
});
session = update.session;
assert.equal(update.feedback.title, "NEW PERSONAL BEST");
assert.equal(update.feedback.tone, "personal-best");
assert.equal(update.feedback.personalBestDelta, 2_500);
assert.equal(session.personalBestScore, 22_500);
assert.equal(session.runCount, 5);
assert.equal(session.eligibleRunCount, 5);
assert.equal(session.totalScore, 79_000);
assert.equal(session.totalWords, 690);
assert.equal(session.totalCorrectCharacters, 3_450);
assert.equal(session.activeDurationMs, 393_000);
assert.equal(session.bestRun.score, 22_500);

const live = getFlowSessionLiveSummaryV4(session, {
  score: 5_000,
  words: 50,
  correctCharacters: 250,
  durationMs: 30_000,
});
assert.equal(live.currentRunNumber, 6);
assert.equal(live.completedRuns, 5);
assert.equal(live.totalScore, 84_000);
assert.equal(live.totalWords, 740);
assert.equal(live.totalCorrectCharacters, 3_700);
assert.equal(live.activeDurationMs, 423_000);
assert.equal(live.bestScore, 22_500);
assert.equal(formatFlowSessionDurationV4(live.activeDurationMs), "7:03");

const ignored = recordFlowSessionRunV4(session, run({
  sessionId: "session-flow-v4-empty",
  correctCharacters: 0,
  wordsCompleted: 0,
  score: 0,
}));
assert.equal(ignored.session, session);
assert.equal(ignored.feedback, null);

const [phase1, css, loader, index] = await Promise.all([
  readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/flow-session-v4.css", import.meta.url), "utf8"),
  readFile(new URL("../js/flow/flowRuntimeLoader.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
]);

assert.match(phase1, /recordFlowSessionRunV4/);
assert.match(phase1, /data-flow-session-strip/);
assert.match(phase1, /data-flow-micro-result/);
assert.match(phase1, /NEW PERSONAL BEST/);
assert.match(phase1, /MOMENTUM/);
assert.match(phase1, /getPublicSessionState/);
assert.match(phase1, /getPublicMicroResult/);
assert.match(phase1, /recordFlowProgressionV4/);
assert.match(phase1, /data-flow-progression/);
assert.match(phase1, /MILESTONE/);
assert.match(phase1, /getPublicProgressionState/);
assert.match(phase1, /data-flow-identity/);
assert.match(phase1, /data-flow-source-title/);
assert.match(phase1, /data-flow-hud-v5/);
assert.match(phase1, /data-flow-micro-secondary/);
assert.match(phase1, /data-flow-global-submission/);
assert.match(phase1, /preparePublicGlobalSubmission/);
assert.doesNotMatch(phase1, /function syncMicroResultSubmissionV4/);
assert.match(phase1, /GLOBAL #/);
assert.match(phase1, /SCORE SUBMITTED/);
assert.match(phase1, /GLOBAL RETRY SAVED/);
assert.match(css, /flow-v4-session-strip/);
assert.match(css, /flow-v4-micro-result/);
assert.match(css, /flow-v4-progression-strip/);
assert.match(css, /flow-v4-milestone-reward/);
assert.match(css, /flow-v5-run-header/);
assert.match(css, /flow-v5-session-meta/);
assert.match(css, /pointer-events:\s*none/);
assert.match(css, /prefers-reduced-motion/);
assert.match(loader, /flowSessionV4\.js\?v=20260924a/);
assert.match(loader, /flowProgressionV4\.js\?v=20260924a/);
assert.match(loader, /flow-session-v4\.css\?v=[0-9a-z]+/);
assert.match(index, /flow-session-v4\.css\?v=[0-9a-z]+/);

console.log("Flow Phase 7A contracts passed: session totals, PB/session-best momentum, live summaries, non-blocking micro-results, and offline UI wiring.");
