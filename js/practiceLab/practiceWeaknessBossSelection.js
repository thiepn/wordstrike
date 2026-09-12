import {
  resolvePracticeCoachBaseNeed,
  resolvePracticeCoachMasteryModifier,
  resolvePracticeCoachMarginalGainModifier,
} from "./practiceCoachUtility.js";
import { PRACTICE_COACH_POLICY_V1 } from "./practiceCoachPolicy.js";
import {
  PRACTICE_WEAKNESS_BOSS_ACTIONABLE_UTILITY,
  PRACTICE_WEAKNESS_BOSS_ARCHETYPES,
  PRACTICE_WEAKNESS_BOSS_ENTITY_TYPES,
  PRACTICE_WEAKNESS_BOSS_MAX_INTERNAL_CANDIDATES,
  PRACTICE_WEAKNESS_BOSS_MAX_LIMITER_CANDIDATES,
  PRACTICE_WEAKNESS_BOSS_MAX_VISIBLE_CANDIDATES,
} from "./practiceWeaknessBossConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const finite = (value) => Number.isFinite(Number(value));
const STATUS_RANK = Object.freeze({ confirmed: 2, likely: 1 });
const TYPE_RANK = Object.freeze({ key: 0, bigram: 1, trigram: 2, word: 3 });
const SATURATION = Object.freeze({
  "insufficient-data": 0.75,
  "not-detected": 1.00,
  approaching: 0.85,
  possible: 0.65,
  likely: 0.40,
  supported: 0,
  resolved: 0,
});
const BOSS_MODIFIER_POLICY = Object.freeze({
  ...PRACTICE_COACH_POLICY_V1,
  saturationModifier: SATURATION,
});

function fromMap(source, key) {
  return source instanceof Map ? source.get(key) : source?.[key];
}

function hierarchyStatus(candidate) {
  const value = candidate?.hierarchy?.status ?? candidate?.hierarchyStatus ?? "independent";
  return value === "partially-explained" ? "partial" : value;
}

function masteryStage(mastery) {
  return String(mastery?.stage ?? mastery?.masteryStage ?? "unmeasured").toLowerCase();
}

function isStableAnchor(mastery) {
  return mastery?.stableAnchor === true
    || mastery?.anchorEligibility?.stableAnchor === true
    || mastery?.anchorEligibility?.status === "stable-anchor";
}

function saturationStatus(learning) {
  return learning?.saturation?.status ?? learning?.saturationStatus ?? "insufficient-data";
}

function marginalGainBand(learning) {
  return learning?.marginalGain ?? learning?.acquisition?.marginalGainStatus ?? learning?.marginalGainBand ?? "unknown";
}

function contentReady(contentReadyByStat, statId) {
  const value = fromMap(contentReadyByStat, statId);
  return value === true || value?.ready === true || value?.status === "ready";
}

function archetypeFor(candidate) {
  const phenotype = candidate?.primaryPhenotype ?? candidate?.phenotype ?? "mixed";
  return PRACTICE_WEAKNESS_BOSS_ARCHETYPES[phenotype] ?? PRACTICE_WEAKNESS_BOSS_ARCHETYPES.mixed;
}

function reasonCodes(candidate, saturation, hierarchy) {
  const phenotype = candidate.primaryPhenotype ?? "mixed";
  const reasons = [candidate.status === "confirmed" ? "confirmed-limiter" : "likely-limiter"];
  if (finite(candidate?.impact?.impactScore) && Number(candidate.impact.impactScore) >= 60) reasons.push("high-impact");
  if (!["supported", "resolved"].includes(saturation)) reasons.push("learning-headroom");
  reasons.push(hierarchy === "partial" ? "partial-hierarchy" : "independent-limiter");
  const phenotypeReason = {
    slow: "slow-pattern",
    hesitant: "hesitation-pattern",
    inaccurate: "accuracy-pattern",
    "recovery-heavy": "recovery-pattern",
    "launch-limited": "launch-pattern",
    unstable: "instability-pattern",
    mixed: "mixed-pattern",
  }[phenotype];
  if (phenotypeReason) reasons.push(phenotypeReason);
  return Object.freeze([...new Set(reasons)].slice(0, 5));
}

export function calculatePracticeWeaknessBossTargetUtility({ candidate, mastery = null, learning = null } = {}) {
  const baseNeed = resolvePracticeCoachBaseNeed(candidate ?? {});
  const masteryModifier = resolvePracticeCoachMasteryModifier(masteryStage(mastery), BOSS_MODIFIER_POLICY);
  const saturation = saturationStatus(learning);
  const saturationModifier = SATURATION[saturation] ?? SATURATION["insufficient-data"];
  const marginalGain = marginalGainBand(learning);
  const marginalGainModifier = resolvePracticeCoachMarginalGainModifier(marginalGain, BOSS_MODIFIER_POLICY);
  const headroom = Math.min(saturationModifier, marginalGainModifier);
  const bossTargetUtility = clamp(baseNeed * masteryModifier * headroom);
  return freezeDeep({ baseNeed, masteryModifier, saturationStatus: saturation, saturationModifier, marginalGainBand: marginalGain, marginalGainModifier, headroom, bossTargetUtility });
}

