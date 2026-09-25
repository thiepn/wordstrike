import assert from "node:assert/strict";
import { getSpeedTestConfig } from "../js/speedTestConfig.js";
import {
  clearSpeedTestRuntime,
  getCurrentSpeedTest,
  getSpeedTestDiagnosticText,
  getSpeedTestLoopActive,
  handleCurrentSpeedTestKey,
  pauseSpeedTest,
  resumeSpeedTest,
  startSpeedTest,
  stopSpeedTestLoop,
} from "../js/speedTest.js";
import {
  abortSession,
  clearSession,
  getCurrentSession,
  SESSION_STATES,
} from "../js/sessionManager.js";

globalThis.localStorage = {
  value: null,
  getItem() { return this.value; },
  setItem(_key, value) { this.value = value; },
};
let nextFrameId = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextFrameId;
  frames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);

const pool = ["word", "apple", "river", "stone", "green", "house"];
const event = (key, timeStamp) => ({ key, timeStamp, preventDefault() {} });
let completed = 0;

clearSession();
let state = startSpeedTest({
  config: getSpeedTestConfig("time-15"),
  wordPool: pool,
  attemptSeed: 123,
  onComplete: () => { completed += 1; },
});
assert.equal(state.phase, "PREPARING");
assert.equal(state.config.wordSetId, "english-200");
assert.equal(state.config.wordSetWordCount, 199);
assert.equal(getCurrentSession().config.wordSetName, "English 200");
assert.match(getSpeedTestDiagnosticText(state, 0), /WORD SET=ENGLISH 200/);
assert.match(getSpeedTestDiagnosticText(state, 0), /ACTUAL WORD COUNT=199/);
assert.match(getSpeedTestDiagnosticText(state, 0), /I PRESENT=NO/);
state.words[0] = "apple";
assert.equal(getCurrentSession().state, SESSION_STATES.PREPARING);
assert.equal(getSpeedTestLoopActive(), true);
handleCurrentSpeedTestKey(event("Backspace", 999999), 10);
handleCurrentSpeedTestKey(event(" ", -5), 20);
assert.equal(state.activeStartedAtMs, null);
handleCurrentSpeedTestKey(event("a", 0), 100);
assert.equal(state.activeStartedAtMs, 100);
assert.equal(getCurrentSession().state, SESSION_STATES.ACTIVE);
assert.equal(state.typedBuffer, "a");
assert.equal(state.deadlineMs, 15100);

const frameEntry = [...frames.entries()].at(-1);
frames.delete(frameEntry[0]);
frameEntry[1](15100);
assert.equal(completed, 1);
assert.equal(state.ended, true);
assert.equal(getCurrentSession().state, SESSION_STATES.COMPLETED);
assert.equal(state.result.characters.correct, 1);
assert.equal(state.result.characters.missed, 0);
assert.ok(state.result.wpm > 0);
assert.equal(state.result.localPersistence.status, "saved");
assert.equal(handleCurrentSpeedTestKey(event("x", 1)), false);
assert.equal(completed, 1);

const firstSessionId = getCurrentSession().id;
state = startSpeedTest({
  config: getSpeedTestConfig("words-10"),
  wordPool: pool,
  attemptSeed: 456,
});
assert.notEqual(getCurrentSession().id, firstSessionId);
assert.equal(state.words.length, 10);
state.words.splice(0, state.words.length, ...Array(9).fill("cat"), "word");
state.currentWordIndex = 9;
for (const [index, key] of [..."word"].entries()) {
  handleCurrentSpeedTestKey(event(key, 900000 + index), 200 + index);
}
assert.equal(state.ended, true);
assert.equal(state.metrics.wordsCompleted, 1);
assert.equal(state.result.activeDurationMs, 3);
assert.equal(state.result.modeData.metricVersion, 2);
assert.equal(state.result.modeData.wordSetId, "english-200");
assert.equal(state.result.modeData.wordSetName, "English 200");
assert.equal(state.result.modeData.wordSetVersion, 1);
assert.equal(state.result.modeData.wordSetWordCount, 199);
assert.equal(state.result.sessionSource, "mode-select");
assert.equal(state.result.modeData.correctSpaces, 0);
assert.equal(state.result.modeData.validSpaces, 0);
assert.equal(state.result.modeData.wordDeletes, 0);

