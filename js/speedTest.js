import { MODE_IDS } from "./modes.js";
import {
  getSpeedTestRecord,
  getSpeedTestRecordFlags,
  recordCompletedSession,
} from "./modeStorage.js";
import {
  beginSession,
  completeSession,
  getCurrentSession,
  markSessionActive,
  markSessionResultPersisted,
  pauseSession,
  resumeSession,
  SESSION_STATES,
  setSessionState,
} from "./sessionManager.js";
import { buildSessionResult } from "./sessionResult.js";
import {
  getSpeedTestConfig,
  SPEED_TEST_TYPES,
} from "./speedTestConfig.js";
import {
  calculateSpeedTestSnapshot,
  classifySpeedTestCharacter,
  countCorrectPositions,
  createSpeedTestMetrics,
} from "./speedTestMetrics.js";
import {
  createSpeedTestTimeline,
  finalizeSpeedTestTimeline,
  persistSpeedTestTimeline,
  recordSpeedTestTimelineCharacter,
  recordSpeedTestTimelineCorrection,
  recordSpeedTestTimelineMissedCharacters,
  recordSpeedTestTimelineSpace,
} from "./speedTestTimeline.js";
import {
  createSpeedTestWordStream,
  SPEED_TEST_WORD_SET,
  SPEED_TEST_BATCH_SIZE,
} from "./speedTestWords.js";

const IGNORED_KEYS = new Set([
  "Shift", "Control", "Alt", "Meta", "CapsLock", "Tab", "Enter",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End",
  "PageUp", "PageDown", "Insert", "Delete",
]);

let currentSpeedTest = null;
let animationFrameId = null;
let callbacks = {};

const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

function requestFrame(callback) {
  return globalThis.requestAnimationFrame?.(callback) ?? null;
}

function cancelFrame(id) {
  if (id != null) globalThis.cancelAnimationFrame?.(id);
}

function ensureWordBuffer(state) {
  const ahead = state.currentWordIndex + SPEED_TEST_BATCH_SIZE;
  if (state.config.testType === SPEED_TEST_TYPES.WORDS) {
    state.stream.ensure(state.config.wordCount);
    state.words = state.stream.words.slice(0, state.config.wordCount);
  } else {
    state.stream.ensure(ahead);
    state.words = state.stream.words;
  }
}

export function createSpeedTestRuntime({
  config,
  wordPool,
  attemptSeed,
  developerMode = false,
}) {
  const safeConfig = getSpeedTestConfig(config?.configId);
  if (!safeConfig) return null;
  const stream = createSpeedTestWordStream(
    wordPool,
    attemptSeed,
    safeConfig.configId,
  );
  const runtimeConfig = Object.freeze({
    ...safeConfig,
    wordSetId: SPEED_TEST_WORD_SET.id,
    wordSetName: SPEED_TEST_WORD_SET.name,
    wordSetVersion: SPEED_TEST_WORD_SET.version,
    wordSetWordCount: SPEED_TEST_WORD_SET.wordCount,
  });
  const state = {
    mode: MODE_IDS.SPEED_TEST,
    config: runtimeConfig,
    wordSet: SPEED_TEST_WORD_SET,
    attemptSeed,
    developerMode,
    phase: "PREPARING",
    stream,
    words: stream.words,
    currentWordIndex: 0,
    typedBuffer: "",
    committedWords: [],
    metrics: createSpeedTestMetrics(),
    timeline: createSpeedTestTimeline(),
    performanceTimeline: null,
    activeStartedAtMs: null,
    accumulatedActiveMs: 0,
    completedAtMs: null,
    deadlineMs: null,
    remainingDurationMs: safeConfig.durationSeconds == null
      ? null
      : safeConfig.durationSeconds * 1000,
    activeDurationMs: 0,
    ended: false,
    result: null,
    recordFlags: {
      newWpmRecord: false,
      newRawWpmRecord: false,
      newAccuracyRecord: false,
    },
    completionNotified: false,
    currentLineIndex: 0,
    previousLineIndex: 0,
    lineMap: [],
    verticalTranslation: 0,
    layoutDirty: true,
    layoutFrameId: null,
    lastLayoutWordIndex: -1,
    resumePhase: "PREPARING",
  };
  ensureWordBuffer(state);
  return state;
}

