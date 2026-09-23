const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const FLOW_CADENCE_RULES = Object.freeze({
  minimumIntervals: 5,
  pauseFloorMs: 500,
  pauseRatio: 3,
  burstFloorMs: 35,
  burstRatio: 0.5,
  variabilityWeight: 75,
  pauseWeight: 100,
  burstWeight: 70,
});

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function cadenceBoundarySet(run) {
  return new Set(run?.cadenceExcludedAfterIndexes || []);
}

function buildUninterruptedIntervals(run) {
  const intervals = [];
  const excludedAfterIndexes = cadenceBoundarySet(run);
  let previousInsert = null;
  let interrupted = false;
  for (const event of run?.rawKeystrokes || []) {
    if (event.type === "backspace") {
      interrupted = true;
      continue;
    }
    if (event.type !== "insert") continue;
    if (previousInsert && !interrupted && !excludedAfterIndexes.has(previousInsert.index)) {
      const ms = Number(event.at) - Number(previousInsert.at);
      if (Number.isFinite(ms) && ms > 0 && ms < 60000) {
        intervals.push(Object.freeze({
          fromIndex: previousInsert.index,
          toIndex: event.index,
          ms,
          expected: event.expected,
        }));
      }
    }
    previousInsert = event;
    interrupted = false;
  }
  return intervals;
}

function cadenceLabel(score) {
  if (score == null) return "Warming up";
  if (score >= 92) return "Locked in";
  if (score >= 82) return "Steady";
  if (score >= 70) return "Variable";
  return "Uneven";
}

function classifyCadence(intervals) {
  const values = intervals.map(({ ms }) => ms);
  if (!values.length) {
    return {
      cadenceScore: null,
      cadenceLabel: cadenceLabel(null),
      baselineIntervalMs: null,
      variabilityRatio: null,
      pauseThresholdMs: null,
      pauseCount: 0,
      pauseRatePercent: 0,
      burstThresholdMs: null,
      burstCount: 0,
      burstRatePercent: 0,
      pauseEvents: [],
      burstEvents: [],
    };
  }

  const baselineIntervalMs = median(values);
  const pauseThresholdMs = Math.max(
    FLOW_CADENCE_RULES.pauseFloorMs,
    baselineIntervalMs * FLOW_CADENCE_RULES.pauseRatio,
  );
  const pauseEvents = intervals.filter(({ ms }) => ms > pauseThresholdMs);
  const normalValues = values.filter((ms) => ms <= pauseThresholdMs);
  const stableBaseline = median(normalValues.length ? normalValues : values) || baselineIntervalMs;
  const absoluteDeviations = normalValues.map((ms) => Math.abs(ms - stableBaseline));
  const variabilityRatio = stableBaseline > 0 ? median(absoluteDeviations) / stableBaseline : 0;
  const burstThresholdMs = Math.max(
    FLOW_CADENCE_RULES.burstFloorMs,
    stableBaseline * FLOW_CADENCE_RULES.burstRatio,
  );
  const burstEvents = intervals.filter(({ ms }) => ms < burstThresholdMs);
  const pauseRate = pauseEvents.length / intervals.length;
  const burstRate = burstEvents.length / intervals.length;

  let cadenceScore = null;
  if (intervals.length >= FLOW_CADENCE_RULES.minimumIntervals) {
    const variabilityPenalty = Math.min(55, variabilityRatio * FLOW_CADENCE_RULES.variabilityWeight);
    const pausePenalty = Math.min(25, pauseRate * FLOW_CADENCE_RULES.pauseWeight);
    const burstPenalty = Math.min(20, burstRate * FLOW_CADENCE_RULES.burstWeight);
    cadenceScore = Math.round(clamp(100 - variabilityPenalty - pausePenalty - burstPenalty, 0, 100));
  }

  return {
    cadenceScore,
    cadenceLabel: cadenceLabel(cadenceScore),
    baselineIntervalMs: round(stableBaseline, 1),
    variabilityRatio: round(variabilityRatio, 4),
    pauseThresholdMs: round(pauseThresholdMs, 1),
    pauseCount: pauseEvents.length,
    pauseRatePercent: round(pauseRate * 100, 1),
    burstThresholdMs: round(burstThresholdMs, 1),
    burstCount: burstEvents.length,
    burstRatePercent: round(burstRate * 100, 1),
    pauseEvents: pauseEvents.map((event) => ({ ...event, ratio: round(event.ms / stableBaseline, 2) })),
    burstEvents: burstEvents.map((event) => ({ ...event, ratio: round(event.ms / stableBaseline, 2) })),
  };
}

function deliberatePauseMs(run) {
  return (run?.pauses || []).reduce((total, pause) => {
    if (pause?.reason !== "chapter-transition") return total;
    const startAt = Number(pause.startAt);
    const endAt = Number(pause.endAt);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return total;
    return total + (endAt - startAt);
  }, 0);
}

function typingDurationMs(run) {
  const start = Number(run?.startedAt);
  if (!Number.isFinite(start)) return 0;
  const raw = run?.rawKeystrokes || [];
  const completedAt = run?.completedAt;
  const finalAt = completedAt != null && Number.isFinite(Number(completedAt))
    ? Number(completedAt)
    : Number(raw.at(-1)?.at);
  if (!Number.isFinite(finalAt) || finalAt <= start) return 0;
  return Math.max(0, (finalAt - start) - deliberatePauseMs(run));
}

