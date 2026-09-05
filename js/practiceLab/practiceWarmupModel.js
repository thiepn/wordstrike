import { PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS, PRACTICE_WARMUP_MODEL_VERSION, PRACTICE_WARMUP_STATUSES } from "./practicePerformanceConstants.js";
import { PRACTICE_WARMUP_POLICY_V1 } from "./practicePerformancePolicy.js";
import { practiceMad, practiceMedian } from "./practiceRobustStats.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const insertion = (event) => event?.type === "character" || event?.type === "space";
const correct = (event) => event?.correctness === "correct" || event?.correctness === true;

function windowConfidence(validWindowCount, controlDegraded) {
  if (validWindowCount >= 4 && !controlDegraded) return "high";
  if (validWindowCount >= 3) return "medium";
  if (validWindowCount >= 2) return "low";
  return "none";
}

export function analyzePracticeWarmup({
  events = [],
  traceMetadata = {},
  latencyAnalysis = null,
  session,
  referenceChannel,
  policy = PRACTICE_WARMUP_POLICY_V1,
} = {}) {
  if (traceMetadata?.truncated) return freezeDeep({ available: false, reason: "trace-truncated", observation: null, windows: [] });
  if (!Number.isFinite(session?.activeDurationMs) || session.activeDurationMs < policy.minimumProbeDurationMs) return freezeDeep({ available: false, reason: "duration", observation: null, windows: [] });
  const horizon = Math.min(session.activeDurationMs, policy.maximumAnalysisDurationMs);
  const fullWindowCount = Math.floor(horizon / policy.windowDurationMs);
  if (fullWindowCount < 2) return freezeDeep({ available: false, reason: "duration", observation: null, windows: [] });

  const byEventIndex = new Map(events.map((event) => [event?.eventIndex, event]));
  const fluentByWindow = Array.from({ length: fullWindowCount }, () => []);
  for (const transition of latencyAnalysis?.classifiedTransitions ?? []) {
    if (transition?.classification !== "fluent" || transition?.isFirstAttempt !== true || !Number.isFinite(transition?.latencyMs)) continue;
    const event = byEventIndex.get(transition.eventIndex);
    const activeMs = event?.relativeActiveTimestampMs;
    if (!Number.isFinite(activeMs) || activeMs < 0 || activeMs >= fullWindowCount * policy.windowDurationMs) continue;
    fluentByWindow[Math.floor(activeMs / policy.windowDurationMs)].push(transition.latencyMs);
  }

  const windows = Array.from({ length: fullWindowCount }, (_, index) => {
    const startMs = index * policy.windowDurationMs;
    const endMs = startMs + policy.windowDurationMs;
    const attempts = events.filter((event) => insertion(event) && event?.isFirstAttempt === true && Number.isFinite(event?.relativeActiveTimestampMs) && event.relativeActiveTimestampMs >= startMs && event.relativeActiveTimestampMs < endMs);
    const correctAttempts = attempts.filter(correct).length;
    const firstPassWpm = (correctAttempts / 5) / (policy.windowDurationMs / 60_000);
    const firstPassAccuracy = attempts.length ? 100 * correctAttempts / attempts.length : null;
    const valid = attempts.length >= policy.minimumFirstPassAttemptsPerWindow;
    return freezeDeep({
      index,
      startMs,
      endMs,
      firstPassAttemptCount: attempts.length,
      correctFirstPassCount: correctAttempts,
      firstPassWpm,
      firstPassAccuracy,
      fluentMedianMs: fluentByWindow[index].length ? practiceMedian(fluentByWindow[index]) : null,
      valid,
    });
  });
  const validWindows = windows.filter((window) => window.valid && window.firstPassWpm > 0 && Number.isFinite(window.firstPassAccuracy));
  if (validWindows.length < 3) return freezeDeep({ available: false, reason: "insufficient-windows", observation: null, windows });
  const early = validWindows[0];
  const lateWindows = validWindows.slice(-policy.lateWindowCount);
  const lateFirstPassWpm = practiceMedian(lateWindows.map((window) => window.firstPassWpm));
  const lateAccuracy = practiceMedian(lateWindows.map((window) => window.firstPassAccuracy));
  const warmupGainLog = Math.log(lateFirstPassWpm / early.firstPassWpm);
  const warmupGainRelative = Math.exp(warmupGainLog) - 1;
  const controlDegraded = lateAccuracy < early.firstPassAccuracy - policy.maximumCleanAccuracyDropPp;
  const lateFluentValues = lateWindows.map((window) => window.fluentMedianMs).filter(Number.isFinite);
  const lateFluentMedian = lateFluentValues.length ? practiceMedian(lateFluentValues) : null;
  const fluentSpeedGainLog = Number.isFinite(early.fluentMedianMs) && early.fluentMedianMs > 0 && Number.isFinite(lateFluentMedian) && lateFluentMedian > 0
    ? Math.log(early.fluentMedianMs / lateFluentMedian)
    : null;

  const stable = (window) => Math.abs(window.firstPassWpm / lateFirstPassWpm - 1) <= policy.stablePaceRelativeTolerance
    && window.firstPassAccuracy >= lateAccuracy - policy.stableAccuracyDropPp;
  let warmupDurationMs = null;
  for (let index = 0; index < validWindows.length - 1; index += 1) {
    if (stable(validWindows[index]) && stable(validWindows[index + 1])) {
      warmupDurationMs = validWindows[index].startMs;
      break;
    }
  }
  const observation = freezeDeep({
    version: PRACTICE_WARMUP_MODEL_VERSION,
    sessionId: session.sessionId,
    completedAtUtc: session.completedAtUtc,
    localDayKey: session.localDayKey,
    referenceChannel,
    earlyFirstPassWpm: early.firstPassWpm,
    lateFirstPassWpm,
    warmupGainLog,
    warmupGainRelative,
    earlyAccuracy: early.firstPassAccuracy,
    lateAccuracy,
    fluentSpeedGainLog,
    warmupDurationMs,
    controlDegraded,
    confidence: windowConfidence(validWindows.length, controlDegraded),
  });
  return freezeDeep({ available: true, reason: null, observation, windows });
}

