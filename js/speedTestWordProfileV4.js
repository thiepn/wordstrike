import {
  getCurrentSpeedTest,
  getSpeedTestActiveDuration,
} from "./speedTest.js";

const PROFILE_VERSION = 1;
const STORAGE_KEY = "wordstrike_speed_test_word_profiles_v4";
const MAX_STORED_PROFILES = 30;
const MAX_WORDS = 240;

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const nonNegative = (value, fallback = 0) => Math.max(0, finite(value, fallback));
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};

let tracker = null;
let frameId = null;
let observer = null;
let installed = false;

function snapshotMetrics(state) {
  const metrics = state?.metrics || {};
  return {
    rawTypedCharacters: nonNegative(metrics.rawTypedCharacters),
    incorrectKeystrokes: nonNegative(metrics.incorrectKeystrokes),
    correctSpaces: nonNegative(metrics.correctSpaces),
    backspaces: nonNegative(metrics.backspaces),
    wordDeletes: nonNegative(metrics.wordDeletes),
  };
}

function diffMetrics(next, previous) {
  const result = {};
  for (const key of Object.keys(next)) {
    result[key] = Math.max(0, Math.round(nonNegative(next[key]) - nonNegative(previous?.[key])));
  }
  return result;
}

function allocateIntegers(total, weights) {
  const safeTotal = Math.max(0, Math.round(nonNegative(total)));
  if (!weights.length) return [];
  const safeWeights = weights.map((value) => Math.max(1, nonNegative(value, 1)));
  const sum = safeWeights.reduce((acc, value) => acc + value, 0) || safeWeights.length;
  const exact = safeWeights.map((value) => (safeTotal * value) / sum);
  const allocation = exact.map((value) => Math.floor(value));
  let remaining = safeTotal - allocation.reduce((acc, value) => acc + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let cursor = 0; remaining > 0; cursor += 1, remaining -= 1) {
    allocation[order[cursor % order.length].index] += 1;
  }
  return allocation;
}

function createTracker(state, activeMs = 0) {
  return {
    runtime: state,
    configId: state?.config?.configId || null,
    wordSetId: state?.wordSet?.id || null,
    attemptSeed: state?.attemptSeed ?? null,
    lastCommitCount: Array.isArray(state?.committedWords) ? state.committedWords.length : 0,
    wordStartMs: nonNegative(activeMs),
    startMetrics: snapshotMetrics(state),
    words: [],
    persistedSessionId: null,
  };
}

function ensureTracker(state, activeMs = 0) {
  if (!state) return null;
  if (tracker?.runtime !== state) {
    const committed = Array.isArray(state.committedWords) ? state.committedWords.length : 0;
    tracker = createTracker(state, committed > 0 ? activeMs : 0);
  }
  return tracker;
}

function wpmFromCharacters(characters, durationMs) {
  const duration = Math.max(1, nonNegative(durationMs, 1));
  return (nonNegative(characters) / 5) / (duration / 60000);
}

function buildWordRecord({
  commit,
  index,
  startMs,
  endMs,
  rawChars,
  incorrectChars,
  backspaces,
  wordDeletes,
  spaceChars,
}) {
  const expected = typeof commit?.expected === "string" ? commit.expected.slice(0, 64) : "";
  const typed = typeof commit?.typed === "string" ? commit.typed.slice(0, 64) : "";
  const correctPositions = Math.max(0, Math.round(nonNegative(commit?.correctPositions)));
  const missingCharacters = Math.max(0, Math.round(nonNegative(commit?.missingCharacters)));
  const durationMs = Math.max(1, Math.round(nonNegative(endMs) - nonNegative(startMs)));
  const effectiveChars = correctPositions + Math.max(0, Math.round(nonNegative(spaceChars)));
  const errors = Math.max(0, Math.round(nonNegative(incorrectChars))) + missingCharacters;
  const denominator = effectiveChars + errors;
  return Object.freeze({
    index,
    expected,
    typed,
    exact: commit?.exact === true,
    startMs: Math.round(nonNegative(startMs)),
    endMs: Math.round(nonNegative(endMs)),
    durationMs,
    effectiveChars,
    rawChars: Math.max(0, Math.round(nonNegative(rawChars))),
    incorrectChars: Math.max(0, Math.round(nonNegative(incorrectChars))),
    missingCharacters,
    errors,
    backspaces: Math.max(0, Math.round(nonNegative(backspaces))),
    wordDeletes: Math.max(0, Math.round(nonNegative(wordDeletes))),
    wpm: round(wpmFromCharacters(effectiveChars, durationMs)),
    rawWpm: round(wpmFromCharacters(rawChars, durationMs)),
    accuracy: denominator > 0 ? round((effectiveChars / denominator) * 100) : 100,
    clean: commit?.exact === true && errors === 0 && nonNegative(backspaces) === 0 && nonNegative(wordDeletes) === 0,
  });
}

