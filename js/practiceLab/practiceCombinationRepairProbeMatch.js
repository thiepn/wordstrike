import { PRACTICE_COMBINATION_REPAIR_POLICY_V1 } from "./practiceCombinationRepairPolicy.js";

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

const finiteOrNull = (value) => Number.isFinite(value) ? Number(value) : null;

function featureRms(left = {}, right = {}) {
  const deltas = FEATURE_KEYS
    .map((key) => {
      const a = finiteOrNull(left[key]);
      const b = finiteOrNull(right[key]);
      return a == null || b == null ? null : a - b;
    })
    .filter((value) => value != null);
  return deltas.length ? Math.sqrt(deltas.reduce((sum, value) => sum + value * value, 0) / deltas.length) : 0;
}

function familySet(units = []) {
  return new Set(units.map((unit) => unit.familyId).filter(Boolean));
}

function totalOpportunities(probe) {
  return (probe?.units || []).reduce((sum, unit) => sum + (Number(unit.targetOpportunityCount) || 0), 0);
}

function aggregateFeature(probe, key) {
  const values = (probe?.units || []).map((unit) => finiteOrNull(unit.difficultyFeatures?.[key])).filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function aggregateTypability(probe) {
  const values = (probe?.units || []).map((unit) => finiteOrNull(unit.typabilityScore)).filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function summarizeProbe(probe) {
  return {
    opportunityCount: totalOpportunities(probe),
    families: familySet(probe?.units),
    typabilityScore: aggregateTypability(probe),
    features: Object.fromEntries(FEATURE_KEYS.map((key) => [key, aggregateFeature(probe, key)])),
  };
}

export function scorePracticeCombinationRepairProbePair(entryProbe, exitProbe, policy = PRACTICE_COMBINATION_REPAIR_POLICY_V1) {
  const entry = summarizeProbe(entryProbe);
  const exit = summarizeProbe(exitProbe);
  const familyOverlap = [...entry.families].filter((familyId) => exit.families.has(familyId));
  const opportunityDelta = Math.abs(entry.opportunityCount - exit.opportunityCount);
  const typabilityDelta = entry.typabilityScore == null || exit.typabilityScore == null ? 0 : Math.abs(entry.typabilityScore - exit.typabilityScore);
  const difficultyRms = featureRms(entry.features, exit.features);
  const valid = opportunityDelta === 0
    && familyOverlap.length === 0
    && typabilityDelta <= policy.probes.typabilityDeltaMax
    && difficultyRms <= policy.probes.featureRmsMax;
  return Object.freeze({
    valid,
    opportunityDelta,
    familyOverlap: Object.freeze(familyOverlap.sort()),
    typabilityDelta,
    featureRms: difficultyRms,
    score: valid ? typabilityDelta + difficultyRms : Number.POSITIVE_INFINITY,
  });
}

export function selectPracticeCombinationRepairProbePair({ entryCandidates = [], exitCandidates = [], policy = PRACTICE_COMBINATION_REPAIR_POLICY_V1 } = {}) {
  const candidates = [];
  for (const entry of entryCandidates) {
    for (const exit of exitCandidates) {
      const match = scorePracticeCombinationRepairProbePair(entry, exit, policy);
      if (!match.valid) continue;
      candidates.push({ entry, exit, match });
    }
  }
  candidates.sort((a, b) => a.match.score - b.match.score
    || String(a.entry.probeId || "").localeCompare(String(b.entry.probeId || ""))
    || String(a.exit.probeId || "").localeCompare(String(b.exit.probeId || "")));
  const selected = candidates[0];
  return selected ? Object.freeze({ entry: selected.entry, exit: selected.exit, match: selected.match }) : null;
}