export function getSpeedTestCurrentWord(state) {
  return state?.words?.[state.currentWordIndex] || "";
}

export function getSpeedTestActiveDuration(state, nowMs = monotonicNow()) {
  if (!state) return 0;
  const currentSegment = (
    state.phase === "ACTIVE" &&
    state.activeStartedAtMs != null
  ) ? Math.max(0, nowMs - state.activeStartedAtMs) : 0;
  return Math.max(0, state.accumulatedActiveMs + currentSegment);
}

export function getSpeedTestLiveMetrics(state, nowMs = monotonicNow(), includePartial = true) {
  return calculateSpeedTestSnapshot(
    state.metrics,
    getSpeedTestActiveDuration(state, nowMs),
    {
      currentWord: getSpeedTestCurrentWord(state),
      typedBuffer: state.typedBuffer,
      includePartial,
    },
  );
}

function beginSpeedTestSession(state) {
  const current = getCurrentSession();
  if (current?.modeId === MODE_IDS.SPEED_TEST && !current.resultFinalized) return current;
  return beginSession({
    modeId: MODE_IDS.SPEED_TEST,
    variantId: state.config.testType,
    source: state.developerMode ? "developer" : state.sessionSource,
    developerMode: state.developerMode,
    seed: state.attemptSeed,
    config: state.config,
    runtimeData: {
      configId: state.config.configId,
      wordSetId: state.wordSet.id,
    },
  });
}

function beginActiveTyping(state, nowMs) {
  if (state.activeStartedAtMs != null) return;
  if (!beginSpeedTestSession(state)) return false;
  state.phase = "ACTIVE";
  state.activeStartedAtMs = nowMs;
  state.deadlineMs = state.config.testType === SPEED_TEST_TYPES.TIME
    ? nowMs + state.remainingDurationMs
    : null;
  markSessionActive({ monotonicMs: nowMs, epochMs: Date.now() });
  return true;
}

function commitCurrentWord(state, { separator = false, nowMs = null } = {}) {
  const expected = getSpeedTestCurrentWord(state);
  const typed = state.typedBuffer;
  const correctPositions = countCorrectPositions(expected, typed);
  const missingCharacters = Math.max(0, expected.length - typed.length);
  const exact = typed === expected;
  const eventNow = Number.isFinite(nowMs) ? nowMs : monotonicNow();
  const activeMs = getSpeedTestActiveDuration(state, eventNow);

  if (missingCharacters > 0) {
    recordSpeedTestTimelineMissedCharacters(state.timeline, {
      activeMs,
      count: missingCharacters,
      expected: expected.slice(typed.length),
      typed,
      word: expected,
    });
  }

  state.metrics.committedCorrectCharacters += correctPositions;
  state.metrics.missedCharacters += missingCharacters;
  state.metrics.wordsCompleted += 1;
  if (exact) state.metrics.exactWords += 1;
  else state.metrics.incorrectWords += 1;
  if (separator) {
    state.metrics.validSpaces += 1;
    state.metrics.correctSpaces += 1;
    state.metrics.correctKeystrokes += 1;
    state.metrics.rawTypedCharacters += 1;
    recordSpeedTestTimelineSpace(state.timeline, activeMs);
  }
  state.committedWords.push({
    expected,
    typed,
    correctPositions,
    missingCharacters,
    exact,
  });
  state.currentWordIndex += 1;
  state.typedBuffer = "";
  ensureWordBuffer(state);
  return state.committedWords.at(-1);
}

