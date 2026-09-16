import { buildPerformanceV5Analysis } from "./speedTestPerformanceV5.js";

export const TYPING_COACH_V6_VERSION = 6;
export const TYPING_COACH_V6_ACTIVE_KEY = "wordstrike_typing_coach_v6_active";
export const TYPING_COACH_V6_HISTORY_KEY = "wordstrike_typing_coach_v6_history";

const MAX_FOCUS_WORDS = 8;
const MAX_HISTORY = 12;
const DRILL_TYPES = new Set(["weak-words", "mistake-patterns", "accuracy-recovery"]);
const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const safeWord = (value) => {
  const word = String(value || "").trim().toLowerCase();
  return /^[a-z]{2,24}$/.test(word) ? word : null;
};
const safeKey = (value) => {
  const key = String(value || "").trim().toLowerCase();
  return /^[a-z]$/.test(key) ? key : null;
};
const unique = (values) => [...new Set(values.filter(Boolean))];

export function summarizeTypingCoachProfile(profile = {}) {
  const words = Array.isArray(profile?.words) ? profile.words.filter(Boolean) : [];
  const cleanWords = words.filter((word) => word.clean === true).length;
  const corrections = words.reduce((sum, word) => (
    sum + Math.max(0, finite(word?.backspaces)) + Math.max(0, finite(word?.wordDeletes))
  ), 0);
  return Object.freeze({
    wordCount: words.length,
    cleanWords,
    cleanPercent: words.length ? round((cleanWords / words.length) * 100) : null,
    corrections: Math.round(corrections),
    correctionsPerWord: words.length ? round(corrections / words.length, 2) : null,
  });
}

function fallbackFocusWords(profile = {}, result = {}) {
  const averageWpm = Math.max(1, finite(result?.wpm, 1));
  return (Array.isArray(profile?.words) ? profile.words : [])
    .map((word) => ({
      word: safeWord(word?.expected),
      burden: Math.max(0, finite(word?.errors)) * 5
        + (Math.max(0, finite(word?.backspaces)) + Math.max(0, finite(word?.wordDeletes))) * 1.7
        + Math.max(0, 1 - (Math.max(0, finite(word?.wpm)) / averageWpm)) * 4
        + (word?.clean === true ? 0 : 2),
    }))
    .filter((item) => item.word)
    .sort((a, b) => b.burden - a.burden)
    .map((item) => item.word);
}

function currentSample(samples, result) {
  return samples.find((sample) => sample?.sessionId === result?.sessionId) || samples.at(-1) || null;
}

function buildDrills({ performance, focusWords, current, result }) {
  const topWord = focusWords[0] || null;
  const confusion = performance?.recurringConfusions?.find((item) => safeKey(item?.expected)) || null;
  const keyTarget = safeKey(confusion?.expected);
  const drills = [];

  if (topWord) {
    drills.push(Object.freeze({
      type: "weak-words",
      title: "Weak Words",
      experimentId: "problem-words",
      targetType: "word",
      target: topWord,
      focusWords: Object.freeze(focusWords.slice(0, MAX_FOCUS_WORDS)),
      rationale: performance?.persistentWords?.[0]?.runCount >= 2
        ? `${topWord} is recurring across multiple same-test runs.`
        : `${topWord} created the strongest word-level friction in this test.`,
    }));
  }

  if (keyTarget) {
    const patternWords = unique((current?.profile?.words || [])
      .map((word) => safeWord(word?.expected))
      .filter((word) => word?.includes(keyTarget)))
      .slice(0, MAX_FOCUS_WORDS);
    drills.push(Object.freeze({
      type: "mistake-patterns",
      title: "Mistake Patterns",
      experimentId: "weak-keys",
      targetType: "key",
      target: keyTarget,
      focusWords: Object.freeze(patternWords.length ? patternWords : focusWords.slice(0, MAX_FOCUS_WORDS)),
      rationale: `${confusion.expected}→${confusion.typed} appeared ${confusion.count}× across ${confusion.runCount} ${confusion.runCount === 1 ? "run" : "runs"}.`,
    }));
  }

  if (topWord) {
    drills.push(Object.freeze({
      type: "accuracy-recovery",
      title: "Accuracy Recovery",
      experimentId: "accuracy-control",
      targetType: "word",
      target: topWord,
      focusWords: Object.freeze(focusWords.slice(0, MAX_FOCUS_WORDS)),
      rationale: `Train a cleaner first pass and more controlled recovery on ${topWord}.`,
    }));
  }

  const profileSummary = summarizeTypingCoachProfile(current?.profile);
  const correctionsPerWord = profileSummary.correctionsPerWord ?? 0;
  const cleanPercent = profileSummary.cleanPercent ?? 100;
  const recurringWord = performance?.persistentWords?.[0];
  let primaryType = null;
  if (correctionsPerWord >= 0.35 || cleanPercent < 70) primaryType = "accuracy-recovery";
  else if (recurringWord && (recurringWord.runCount >= 2 || recurringWord.difficultyScore >= 4)) primaryType = "weak-words";
  else if (confusion && (confusion.runCount >= 2 || confusion.count >= 3)) primaryType = "mistake-patterns";
  else if (topWord) primaryType = "weak-words";
  else if (keyTarget) primaryType = "mistake-patterns";
  else primaryType = drills[0]?.type || null;

  if (!drills.some((drill) => drill.type === primaryType)) primaryType = drills[0]?.type || null;
  return Object.freeze({ drills: Object.freeze(drills), primaryType });
}

