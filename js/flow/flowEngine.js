import { FLOW_PHASES, createInitialFlowRun } from "./flowState.js";
import {
  applyFlowBackspaceGameplay,
  applyFlowInsertGameplay,
  finalizeFlowGameplay,
  getFlowGameplaySnapshot,
  initializeFlowGameplay,
} from "./flowGameplay.js";
import { analyzeFlowCadence } from "./flowCadence.js";
import { hasFlowModifier } from "./flowModifiers.js";

const WORD_CHAR = /[A-Za-z0-9'’]/;
const SENTENCE_END = /[.!?]/;
const WORD_SEPARATOR = /\s/;

function normalizePassage(value) {
  if (typeof value !== "string") throw new TypeError("Flow passage must be a string");
  const normalized = value.normalize("NFC");
  if (!normalized.length) throw new TypeError("Flow passage must not be empty");
  return normalized;
}

function currentNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function findNextSeparator(text, startIndex) {
  for (let index = Math.max(0, startIndex); index < text.length; index += 1) {
    if (WORD_SEPARATOR.test(text[index])) return index;
  }
  return -1;
}

function findTokenStart(text, index) {
  let start = Math.max(0, Math.min(index, text.length));
  while (start > 0 && !WORD_SEPARATOR.test(text[start - 1])) start -= 1;
  return start;
}

function extraCharactersAt(run, index) {
  return (run?.extraCharacters || []).filter((entry) => entry.index === index);
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
  const boundary = {
    wordEnded: false,
    cleanWord: false,
    sentenceEnded: false,
    cleanSentence: false,
  };
  const wordEnded = WORD_CHAR.test(current) && (index === passage.length - 1 || !WORD_CHAR.test(next));
  if (wordEnded) {
    const startIndex = findWordStart(passage, index);
    const cleanWord = typedSliceCorrect(run, startIndex, index);
    run.wordTimings.push({
      startIndex,
      endIndex: index,
      text: passage.slice(startIndex, index + 1),
      startedAt: timingStart(run, startIndex, at),
      completedAt: at,
      durationMs: Math.max(0, at - timingStart(run, startIndex, at)),
      correct: cleanWord,
    });
    boundary.wordEnded = true;
    boundary.cleanWord = cleanWord;
  }

  if (SENTENCE_END.test(current)) {
    const startIndex = findSentenceStart(passage, index);
    const cleanSentence = typedSliceCorrect(run, startIndex, index);
    run.sentenceTimings.push({
      startIndex,
      endIndex: index,
      text: passage.slice(startIndex, index + 1),
      startedAt: timingStart(run, startIndex, at),
      completedAt: at,
      durationMs: Math.max(0, at - timingStart(run, startIndex, at)),
      correct: cleanSentence,
    });
    boundary.sentenceEnded = true;
    boundary.cleanSentence = cleanSentence;
  }
  return boundary;
}

export function createFlowTypingRun(passage, options = {}) {
  const run = createInitialFlowRun(options);
  run.phase = FLOW_PHASES.READY;
  run.passage = normalizePassage(passage);
  run.typedCharacters = [];
  run.errorTimings = [];
  run.correctionTimings = [];
  run.sentenceTimings = [];
  run.extraCharacters = [];
  run.currentWordStartIndex = 0;
  run.totalInsertedCharacters = 0;
  initializeFlowGameplay(run);
  return run;
}

export function startFlowTypingRun(run, at = currentNow()) {
  if (!run || typeof run !== "object") return false;
  if (run.phase === FLOW_PHASES.COMPLETE) return false;
  if (run.startedAt == null) run.startedAt = at;
  run.phase = FLOW_PHASES.RUNNING;
  return true;
}

function recordExtraAtSeparator(run, actual, at) {
  startFlowTypingRun(run, at);
  const index = run.currentIndex;
  const expected = run.passage[index];
  const entry = Object.freeze({
    index,
    expected,
    actual,
    correct: false,
    extra: true,
    at,
  });
  run.extraCharacters.push(entry);
  run.rawKeystrokes.push({ type: "insert", ...entry });
  run.totalInsertedCharacters += 1;
  run.incorrectChars += 1;
  run.uncorrectedErrors += 1;
  run.errorTimings.push({ index, expected, actual, at, extra: true });
  applyFlowInsertGameplay(run, {
    index,
    correct: false,
    newProgress: false,
    cleanWord: false,
    cleanSentence: false,
    at,
  });
  return true;
}

function commitEarlyWordSeparator(run, actual, at) {
  if (!WORD_SEPARATOR.test(actual)) return false;
  const wordStart = Number.isInteger(run.currentWordStartIndex)
    ? run.currentWordStartIndex
    : findTokenStart(run.passage, run.currentIndex);
  const boundaryIndex = findNextSeparator(run.passage, wordStart);
  if (boundaryIndex < 0 || run.currentIndex >= boundaryIndex) return false;

  startFlowTypingRun(run, at);
  const skippedStart = run.currentIndex;
  while (run.currentIndex < boundaryIndex) {
    const index = run.currentIndex;
    const expected = run.passage[index];
    const missed = Object.freeze({
      index,
      expected,
      actual: expected,
      correct: false,
      missed: true,
      at,
    });
    run.typedCharacters.push(missed);
    run.currentIndex += 1;
    run.incorrectChars += 1;
    run.uncorrectedErrors += 1;
    run.errorTimings.push({ index, expected, actual: "", at, missed: true });
  }

  const boundaryState = boundaryIndex > 0
    ? recordBoundaryTimings(run, boundaryIndex - 1, at)
    : { cleanWord: false, cleanSentence: false };
  const expected = run.passage[boundaryIndex];
  run.typedCharacters.push(Object.freeze({
    index: boundaryIndex,
    expected,
    actual,
    correct: true,
    wordCommit: true,
    at,
  }));
  run.currentIndex = boundaryIndex + 1;
  run.correctChars += 1;
  run.totalInsertedCharacters += 1;
  run.rawKeystrokes.push(Object.freeze({
    type: "insert",
    index: boundaryIndex,
    expected,
    actual,
    correct: false,
    wordCommit: true,
    skippedCount: Math.max(0, boundaryIndex - skippedStart),
    at,
  }));
  applyFlowInsertGameplay(run, {
    index: boundaryIndex,
    correct: false,
    newProgress: true,
    cleanWord: boundaryState.cleanWord,
    cleanSentence: boundaryState.cleanSentence,
    at,
  });
  run.currentWordStartIndex = run.currentIndex;
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

    if (WORD_SEPARATOR.test(actual) && !WORD_SEPARATOR.test(expected)) {
      if (commitEarlyWordSeparator(run, actual, at)) {
        changed = true;
        continue;
      }
    }

    if (!WORD_SEPARATOR.test(actual) && WORD_SEPARATOR.test(expected)) {
      recordExtraAtSeparator(run, actual, at);
      changed = true;
      continue;
    }

    const correct = actual === expected;
    const newProgress = index >= (run.furthestIndexReached || 0);
    const entry = { index, expected, actual, correct, at };
    run.typedCharacters.push(entry);
    run.rawKeystrokes.push({ type: "insert", ...entry });
    run.totalInsertedCharacters += 1;
    run.currentIndex += 1;
    if (correct) {
      run.correctChars += 1;
      if (WORD_SEPARATOR.test(expected)) {
        run.currentWordStartIndex = run.currentIndex;
      }
    } else {
      run.incorrectChars += 1;
      run.uncorrectedErrors += 1;
      run.errorTimings.push({ index, expected, actual, at });
    }
    const boundary = recordBoundaryTimings(run, index, at);
    applyFlowInsertGameplay(run, {
      index,
      correct,
      newProgress,
      cleanWord: boundary.cleanWord,
      cleanSentence: boundary.cleanSentence,
      at,
    });
    changed = true;
  }

  if (changed && run.currentIndex >= run.passage.length) {
    run.phase = FLOW_PHASES.COMPLETE;
    run.completedAt = at;
    finalizeFlowGameplay(run);
  }
  return changed;
}

