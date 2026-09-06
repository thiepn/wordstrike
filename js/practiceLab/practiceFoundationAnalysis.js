import {
  analyzePracticeLatency,
  PRACTICE_LATENCY_POLICY_V1,
} from "./practiceLatencyClassifier.js";
import { analyzePracticeErrors } from "./practiceErrorAnalyzer.js";
import { createPracticeErrorTracker } from "./practiceErrorTracker.js";
import { PRACTICE_ERROR_POLICY_V1 } from "./practiceErrorPolicy.js";
import { analyzePracticeNormalization } from "./practiceNormalizationAnalysis.js";
import { PRACTICE_LEARNING_ANALYSIS_VERSION } from "./practiceLearningConstants.js";
import { createEmptyPracticeRetentionAnalysis } from "./practiceRetentionAnalysis.js";
import { createEmptyPracticeEvaluationAnalysis } from "./practiceEvaluationAnalysis.js";

export const PRACTICE_FOUNDATION_ANALYSIS_VERSION = 9;

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
    const cursorBefore = Number.isInteger(event.cursorBefore) ? event.cursorBefore : Number.isInteger(event.textPosition) ? event.textPosition : cursor;
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
  const tracker = createPracticeErrorTracker({ policy, aggregateScope: traceMetadata?.truncated ? "retained-window" : "complete-session" });
  let cursor = 0;
  for (const source of events) {
    const event = normalizeFallbackEvent(source, cursor);
    if (!event) continue;
    try { tracker.consume(event); cursor = event.cursorAfter; } catch { /* synthetic fallback only */ }
  }
  return tracker.finalizeSnapshot();
}

function emptyLearningAnalysis() {
  return freezeDeep({
    version: PRACTICE_LEARNING_ANALYSIS_VERSION,
    summary: {
      analysisVersion: PRACTICE_LEARNING_ANALYSIS_VERSION,
      observationVersion: 1,
      acquisitionObservationCount: 0,
      transferObservationCount: 0,
      completePhaseObservationCount: 0,
      partialPhaseObservationCount: 0,
      skippedCount: 0,
      learningStateUpdateCount: 0,
    },
    observationDeltas: [],
  });
}

export function buildPracticeFoundationAnalysis({
  events = [],
  traceMetadata = {},
  latencyPolicy = PRACTICE_LATENCY_POLICY_V1,
  errorPolicy = PRACTICE_ERROR_POLICY_V1,
  errorTrackerSnapshot = null,
  contentPlan = null,
  context = null,
  segmenter = null,
  normalizationOptions = {},
  skillEvidenceTracker = null,
  skillEvidenceFinalize = null,
  ability = null,
  performance = null,
  learning = null,
  retention = null,
  evaluation = null,
} = {}) {
  const latency = analyzePracticeLatency({ events, traceMetadata, policy: latencyPolicy });
  const trackerSnapshot = errorTrackerSnapshot ?? buildFallbackTrackerSnapshot(events, traceMetadata, errorPolicy);
  const errors = analyzePracticeErrors({ events, traceMetadata, trackerSnapshot, latencyAnalysis: latency, policy: errorPolicy });
  const normalization = analyzePracticeNormalization({ ...normalizationOptions, latencyAnalysis: latency, contentPlan, context, segmenter });
  const partial = { latency, errors, normalization };
  const skills = skillEvidenceTracker && skillEvidenceFinalize
    ? skillEvidenceTracker.finalize({ foundationAnalysis: partial, ...skillEvidenceFinalize })
    : freezeDeep({ version: 1, policyVersion: 1, summary: null, deltas: [] });
  return freezeDeep({
    version: PRACTICE_FOUNDATION_ANALYSIS_VERSION,
    latency,
    errors,
    normalization,
    skills,
    ability: ability ?? freezeDeep({ version: 1, channel: null, status: "not-requested", reasons: [], observation: null, sessionSummary: null }),
    performance: performance ?? freezeDeep({ version: 1, status: "not-requested", reasons: [], measurementKind: null, stateProbe: null, warmup: null, frontier: null, sessionSummary: null, performanceStateDelta: null }),
    learning: learning ?? emptyLearningAnalysis(),
    retention: retention ?? createEmptyPracticeRetentionAnalysis(),
    evaluation: evaluation ?? createEmptyPracticeEvaluationAnalysis(),
  });
}

function attach(foundationAnalysis, field, value, label) {
  if (!foundationAnalysis || foundationAnalysis.version !== PRACTICE_FOUNDATION_ANALYSIS_VERSION) throw new TypeError(`Practice ${label} attachment requires current foundation analysis`);
  if (!value || typeof value !== "object") throw new TypeError(`Practice ${label} analysis is required`);
  return freezeDeep({ ...foundationAnalysis, [field]: value });
}

export function withPracticeAbilityAnalysis(foundationAnalysis, ability) { return attach(foundationAnalysis, "ability", ability, "ability"); }
export function withPracticePerformanceAnalysis(foundationAnalysis, performance) { return attach(foundationAnalysis, "performance", performance, "performance"); }
export function withPracticeLearningAnalysis(foundationAnalysis, learning) { return attach(foundationAnalysis, "learning", learning, "learning"); }
export function withPracticeRetentionAnalysis(foundationAnalysis, retention) { return attach(foundationAnalysis, "retention", retention, "retention"); }
export function withPracticeEvaluationAnalysis(foundationAnalysis, evaluation) { return attach(foundationAnalysis, "evaluation", evaluation, "evaluation"); }