function captureCommittedWords(state, activeMs = null) {
  if (!state) return null;
  const now = globalThis.performance?.now?.() ?? Date.now();
  const endActiveMs = activeMs == null
    ? getSpeedTestActiveDuration(state, now)
    : nonNegative(activeMs);
  const current = ensureTracker(state, endActiveMs);
  if (!current) return null;
  const committed = Array.isArray(state.committedWords) ? state.committedWords : [];
  if (committed.length <= current.lastCommitCount) return current;

  const pending = committed.slice(current.lastCommitCount, MAX_WORDS);
  if (!pending.length) {
    current.lastCommitCount = committed.length;
    return current;
  }

  const metricNow = snapshotMetrics(state);
  const metricDiff = diffMetrics(metricNow, current.startMetrics);
  const weights = pending.map((item) => Math.max(1, String(item?.expected || "").length + 1));
  const rawAllocation = allocateIntegers(metricDiff.rawTypedCharacters, weights);
  const incorrectAllocation = allocateIntegers(metricDiff.incorrectKeystrokes, weights);
  const backspaceAllocation = allocateIntegers(metricDiff.backspaces, weights);
  const deleteAllocation = allocateIntegers(metricDiff.wordDeletes, weights);
  const spaces = Array.from({ length: pending.length }, (_, index) => (
    index < Math.min(pending.length, metricDiff.correctSpaces) ? 1 : 0
  ));

  const totalDuration = Math.max(1, endActiveMs - current.wordStartMs);
  const weightSum = weights.reduce((sum, value) => sum + value, 0) || pending.length;
  let cursorMs = current.wordStartMs;
  pending.forEach((commit, localIndex) => {
    const isLast = localIndex === pending.length - 1;
    const share = weights[localIndex] / weightSum;
    const nextMs = isLast ? endActiveMs : cursorMs + (totalDuration * share);
    current.words.push(buildWordRecord({
      commit,
      index: current.lastCommitCount + localIndex + 1,
      startMs: cursorMs,
      endMs: nextMs,
      rawChars: rawAllocation[localIndex],
      incorrectChars: incorrectAllocation[localIndex],
      backspaces: backspaceAllocation[localIndex],
      wordDeletes: deleteAllocation[localIndex],
      spaceChars: spaces[localIndex],
    }));
    cursorMs = nextMs;
  });

  current.lastCommitCount = committed.length;
  current.wordStartMs = endActiveMs;
  current.startMetrics = metricNow;
  return current;
}

function sanitizeWord(word, index) {
  if (!word || typeof word !== "object") return null;
  const expected = typeof word.expected === "string" ? word.expected.slice(0, 64) : "";
  if (!expected) return null;
  const durationMs = Math.max(1, Math.round(nonNegative(word.durationMs, 1)));
  return {
    index: Math.max(1, Math.round(nonNegative(word.index, index + 1))),
    expected,
    typed: typeof word.typed === "string" ? word.typed.slice(0, 64) : "",
    exact: word.exact === true,
    startMs: Math.round(nonNegative(word.startMs)),
    endMs: Math.round(nonNegative(word.endMs)),
    durationMs,
    effectiveChars: Math.round(nonNegative(word.effectiveChars)),
    rawChars: Math.round(nonNegative(word.rawChars)),
    incorrectChars: Math.round(nonNegative(word.incorrectChars)),
    missingCharacters: Math.round(nonNegative(word.missingCharacters)),
    errors: Math.round(nonNegative(word.errors)),
    backspaces: Math.round(nonNegative(word.backspaces)),
    wordDeletes: Math.round(nonNegative(word.wordDeletes)),
    wpm: round(word.wpm),
    rawWpm: round(word.rawWpm),
    accuracy: Math.max(0, Math.min(100, round(word.accuracy, 1))),
    clean: word.clean === true,
  };
}