export function buildTypingCoachV6({ samples = [], result = {}, profile = null } = {}) {
  if (!result?.sessionId) return null;
  const performance = buildPerformanceV5Analysis(samples, result);
  if (!performance) return null;
  const current = currentSample(samples, result);
  const currentProfile = profile || current?.profile || null;
  const focusWords = unique([
    ...(performance.focusWords || []).map(safeWord),
    ...fallbackFocusWords(currentProfile, result),
  ]).slice(0, MAX_FOCUS_WORDS);
  const built = buildDrills({ performance, focusWords, current: current || { profile: currentProfile }, result });
  if (!built.drills.length) return null;
  const primary = built.drills.find((drill) => drill.type === built.primaryType) || built.drills[0];
  const profileSummary = summarizeTypingCoachProfile(currentProfile);
  const baseline = Object.freeze({
    sessionId: result.sessionId,
    wpm: round(result.wpm),
    accuracy: round(clamp(finite(result.accuracy), 0, 100)),
    rawWpm: round(Math.max(0, finite(result.modeData?.rawWpm))),
    cleanPercent: profileSummary.cleanPercent,
    correctionsPerWord: profileSummary.correctionsPerWord,
  });
  const secondary = built.drills.filter((drill) => drill.type !== primary.type);
  const observations = [
    primary.rationale,
    performance.baselineEstablished
      ? `Compared with ${performance.runCount} recent runs of this exact test.`
      : `Baseline building: ${performance.runCount}/3 same-test runs captured.`,
  ];
  if (profileSummary.cleanPercent != null) {
    observations.push(`${profileSummary.cleanPercent.toFixed(0)}% clean words · ${(profileSummary.correctionsPerWord ?? 0).toFixed(2)} corrections per word.`);
  }
  return Object.freeze({
    version: TYPING_COACH_V6_VERSION,
    sourceSessionId: result.sessionId,
    configId: result.modeData?.configId || null,
    wordSetId: result.modeData?.wordSetId || null,
    primaryDrillType: primary.type,
    primaryDrill: primary,
    drills: built.drills,
    focusWords: Object.freeze(focusWords),
    observations: Object.freeze(observations.slice(0, 3)),
    estimatedMinutes: 2,
    baseline,
    performance,
  });
}

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function sanitizeDrill(value) {
  if (!value || !DRILL_TYPES.has(value.type)) return null;
  const target = value.targetType === "key" ? safeKey(value.target) : safeWord(value.target);
  if (!target) return null;
  const experimentId = value.type === "weak-words"
    ? "problem-words"
    : value.type === "mistake-patterns" ? "weak-keys" : "accuracy-control";
  return {
    type: value.type,
    title: String(value.title || "Practice").slice(0, 60),
    experimentId,
    targetType: value.targetType === "key" ? "key" : "word",
    target,
    focusWords: unique((value.focusWords || []).map(safeWord)).slice(0, MAX_FOCUS_WORDS),
    rationale: String(value.rationale || "").slice(0, 240),
  };
}

function sanitizeBaseline(value = {}) {
  return {
    sessionId: typeof value.sessionId === "string" ? value.sessionId.slice(0, 100) : null,
    wpm: round(Math.max(0, finite(value.wpm))),
    accuracy: round(clamp(finite(value.accuracy), 0, 100)),
    rawWpm: round(Math.max(0, finite(value.rawWpm))),
    cleanPercent: value.cleanPercent == null ? null : round(clamp(finite(value.cleanPercent), 0, 100)),
    correctionsPerWord: value.correctionsPerWord == null ? null : round(Math.max(0, finite(value.correctionsPerWord)), 2),
  };
}

function sanitizeCycle(value) {
  if (!value || value.version !== TYPING_COACH_V6_VERSION) return null;
  const drill = sanitizeDrill(value.drill);
  if (!drill) return null;
  return {
    version: TYPING_COACH_V6_VERSION,
    cycleId: typeof value.cycleId === "string" ? value.cycleId.slice(0, 100) : null,
    sourceSessionId: typeof value.sourceSessionId === "string" ? value.sourceSessionId.slice(0, 100) : null,
    configId: typeof value.configId === "string" ? value.configId.slice(0, 80) : null,
    wordSetId: typeof value.wordSetId === "string" ? value.wordSetId.slice(0, 80) : null,
    drill,
    focusWords: unique((value.focusWords || []).map(safeWord)).slice(0, MAX_FOCUS_WORDS),
    baseline: sanitizeBaseline(value.baseline),
    createdAt: Math.max(0, finite(value.createdAt, Date.now())),
    practiceStartedAt: value.practiceStartedAt ? Math.max(0, finite(value.practiceStartedAt)) : null,
    practiceCompletedAt: value.practiceCompletedAt ? Math.max(0, finite(value.practiceCompletedAt)) : null,
    retestRequestedAt: value.retestRequestedAt ? Math.max(0, finite(value.retestRequestedAt)) : null,
    completedAt: value.completedAt ? Math.max(0, finite(value.completedAt)) : null,
    after: value.after ? sanitizeBaseline(value.after) : null,
    comparison: value.comparison && typeof value.comparison === "object" ? {
      wpmDelta: round(value.comparison.wpmDelta),
      accuracyDelta: round(value.comparison.accuracyDelta),
      cleanDelta: value.comparison.cleanDelta == null ? null : round(value.comparison.cleanDelta),
      correctionsDelta: value.comparison.correctionsDelta == null ? null : round(value.comparison.correctionsDelta, 2),
    } : null,
  };
}

