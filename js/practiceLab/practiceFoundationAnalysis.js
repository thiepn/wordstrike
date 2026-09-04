import {
  analyzePracticeLatency,
  PRACTICE_LATENCY_POLICY_V1,
} from "./practiceLatencyClassifier.js";
import { analyzePracticeErrors } from "./practiceErrorAnalyzer.js";
import { createPracticeErrorTracker } from "./practiceErrorTracker.js";
import { PRACTICE_ERROR_POLICY_V1 } from "./practiceErrorPolicy.js";

export const PRACTICE_FOUNDATION_ANALYSIS_VERSION = 2;

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function normalizeFallbackEvent(event, cursor) {
  if (!event || typeof event !== "object") return null;
  const insertion = event.type === "character" || event.type === "space";
  const correction = event.type === "backspace" || event.type === "word-delete";
  if (!insertion && !correction) return null;
  if (insertion) {
    const cursorBefore = Number.isInteger(event.cursorBefore)
      ? event.cursorBefore
      : Number.isInteger(event.textPosition) ? event.textPosition : cursor;
    return { ...event, cursorBefore, cursorAfter: Number.isInteger(event.cursorAfter) ? event.cursorAfter : cursorBefore + 1 };
  }
  const cursorAfter = Number.isInteger(event.cursorAfter) ? event.cursorAfter : cursor;
  const cursorBefore = Number.isInteger(event.cursorBefore) ? event.cursorBefore : cursorAfter;
  return {
    ...event,
    cursorBefore,
    cursorAfter,
    removedCount: Number.isInteger(event.removedCount) ? event.removedCount : Math.max(0, cursorBefore - cursorAfter),
    removedIncorrectCount: Number.isInteger(event.removedIncorrectCount) ? event.removedIncorrectCount : 0,
    removedCorrectCount: Number.isInteger(event.removedCorrectCount) ? event.removedCorrectCount : 0,
    correctionPolicy: event.correctionPolicy ?? "allow",
  };
}

function buildFallbackTrackerSnapshot(events, traceMetadata, policy) {
  const tracker = createPracticeErrorTracker({
    policy,
    aggregateScope: traceMetadata?.truncated ? "retained-window" : "complete-session",
  });
  let cursor = 0;
  for (const source of events) {
    const event = normalizeFallbackEvent(source, cursor);
    if (!event) continue;
    try {
      tracker.consume(event);
      cursor = event.cursorAfter;
    } catch {
      // Live PL9 sessions supply streaming state; this is only a legacy/synthetic fallback.
    }
  }
  return tracker.finalizeSnapshot();
}

export function buildPracticeFoundationAnalysis({
  events = [],
  traceMetadata = {},
  latencyPolicy = PRACTICE_LATENCY_POLICY_V1,
  errorPolicy = PRACTICE_ERROR_POLICY_V1,
  errorTrackerSnapshot = null,
} = {}) {
  const latency = analyzePracticeLatency({ events, traceMetadata, policy: latencyPolicy });
  const trackerSnapshot = errorTrackerSnapshot ?? buildFallbackTrackerSnapshot(events, traceMetadata, errorPolicy);
  const errors = analyzePracticeErrors({
    events,
    traceMetadata,
    trackerSnapshot,
    latencyAnalysis: latency,
    policy: errorPolicy,
  });
  return freezeDeep({ version: PRACTICE_FOUNDATION_ANALYSIS_VERSION, latency, errors });
}