function buildSpeedTestResult(state, completedAtMs) {
  const session = getCurrentSession();
  if (!session || session.modeId !== MODE_IDS.SPEED_TEST) return null;
  const activeDurationMs = state.activeDurationMs;
  const live = calculateSpeedTestSnapshot(state.metrics, activeDurationMs, {
    currentWord: getSpeedTestCurrentWord(state),
    typedBuffer: state.typedBuffer,
    includePartial: state.config.testType === SPEED_TEST_TYPES.TIME,
  });
  state.performanceTimeline = state.performanceTimeline
    || finalizeSpeedTestTimeline(state.timeline, activeDurationMs);
  const endedAt = Date.now();
  return buildSessionResult({
    sessionId: session.id,
    modeId: MODE_IDS.SPEED_TEST,
    variantId: state.config.testType,
    sessionSource: session.source,
    startedAt: session.startedAtEpochMs ?? session.createdAtEpochMs,
    endedAt,
    durationMs: Math.max(0, endedAt - session.createdAtEpochMs),
    activeDurationMs,
    seed: state.attemptSeed,
    developerMode: state.developerMode,
    success: true,
    failureReason: null,
    score: null,
    grade: null,
    accuracy: live.accuracy,
    wpm: live.wpm,
    characters: {
      correct: live.correctTestCharacters,
      incorrect: state.metrics.incorrectKeystrokes,
      missed: state.metrics.missedCharacters,
      totalKeystrokes: live.rawTestCharacters,
    },
    words: {
      completed: state.metrics.wordsCompleted,
      missed: state.metrics.incorrectWords,
      total: state.config.wordCount ?? state.metrics.wordsCompleted,
    },
    combo: { maximum: 0, final: 0 },
    modeData: {
      metricVersion: 2,
      recordEligible: (
        state.developerMode !== true &&
        state.config.testType === SPEED_TEST_TYPES.TIME &&
        [15, 60].includes(state.config.durationSeconds) &&
        state.wordSet.id === SPEED_TEST_WORD_SET.id &&
        state.wordSet.version === SPEED_TEST_WORD_SET.version
      ),
      wordSetId: state.wordSet.id,
      wordSetName: state.wordSet.name,
      wordSetVersion: state.wordSet.version,
      wordSetWordCount: state.wordSet.wordCount,
      configId: state.config.configId,
      testType: state.config.testType,
      durationSeconds: state.config.durationSeconds,
      targetWordCount: state.config.wordCount,
      rawWpm: live.rawWpm,
      correctTestCharacters: live.correctTestCharacters,
      rawTestCharacters: live.rawTestCharacters,
      correctKeystrokes: state.metrics.correctKeystrokes,
      incorrectKeystrokes: state.metrics.incorrectKeystrokes,
      missedCharacters: state.metrics.missedCharacters,
      printableKeystrokes: state.metrics.printableKeystrokes,
      correctSpaces: state.metrics.correctSpaces,
      validSpaces: state.metrics.validSpaces,
      backspaces: state.metrics.backspaces,
      wordDeletes: state.metrics.wordDeletes,
      extraCharacters: state.metrics.extraCharacters,
      exactWords: state.metrics.exactWords,
      incorrectWords: state.metrics.incorrectWords,
      generatedWordCount: state.words.length,
      completedWordCount: state.metrics.wordsCompleted,
      attemptSeed: state.attemptSeed,
      performanceTimeline: state.performanceTimeline,
    },
  });
}

export function completeSpeedTest(state, completedAtMs = monotonicNow()) {
  if (
    !state ||
    state.ended ||
    state.activeStartedAtMs == null
  ) {
    return null;
  }
  const activeDurationMs = getSpeedTestActiveDuration(state, completedAtMs);
  state.ended = true;
  state.phase = "COMPLETE";
  state.completedAtMs = Math.max(state.activeStartedAtMs, completedAtMs);
  state.activeDurationMs = activeDurationMs;
  state.accumulatedActiveMs = state.activeDurationMs;
  state.activeStartedAtMs = null;
  const result = buildSpeedTestResult(state, state.completedAtMs);
  if (!result) return null;
  setSessionState(SESSION_STATES.RESULTS, {
    monotonicMs: state.completedAtMs,
    epochMs: Date.now(),
  });
  const previousRecord = getSpeedTestRecord(
    state.config.configId,
    state.wordSet.id,
  );
  state.recordFlags = getSpeedTestRecordFlags(result, previousRecord);
  if (!completeSession(result, {
    monotonicMs: state.completedAtMs,
    epochMs: result.endedAt,
  })) {
    return null;
  }
  if (recordCompletedSession(result)) {
    markSessionResultPersisted(result.sessionId);
  } else if (state.developerMode) {
    state.recordFlags = {
      newWpmRecord: false,
      newRawWpmRecord: false,
      newAccuracyRecord: false,
    };
  }
  persistSpeedTestTimeline(
    result.sessionId,
    result.modeData?.performanceTimeline,
    result.endedAt,
  );
  state.result = result;
  return result;
}

