import {
  PRACTICE_RESEARCH_POLICY,
  PRACTICE_RESEARCH_PROBE_CONTRACT,
  PRACTICE_RESEARCH_PROBE_QUOTAS,
  PRACTICE_RESEARCH_PROBE_VERSION,
} from "./practiceResearchConstants.js";

export function getPracticeResearchProbeQuota(entityType) {
  const quota = PRACTICE_RESEARCH_PROBE_QUOTAS[entityType];
  if (!Number.isInteger(quota)) throw new TypeError(`Unsupported Practice Research probe entity type: ${entityType}`);
  return quota;
}

export function createPracticeResearchProbePlan({ target, phase, familyIds = [], probeId = null, probeHash = null } = {}) {
  if (!target?.statId || !target?.entityType || !target?.entityKey) throw new TypeError("Practice Research probe requires one canonical target");
  if (!["baseline", "followup"].includes(phase)) throw new TypeError("Research probe phase must be baseline or followup");
  return Object.freeze({
    probeVersion: PRACTICE_RESEARCH_PROBE_VERSION,
    ...PRACTICE_RESEARCH_PROBE_CONTRACT,
    phase,
    target: Object.freeze({ entityType: target.entityType, statId: target.statId, entityKey: target.entityKey }),
    targetOpportunityQuota: getPracticeResearchProbeQuota(target.entityType),
    familyIds: Object.freeze([...new Set(familyIds)].slice(0, 64)),
    probeId,
    probeHash,
  });
}

export function validatePracticeResearchProbePair(baseline, followup) {
  const reasons = [];
  if (!baseline || !followup) reasons.push("probe-missing");
  if (baseline?.target?.statId !== followup?.target?.statId) reasons.push("target-mismatch");
  if (baseline?.targetOpportunityQuota !== followup?.targetOpportunityQuota) reasons.push("quota-mismatch");
  const baselineFamilies = new Set(baseline?.familyIds ?? []);
  if ((followup?.familyIds ?? []).some((id) => baselineFamilies.has(id))) reasons.push("family-overlap");
  if (Number.isFinite(baseline?.difficultyIndex) && Number.isFinite(followup?.difficultyIndex) && Math.abs(baseline.difficultyIndex - followup.difficultyIndex) > 0.30) reasons.push("difficulty-mismatch");
  if (Number.isFinite(baseline?.weightedFeatureRms) && Number.isFinite(followup?.weightedFeatureRms) && followup.weightedFeatureRms > 0.60) reasons.push("feature-rms-mismatch");
  if (baseline?.target?.entityType === "key") {
    if (Number.isFinite(followup?.positionProfileTvd) && followup.positionProfileTvd > 0.20) reasons.push("position-profile-mismatch");
    if (Number.isFinite(followup?.geometryTvd) && followup.geometryTvd > 0.30) reasons.push("geometry-mismatch");
  }
  if (baseline?.target?.entityType === "word" && Number.isFinite(followup?.launchContextTvd) && followup.launchContextTvd > 0.30) reasons.push("launch-context-mismatch");
  return Object.freeze({ valid: reasons.length === 0, reasons: Object.freeze(reasons) });
}

export function normalizePracticeResearchProbeResult(result = {}) {
  const coverage = Number(result.qualityCoverage);
  const quality = Number(result.quality);
  const valid = Number.isFinite(coverage) && coverage >= PRACTICE_RESEARCH_POLICY.qualityCoverageMinimum && Number.isFinite(quality);
  return Object.freeze({
    status: valid ? "valid" : "insufficient",
    probeId: result.probeId ?? null,
    probeHash: result.probeHash ?? null,
    familyIds: Object.freeze([...(result.familyIds ?? [])].slice(0, 64)),
    quality: Number.isFinite(quality) ? quality : null,
    qualityCoverage: Number.isFinite(coverage) ? coverage : null,
    firstPassAccuracy: Number.isFinite(result.firstPassAccuracy) ? Number(result.firstPassAccuracy) : null,
    normalizedResidualMedianMs: Number.isFinite(result.normalizedResidualMedianMs) ? Number(result.normalizedResidualMedianMs) : null,
    disfluencyRate: Number.isFinite(result.disfluencyRate) ? Number(result.disfluencyRate) : null,
    launchResidualMedianMs: Number.isFinite(result.launchResidualMedianMs) ? Number(result.launchResidualMedianMs) : null,
    internalResidualMedianMs: Number.isFinite(result.internalResidualMedianMs) ? Number(result.internalResidualMedianMs) : null,
    completedAt: result.completedAt ?? null,
  });
}

export function computePracticeResearchOutcome(baseline, followup) {
  if (baseline?.status !== "valid" || followup?.status !== "valid") return null;
  return Object.freeze({
    responseValue: followup.quality - baseline.quality,
    responseUnit: "quality-points",
    firstPassAccuracyDeltaPp: Number.isFinite(baseline.firstPassAccuracy) && Number.isFinite(followup.firstPassAccuracy) ? (followup.firstPassAccuracy - baseline.firstPassAccuracy) * 100 : null,
    normalizedResidualDeltaMs: Number.isFinite(baseline.normalizedResidualMedianMs) && Number.isFinite(followup.normalizedResidualMedianMs) ? followup.normalizedResidualMedianMs - baseline.normalizedResidualMedianMs : null,
    disfluencyDeltaPp: Number.isFinite(baseline.disfluencyRate) && Number.isFinite(followup.disfluencyRate) ? (followup.disfluencyRate - baseline.disfluencyRate) * 100 : null,
    launchResidualDeltaMs: Number.isFinite(baseline.launchResidualMedianMs) && Number.isFinite(followup.launchResidualMedianMs) ? followup.launchResidualMedianMs - baseline.launchResidualMedianMs : null,
    internalResidualDeltaMs: Number.isFinite(baseline.internalResidualMedianMs) && Number.isFinite(followup.internalResidualMedianMs) ? followup.internalResidualMedianMs - baseline.internalResidualMedianMs : null,
  });
}
