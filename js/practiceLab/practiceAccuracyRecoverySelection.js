import { evaluatePracticeSaturation } from "./practiceSaturationModel.js";
import { normalizePracticeAccuracyRecoveryTarget } from "./practiceAccuracyRecoveryTargets.js";
import { PRACTICE_ACCURACY_RECOVERY_POLICY_V1 } from "./practiceAccuracyRecoveryPolicy.js";

const finite = Number.isFinite;
const STATUS_STRENGTH = Object.freeze({ confirmed: 3, likely: 2, possible: 1 });
const STAGE_PREFERENCE = Object.freeze({ learning: 0, acquired: 1, unmeasured: 2, transferred: 3, robust: 4, retained: 5 });
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

function lower(value) { return typeof value === "string" ? value.toLowerCase() : ""; }
function dimensionCandidate(limiter, name) {
  const list = [
    limiter?.dimensions?.[name],
    limiter?.dimensionEvidence?.[name],
    limiter?.dimensionScores?.[name],
    limiter?.[name],
  ].filter(Boolean);
  const raw = list[0] ?? null;
  if (finite(raw)) return { severity: raw, confidence: null, status: limiter?.status ?? null };
  return {
    severity: [raw?.weightedSeverity, raw?.severity, raw?.score, raw?.weightedScore].find(finite) ?? 0,
    confidence: [raw?.confidenceScore, raw?.evidenceConfidenceScore, raw?.confidence].find(finite) ?? null,
    status: raw?.status ?? limiter?.status ?? null,
  };
}
function confidenceFor(limiter, inaccurate, recovery) {
  return [inaccurate.confidence, recovery.confidence, limiter?.evidenceMetadata?.primaryDimensionConfidenceScore, limiter?.evidenceConfidenceScore, limiter?.evidenceMetadata?.generalConfidenceScore].filter(finite).sort((a, b) => b - a)[0] ?? 0;
}
function statusFor(limiter, inaccurate, recovery) {
  const statuses = [inaccurate.status, recovery.status, limiter?.status].filter((value) => STATUS_STRENGTH[value]);
  return statuses.sort((a, b) => STATUS_STRENGTH[b] - STATUS_STRENGTH[a])[0] ?? limiter?.status ?? "insufficient-data";
}
function hierarchyIndependence(limiter) {
  const explained = Array.isArray(limiter?.hierarchy?.explainedBy) ? limiter.hierarchy.explainedBy.filter((entry) => ["likely", "confirmed"].includes(entry?.status ?? entry?.limiterStatus)) : [];
  const stronglyExplained = limiter?.hierarchy?.status === "explained" || limiter?.hierarchy?.stronglyExplained === true || explained.length > 0;
  return { stronglyExplained, explanationCount: explained.length, factor: stronglyExplained ? 0.65 : 1 };
}
function saturationFor(learningState, mastery, limiter) {
  return learningState ? evaluatePracticeSaturation({ learningState, mastery, limiter }) : Object.freeze({ status: "insufficient-data", confidence: "none", type: "unknown", reasons: Object.freeze(["learning-state-unavailable"]) });
}
function saturationFactor(status, policy) { return policy.recommendations.deemphasizedSaturation.includes(status) ? 0.65 : 1; }
function masteryFactor(stage, policy) { return policy.recommendations.deemphasizedMasteryStages.map(lower).includes(lower(stage)) ? 0.55 : 1; }
function compare(a, b) {
  if (b.selectionScore !== a.selectionScore) return b.selectionScore - a.selectionScore;
  if ((STATUS_STRENGTH[b.limiterStatus] ?? 0) !== (STATUS_STRENGTH[a.limiterStatus] ?? 0)) return (STATUS_STRENGTH[b.limiterStatus] ?? 0) - (STATUS_STRENGTH[a.limiterStatus] ?? 0);
  if ((b.priorityScore ?? -1) !== (a.priorityScore ?? -1)) return (b.priorityScore ?? -1) - (a.priorityScore ?? -1);
  if (b.evidenceConfidenceScore !== a.evidenceConfidenceScore) return b.evidenceConfidenceScore - a.evidenceConfidenceScore;
  const stageDelta = (STAGE_PREFERENCE[lower(a.masteryStage)] ?? 9) - (STAGE_PREFERENCE[lower(b.masteryStage)] ?? 9); if (stageDelta) return stageDelta;
  return a.entityType.localeCompare(b.entityType) || a.entityKey.localeCompare(b.entityKey);
}

