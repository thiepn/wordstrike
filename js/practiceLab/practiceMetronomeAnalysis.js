import {
  PRACTICE_METRONOME_ANALYSIS_VERSION,
  PRACTICE_METRONOME_MIN_BLOCK_DURATION_RATIO,
  PRACTICE_METRONOME_MIN_CONDITION_OPPORTUNITIES,
  PRACTICE_METRONOME_MIN_SILENT_OPPORTUNITIES,
  PRACTICE_METRONOME_MIN_TIMING_TRANSITIONS,
  PRACTICE_METRONOME_PATTERN_ACCURACY_THRESHOLD_PP,
  PRACTICE_METRONOME_PATTERN_CORRECTION_THRESHOLD_PP,
  PRACTICE_METRONOME_PATTERN_DISFLUENCY_THRESHOLD_PP,
  PRACTICE_METRONOME_PATTERN_PACE_THRESHOLD_PERCENT,
  PRACTICE_METRONOME_PATTERN_VARIATION_THRESHOLD_PERCENT,
  PRACTICE_METRONOME_RESULT_VERSION,
} from "./practiceMetronomeConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const finite = Number.isFinite;
function median(values) { const a = values.filter(finite).slice().sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
function mad(values, center = median(values)) { return center == null ? null : median(values.filter(finite).map((value) => Math.abs(value - center))); }
const pp = (a, b) => finite(a) && finite(b) ? 100 * (a - b) : null;
const pacePct = (a, b) => finite(a) && finite(b) ? 100 * (Math.exp(a - b) - 1) : null;

export function analyzePracticeMetronomeBlock(block = {}) {
  const scheduledDurationMs = Math.max(0, Number(block.endMs) - Number(block.startMs));
  const durationMs = Number(block.observedDurationMs) || 0;
  const minutes = durationMs / 60_000;
  const effectiveWpm = minutes > 0 ? (Number(block.correctFirstPassAttempts) || 0) / 5 / minutes : null;
  const firstPassOpportunityCount = Number(block.firstPassOpportunityCount) || 0;
  const correctFirstPassAttempts = Number(block.correctFirstPassAttempts) || 0;
  const firstPassAccuracy = firstPassOpportunityCount > 0 ? correctFirstPassAttempts / firstPassOpportunityCount : null;
  const eligibleTimingCount = Number(block.eligibleTimingCount) || 0;
  const disfluencyRate = eligibleTimingCount >= PRACTICE_METRONOME_MIN_TIMING_TRANSITIONS ? (Number(block.disfluentTimingCount) || 0) / eligibleTimingCount : null;
  const correctionCostRate = durationMs > 0 ? (Number(block.correctionCostMs) || 0) / durationMs : null;
  const windowWpm = (block.windows ?? []).filter((window) => window.observedDurationMs > 0 && window.firstPassOpportunityCount > 0).map((window) => window.correctFirstPassAttempts / 5 / (window.observedDurationMs / 60_000));
  const windowMedianWpm = median(windowWpm);
  const windowMadWpm = mad(windowWpm, windowMedianWpm);
  const paceVariationPercent = finite(windowMedianWpm) && windowMedianWpm > 0 && finite(windowMadWpm) ? 100 * windowMadWpm / windowMedianWpm : null;
  const minimumOpportunities = block.kind === "condition" ? PRACTICE_METRONOME_MIN_CONDITION_OPPORTUNITIES : PRACTICE_METRONOME_MIN_SILENT_OPPORTUNITIES;
  const valid = durationMs >= scheduledDurationMs * PRACTICE_METRONOME_MIN_BLOCK_DURATION_RATIO
    && firstPassOpportunityCount >= minimumOpportunities
    && !block.protocolCorrupt && !block.contentExhausted && finite(effectiveWpm) && effectiveWpm > 0;
  return freezeDeep({ ...block, scheduledDurationMs, effectiveWpm, logEffectivePace: valid ? Math.log(effectiveWpm) : null, firstPassAccuracy, disfluencyRate, correctionCostRate, paceVariationPercent, windowMedianWpm, valid });
}

function aggregate(blocks, condition) {
  const selected = blocks.filter((block) => block.kind === "condition" && block.condition === condition && block.valid);
  if (!selected.length) return freezeDeep({ condition, status: "insufficient", validBlockCount: 0, effectiveWpm: null, logEffectivePace: null, paceVariationPercent: null, firstPassAccuracy: null, disfluencyRate: null, correctionCostRate: null });
  const opportunities = selected.reduce((sum, block) => sum + block.firstPassOpportunityCount, 0);
  const correct = selected.reduce((sum, block) => sum + block.correctFirstPassAttempts, 0);
  const timing = selected.reduce((sum, block) => sum + block.eligibleTimingCount, 0);
  const disfluent = selected.reduce((sum, block) => sum + block.disfluentTimingCount, 0);
  const duration = selected.reduce((sum, block) => sum + block.observedDurationMs, 0);
  const correction = selected.reduce((sum, block) => sum + block.correctionCostMs, 0);
  const logEffectivePace = median(selected.map((block) => block.logEffectivePace));
  return freezeDeep({ condition, status: "observed", validBlockCount: selected.length, effectiveWpm: finite(logEffectivePace) ? Math.exp(logEffectivePace) : null, logEffectivePace, paceVariationPercent: median(selected.map((block) => block.paceVariationPercent)), firstPassAccuracy: opportunities ? correct / opportunities : null, disfluencyRate: timing >= PRACTICE_METRONOME_MIN_TIMING_TRANSITIONS ? disfluent / timing : null, correctionCostRate: duration ? correction / duration : null });
}

export function classifyPracticeMetronomePattern({ pulseEffectivePaceDeltaPercent, pulsePaceVariationDeltaPercent, pulseAccuracyDeltaPp, pulseDisfluencyDeltaPp, pulseCorrectionCostDeltaPp } = {}) {
  if (!finite(pulseEffectivePaceDeltaPercent) || !finite(pulseAccuracyDeltaPp) || !finite(pulsePaceVariationDeltaPercent)) return "insufficient";
  const costly = pulseAccuracyDeltaPp < -PRACTICE_METRONOME_PATTERN_ACCURACY_THRESHOLD_PP
    || (finite(pulseDisfluencyDeltaPp) && pulseDisfluencyDeltaPp > PRACTICE_METRONOME_PATTERN_DISFLUENCY_THRESHOLD_PP)
    || (finite(pulseCorrectionCostDeltaPp) && pulseCorrectionCostDeltaPp > PRACTICE_METRONOME_PATTERN_CORRECTION_THRESHOLD_PP);
  if (costly) return "pulse-associated-higher-cost";
  if (pulsePaceVariationDeltaPercent <= -PRACTICE_METRONOME_PATTERN_VARIATION_THRESHOLD_PERCENT) return "pulse-associated-steadier";
  if (Math.abs(pulseEffectivePaceDeltaPercent) < PRACTICE_METRONOME_PATTERN_PACE_THRESHOLD_PERCENT
    && Math.abs(pulsePaceVariationDeltaPercent) < PRACTICE_METRONOME_PATTERN_VARIATION_THRESHOLD_PERCENT
    && Math.abs(pulseAccuracyDeltaPp) < PRACTICE_METRONOME_PATTERN_ACCURACY_THRESHOLD_PP) return "little-observed-difference";
  return "mixed";
}

export function analyzePracticeMetronome({ blockSnapshot, durationMs, scheduleVariant, cueMode, bpm, charsPerBeat } = {}) {
  const blocks = (blockSnapshot?.blocks ?? []).map(analyzePracticeMetronomeBlock);
  const pulse = aggregate(blocks, "pulse"); const silent = aggregate(blocks, "silent");
  const pulseEffectivePaceDeltaPercent = pacePct(pulse.logEffectivePace, silent.logEffectivePace);
  const pulsePaceVariationDeltaPercent = finite(pulse.paceVariationPercent) && finite(silent.paceVariationPercent) ? pulse.paceVariationPercent - silent.paceVariationPercent : null;
  const pulseAccuracyDeltaPp = pp(pulse.firstPassAccuracy, silent.firstPassAccuracy);
  const pulseDisfluencyDeltaPp = pp(pulse.disfluencyRate, silent.disfluencyRate);
  const pulseCorrectionCostDeltaPp = pp(pulse.correctionCostRate, silent.correctionCostRate);
  return freezeDeep({ resultVersion: PRACTICE_METRONOME_RESULT_VERSION, analysisVersion: PRACTICE_METRONOME_ANALYSIS_VERSION, durationMs, scheduleVariant, cueMode, bpm, charsPerBeat, interpretation: "within-session descriptive association only", baseline: blocks.find((block) => block.kind === "baseline") ?? null, conditions: { pulse, silent }, integration: blocks.find((block) => block.kind === "integration") ?? null, pulseEffectivePaceDeltaPercent, pulsePaceVariationDeltaPercent, pulseAccuracyDeltaPp, pulseDisfluencyDeltaPp, pulseCorrectionCostDeltaPp, pattern: classifyPracticeMetronomePattern({ pulseEffectivePaceDeltaPercent, pulsePaceVariationDeltaPercent, pulseAccuracyDeltaPp, pulseDisfluencyDeltaPp, pulseCorrectionCostDeltaPp }), validBlockCount: blocks.filter((block) => block.valid).length, blocks: blocks.map((block) => ({ blockId: block.blockId, kind: block.kind, condition: block.condition, effectiveWpm: block.effectiveWpm, paceVariationPercent: block.paceVariationPercent, firstPassAccuracy: block.firstPassAccuracy, disfluencyRate: block.disfluencyRate, correctionCostRate: block.correctionCostRate, valid: block.valid })) });
}
