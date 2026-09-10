import { PRACTICE_COMMON_WORD_BANDS } from "./practiceCommonWordsConstants.js";
import { practiceMedian } from "./practiceRobustStats.js";

const INSERTION_TYPES = new Set(["character", "space"]);
const finite = Number.isFinite;
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const correct = (event) => event?.correctness === "correct" || event?.correctness === true;

function firstAttemptsByPosition(eventTrace) {
  const map = new Map();
  for (const event of Array.isArray(eventTrace) ? eventTrace : []) {
    if (!INSERTION_TYPES.has(event?.type) || event?.isFirstAttempt !== true || !Number.isInteger(event?.textPosition)) continue;
    if (!map.has(event.textPosition)) map.set(event.textPosition, event);
  }
  return map;
}
function normalizedByPosition(foundationAnalysis) {
  const map = new Map();
  for (const transition of foundationAnalysis?.normalization?.normalizedTransitions ?? []) {
    if (transition?.isFirstAttempt === true && Number.isInteger(transition?.textPosition) && !map.has(transition.textPosition)) map.set(transition.textPosition, transition);
  }
  return map;
}
function timing(positions, firstAttempts, normalized) {
  let eligibleCount = 0; let disfluentCount = 0; const residuals = [];
  for (const position of positions) {
    const event = firstAttempts.get(position); const transition = normalized.get(position);
    if (!event || !transition || !["fluent", "disfluent"].includes(transition.latencyClass)) continue;
    eligibleCount += 1;
    if (transition.latencyClass === "disfluent") disfluentCount += 1;
    if (correct(event) && transition.latencyClass === "fluent" && finite(transition.residualLatencyMs)) residuals.push(transition.residualLatencyMs);
  }
  return freezeDeep({
    eligibleCount,
    residualMedianMs: residuals.length ? practiceMedian(residuals) : null,
    residualCount: residuals.length,
    disfluencyRate: eligibleCount ? disfluentCount / eligibleCount : null,
    disfluentCount,
  });
}

export function buildPracticeCommonWordBandMetrics({ eventTrace = [], foundationAnalysis = null, contentPlan } = {}) {
  const firstAttempts = firstAttemptsByPosition(eventTrace); const normalized = normalizedByPosition(foundationAnalysis);
  const result = {};
  for (const band of PRACTICE_COMMON_WORD_BANDS) {
    const units = (contentPlan?.units ?? []).filter((unit) => unit?.type === "word" && unit?.metadata?.commonWords?.band === band);
    let opportunityCount = 0; let firstPassCorrectCount = 0; const launchPositions = []; const internalPositions = [];
    for (const unit of units) {
      const expected = Array.from(unit.text ?? "");
      if (!expected.length) continue;
      let complete = true; let hadError = false;
      for (let offset = 0; offset < expected.length; offset += 1) {
        const event = firstAttempts.get(unit.startIndex + offset);
        if (!event || event.expected !== expected[offset]) { complete = false; break; }
        if (!correct(event)) hadError = true;
      }
      if (!complete) continue;
      opportunityCount += 1;
      if (!hadError) firstPassCorrectCount += 1;
      launchPositions.push(unit.startIndex);
      for (let position = unit.startIndex + 1; position < unit.endIndex; position += 1) internalPositions.push(position);
    }
    const launch = timing(launchPositions, firstAttempts, normalized);
    const internal = timing(internalPositions, firstAttempts, normalized);
    result[band] = freezeDeep({
      wordOpportunityCount: opportunityCount,
      wholeWordFirstPassCorrectCount: firstPassCorrectCount,
      wholeWordFirstPassAccuracy: opportunityCount ? firstPassCorrectCount / opportunityCount : null,
      launchEligibleCount: launch.eligibleCount,
      launchResidualMedianMs: launch.residualMedianMs,
      launchDisfluencyRate: launch.disfluencyRate,
      internalEligibleCount: internal.eligibleCount,
      internalResidualMedianMs: internal.residualMedianMs,
      internalDisfluencyRate: internal.disfluencyRate,
    });
  }
  return freezeDeep(result);
}