function sanitizeProfile(value) {
  if (!value || value.version !== PROFILE_VERSION || !Array.isArray(value.words)) return null;
  const words = value.words.slice(0, MAX_WORDS).map(sanitizeWord).filter(Boolean);
  if (!words.length) return null;
  return {
    version: PROFILE_VERSION,
    sessionId: typeof value.sessionId === "string" ? value.sessionId : null,
    configId: typeof value.configId === "string" ? value.configId : null,
    wordSetId: typeof value.wordSetId === "string" ? value.wordSetId : null,
    attemptSeed: value.attemptSeed ?? null,
    activeDurationMs: Math.round(nonNegative(value.activeDurationMs)),
    capturedAt: Math.round(nonNegative(value.capturedAt, Date.now())),
    words,
  };
}

function readStore() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSpeedTestWordProfile(profile) {
  const safe = sanitizeProfile(profile);
  if (!safe?.sessionId) return false;
  try {
    const existing = readStore().filter((entry) => entry?.sessionId !== safe.sessionId);
    const next = [{ sessionId: safe.sessionId, profile: safe }, ...existing].slice(0, MAX_STORED_PROFILES);
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function loadSpeedTestWordProfile(sessionId) {
  if (typeof sessionId !== "string" || !sessionId) return null;
  const entry = readStore().find((candidate) => candidate?.sessionId === sessionId);
  return sanitizeProfile(entry?.profile);
}

export function getCurrentSpeedTestWordProfile(state = getCurrentSpeedTest()) {
  if (!state) return null;
  const activeMs = state.ended
    ? nonNegative(state.activeDurationMs)
    : getSpeedTestActiveDuration(state);
  const current = captureCommittedWords(state, activeMs);
  if (!current?.words?.length) return null;
  return sanitizeProfile({
    version: PROFILE_VERSION,
    sessionId: state.result?.sessionId || null,
    configId: current.configId,
    wordSetId: current.wordSetId,
    attemptSeed: current.attemptSeed,
    activeDurationMs: state.ended ? state.activeDurationMs : activeMs,
    capturedAt: Date.now(),
    words: current.words,
  });
}

export function finalizeCurrentSpeedTestWordProfile(state = getCurrentSpeedTest()) {
  if (!state?.result?.sessionId) return getCurrentSpeedTestWordProfile(state);
  const current = captureCommittedWords(state, nonNegative(state.activeDurationMs));
  if (!current?.words?.length) return null;
  const profile = sanitizeProfile({
    version: PROFILE_VERSION,
    sessionId: state.result.sessionId,
    configId: current.configId,
    wordSetId: current.wordSetId,
    attemptSeed: current.attemptSeed,
    activeDurationMs: state.activeDurationMs,
    capturedAt: Date.now(),
    words: current.words,
  });
  if (profile && current.persistedSessionId !== profile.sessionId) {
    persistSpeedTestWordProfile(profile);
    current.persistedSessionId = profile.sessionId;
  }
  return profile;
}

function samplingFrame() {
  frameId = null;
  const state = getCurrentSpeedTest();
  if (!state) return;
  if (state.ended) {
    finalizeCurrentSpeedTestWordProfile(state);
    return;
  }
  captureCommittedWords(state);
  frameId = globalThis.requestAnimationFrame?.(samplingFrame) ?? null;
}

function ensureSampling() {
  const state = getCurrentSpeedTest();
  if (!state) return;
  if (frameId == null) frameId = globalThis.requestAnimationFrame?.(samplingFrame) ?? null;
}

export function installSpeedTestWordProfiler() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const root = document.querySelector("#app");
  if (!root) return;
  ensureSampling();
  observer = new MutationObserver(() => ensureSampling());
  observer.observe(root, { childList: true, subtree: true });
}

export const SPEED_TEST_WORD_PROFILE_STORAGE_KEY = STORAGE_KEY;