function compareCandidates(a, b) {
  if (b.bossTargetUtility !== a.bossTargetUtility) return b.bossTargetUtility - a.bossTargetUtility;
  const ap = finite(a.priorityScore) ? Number(a.priorityScore) : -1;
  const bp = finite(b.priorityScore) ? Number(b.priorityScore) : -1;
  if (bp !== ap) return bp - ap;
  const ai = finite(a.impactScore) ? Number(a.impactScore) : -1;
  const bi = finite(b.impactScore) ? Number(b.impactScore) : -1;
  if (bi !== ai) return bi - ai;
  const ac = finite(a.limiterConfidence) ? Number(a.limiterConfidence) : -1;
  const bc = finite(b.limiterConfidence) ? Number(b.limiterConfidence) : -1;
  if (bc !== ac) return bc - ac;
  const type = (TYPE_RANK[a.entityType] ?? 99) - (TYPE_RANK[b.entityType] ?? 99);
  if (type) return type;
  return String(a.entityKey).localeCompare(String(b.entityKey)) || String(a.statId).localeCompare(String(b.statId));
}

export function buildPracticeWeaknessBossCandidates({
  limiterSnapshot = null,
  masteryByStat = new Map(),
  learningByStat = new Map(),
  contentReadyByStat = new Map(),
  maxInitial = PRACTICE_WEAKNESS_BOSS_MAX_LIMITER_CANDIDATES,
  maxInternal = PRACTICE_WEAKNESS_BOSS_MAX_INTERNAL_CANDIDATES,
} = {}) {
  const limiterCandidates = Array.isArray(limiterSnapshot?.candidates) ? limiterSnapshot.candidates : [];
  const initial = limiterCandidates.slice(0, Math.max(1, Math.min(PRACTICE_WEAKNESS_BOSS_MAX_LIMITER_CANDIDATES, maxInitial)));
  const output = [];
  for (const candidate of initial) {
    if (!PRACTICE_WEAKNESS_BOSS_ENTITY_TYPES.includes(candidate?.entityType)) continue;
    if (!["likely", "confirmed"].includes(candidate?.status)) continue;
    const hierarchy = hierarchyStatus(candidate);
    if (!["independent", "partial"].includes(hierarchy)) continue;
    const mastery = fromMap(masteryByStat, candidate.statId);
    if (isStableAnchor(mastery)) continue;
    const learning = fromMap(learningByStat, candidate.statId);
    const saturation = saturationStatus(learning);
    if (["supported", "resolved"].includes(saturation)) continue;
    if (!contentReady(contentReadyByStat, candidate.statId)) continue;
    const utility = calculatePracticeWeaknessBossTargetUtility({ candidate, mastery, learning });
    if (utility.bossTargetUtility < PRACTICE_WEAKNESS_BOSS_ACTIONABLE_UTILITY) continue;
    const archetype = archetypeFor(candidate);
    output.push(freezeDeep({
      statId: candidate.statId,
      entityType: candidate.entityType,
      entityKey: candidate.entityKey,
      limiterStatus: candidate.status,
      phenotype: candidate.primaryPhenotype ?? "mixed",
      hierarchyStatus: hierarchy,
      priorityScore: finite(candidate.priorityScore) ? Number(candidate.priorityScore) : null,
      impactScore: finite(candidate?.impact?.impactScore) ? Number(candidate.impact.impactScore) : null,
      limiterConfidence: finite(candidate?.evidenceMetadata?.primaryDimensionConfidenceScore)
        ? Number(candidate.evidenceMetadata.primaryDimensionConfidenceScore)
        : finite(candidate?.evidenceConfidenceScore) ? Number(candidate.evidenceConfidenceScore) : null,
      weaknessScore: finite(candidate.weaknessScore) ? Number(candidate.weaknessScore) : 0,
      masteryStage: masteryStage(mastery),
      saturationStatus: saturation,
      marginalGainBand: marginalGainBand(learning),
      bossTargetUtility: utility.bossTargetUtility,
      utilityBreakdown: utility,
      bossTheme: { ...archetype },
      contentReady: true,
      reasonCodes: reasonCodes(candidate, saturation, hierarchy),
    }));
  }
  output.sort(compareCandidates);
  return Object.freeze(output.slice(0, Math.max(1, Math.min(PRACTICE_WEAKNESS_BOSS_MAX_INTERNAL_CANDIDATES, maxInternal))));
}

export function getPracticeWeaknessBossAvailabilityFromCandidates(candidates = []) {
  const bounded = Array.isArray(candidates) ? candidates.slice(0, PRACTICE_WEAKNESS_BOSS_MAX_VISIBLE_CANDIDATES) : [];
  return freezeDeep({
    available: bounded.length > 0,
    candidateCount: bounded.length,
    recommendedCandidate: bounded[0] ?? null,
    candidates: bounded,
    reasons: bounded.length ? [] : ["no-current-eligible-boss-target"],
  });
}

export function selectPracticeWeaknessBossCandidate(candidates = [], statId, { targetSource = "candidate-choice" } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const selected = list.find((candidate) => candidate.statId === statId) ?? null;
  if (!selected) return null;
  return freezeDeep({ ...selected, targetSource });
}
