import { PRACTICE_WEAK_KEYS_POLICY_V1 } from "./practiceWeakKeysPolicy.js";

const FEATURE_KEYS = Object.freeze([
  "meanWordLength",
  "p90WordLength",
  "uppercaseRatio",
  "punctuationRatio",
  "digitRatio",
  "symbolRatio",
  "lexicalRarityScore",
  "bigramRarityScore",
]);
const POSITION_KEYS = Object.freeze(["word-start", "word-middle", "word-end", "single-character-word"]);
const GEOMETRY_KEYS = Object.freeze(["same-key", "same-side-near", "same-side-far", "cross-side"]);
const finite = (value) => Number.isFinite(value);
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const list = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

function familySet(probe) {
  const result = new Set();
  for (const unit of probe?.units ?? []) for (const id of list(unit.familyIds ?? unit.familyId)) if (id) result.add(id);
  return result;
}

function contentSet(probe) {
  const result = new Set();
  for (const unit of probe?.units ?? []) for (const id of list(unit.contentIds ?? unit.contentId)) if (id) result.add(id);
  return result;
}

function totalOpportunities(probe) {
  return (probe?.units ?? []).reduce((sum, unit) => sum + Number(unit?.targetOpportunityCount || 0), 0);
}

function aggregateFeature(probe, key) {
  let weighted = 0;
  let weight = 0;
  for (const unit of probe?.units ?? []) {
    const value = unit?.difficultyFeatures?.[key];
    if (!finite(value)) continue;
    const unitWeight = Math.max(1, Number(unit?.targetOpportunityCount || 1));
    weighted += value * unitWeight;
    weight += unitWeight;
  }
  return weight ? weighted / weight : null;
}

function featureRms(left, right) {
  const deltas = FEATURE_KEYS.map((key) => {
    const a = aggregateFeature(left, key);
    const b = aggregateFeature(right, key);
    return finite(a) && finite(b) ? a - b : null;
  }).filter(finite);
  return deltas.length ? Math.sqrt(deltas.reduce((sum, value) => sum + value * value, 0) / deltas.length) : 0;
}

function aggregateTypability(probe) {
  let weighted = 0;
  let weight = 0;
  for (const unit of probe?.units ?? []) {
    const value = finite(unit?.typabilityScore) ? unit.typabilityScore : unit?.difficultyIndex;
    if (!finite(value)) continue;
    const unitWeight = Math.max(1, Number(unit?.targetOpportunityCount || 1));
    weighted += value * unitWeight;
    weight += unitWeight;
  }
  return weight ? weighted / weight : null;
}

function aggregateCounts(probe, key, supportedKeys) {
  const result = Object.fromEntries(supportedKeys.map((value) => [value, 0]));
  for (const unit of probe?.units ?? []) {
    const source = unit?.[key] ?? {};
    for (const value of supportedKeys) result[value] += Number(source[value] || 0);
  }
  return result;
}

function profile(counts, keys) {
  const total = keys.reduce((sum, key) => sum + Number(counts[key] || 0), 0);
  return {
    total,
    values: Object.fromEntries(keys.map((key) => [key, total ? Number(counts[key] || 0) / total : null])),
  };
}

function totalVariation(left, right, keys) {
  const a = profile(left, keys);
  const b = profile(right, keys);
  if (!a.total || !b.total) return null;
  return 0.5 * keys.reduce((sum, key) => sum + Math.abs(a.values[key] - b.values[key]), 0);
}

function compositionMode(probe) {
  return probe?.compositionMode ?? probe?.units?.[0]?.compositionMode ?? null;
}

export function scorePracticeWeakKeysProbePair(entryProbe, exitProbe, policy = PRACTICE_WEAK_KEYS_POLICY_V1) {
  const entryOpportunities = totalOpportunities(entryProbe);
  const exitOpportunities = totalOpportunities(exitProbe);
  const entryFamilies = familySet(entryProbe);
  const exitFamilies = familySet(exitProbe);
  const entryContents = contentSet(entryProbe);
  const exitContents = contentSet(exitProbe);
  const familyOverlap = [...entryFamilies].filter((id) => exitFamilies.has(id)).sort();
  const contentOverlap = [...entryContents].filter((id) => exitContents.has(id)).sort();
  const entryTypability = aggregateTypability(entryProbe);
  const exitTypability = aggregateTypability(exitProbe);
  const typabilityDelta = finite(entryTypability) && finite(exitTypability) ? Math.abs(entryTypability - exitTypability) : 0;
  const rms = featureRms(entryProbe, exitProbe);
  const positionDistance = totalVariation(
    aggregateCounts(entryProbe, "positionCounts", POSITION_KEYS),
    aggregateCounts(exitProbe, "positionCounts", POSITION_KEYS),
    POSITION_KEYS,
  );
  const geometryDistance = totalVariation(
    aggregateCounts(entryProbe, "geometryCounts", GEOMETRY_KEYS),
    aggregateCounts(exitProbe, "geometryCounts", GEOMETRY_KEYS),
    GEOMETRY_KEYS,
  );
  const entryMode = compositionMode(entryProbe);
  const exitMode = compositionMode(exitProbe);
  const exactQuota = policy.probes.targetOpportunityCount;
  const valid = entryOpportunities === exactQuota
    && exitOpportunities === exactQuota
    && familyOverlap.length === 0
    && contentOverlap.length === 0
    && Boolean(entryMode)
    && entryMode === exitMode
    && typabilityDelta <= policy.probes.typabilityDeltaMax
    && rms <= policy.probes.featureRmsMax
    && (positionDistance == null || positionDistance <= policy.probes.positionProfileTvMax)
    && (geometryDistance == null || geometryDistance <= policy.probes.geometryProfileTvMax);
  const score = valid
    ? typabilityDelta + rms + (positionDistance ?? 0) + (geometryDistance ?? 0)
    : Number.POSITIVE_INFINITY;
  return freezeDeep({
    valid,
    entryOpportunityCount: entryOpportunities,
    exitOpportunityCount: exitOpportunities,
    compositionMode: entryMode === exitMode ? entryMode : null,
    familyOverlap,
    contentOverlap,
    typabilityDelta,
    featureRms: rms,
    positionProfileDistance: positionDistance,
    positionProfileCoverage: positionDistance == null ? "reduced" : "available",
    geometryProfileDistance: geometryDistance,
    geometryProfileCoverage: geometryDistance == null ? "unavailable" : "available",
    score,
  });
}

export function selectPracticeWeakKeysProbePair({ entryCandidates = [], exitCandidates = [], policy = PRACTICE_WEAK_KEYS_POLICY_V1 } = {}) {
  const valid = [];
  for (const entry of Array.isArray(entryCandidates) ? entryCandidates : []) {
    for (const exit of Array.isArray(exitCandidates) ? exitCandidates : []) {
      const match = scorePracticeWeakKeysProbePair(entry, exit, policy);
      if (match.valid) valid.push({ entry, exit, match });
    }
  }
  valid.sort((a, b) => a.match.score - b.match.score
    || String(a.entry?.probeId ?? "").localeCompare(String(b.entry?.probeId ?? ""))
    || String(a.exit?.probeId ?? "").localeCompare(String(b.exit?.probeId ?? "")));
  return valid.length ? freezeDeep(valid[0]) : null;
}

export const PRACTICE_WEAK_KEYS_PROBE_POSITION_KEYS = POSITION_KEYS;
export const PRACTICE_WEAK_KEYS_PROBE_GEOMETRY_KEYS = GEOMETRY_KEYS;