export function buildAccuracyRecoveryCandidates({ profileId, contextId, language = "en", skillStats = [], limiterSnapshot = null, masterySnapshot = null, learningStates = [], availabilityByIdentity = null, maxResults = 8, policy = PRACTICE_ACCURACY_RECOVERY_POLICY_V1 } = {}) {
  if (typeof profileId !== "string" || typeof contextId !== "string") throw new TypeError("Accuracy & Recovery recommendations require profile/context identity");
  const limiterByStat = new Map((limiterSnapshot?.candidates ?? []).map((entry) => [entry.statId, entry]));
  const masteryByStat = new Map((masterySnapshot?.entities ?? []).map((entry) => [entry.statId, entry]));
  const learningByStat = new Map((learningStates ?? []).map((entry) => [entry.statId, entry]));
  const candidates = [];
  for (const stat of skillStats ?? []) {
    if (stat?.profileId !== profileId || stat?.contextId !== contextId || !["key", "bigram", "trigram", "word"].includes(stat?.entityType)) continue;
    const target = normalizePracticeAccuracyRecoveryTarget({ entityType: stat.entityType, entityKey: stat.entityKey, language }); if (!target) continue;
    const limiter = limiterByStat.get(stat.statId); if (!limiter) continue;
    const inaccurate = dimensionCandidate(limiter, "inaccurate");
    const recovery = dimensionCandidate(limiter, "recovery-heavy");
    const phenotype = limiter.primaryPhenotype ?? limiter.phenotype ?? "mixed";
    const status = statusFor(limiter, inaccurate, recovery);
    const primary = policy.recommendations.primaryStatuses.includes(status);
    const secondary = status === policy.recommendations.secondaryStatus;
    if (!primary && !secondary) continue;
    const mixedEligible = lower(phenotype) !== "mixed" || inaccurate.severity >= policy.recommendations.mixedMinimumSeverity || recovery.severity >= policy.recommendations.mixedMinimumSeverity;
    if (!mixedEligible) continue;
    const controlSeverity = Math.max(inaccurate.severity, recovery.severity);
    const clearlyControlRelated = controlSeverity > 0 || ["inaccurate", "recovery-heavy"].includes(lower(phenotype));
    if (!clearlyControlRelated) continue;
    const availability = availabilityByIdentity instanceof Map ? availabilityByIdentity.get(`${target.entityType}\u0000${target.entityKey}`) : availabilityByIdentity?.[`${target.entityType}:${target.entityKey}`];
    if (availability && availability.status !== "ready") continue;
    const mastery = masteryByStat.get(stat.statId) ?? null;
    const masteryStage = mastery?.stage ?? "unmeasured";
    const saturation = saturationFor(learningByStat.get(stat.statId), mastery, limiter);
    const hierarchy = target.entityType === "key" ? { stronglyExplained: false, explanationCount: 0, factor: 1 } : hierarchyIndependence(limiter);
    const confidence = confidenceFor(limiter, inaccurate, recovery);
    const priority = finite(limiter.priorityScore) ? limiter.priorityScore : finite(limiter.impactScore) ? limiter.impactScore : finite(limiter.weaknessScore) ? limiter.weaknessScore : 0;
    const base = controlSeverity * 1.5 + priority + confidence * 0.25 + (primary ? 20 : 0);
    const selectionScore = base * hierarchy.factor * masteryFactor(masteryStage, policy) * saturationFactor(saturation.status, policy);
    candidates.push(freezeDeep({
      statId: stat.statId,
      entityType: target.entityType,
      entityKey: target.entityKey,
      limiterStatus: status,
      limiterPhenotype: phenotype,
      inaccurateSeverity: inaccurate.severity,
      recoveryHeavySeverity: recovery.severity,
      priorityScore: finite(limiter.priorityScore) ? limiter.priorityScore : null,
      impactScore: finite(limiter.impactScore) ? limiter.impactScore : null,
      evidenceConfidenceScore: confidence,
      masteryStage,
      saturationStatus: saturation.status,
      saturationDeemphasized: policy.recommendations.deemphasizedSaturation.includes(saturation.status),
      hierarchyDeemphasized: hierarchy.stronglyExplained,
      hierarchyExplanationCount: hierarchy.explanationCount,
      selectionScore,
      targetSource: "recommended",
    }));
  }
  candidates.sort(compare);
  return Object.freeze(candidates.slice(0, Math.max(0, Math.min(policy.recommendations.maximum, Number.isInteger(maxResults) ? maxResults : policy.recommendations.maximum))));
}

export function buildAccuracyRecoveryManualWarnings({ statId, limiterSnapshot = null, masterySnapshot = null, learningStates = [], policy = PRACTICE_ACCURACY_RECOVERY_POLICY_V1 } = {}) {
  if (!statId) return Object.freeze([]);
  const limiter = (limiterSnapshot?.candidates ?? []).find((entry) => entry.statId === statId) ?? null;
  const mastery = (masterySnapshot?.entities ?? []).find((entry) => entry.statId === statId) ?? null;
  const learning = (learningStates ?? []).find((entry) => entry.statId === statId) ?? null;
  const warnings = [];
  if (learning) {
    const saturation = evaluatePracticeSaturation({ learningState: learning, mastery, limiter });
    if (policy.recommendations.deemphasizedSaturation.includes(saturation.status)) warnings.push(Object.freeze({ kind: "saturation", message: "Recent similar acquisition practice appears to have low marginal gain." }));
  }
  const hierarchy = limiter ? hierarchyIndependence(limiter) : null;
  if (hierarchy?.stronglyExplained) warnings.push(Object.freeze({ kind: "hierarchy", message: "Some of this target's difficulty may be explained by a lower-level limiter." }));
  return Object.freeze(warnings);
}
