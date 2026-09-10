const TIMELINE_VERSION = 1;
const DEFAULT_BUCKET_MS = 1000;
const MAX_TIMELINE_POINTS = 600;
const MAX_MISTAKES = 320;
const STORAGE_KEY = "wordstrike_speed_test_timelines_v1";
const MAX_STORED_TIMELINES = 30;

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const nonNegative = (value, fallback = 0) => Math.max(0, finite(value, fallback));
const roundMetric = (value) => Math.round(nonNegative(value) * 10) / 10;

function bucketIndexFor(activeMs, bucketMs) {
  return Math.max(0, Math.floor(nonNegative(activeMs) / bucketMs));
}

function ensureBucket(timeline, activeMs) {
  const index = Math.min(
    MAX_TIMELINE_POINTS - 1,
    bucketIndexFor(activeMs, timeline.bucketMs),
  );
  while (timeline.buckets.length <= index) {
    const nextIndex = timeline.buckets.length;
    timeline.buckets.push({
      index: nextIndex,
      rawChars: 0,
      correctChars: 0,
      correctedCharsErased: 0,
      incorrectChars: 0,
      missedChars: 0,
      backspaces: 0,
      wordDeletes: 0,
    });
  }
  return timeline.buckets[index];
}

function addMistake(timeline, mistake) {
  if (timeline.mistakes.length >= MAX_MISTAKES) return;
  const activeMs = nonNegative(mistake.activeMs);
  timeline.mistakes.push({
    timeMs: Math.round(activeMs),
    second: Math.floor(activeMs / timeline.bucketMs) + 1,
    type: mistake.type === "extra" || mistake.type === "missed"
      ? mistake.type
      : "incorrect",
    count: Math.max(1, Math.round(nonNegative(mistake.count, 1))),
    expected: typeof mistake.expected === "string" ? mistake.expected.slice(0, 24) : "",
    typed: typeof mistake.typed === "string" ? mistake.typed.slice(0, 24) : "",
    word: typeof mistake.word === "string" ? mistake.word.slice(0, 48) : "",
  });
}

function wpmFromCharacters(characters, durationMs) {
  const duration = nonNegative(durationMs);
  if (duration <= 0) return 0;
  return (nonNegative(characters) / 5) / (duration / 60000);
}

export function createSpeedTestTimeline({ bucketMs = DEFAULT_BUCKET_MS } = {}) {
  return {
    version: TIMELINE_VERSION,
    bucketMs: Math.max(250, Math.round(nonNegative(bucketMs, DEFAULT_BUCKET_MS))),
    buckets: [],
    mistakes: [],
  };
}

export function recordSpeedTestTimelineCharacter(timeline, {
  activeMs = 0,
  correct = false,
  extra = false,
  expected = "",
  typed = "",
  word = "",
} = {}) {
  if (!timeline?.buckets) return;
  const bucket = ensureBucket(timeline, activeMs);
  bucket.rawChars += 1;
  if (correct) {
    bucket.correctChars += 1;
    return;
  }
  bucket.incorrectChars += 1;
  addMistake(timeline, {
    activeMs,
    type: extra ? "extra" : "incorrect",
    expected,
    typed,
    word,
  });
}

export function recordSpeedTestTimelineSpace(timeline, activeMs = 0) {
  if (!timeline?.buckets) return;
  const bucket = ensureBucket(timeline, activeMs);
  bucket.rawChars += 1;
  bucket.correctChars += 1;
}

export function recordSpeedTestTimelineCorrection(timeline, {
  activeMs = 0,
  erasedCorrectChars = 0,
  wordDelete = false,
} = {}) {
  if (!timeline?.buckets) return;
  const bucket = ensureBucket(timeline, activeMs);
  bucket.backspaces += 1;
  if (wordDelete) bucket.wordDeletes += 1;
  bucket.correctedCharsErased += Math.round(nonNegative(erasedCorrectChars));
}

export function recordSpeedTestTimelineMissedCharacters(timeline, {
  activeMs = 0,
  count = 0,
  expected = "",
  typed = "",
  word = "",
} = {}) {
  if (!timeline?.buckets) return;
  const missed = Math.round(nonNegative(count));
  if (missed <= 0) return;
  const bucket = ensureBucket(timeline, activeMs);
  bucket.missedChars += missed;
  addMistake(timeline, {
    activeMs,
    type: "missed",
    count: missed,
    expected,
    typed,
    word,
  });
}

