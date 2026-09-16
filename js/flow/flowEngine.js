import { FLOW_PHASES, createInitialFlowRun } from "./flowState.js";

const WORD_CHAR = /[A-Za-z0-9'’]/;
const SENTENCE_END = /[.!?]/;

function normalizePassage(value) {
  if (typeof value !== "string") throw new TypeError("Flow passage must be a string");
  const normalized = value.normalize("NFC");
  if (!normalized.length) throw new TypeError("Flow passage must not be empty");
  return normalized;
}

function currentNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function findWordStart(text, index) {
  let start = index;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start -= 1;
  return start;
}

function findSentenceStart(text, index) {
  let start = index;
  while (start > 0 && !SENTENCE_END.test(text[start - 1])) start -= 1;
  while (text[start] === " ") start += 1;
  return start;
}

function typedSliceCorrect(run, startIndex, endIndex) {
  for (let index = startIndex; index <= endIndex; index += 1) {
    if (run.typedCharacters[index]?.correct !== true) return false;
  }
  return true;
}

function timingStart(run, startIndex, fallback) {
  return run.typedCharacters[startIndex]?.at ?? fallback;
}

function recordBoundaryTimings(run, index, at) {
  const passage = run.passage;
  const current = passage[index];
  const next = passage[index + 1];
  const wordEnded = WORD_CHAR.test(current) && (index === passage.length - 1 || !WORD_CHAR.test(next));
  if (wordEnded) {
    const startIndex = findWordStart(passage, index);
    run.wordTimings.push({
      startIndex,
      endIndex: index,
      text: passage.slice(startIndex, index + 1),
      startedAt: timingStart(run, startIndex, at),
      completedAt: at,
      durationMs: Math.max(0, at - timingStart(run, startIndex, at)),
      correct: typedSliceCorrect(run, startIndex, index),
    });
  }

  if (SENTENCE_END.test(current)) {
    const startIndex = findSentenceStart(passage, index);
    run.sentenceTimings.push({
      startIndex,
      endIndex: index,
      text: passage.slice(startIndex, index + 1),
      startedAt: timingStart(run, startIndex, at),
      completedAt: at,
      durationMs: Math.max(0, at - timingStart(run, startIndex, at)),
      correct: typedSliceCorrect(run, startIndex, index),
    });
  }
}

export function createFlowTypingRun(passage, options = {}) {
  const run = createInitialFlowRun(options);
  run.phase = FLOW_PHASES.READY;
  run.passage = normalizePassage(passage);
  run.typedCharacters = [];
  run.errorTimings = [];
  run.correctionTimings = [];
  run.sentenceTimings = [];
  run.totalInsertedCharacters = 0;
  return run;
}

export function startFlowTypingRun(run, at = currentNow()) {
  if (!run || typeof run !== "object") return false;
  if (run.phase === FLOW_PHASES.COMPLETE) return false;
  if (run.startedAt == null) run.startedAt = at;
  run.phase = FLOW_PHASES.RUNNING;
  return true;
}

export function insertFlowText(run, value, at = currentNow()) {
  if (!run || typeof value !== "string" || value.length === 0) return false;
  if (run.phase === FLOW_PHASES.COMPLETE) return false;
  let changed = false;
  for (const actual of [...value.normalize("NFC")]) {
    if (run.currentIndex >= run.passage.length) break;
    if (actual === "\r" || actual === "\n" || actual === "\t") continue;
    startFlowTypingRun(run, at);
    const index = run.currentIndex;
    const expected = run.passage[index];
    const correct = actual === expected;
    const entry = { index, expected, actual, correct, at };
    run.typedCharacters.push(entry);
    run.rawKeystrokes.push({ type: "insert", ...entry });
    run.totalInsertedCharacters += 1;
    run.currentIndex += 1;
    if (correct) run.correctChars += 1;
    else {
      run.incorrectChars += 1;
      run.uncorrectedErrors += 1;
      run.errorTimings.push({ index, expected, actual, at });
    }
    recordBoundaryTimings(run, index, at);
    changed = true;
  }

  if (changed && run.currentIndex >= run.passage.length) {
    run.phase = FLOW_PHASES.COMPLETE;
    run.completedAt = at;
  }
  return changed;
}

export function backspaceFlowText(run, at = currentNow()) {
  if (!run || run.phase === FLOW_PHASES.COMPLETE || run.currentIndex <= 0) return false;
  const removed = run.typedCharacters.pop();
  run.currentIndex -= 1;
  if (removed.correct) run.correctChars = Math.max(0, run.correctChars - 1);
  else {
    run.uncorrectedErrors = Math.max(0, run.uncorrectedErrors - 1);
    run.correctedErrors += 1;
    run.correctionTimings.push({
      index: removed.index,
      expected: removed.expected,
      actual: removed.actual,
      errorAt: removed.at,
      correctedAt: at,
      correctionDelayMs: Math.max(0, at - removed.at),
    });
  }
  run.rawKeystrokes.push({
    type: "backspace",
    index: removed.index,
    expected: removed.expected,
    actual: removed.actual,
    removedCorrectCharacter: removed.correct,
    at,
  });
  if (run.startedAt != null) run.phase = FLOW_PHASES.RUNNING;
  return true;
}

export function getFlowCharacterView(run) {
  if (!run?.passage) return [];
  return [...run.passage].map((expected, index) => {
    const typed = run.typedCharacters[index];
    return Object.freeze({
      index,
      expected,
      actual: typed?.actual ?? null,
      status: typed ? (typed.correct ? "correct" : "incorrect") : "pending",
      current: index === run.currentIndex && run.phase !== FLOW_PHASES.COMPLETE,
    });
  });
}

export function getFlowTypingSnapshot(run) {
  if (!run) return null;
  return {
    mode: run.mode,
    phase: run.phase,
    passageId: run.passageId ?? null,
    category: run.category,
    difficulty: run.difficulty,
    sessionLength: run.sessionLength,
    passage: run.passage,
    currentIndex: run.currentIndex,
    passageLength: run.passage.length,
    correctChars: run.correctChars,
    incorrectChars: run.incorrectChars,
    correctedErrors: run.correctedErrors,
    uncorrectedErrors: run.uncorrectedErrors,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    rawKeystrokes: run.rawKeystrokes.map((entry) => ({ ...entry })),
    wordTimings: run.wordTimings.map((entry) => ({ ...entry })),
    sentenceTimings: run.sentenceTimings.map((entry) => ({ ...entry })),
    errorTimings: run.errorTimings.map((entry) => ({ ...entry })),
    correctionTimings: run.correctionTimings.map((entry) => ({ ...entry })),
  };
}