state = startSpeedTest({
  config: getSpeedTestConfig("time-60"),
  wordPool: pool,
  attemptSeed: 777,
});
state.words[0] = "word";
handleCurrentSpeedTestKey(event("w", 0), 1000);
assert.equal(state.typedBuffer, "w");
assert.equal(pauseSpeedTest(11000), true);
assert.equal(state.phase, "PAUSED");
assert.equal(state.accumulatedActiveMs, 10000);
assert.equal(state.remainingDurationMs, 50000);
assert.equal(state.deadlineMs, null);
assert.equal(getCurrentSession().state, SESSION_STATES.PAUSED);
assert.equal(handleCurrentSpeedTestKey(event("o", -1), 21000), false);
assert.equal(state.typedBuffer, "w");
assert.equal(resumeSpeedTest(31000), true);
assert.equal(state.phase, "ACTIVE");
assert.equal(state.deadlineMs, 81000);
assert.equal(getCurrentSession().state, SESSION_STATES.ACTIVE);
assert.equal(state.typedBuffer, "w");
abortSession("test-reset");
clearSpeedTestRuntime();
clearSession();

state = startSpeedTest({
  config: getSpeedTestConfig("time-30"),
  wordPool: pool,
  attemptSeed: 880,
  source: "change-test",
  deferSession: true,
});
assert.equal(state.phase, "PREPARING");
assert.equal(state.config.configId, "time-30");
assert.equal(getCurrentSession(), null);
handleCurrentSpeedTestKey(event(state.words[0][0], 500000), 500);
assert.equal(getCurrentSession().modeId, "speed-test");
assert.equal(getCurrentSession().state, SESSION_STATES.ACTIVE);
abortSession("test-reset");
clearSpeedTestRuntime();
clearSession();

state = startSpeedTest({
  config: getSpeedTestConfig("time-60"),
  wordPool: pool,
  attemptSeed: 778,
});
assert.equal(pauseSpeedTest(100), true);
assert.equal(state.resumePhase, "PREPARING");
assert.equal(resumeSpeedTest(10000), true);
assert.equal(state.phase, "PREPARING");
assert.equal(state.activeStartedAtMs, null);
abortSession("test-reset");
clearSpeedTestRuntime();
clearSession();

const workingStorage = globalThis.localStorage;
const workingSessionStorage = globalThis.sessionStorage;
const firefoxSessionValues = new Map();
globalThis.localStorage = {
  getItem() { throw Object.assign(new Error("storage unavailable"), { name: "NS_ERROR_NOT_AVAILABLE" }); },
  setItem() { throw Object.assign(new Error("storage unavailable"), { name: "NS_ERROR_NOT_AVAILABLE" }); },
  removeItem() { throw Object.assign(new Error("storage unavailable"), { name: "NS_ERROR_NOT_AVAILABLE" }); },
};
globalThis.sessionStorage = {
  getItem(key) { return firefoxSessionValues.get(key) ?? null; },
  setItem(key, value) { firefoxSessionValues.set(key, String(value)); },
  removeItem(key) { firefoxSessionValues.delete(key); },
};
clearSession();
state = startSpeedTest({
  config: getSpeedTestConfig("words-10"),
  wordPool: pool,
  attemptSeed: 998,
});
state.words.splice(0, state.words.length, ...Array(9).fill("cat"), "word");
state.currentWordIndex = 9;
for (const [index, key] of [..."word"].entries()) {
  handleCurrentSpeedTestKey(event(key, 700000 + index), 700 + index);
}
assert.equal(state.ended, true);
assert.equal(state.result.localPersistence.status, "saved",
  "Firefox localStorage failure should fall back to sessionStorage instead of losing the result");
assert.ok(firefoxSessionValues.has("wordstrike_mode_data_v2"));
clearSpeedTestRuntime();
clearSession();

globalThis.sessionStorage = {
  getItem() { return null; },
  setItem() { throw new Error("quota"); },
  removeItem() {},
};
state = startSpeedTest({
  config: getSpeedTestConfig("words-10"),
  wordPool: pool,
  attemptSeed: 997,
});
state.words.splice(0, state.words.length, ...Array(9).fill("cat"), "word");
state.currentWordIndex = 9;
for (const [index, key] of [..."word"].entries()) {
  handleCurrentSpeedTestKey(event(key, 710000 + index), 710 + index);
}
assert.equal(state.ended, true);
assert.equal(state.result.localPersistence.status, "failed");
assert.match(state.result.localPersistence.warning, /could not be saved locally/i);
assert.deepEqual(state.recordFlags, {
  newWpmRecord: false,
  newRawWpmRecord: false,
  newAccuracyRecord: false,
});
clearSpeedTestRuntime();
clearSession();
globalThis.localStorage = workingStorage;
globalThis.sessionStorage = workingSessionStorage;

state = startSpeedTest({
  config: getSpeedTestConfig("time-60"),
  wordPool: pool,
  attemptSeed: 999,
});
assert.equal(abortSession("escape").state, SESSION_STATES.ABORTED);
stopSpeedTestLoop();
assert.equal(frames.size, 0);
clearSpeedTestRuntime();
assert.equal(getCurrentSpeedTest(), null);

console.log("Typing Test delayed start, deadline, exact-once completion, retry identity, Firefox fallback, persistence failure, and cleanup tests passed.");