function buildPoint(bucket, index, activeDurationMs, bucketMs) {
  const startMs = index * bucketMs;
  const durationMs = Math.min(bucketMs, Math.max(0, activeDurationMs - startMs));
  const netCorrectChars = Math.max(0, bucket.correctChars - bucket.correctedCharsErased);
  const errors = bucket.incorrectChars + bucket.missedChars;
  const accuracyDenominator = bucket.correctChars + errors;
  return {
    second: index + 1,
    startMs,
    elapsedMs: Math.round(startMs + durationMs),
    durationMs: Math.round(durationMs),
    wpm: roundMetric(wpmFromCharacters(netCorrectChars, durationMs)),
    rawWpm: roundMetric(wpmFromCharacters(bucket.rawChars, durationMs)),
    accuracy: accuracyDenominator > 0
      ? roundMetric((bucket.correctChars / accuracyDenominator) * 100)
      : 100,
    errors,
    backspaces: bucket.backspaces,
    wordDeletes: bucket.wordDeletes,
    correctChars: bucket.correctChars,
    netCorrectChars,
    rawChars: bucket.rawChars,
    correctedCharsErased: bucket.correctedCharsErased,
    missedChars: bucket.missedChars,
  };
}

function rollingFiveSecondAnalysis(points) {
  if (points.length < 5) {
    return {
      fastest5sWpm: null,
      fastest5sStartSecond: null,
      slowest5sWpm: null,
      slowest5sStartSecond: null,
    };
  }
  let fastest = null;
  let slowest = null;
  for (let start = 0; start <= points.length - 5; start += 1) {
    const window = points.slice(start, start + 5);
    const durationMs = window.reduce((sum, point) => sum + point.durationMs, 0);
    if (durationMs < 4900) continue;
    const characters = window.reduce((sum, point) => sum + point.netCorrectChars, 0);
    const value = roundMetric(wpmFromCharacters(characters, durationMs));
    const item = { value, startSecond: window[0].second };
    if (!fastest || item.value > fastest.value) fastest = item;
    if (!slowest || item.value < slowest.value) slowest = item;
  }
  return {
    fastest5sWpm: fastest?.value ?? null,
    fastest5sStartSecond: fastest?.startSecond ?? null,
    slowest5sWpm: slowest?.value ?? null,
    slowest5sStartSecond: slowest?.startSecond ?? null,
  };
}

export function finalizeSpeedTestTimeline(timeline, activeDurationMs = 0) {
  if (!timeline?.buckets) return null;
  const duration = nonNegative(activeDurationMs);
  if (duration <= 0) return null;
  const bucketMs = Math.max(250, Math.round(nonNegative(timeline.bucketMs, DEFAULT_BUCKET_MS)));
  const pointCount = Math.min(MAX_TIMELINE_POINTS, Math.max(1, Math.ceil(duration / bucketMs)));
  while (timeline.buckets.length < pointCount) ensureBucket(timeline, timeline.buckets.length * bucketMs);
  const points = timeline.buckets
    .slice(0, pointCount)
    .map((bucket, index) => buildPoint(bucket, index, duration, bucketMs));
  const peak = points.reduce((best, point) => point.wpm > best.wpm ? point : best, points[0]);
  const rolling = rollingFiveSecondAnalysis(points);
  const mistakes = timeline.mistakes
    .filter((mistake) => mistake.timeMs <= duration + 1)
    .slice(0, MAX_MISTAKES)
    .map((mistake) => ({ ...mistake }));
  return Object.freeze({
    version: TIMELINE_VERSION,
    bucketMs,
    activeDurationMs: Math.round(duration),
    points: Object.freeze(points.map((point) => Object.freeze(point))),
    mistakes: Object.freeze(mistakes.map((mistake) => Object.freeze(mistake))),
    analysis: Object.freeze({
      peakWpm: peak?.wpm ?? 0,
      peakSecond: peak?.second ?? null,
      ...rolling,
    }),
  });
}