function processCharacter(state, character, nowMs) {
  if (beginActiveTyping(state, nowMs) === false) return false;
  const expected = getSpeedTestCurrentWord(state);
  const typedIndex = state.typedBuffer.length;
  const classification = classifySpeedTestCharacter(expected, typedIndex, character);
  const activeMs = getSpeedTestActiveDuration(state, nowMs);
  recordSpeedTestTimelineCharacter(state.timeline, {
    activeMs,
    correct: classification === "correct",
    extra: classification === "extra",
    expected: expected[typedIndex] || "",
    typed: character,
    word: expected,
  });
  state.typedBuffer += character;
  state.metrics.printableKeystrokes += 1;
  state.metrics.rawTypedCharacters += 1;
  if (classification === "correct") state.metrics.correctKeystrokes += 1;
  else {
    state.metrics.incorrectKeystrokes += 1;
    if (classification === "extra") state.metrics.extraCharacters += 1;
  }

  const isFinalWord = (
    state.config.testType === SPEED_TEST_TYPES.WORDS &&
    state.currentWordIndex === state.config.wordCount - 1
  );
  if (isFinalWord && state.typedBuffer === expected) {
    commitCurrentWord(state, { nowMs });
    completeSpeedTest(state, nowMs);
  }
}

export function handleSpeedTestInput(state, event, nowMs = monotonicNow()) {
  if (!state || state.ended || state.phase === "PAUSED") return false;
  const eventNow = Number.isFinite(nowMs) ? nowMs : monotonicNow();

  if (
    state.activeStartedAtMs != null &&
    state.deadlineMs != null &&
    eventNow >= state.deadlineMs
  ) {
    completeSpeedTest(state, state.deadlineMs);
    return false;
  }
  if (event.key === "Backspace") {
    event.preventDefault?.();
    if (!state.typedBuffer) return false;
    const expected = getSpeedTestCurrentWord(state);
    const activeMs = getSpeedTestActiveDuration(state, eventNow);
    const wordDelete = event.ctrlKey || event.metaKey;
    const erasedCorrectChars = wordDelete
      ? countCorrectPositions(expected, state.typedBuffer)
      : expected[state.typedBuffer.length - 1] === state.typedBuffer.at(-1) ? 1 : 0;
    recordSpeedTestTimelineCorrection(state.timeline, {
      activeMs,
      erasedCorrectChars,
      wordDelete,
    });
    state.metrics.backspaces += 1;
    if (wordDelete) {
      state.typedBuffer = "";
      state.metrics.wordDeletes += 1;
    } else {
      state.typedBuffer = state.typedBuffer.slice(0, -1);
    }
    return true;
  }
  if (IGNORED_KEYS.has(event.key) || event.key?.startsWith("F")) return false;
  if (event.key === " ") {
    event.preventDefault?.();
    if (!state.typedBuffer) return false;
    if (
      state.config.testType === SPEED_TEST_TYPES.WORDS &&
      state.currentWordIndex === state.config.wordCount - 1 &&
      state.typedBuffer !== getSpeedTestCurrentWord(state)
    ) {
      return false;
    }
    commitCurrentWord(state, { separator: true, nowMs: eventNow });
    return true;
  }
  if (typeof event.key !== "string" || event.key.length !== 1) return false;
  event.preventDefault?.();
  const character = /^[a-z]$/i.test(event.key)
    ? event.key.toLowerCase()
    : event.key;
  processCharacter(state, character, eventNow);
  return true;
}