function nextCycleId() {
  try { return globalThis.crypto?.randomUUID?.() || `coach-${Date.now()}`; }
  catch { return `coach-${Date.now()}`; }
}

export function activateTypingCoachPlan(plan, drillType = plan?.primaryDrillType) {
  if (!plan || plan.version !== TYPING_COACH_V6_VERSION) return null;
  const drill = sanitizeDrill(plan.drills?.find((item) => item.type === drillType) || plan.primaryDrill);
  if (!drill) return null;
  const cycle = sanitizeCycle({
    version: TYPING_COACH_V6_VERSION,
    cycleId: nextCycleId(),
    sourceSessionId: plan.sourceSessionId,
    configId: plan.configId,
    wordSetId: plan.wordSetId,
    drill,
    focusWords: plan.focusWords,
    baseline: plan.baseline,
    createdAt: Date.now(),
  });
  if (!cycle || !writeJson(TYPING_COACH_V6_ACTIVE_KEY, cycle)) return null;
  return cycle;
}

export function loadActiveTypingCoachCycle() {
  return sanitizeCycle(readJson(TYPING_COACH_V6_ACTIVE_KEY, null));
}

function patchActive(patch) {
  const current = loadActiveTypingCoachCycle();
  if (!current) return null;
  const next = sanitizeCycle({ ...current, ...patch });
  if (!next || !writeJson(TYPING_COACH_V6_ACTIVE_KEY, next)) return null;
  return next;
}

export const markTypingCoachPracticeStarted = () => patchActive({ practiceStartedAt: Date.now() });
export const markTypingCoachPracticeCompleted = () => patchActive({ practiceCompletedAt: Date.now() });
export const markTypingCoachRetestRequested = () => patchActive({ retestRequestedAt: Date.now() });

export function clearActiveTypingCoachCycle() {
  try { globalThis.localStorage?.removeItem(TYPING_COACH_V6_ACTIVE_KEY); } catch {}
}

function history() {
  const values = readJson(TYPING_COACH_V6_HISTORY_KEY, []);
  return Array.isArray(values) ? values.map(sanitizeCycle).filter(Boolean).slice(0, MAX_HISTORY) : [];
}

export function completeTypingCoachRetest(result, profile) {
  const active = loadActiveTypingCoachCycle();
  if (!active?.retestRequestedAt || !result?.sessionId || result.sessionId === active.sourceSessionId) return null;
  if (active.configId && result.modeData?.configId !== active.configId) return null;
  if (active.wordSetId && result.modeData?.wordSetId && result.modeData.wordSetId !== active.wordSetId) return null;
  const summary = summarizeTypingCoachProfile(profile);
  const after = sanitizeBaseline({
    sessionId: result.sessionId,
    wpm: result.wpm,
    accuracy: result.accuracy,
    rawWpm: result.modeData?.rawWpm,
    cleanPercent: summary.cleanPercent,
    correctionsPerWord: summary.correctionsPerWord,
  });
  const comparison = {
    wpmDelta: round(after.wpm - active.baseline.wpm),
    accuracyDelta: round(after.accuracy - active.baseline.accuracy),
    cleanDelta: after.cleanPercent == null || active.baseline.cleanPercent == null
      ? null : round(after.cleanPercent - active.baseline.cleanPercent),
    correctionsDelta: after.correctionsPerWord == null || active.baseline.correctionsPerWord == null
      ? null : round(after.correctionsPerWord - active.baseline.correctionsPerWord, 2),
  };
  const completed = sanitizeCycle({ ...active, after, comparison, completedAt: Date.now() });
  if (!completed) return null;
  writeJson(TYPING_COACH_V6_HISTORY_KEY, [completed, ...history().filter((item) => item.cycleId !== completed.cycleId)].slice(0, MAX_HISTORY));
  clearActiveTypingCoachCycle();
  return completed;
}

export function getTypingCoachCycleForRetestSession(sessionId) {
  if (typeof sessionId !== "string" || !sessionId) return null;
  return history().find((item) => item.after?.sessionId === sessionId) || null;
}

export function getTypingCoachHistory() {
  return Object.freeze(history());
}