function sanitizeStoredTimeline(value) {
  if (!value || value.version !== TIMELINE_VERSION || !Array.isArray(value.points)) return null;
  const bucketMs = Math.max(250, Math.round(nonNegative(value.bucketMs, DEFAULT_BUCKET_MS)));
  const points = value.points.slice(0, MAX_TIMELINE_POINTS).map((point, index) => ({
    second: index + 1,
    startMs: Math.round(nonNegative(point?.startMs, index * bucketMs)),
    elapsedMs: Math.round(nonNegative(point?.elapsedMs, (index + 1) * bucketMs)),
    durationMs: Math.min(bucketMs, Math.round(nonNegative(point?.durationMs, bucketMs))),
    wpm: roundMetric(point?.wpm),
    rawWpm: roundMetric(point?.rawWpm),
    accuracy: Math.max(0, Math.min(100, roundMetric(point?.accuracy, 100))),
    errors: Math.round(nonNegative(point?.errors)),
    backspaces: Math.round(nonNegative(point?.backspaces)),
    wordDeletes: Math.round(nonNegative(point?.wordDeletes)),
    correctChars: Math.round(nonNegative(point?.correctChars)),
    netCorrectChars: Math.round(nonNegative(point?.netCorrectChars)),
    rawChars: Math.round(nonNegative(point?.rawChars)),
    correctedCharsErased: Math.round(nonNegative(point?.correctedCharsErased)),
    missedChars: Math.round(nonNegative(point?.missedChars)),
  }));
  if (!points.length) return null;
  const mistakes = Array.isArray(value.mistakes)
    ? value.mistakes.slice(0, MAX_MISTAKES).map((mistake) => ({
      timeMs: Math.round(nonNegative(mistake?.timeMs)),
      second: Math.max(1, Math.round(nonNegative(mistake?.second, 1))),
      type: ["incorrect", "extra", "missed"].includes(mistake?.type) ? mistake.type : "incorrect",
      count: Math.max(1, Math.round(nonNegative(mistake?.count, 1))),
      expected: typeof mistake?.expected === "string" ? mistake.expected.slice(0, 24) : "",
      typed: typeof mistake?.typed === "string" ? mistake.typed.slice(0, 24) : "",
      word: typeof mistake?.word === "string" ? mistake.word.slice(0, 48) : "",
    }))
    : [];
  return {
    version: TIMELINE_VERSION,
    bucketMs,
    activeDurationMs: Math.round(nonNegative(value.activeDurationMs)),
    points,
    mistakes,
    analysis: {
      peakWpm: roundMetric(value.analysis?.peakWpm),
      peakSecond: value.analysis?.peakSecond == null ? null : Math.max(1, Math.round(nonNegative(value.analysis.peakSecond, 1))),
      fastest5sWpm: value.analysis?.fastest5sWpm == null ? null : roundMetric(value.analysis.fastest5sWpm),
      fastest5sStartSecond: value.analysis?.fastest5sStartSecond == null ? null : Math.max(1, Math.round(nonNegative(value.analysis.fastest5sStartSecond, 1))),
      slowest5sWpm: value.analysis?.slowest5sWpm == null ? null : roundMetric(value.analysis.slowest5sWpm),
      slowest5sStartSecond: value.analysis?.slowest5sStartSecond == null ? null : Math.max(1, Math.round(nonNegative(value.analysis.slowest5sStartSecond, 1))),
    },
  };
}

function readTimelineStore() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSpeedTestTimeline(sessionId, timeline, endedAt = Date.now()) {
  if (typeof sessionId !== "string" || !sessionId || !timeline) return false;
  const safeTimeline = sanitizeStoredTimeline(timeline);
  if (!safeTimeline) return false;
  try {
    const existing = readTimelineStore().filter((entry) => entry?.sessionId !== sessionId);
    const next = [{ sessionId, endedAt: nonNegative(endedAt, Date.now()), timeline: safeTimeline }, ...existing]
      .slice(0, MAX_STORED_TIMELINES);
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function loadSpeedTestTimeline(sessionId) {
  if (typeof sessionId !== "string" || !sessionId) return null;
  const entry = readTimelineStore().find((candidate) => candidate?.sessionId === sessionId);
  return sanitizeStoredTimeline(entry?.timeline);
}

export const SPEED_TEST_TIMELINE_STORAGE_KEY = STORAGE_KEY;