export function buildPracticeWarmupModel(observations = [], policy = PRACTICE_WARMUP_POLICY_V1) {
  const bounded = [...observations].slice(-policy.maximumObservationsPerChannel);
  const valid = bounded.filter((item) => Number.isFinite(item?.warmupGainLog) && Number.isFinite(item?.warmupGainRelative));
  const sampleCount = valid.length;
  const dayCount = new Set(valid.map((item) => item.localDayKey).filter(Boolean)).size;
  if (!sampleCount) return freezeDeep({
    modelVersion: PRACTICE_WARMUP_MODEL_VERSION,
    status: "insufficient-data",
    confidence: "none",
    sampleCount: 0,
    dayCount: 0,
    typicalWarmupGainLog: null,
    typicalWarmupGainRelative: null,
    warmupGainMadLog: null,
    typicalWarmupDurationMs: null,
    plateauEstimateFraction: null,
    controlDegradedFraction: null,
  });
  const medianLog = practiceMedian(valid.map((item) => item.warmupGainLog));
  const madLog = practiceMad(valid.map((item) => item.warmupGainLog));
  const medianRelative = Math.exp(medianLog) - 1;
  const durations = valid.map((item) => item.warmupDurationMs).filter(Number.isFinite);
  const plateauEstimateFraction = durations.length / sampleCount;
  const degradedFraction = valid.filter((item) => item.controlDegraded).length / sampleCount;
  const sufficient = sampleCount >= policy.minimumModelObservations && dayCount >= policy.minimumModelDays && degradedFraction < 0.5;
  let status = "insufficient-data";
  if (sufficient) status = medianRelative >= policy.minimumMeaningfulWarmupGain ? "observed" : "none-observed";
  let confidence = "low";
  if (sufficient) confidence = "medium";
  if (
    sufficient
    && sampleCount >= policy.highConfidenceObservations
    && dayCount >= policy.highConfidenceDays
    && Number.isFinite(madLog)
    && madLog <= policy.highConfidenceMaximumGainMadLog
    && plateauEstimateFraction >= policy.highConfidenceMinimumPlateauFraction
  ) confidence = "high";
  if (!PRACTICE_WARMUP_STATUSES.includes(status) || !PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS.includes(confidence)) throw new TypeError("Practice warm-up model produced an invalid state");
  return freezeDeep({
    modelVersion: PRACTICE_WARMUP_MODEL_VERSION,
    status,
    confidence,
    sampleCount,
    dayCount,
    typicalWarmupGainLog: medianLog,
    typicalWarmupGainRelative: medianRelative,
    warmupGainMadLog: madLog,
    typicalWarmupDurationMs: durations.length ? practiceMedian(durations) : null,
    plateauEstimateFraction,
    controlDegradedFraction: degradedFraction,
  });
}
