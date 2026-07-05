import { PRACTICE_SESSION_LIMITS } from "./practiceSessionConstants.js";

function updateAggregate(aggregate, value) {
  aggregate.count += 1;
  const delta = value - aggregate.mean;
  aggregate.mean += delta / aggregate.count;
  aggregate.m2 += delta * (value - aggregate.mean);
}

function observation(map, key, defaults = {}) {
  if (!map.has(key)) map.set(key, { entityKey: key, sampleCount: 0, correctCount: 0, errorCount: 0, latencyCount: 0, latencyMeanMs: 0, latencyM2: 0, ...defaults });
  return map.get(key);
}

export function createPracticeMetricsCollector(seed = {}) {
  const counters = {
    acceptedInsertions: seed.acceptedInsertions || 0,
    correctInsertions: seed.correctInsertions || 0,
    incorrectInsertions: seed.incorrectInsertions || 0,
    spaces: seed.spaces || 0,
    backspaces: seed.backspaces || 0,
    wordDeletes: seed.wordDeletes || 0,
    ignoredCorrections: seed.ignoredCorrections || 0,
    correctedIncorrectCharacters: seed.correctedIncorrectCharacters || 0,
    deletedCorrectCharacters: seed.deletedCorrectCharacters || 0,
    correctionInputs: seed.correctionInputs || 0,
    charactersRemoved: seed.charactersRemoved || 0,
    correctionCostMs: seed.correctionCostMs || 0,
    completedUnits: seed.completedUnits || 0,
    completedWords: seed.completedWords || 0,
  };
  const transitions = { count: seed.transitionCount || 0, mean: seed.transitionMeanMs || 0, m2: seed.transitionM2 || 0 };
  const keyObservations = new Map();
  const bigramObservations = new Map();
  const trigramObservations = new Map();
  const wordObservations = [];
  const wordStartDelays = [];
  const wordCompletionDurations = [];
  const wordCorrectionCounts = new Map();
  let firstInputLatencyMs = seed.firstInputLatencyMs ?? null;
  let longestInputHesitationMs = seed.longestInputHesitationMs || 0;
  let lastInsertionMono = seed.lastInsertionMono ?? null;
  let correctionStartedActiveMs = null;

  const recordSequence = (map, key, correct, latency) => {
    const item = observation(map, key);
    item.sampleCount += 1;
    if (correct) item.correctCount += 1;
    else item.errorCount += 1;
    if (Number.isFinite(latency) && latency >= 0) {
      const aggregate = { count: item.latencyCount, mean: item.latencyMeanMs, m2: item.latencyM2 };
      updateAggregate(aggregate, latency);
      item.latencyCount = aggregate.count;
      item.latencyMeanMs = aggregate.mean;
      item.latencyM2 = aggregate.m2;
    }
  };

  return Object.freeze({
    recordInsertion({ value, expected, correct, position, expectedGraphemes, monotonicMs, activeMs, performanceStartMono, unit }) {
      counters.acceptedInsertions += 1;
      counters.correctInsertions += correct ? 1 : 0;
      counters.incorrectInsertions += correct ? 0 : 1;
      counters.spaces += value === " " ? 1 : 0;
      if (firstInputLatencyMs == null && Number.isFinite(performanceStartMono)) firstInputLatencyMs = Math.max(0, monotonicMs - performanceStartMono);
      const latency = lastInsertionMono == null ? null : activeMs - lastInsertionMono;
      if (Number.isFinite(latency) && latency >= 0) {
        longestInputHesitationMs = Math.max(longestInputHesitationMs, latency);
        if (latency <= PRACTICE_SESSION_LIMITS.inactiveTransitionMs) updateAggregate(transitions, latency);
      }
      if (correctionStartedActiveMs != null) {
        counters.correctionCostMs += Math.max(0, activeMs - correctionStartedActiveMs);
        correctionStartedActiveMs = null;
      }
      recordSequence(keyObservations, expected, correct, latency);
      if (position >= 1) recordSequence(bigramObservations, expectedGraphemes.slice(position - 1, position + 1).join(""), correct, latency);
      if (position >= 2) recordSequence(trigramObservations, expectedGraphemes.slice(position - 2, position + 1).join(""), correct, latency);
      if (unit && position === unit.startIndex) {
        const delay = Number.isFinite(latency) ? latency : firstInputLatencyMs;
        if (Number.isFinite(delay)) wordStartDelays.push(delay);
      }
      lastInsertionMono = activeMs;
      return latency;
    },
    recordCorrection({ type, policy, removed, activeMs }) {
      counters.correctionInputs += 1;
      counters.backspaces += type === "backspace" ? 1 : 0;
      counters.wordDeletes += type === "word-delete" ? 1 : 0;
      if (policy === "ignore") counters.ignoredCorrections += 1;
      if (removed?.length) {
        counters.charactersRemoved += removed.length;
        counters.correctedIncorrectCharacters += removed.filter((entry) => !entry.correct).length;
        counters.deletedCorrectCharacters += removed.filter((entry) => entry.correct).length;
        correctionStartedActiveMs ??= activeMs;
        for (const entry of removed) {
          if (entry.unitId) wordCorrectionCounts.set(entry.unitId, (wordCorrectionCounts.get(entry.unitId) || 0) + 1);
        }
      }
    },
    recordUnitCompletion(unit, typedEntries, activeMs) {
      counters.completedUnits += 1;
      if (unit.type === "word") counters.completedWords += 1;
      const entries = typedEntries.slice(unit.startIndex, unit.endIndex);
      const startedAt = entries[0]?.insertedAt;
      const duration = Number.isFinite(startedAt) ? Math.max(0, activeMs - startedAt) : 0;
      if (unit.type === "word") {
        wordCompletionDurations.push(duration);
        wordObservations.push({
          entityKey: unit.text,
          wordStartDelayMs: wordStartDelays.at(-1) ?? null,
          completionDurationMs: duration,
          correct: entries.every((entry) => entry.correct),
          correctionCount: wordCorrectionCounts.get(unit.unitId) || 0,
        });
      }
    },
    snapshot({ activeDurationMs = 0, pausedDurationMs = 0, wallDurationMs = 0, finalTypedEntries = [] } = {}) {
      const minutes = activeDurationMs / 60000;
      const finalCorrect = finalTypedEntries.filter((entry) => entry.correct).length;
      const uncorrectedErrors = finalTypedEntries.filter((entry) => !entry.correct).length;
      const variance = transitions.count > 1 ? transitions.m2 / (transitions.count - 1) : null;
      const standardDeviation = variance == null ? null : Math.sqrt(Math.max(0, variance));
      const consistency = transitions.count >= PRACTICE_SESSION_LIMITS.consistencyMinimumSamples && transitions.mean > 0
        ? Math.max(0, Math.min(100, 100 - (standardDeviation / transitions.mean) * 100))
        : null;
      return Object.freeze({
        ...counters,
        uncorrectedErrors,
        activeDurationMs,
        pausedDurationMs,
        wallDurationMs,
        firstInputLatencyMs,
        longestInputHesitationMs,
        transitionCount: transitions.count,
        transitionMeanMs: transitions.mean,
        transitionVariance: variance,
        consistency,
        rawWpm: minutes > 0 ? (counters.acceptedInsertions / 5) / minutes : 0,
        wpm: minutes > 0 ? (finalCorrect / 5) / minutes : 0,
        accuracy: counters.acceptedInsertions > 0 ? (counters.correctInsertions / counters.acceptedInsertions) * 100 : 100,
        wordStartDelays: Object.freeze(wordStartDelays.slice(-64)),
        wordCompletionDurations: Object.freeze(wordCompletionDurations.slice(-64)),
      });
    },
    observations() {
      const freezeMap = (map, entityType) => Object.freeze([...map.values()].map((item) => Object.freeze({ entityType, ...item })));
      return Object.freeze({
        keys: freezeMap(keyObservations, "key"),
        bigrams: freezeMap(bigramObservations, "bigram"),
        trigrams: freezeMap(trigramObservations, "trigram"),
        words: Object.freeze(wordObservations.map((item) => Object.freeze({ entityType: "word", ...item }))),
      });
    },
    checkpointSnapshot() {
      return {
        ...counters,
        transitionCount: transitions.count,
        transitionMeanMs: transitions.mean,
        transitionM2: transitions.m2,
        firstInputLatencyMs,
        longestInputHesitationMs,
        lastInsertionMono,
      };
    },
  });
}