function tick(timestamp) {
  if (!currentSpeedTest || currentSpeedTest.ended) return;
  if (
    currentSpeedTest.deadlineMs != null &&
    timestamp >= currentSpeedTest.deadlineMs
  ) {
    const result = completeSpeedTest(currentSpeedTest, currentSpeedTest.deadlineMs);
    stopSpeedTestLoop();
    if (!currentSpeedTest.completionNotified) {
      currentSpeedTest.completionNotified = true;
      callbacks.onComplete?.(currentSpeedTest, result);
    }
    return;
  }
  callbacks.onUpdate?.(currentSpeedTest, timestamp);
  animationFrameId = requestFrame(tick);
}

export function startSpeedTest({
  config,
  wordPool,
  attemptSeed,
  developerMode = false,
  source = "mode-select",
  deferSession = false,
  onUpdate,
  onComplete,
}) {
  stopSpeedTestLoop();
  const state = createSpeedTestRuntime({
    config,
    wordPool,
    attemptSeed,
    developerMode,
  });
  if (!state) return null;
  state.sessionSource = source;
  state.deferSession = deferSession === true;
  if (!state.deferSession && !beginSpeedTestSession(state)) return null;
  currentSpeedTest = state;
  callbacks = { onUpdate, onComplete };
  animationFrameId = requestFrame(tick);
  return state;
}

export function handleCurrentSpeedTestKey(event, nowMs = monotonicNow()) {
  const handled = handleSpeedTestInput(currentSpeedTest, event, nowMs);
  callbacks.onUpdate?.(currentSpeedTest, nowMs);
  if (currentSpeedTest?.ended && !currentSpeedTest.completionNotified) {
    stopSpeedTestLoop();
    currentSpeedTest.completionNotified = true;
    callbacks.onComplete?.(currentSpeedTest, currentSpeedTest.result);
  }
  return handled;
}

export function pauseSpeedTest(nowMs = monotonicNow()) {
  const state = currentSpeedTest;
  if (!state || state.ended || state.phase === "PAUSED") return false;
  if (!["PREPARING", "ACTIVE"].includes(state.phase)) return false;
  state.resumePhase = state.phase;
  if (state.phase === "ACTIVE") {
    state.accumulatedActiveMs = getSpeedTestActiveDuration(state, nowMs);
    state.activeStartedAtMs = null;
    if (state.deadlineMs != null) {
      state.remainingDurationMs = Math.max(0, state.deadlineMs - nowMs);
      state.deadlineMs = null;
    }
  }
  state.phase = "PAUSED";
  stopSpeedTestLoop();
  const session = getCurrentSession();
  return session?.modeId === MODE_IDS.SPEED_TEST
    ? pauseSession({ monotonicMs: nowMs, epochMs: Date.now() })
    : true;
}

export function resumeSpeedTest(nowMs = monotonicNow()) {
  const state = currentSpeedTest;
  if (!state || state.ended || state.phase !== "PAUSED") return false;
  state.phase = state.resumePhase === "ACTIVE" ? "ACTIVE" : "PREPARING";
  if (state.phase === "ACTIVE") {
    state.activeStartedAtMs = nowMs;
    if (state.config.testType === SPEED_TEST_TYPES.TIME) {
      state.deadlineMs = nowMs + state.remainingDurationMs;
    }
  }
  const session = getCurrentSession();
  if (
    session?.modeId === MODE_IDS.SPEED_TEST &&
    !resumeSession({ monotonicMs: nowMs, epochMs: Date.now() })
  ) return false;
  resumeSpeedTestLoop();
  return true;
}

export function stopSpeedTestLoop() {
  cancelFrame(animationFrameId);
  animationFrameId = null;
}

export function resumeSpeedTestLoop() {
  if (animationFrameId == null && currentSpeedTest && !currentSpeedTest.ended) {
    animationFrameId = requestFrame(tick);
  }
}