export function backspaceFlowText(run, at = currentNow()) {
  if (!run || run.phase === FLOW_PHASES.COMPLETE || run.currentIndex <= 0) return false;
  if (hasFlowModifier(run, "no-backspace")) {
    run.blockedBackspaces = (run.blockedBackspaces || 0) + 1;
    run.rawKeystrokes.push({
      type: "blocked-backspace",
      index: run.currentIndex - 1,
      at,
    });
    return false;
  }
  const extras = run.extraCharacters || [];
  let extraIndex = -1;
  for (let index = extras.length - 1; index >= 0; index -= 1) {
    if (extras[index]?.index === run.currentIndex) {
      extraIndex = index;
      break;
    }
  }
  if (extraIndex >= 0) {
    const removed = extras.splice(extraIndex, 1)[0];
    run.uncorrectedErrors = Math.max(0, run.uncorrectedErrors - 1);
    run.correctedErrors += 1;
    run.correctionTimings.push({
      index: removed.index,
      expected: removed.expected,
      actual: removed.actual,
      errorAt: removed.at,
      correctedAt: at,
      correctionDelayMs: Math.max(0, at - removed.at),
      extra: true,
    });
    run.rawKeystrokes.push({
      type: "backspace",
      index: removed.index,
      expected: removed.expected,
      actual: removed.actual,
      removedCorrectCharacter: false,
      extra: true,
      at,
    });
    applyFlowBackspaceGameplay(run, { removed, at });
    if (run.startedAt != null) run.phase = FLOW_PHASES.RUNNING;
    return true;
  }

  const removed = run.typedCharacters.pop();
  run.currentIndex -= 1;
  if (run.currentIndex < (run.currentWordStartIndex || 0)) {
    run.currentWordStartIndex = findTokenStart(run.passage, run.currentIndex);
  }
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
  applyFlowBackspaceGameplay(run, { removed, at });
  if (run.startedAt != null) run.phase = FLOW_PHASES.RUNNING;
  return true;
}

