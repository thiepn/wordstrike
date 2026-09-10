import { PRACTICE_ENDURANCE_ANALYSIS_VERSION, PRACTICE_ENDURANCE_RESULT_VERSION } from "./practiceEnduranceConstants.js";
import { PRACTICE_ENDURANCE_POLICY_V1 } from "./practiceEndurancePolicy.js";
import { analyzePracticeSustainedWindows, pooledRatio, summarizePracticeSustainedVariation } from "./practiceSustainedAnalysisCore.js";
import { practiceSustainedMedian } from "./practiceSustainedMath.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const finite = Number.isFinite;
const selected = (windows, ordinals) => windows.filter((window) => ordinals.includes(window.ordinal) && window.structuralValid);
const sum = (windows, key) => windows.reduce((total, window) => total + (finite(window?.[key]) ? window[key] : 0), 0);

function pooledControl(early, late) {
  const earlyAccuracy = pooledRatio(early, "firstPassCorrectCount", "firstPassOpportunityCount");
  const lateAccuracy = pooledRatio(late, "firstPassCorrectCount", "firstPassOpportunityCount");
  const earlyDisfluency = pooledRatio(early, "disfluentCount", "timingEligibleCount");
  const lateDisfluency = pooledRatio(late, "disfluentCount", "timingEligibleCount");
  const earlyActive = sum(early, "windowActiveMs"); const lateActive = sum(late, "windowActiveMs");
  const earlyCorrection = earlyActive > 0 ? sum(early, "correctionCostMs") / earlyActive : null;
  const lateCorrection = lateActive > 0 ? sum(late, "correctionCostMs") / lateActive : null;
  return freezeDeep({
    earlyFirstPassAccuracy: earlyAccuracy,
    lateFirstPassAccuracy: lateAccuracy,
    accuracyDeltaPp: finite(earlyAccuracy) && finite(lateAccuracy) ? 100 * (lateAccuracy - earlyAccuracy) : null,
    earlyDisfluencyRate: earlyDisfluency,
    lateDisfluencyRate: lateDisfluency,
    disfluencyDeltaPp: finite(earlyDisfluency) && finite(lateDisfluency) ? 100 * (lateDisfluency - earlyDisfluency) : null,
    earlyCorrectionCostRate: earlyCorrection,
    lateCorrectionCostRate: lateCorrection,
    correctionCostDeltaPp: finite(earlyCorrection) && finite(lateCorrection) ? 100 * (lateCorrection - earlyCorrection) : null,
  });
}

export function classifyPracticeEnduranceControl(control, policy = PRACTICE_ENDURANCE_POLICY_V1) {
  const material = (finite(control.accuracyDeltaPp) && control.accuracyDeltaPp <= policy.controlDegradation.accuracyDeltaPp)
    || (finite(control.disfluencyDeltaPp) && control.disfluencyDeltaPp >= policy.controlDegradation.disfluencyDeltaPp)
    || (finite(control.correctionCostDeltaPp) && control.correctionCostDeltaPp >= policy.controlDegradation.correctionCostDeltaPp);
  const available = [control.accuracyDeltaPp, control.disfluencyDeltaPp, control.correctionCostDeltaPp].filter(finite).length;
  const preserved = available > 0
    && (!finite(control.accuracyDeltaPp) || control.accuracyDeltaPp >= policy.controlPreserved.accuracyDeltaPp)
    && (!finite(control.disfluencyDeltaPp) || control.disfluencyDeltaPp <= policy.controlPreserved.disfluencyDeltaPp)
    && (!finite(control.correctionCostDeltaPp) || control.correctionCostDeltaPp <= policy.controlPreserved.correctionCostDeltaPp);
  return freezeDeep({ materialDegradation: material, preserved, coverage: available === 3 ? "full" : available > 0 ? "partial" : "none" });
}

function endurancePattern(retentionPercent, controlState, sufficient, policy) {
  if (!sufficient || !finite(retentionPercent)) return "insufficient";
  if (retentionPercent <= policy.paceDeclineRetentionMaximumPercent && controlState.materialDegradation) return "mixed-decline";
  if (retentionPercent <= policy.paceDeclineRetentionMaximumPercent && !controlState.materialDegradation) return "pace-decline";
  if (retentionPercent >= policy.risingRetentionMinimumPercent && controlState.preserved) return "rising";
  if (retentionPercent > policy.paceDeclineRetentionMaximumPercent && controlState.materialDegradation) return "control-decline";
  if (retentionPercent >= policy.stableRetentionMinimumPercent && controlState.preserved) return "stable";
  return "uncertain";
}

export function analyzePracticeEndurance({ windowSnapshot, scoreRange = null, flow = "practice", durationMs = 0, policy = PRACTICE_ENDURANCE_POLICY_V1 } = {}) {
  const windows = analyzePracticeSustainedWindows({ snapshot: windowSnapshot, scoreRange, structuralMinimumWindowMs: policy.structuralMinimumWindowMs, structuralMinimumFirstPassOpportunities: policy.structuralMinimumFirstPassOpportunities, paceCoordinate: "effective" });
  const valid = windows.filter((window) => window.structuralValid && finite(window.adjustedLogPace));
  const check = flow === "check";
  const earlyCount = durationMs === 300_000 && !check ? 2 : 4;
  const early = check ? selected(windows, policy.checkEarlyWindowOrdinals) : valid.slice(0, earlyCount);
  const late = check ? selected(windows, policy.checkLateWindowOrdinals) : valid.slice(-earlyCount);
  const earlyLog = practiceSustainedMedian(early.map((window) => window.adjustedLogPace));
  const lateLog = practiceSustainedMedian(late.map((window) => window.adjustedLogPace));
  const paceRetentionRatio = finite(earlyLog) && finite(lateLog) ? Math.exp(lateLog - earlyLog) : null;
  const control = pooledControl(early, late);
  const controlState = classifyPracticeEnduranceControl(control, policy);
  const variation = summarizePracticeSustainedVariation(windows);
  const sufficient = check ? early.length >= policy.minimumEarlyLateValidWindows && late.length >= policy.minimumEarlyLateValidWindows : early.length >= Math.min(2, earlyCount) && late.length >= Math.min(2, earlyCount);
  const paceRetentionPercent = paceRetentionRatio == null ? null : 100 * paceRetentionRatio;
  return freezeDeep({
    resultVersion: PRACTICE_ENDURANCE_RESULT_VERSION,
    analysisVersion: PRACTICE_ENDURANCE_ANALYSIS_VERSION,
    flow,
    status: sufficient ? "complete" : "insufficient",
    durationMs,
    settlingMs: windowSnapshot?.analysisStartMs ?? 0,
    validWindowCount: valid.length,
    earlyWindowOrdinals: early.map((window) => window.ordinal),
    lateWindowOrdinals: late.map((window) => window.ordinal),
    earlyAdjustedEffectiveWpm: finite(earlyLog) ? Math.exp(earlyLog) : null,
    lateAdjustedEffectiveWpm: finite(lateLog) ? Math.exp(lateLog) : null,
    paceRetentionRatio,
    paceRetentionPercent,
    control: { ...control, ...controlState },
    pace: { variationPercent: variation.variationPercent, trendPercent: variation.driftPercent, slopeLogPerMinute: variation.slopeLogPerMinute },
    pattern: endurancePattern(paceRetentionPercent, controlState, sufficient, policy),
  });
}