function getWpm(run) {
  const durationMs = typingDurationMs(run);
  if (durationMs <= 0) return { rawWpm: 0, finalWpm: 0, typingDurationMs: 0 };
  const minutes = durationMs / 60000;
  const inserted = (run?.rawKeystrokes || []).filter((event) => event.type === "insert").length;
  return {
    rawWpm: round((inserted / 5) / minutes, 1),
    finalWpm: round(((run?.correctChars || 0) / 5) / minutes, 1),
    typingDurationMs: round(durationMs, 1),
  };
}

function finalEntry(run, index) {
  const entry = run?.typedCharacters?.[index];
  return entry && entry.index === index ? entry : null;
}

function latency(run, fromIndex, toIndex, excludedAfterIndexes = null) {
  const boundaries = excludedAfterIndexes || cadenceBoundarySet(run);
  if (boundaries.has(fromIndex)) return null;
  const from = finalEntry(run, fromIndex);
  const to = finalEntry(run, toIndex);
  if (!from || !to) return null;
  const value = Number(to.at) - Number(from.at);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function nextNonSpaceIndex(text, index) {
  let cursor = index + 1;
  while (cursor < text.length && text[cursor] === " ") cursor += 1;
  return cursor < text.length ? cursor : -1;
}

function previousWordIndex(text, index) {
  let cursor = index - 1;
  while (cursor >= 0 && !/[A-Za-z0-9]/.test(text[cursor])) cursor -= 1;
  return cursor;
}

function collectFeatureLatencies(run) {
  const text = run?.passage || "";
  const excludedAfterIndexes = cadenceBoundarySet(run);
  const groups = new Map([
    ["word-transition", { label: "Word transitions", values: [] }],
    ["after-comma", { label: "After commas", values: [] }],
    ["after-sentence", { label: "After sentence endings", values: [] }],
    ["after-semicolon-colon", { label: "After ; or :", values: [] }],
    ["capitals", { label: "Capital letters", values: [] }],
    ["apostrophes", { label: "Apostrophes", values: [] }],
    ["quotes", { label: "Quotation marks", values: [] }],
    ["numbers", { label: "Numbers", values: [] }],
  ]);

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const current = finalEntry(run, index);
    if (!current) continue;

    if (/[A-Za-z0-9]/.test(character) && (index === 0 || !/[A-Za-z0-9'’]/.test(text[index - 1]))) {
      const previous = previousWordIndex(text, index);
      if (previous >= 0) {
        const value = latency(run, previous, index, excludedAfterIndexes);
        if (value != null) groups.get("word-transition").values.push(value);
      }
    }

    if (/[A-Z]/.test(character) && index > 0) {
      const value = latency(run, index - 1, index, excludedAfterIndexes);
      if (value != null) groups.get("capitals").values.push(value);
    }
    if (/[0-9]/.test(character) && index > 0) {
      const value = latency(run, index - 1, index, excludedAfterIndexes);
      if (value != null) groups.get("numbers").values.push(value);
    }
    if (["'", "’"].includes(character) && index > 0) {
      const value = latency(run, index - 1, index, excludedAfterIndexes);
      if (value != null) groups.get("apostrophes").values.push(value);
    }
    if (["\"", "“", "”"].includes(character) && index > 0) {
      const value = latency(run, index - 1, index, excludedAfterIndexes);
      if (value != null) groups.get("quotes").values.push(value);
    }

    const punctuationKey = character === ","
      ? "after-comma"
      : /[.!?]/.test(character)
        ? "after-sentence"
        : /[;:]/.test(character)
          ? "after-semicolon-colon"
          : null;
    if (punctuationKey) {
      const next = nextNonSpaceIndex(text, index);
      if (next >= 0) {
        const value = latency(run, index, next, excludedAfterIndexes);
        if (value != null) groups.get(punctuationKey).values.push(value);
      }
    }
  }

  return groups;
}

function summarizeFeatureLatencies(run, baselineIntervalMs) {
  const groups = collectFeatureLatencies(run);
  const summaries = [];
  for (const [key, group] of groups.entries()) {
    if (!group.values.length) continue;
    const medianMs = median(group.values);
    summaries.push(Object.freeze({
      key,
      label: group.label,
      sampleCount: group.values.length,
      medianMs: round(medianMs, 1),
      averageMs: round(mean(group.values), 1),
      deltaMs: baselineIntervalMs == null ? null : round(medianMs - baselineIntervalMs, 1),
    }));
  }
  return summaries;
}

function correctionCost(run) {
  const values = (run?.correctionTimings || [])
    .map((entry) => Number(entry.correctionDelayMs))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return Object.freeze({
    count: values.length,
    totalMs: round(values.reduce((sum, value) => sum + value, 0), 1),
    medianMs: round(median(values), 1),
    averageMs: round(mean(values), 1),
  });
}

export function analyzeFlowCadence(run) {
  if (!run) return null;
  const intervals = buildUninterruptedIntervals(run);
  const cadence = classifyCadence(intervals);
  const featureLatencies = summarizeFeatureLatencies(run, cadence.baselineIntervalMs);
  const slowestHesitations = featureLatencies
    .filter(({ deltaMs }) => deltaMs != null && deltaMs > 0)
    .sort((a, b) => b.deltaMs - a.deltaMs)
    .slice(0, 3);
  const speed = getWpm(run);

  return Object.freeze({
    sampleCount: intervals.length,
    ...cadence,
    ...speed,
    correctionCost: correctionCost(run),
    featureLatencies,
    slowestHesitations,
  });
}
