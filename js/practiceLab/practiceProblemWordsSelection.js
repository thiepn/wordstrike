import { PRACTICE_MASTERY_STAGE_RANK } from "./practiceMasteryConstants.js";
import { evaluatePracticeSaturation } from "./practiceSaturationModel.js";
import { PRACTICE_PROBLEM_WORDS_POLICY_V1 } from "./practiceProblemWordsPolicy.js";
import { normalizePracticeProblemWordTarget } from "./practiceProblemWordsTargets.js";

const finite = Number.isFinite;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const STATUS = Object.freeze({ confirmed: 3, likely: 2, possible: 1, "not-elevated": 0, "insufficient-data": 0 });
const HIERARCHY = Object.freeze({ independent: 3, "partially-explained": 2, explained: 1, unknown: 0 });
const MASTERY = Object.freeze({ learning: 0, acquired: 1, unmeasured: 2, transferred: 3, robust: 4, retained: 5 });
const ALLOWED_PHENOTYPES = new Set(["launch-limited", "slow", "hesitant", "inaccurate", "recovery-heavy", "unstable", "mixed"]);

function confidenceFor(limiter) {
  const values = [limiter?.evidenceMetadata?.primaryDimensionConfidenceScore, limiter?.evidenceConfidenceScore, limiter?.evidenceMetadata?.generalConfidenceScore].filter(finite);
  return values.length ? Math.max(...values) : 0;
}
function hierarchyState(limiter) {
  const raw = limiter?.hierarchy?.status ?? limiter?.hierarchy?.explanationStatus ?? limiter?.hierarchyStatus ?? "unknown";
  if (["independent", "partially-explained", "explained"].includes(raw)) return raw;
  if (limiter?.hierarchy?.explained === true) return "explained";
  if ((limiter?.hierarchy?.explainedBy?.length ?? 0) > 0) return "partially-explained";
  return "independent";
}
function explanatoryEntities(limiter, maximum) {
  return Object.freeze((limiter?.hierarchy?.explainedBy ?? [])
    .filter((entry) => ["key", "bigram", "trigram"].includes(entry?.entityType) && typeof entry?.entityKey === "string")
    .sort((a, b) => Number(b?.confidenceScore || 0) - Number(a?.confidenceScore || 0) || String(a.entityKey).localeCompare(String(b.entityKey)))
    .slice(0, maximum)
    .map((entry) => Object.freeze({ entityType: entry.entityType, entityKey: entry.entityKey, confidenceScore: finite(entry.confidenceScore) ? entry.confidenceScore : null })));
}
function saturationFactor(status) {
  if (status === "supported") return 0.35;
  if (status === "likely") return 0.55;
  if (status === "resolved") return 0.25;
  return 1;
}
function fallbackPriority(limiter, confidence) { return (finite(limiter?.weaknessScore) ? limiter.weaknessScore : 0) * confidence / 100; }
function compare(a, b) {
  if (b.effectivePriorityScore !== a.effectivePriorityScore) return b.effectivePriorityScore - a.effectivePriorityScore;
  const status = (STATUS[b.limiterStatus] ?? 0) - (STATUS[a.limiterStatus] ?? 0); if (status) return status;
  const hierarchy = (HIERARCHY[b.hierarchyStatus] ?? 0) - (HIERARCHY[a.hierarchyStatus] ?? 0); if (hierarchy) return hierarchy;
  if (b.evidenceConfidenceScore !== a.evidenceConfidenceScore) return b.evidenceConfidenceScore - a.evidenceConfidenceScore;
  if ((b.weaknessScore ?? -1) !== (a.weaknessScore ?? -1)) return (b.weaknessScore ?? -1) - (a.weaknessScore ?? -1);
  const stage = (MASTERY[a.masteryStage] ?? 9) - (MASTERY[b.masteryStage] ?? 9); if (stage) return stage;
  if (a.saturationDeemphasized !== b.saturationDeemphasized) return a.saturationDeemphasized ? 1 : -1;
  return a.entityKey.localeCompare(b.entityKey) || a.statId.localeCompare(b.statId);
}