export function getFlowCharacterView(run) {
  if (!run?.passage) return [];
  return [...run.passage].map((expected, index) => {
    const typed = run.typedCharacters[index];
    const extras = extraCharactersAt(run, index);
    const hasExtras = extras.length > 0;
    return Object.freeze({
      index,
      expected,
      actual: hasExtras
        ? `${extras.map((entry) => entry.actual).join("")}${typed?.actual ?? expected}`
        : typed?.actual ?? null,
      status: hasExtras
        ? "incorrect"
        : typed?.missed
          ? "missed"
          : typed
            ? (typed.correct ? "correct" : "incorrect")
            : "pending",
      extraCount: extras.length,
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
    modifiers: [...(run.modifiers || [])],
    blockedBackspaces: run.blockedBackspaces || 0,
    passage: run.passage,
    currentIndex: run.currentIndex,
    passageLength: run.passage.length,
    correctChars: run.correctChars,
    incorrectChars: run.incorrectChars,
    correctedErrors: run.correctedErrors,
    uncorrectedErrors: run.uncorrectedErrors,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    gameplay: getFlowGameplaySnapshot(run),
    cadence: analyzeFlowCadence(run),
    rawKeystrokes: run.rawKeystrokes.map((entry) => ({ ...entry })),
    wordTimings: run.wordTimings.map((entry) => ({ ...entry })),
    sentenceTimings: run.sentenceTimings.map((entry) => ({ ...entry })),
    errorTimings: run.errorTimings.map((entry) => ({ ...entry })),
    correctionTimings: run.correctionTimings.map((entry) => ({ ...entry })),
    extraCharacters: (run.extraCharacters || []).map((entry) => ({ ...entry })),
  };
}