export function clearSpeedTestRuntime() {
  stopSpeedTestLoop();
  if (currentSpeedTest) {
    cancelFrame(currentSpeedTest.layoutFrameId);
    currentSpeedTest.layoutFrameId = null;
    currentSpeedTest.words.length = 0;
    currentSpeedTest.committedWords.length = 0;
    currentSpeedTest.typedBuffer = "";
    if (currentSpeedTest.timeline?.buckets) currentSpeedTest.timeline.buckets.length = 0;
    if (currentSpeedTest.timeline?.mistakes) currentSpeedTest.timeline.mistakes.length = 0;
  }
  currentSpeedTest = null;
  callbacks = {};
}

export function getCurrentSpeedTest() {
  return currentSpeedTest;
}

export function getSpeedTestLoopActive() {
  return animationFrameId != null;
}

export function getSpeedTestDiagnosticText(state = currentSpeedTest, nowMs = monotonicNow()) {
  if (!state) return "SPEED TEST=inactive";
  const live = getSpeedTestLiveMetrics(state, nowMs);
  const session = getCurrentSession();
  return [
    `MODE=${MODE_IDS.SPEED_TEST}`,
    `SESSION ID=${session?.id ?? "none"}`,
    `SESSION STATE=${session?.state ?? "idle"}`,
    `CONFIG=${state.config.configId}`,
    `WORD SET=${state.wordSet.name.toUpperCase()}`,
    `WORD SET ID=${state.wordSet.id}`,
    `WORD SET VERSION=${state.wordSet.version}`,
    `ACTUAL WORD COUNT=${state.wordSet.wordCount}`,
    `I PRESENT=${state.words.includes("I") || state.words.includes("i") ? "YES" : "NO"}`,
    `RECORD ELIGIBLE=${state.developerMode !== true}`,
    `ATTEMPT SEED=${state.attemptSeed}`,
    `STREAM SEED=${state.stream.baseSeed}`,
    `BATCH=${state.stream.lastBatchIndex}`,
    `BATCH SEED=${state.stream.lastBatchSeed}`,
    `ACTIVE=${Math.round(getSpeedTestActiveDuration(state, nowMs))}ms`,
    `DEADLINE=${state.deadlineMs ?? "none"}`,
    `WORD INDEX=${state.currentWordIndex}`,
    `WORD=${getSpeedTestCurrentWord(state)}`,
    `BUFFER=${state.typedBuffer || "empty"}`,
    `CARET=${state.typedBuffer.length}`,
    `LINE=${state.currentLineIndex}`,
    `QUEUE=${state.words.length}`,
    `CORRECT=${state.metrics.correctKeystrokes}`,
    `CORRECT TEST CHARS=${live.correctTestCharacters}`,
    `RAW TEST CHARS=${live.rawTestCharacters}`,
    `CORRECT SPACES=${state.metrics.correctSpaces}`,
    `VALID SPACES=${state.metrics.validSpaces}`,
    `PRINTABLE=${state.metrics.printableKeystrokes}`,
    `INCORRECT=${state.metrics.incorrectKeystrokes}`,
    `MISSED=${state.metrics.missedCharacters}`,
    `EXTRA=${state.metrics.extraCharacters}`,
    `BACKSPACES=${state.metrics.backspaces}`,
    `WORD DELETES=${state.metrics.wordDeletes}`,
    `TIMELINE POINTS=${state.performanceTimeline?.points?.length ?? state.timeline?.buckets?.length ?? 0}`,
    `CPM=${live.cpm.toFixed(2)}`,
    `WPM=${live.wpm.toFixed(2)}`,
    `RAW CPM=${live.rawCpm.toFixed(2)}`,
    `RAW=${live.rawWpm.toFixed(2)}`,
    `ACCURACY=${live.accuracy.toFixed(2)}`,
    `FINALIZED=${session?.resultFinalized === true}`,
    `PERSISTED=${session?.resultPersisted === true}`,
  ].join(" // ");
}