export function buildProblemWordCandidates({
  profileId,
  contextId,
  language = "en",
  skillStats = [],
  limiterSnapshot = null,
  masterySnapshot = null,
  learningStates = [],
  availabilityByWord = null,
  maxResults = PRACTICE_PROBLEM_WORDS_POLICY_V1.recommendations.maximum,
  policy = PRACTICE_PROBLEM_WORDS_POLICY_V1,
} = {}) {
  if (typeof profileId !== "string" || typeof contextId !== "string") throw new TypeError("Problem Words recommendations require profile/context identity");
  if (limiterSnapshot && (limiterSnapshot.profileId !== profileId || limiterSnapshot.contextId !== contextId)) throw new TypeError("Problem Words limiter snapshot context mismatch");
  if (masterySnapshot && (masterySnapshot.profileId !== profileId || masterySnapshot.contextId !== contextId)) throw new TypeError("Problem Words mastery snapshot context mismatch");
  const limiterByStat = new Map((limiterSnapshot?.candidates ?? []).map((entry) => [entry.statId, entry]));
  const masteryByStat = new Map((masterySnapshot?.entities ?? []).map((entry) => [entry.statId, entry]));
  const learningByStat = new Map((Array.isArray(learningStates) ? learningStates : []).map((entry) => [entry.statId, entry]));
  const out = [];
  for (const stat of Array.isArray(skillStats) ? skillStats : []) {
    if (stat?.profileId !== profileId || stat?.contextId !== contextId || stat?.entityType !== "word") continue;
    const target = normalizePracticeProblemWordTarget({ entityKey: stat.entityKey, language, policy });
    if (!target) continue;
    const limiter = limiterByStat.get(stat.statId);
    if (!limiter || !["confirmed", "likely", "possible"].includes(limiter.status)) continue;
    const phenotype = ALLOWED_PHENOTYPES.has(limiter.primaryPhenotype) ? limiter.primaryPhenotype : "mixed";
    const mastery = masteryByStat.get(stat.statId) ?? null;
    const masteryStage = mastery?.stage ?? "unmeasured";
    if (["robust", "retained"].includes(masteryStage)) continue;
    const availability = availabilityByWord instanceof Map ? availabilityByWord.get(target.entityKey) : availabilityByWord?.[target.entityKey];
    if (availability && availability.status !== "ready") continue;
    const confidence = confidenceFor(limiter); if (confidence <= 0) continue;
    const learningState = learningByStat.get(stat.statId) ?? null;
    const saturation = learningState ? evaluatePracticeSaturation({ learningState, mastery, limiter }) : { status: "insufficient-data", confidence: "none", type: "unknown" };
    const factor = saturationFactor(saturation.status);
    const hierarchyStatus = hierarchyState(limiter);
    const hierarchyFactor = hierarchyStatus === "explained" ? 0.5 : hierarchyStatus === "partially-explained" ? 0.8 : 1;
    const rawPriority = finite(limiter.priorityScore) ? limiter.priorityScore : fallbackPriority(limiter, confidence);
    out.push(freezeDeep({
      statId: stat.statId,
      entityType: "word",
      entityKey: target.entityKey,
      limiterStatus: limiter.status,
      limiterPhenotype: phenotype,
      evidenceConfidenceScore: confidence,
      limiterPriorityScore: finite(limiter.priorityScore) ? limiter.priorityScore : null,
      weaknessScore: finite(limiter.weaknessScore) ? limiter.weaknessScore : null,
      hierarchyStatus,
      explanatoryEntities: explanatoryEntities(limiter, policy.recommendations.maximumExplanatoryEntities),
      hierarchyDeemphasized: hierarchyStatus === "explained",
      masteryStage,
      masteryRank: PRACTICE_MASTERY_STAGE_RANK[masteryStage] ?? null,
      saturationStatus: saturation.status,
      saturationConfidence: saturation.confidence,
      saturationType: saturation.type,
      saturationDeemphasized: factor < 1,
      effectivePriorityScore: rawPriority * hierarchyFactor * factor,
      targetSource: "recommended",
    }));
  }
  out.sort(compare);
  return Object.freeze(out.slice(0, Math.max(0, Math.min(Number.isInteger(maxResults) ? maxResults : 0, policy.recommendations.maximum))));
}

export function getProblemWordManualWarnings({ entityKey, skillStats = [], limiterSnapshot = null, masterySnapshot = null, learningStates = [] } = {}) {
  const stat = (skillStats ?? []).find((entry) => entry?.entityType === "word" && entry.entityKey === entityKey) ?? null;
  if (!stat) return Object.freeze([]);
  const limiter = (limiterSnapshot?.candidates ?? []).find((entry) => entry.statId === stat.statId) ?? null;
  const mastery = (masterySnapshot?.entities ?? []).find((entry) => entry.statId === stat.statId) ?? null;
  const learningState = (learningStates ?? []).find((entry) => entry.statId === stat.statId) ?? null;
  const warnings = [];
  const hierarchy = hierarchyState(limiter);
  if (hierarchy !== "independent") warnings.push(Object.freeze({ kind: "hierarchy", message: "Some of this word's difficulty may reflect lower-level letter combinations." }));
  if (learningState) {
    const saturation = evaluatePracticeSaturation({ learningState, mastery, limiter });
    if (["likely", "supported", "resolved"].includes(saturation.status)) warnings.push(Object.freeze({ kind: "saturation", status: saturation.status, message: "Recent similar practice appears to have low marginal gain." }));
  }
  return Object.freeze(warnings);
}
