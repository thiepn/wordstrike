import { PRACTICE_PROBLEM_WORDS_POLICY_V1 } from "./practiceProblemWordsPolicy.js";

const FEATURE_KEYS = Object.freeze(["meanWordLength", "p90WordLength", "uppercaseRatio", "punctuationRatio", "digitRatio", "symbolRatio", "lexicalRarityScore", "bigramRarityScore"]);
const finite = Number.isFinite;
const list = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

function ids(probe, keys) {
  const result = new Set();
  for (const unit of probe?.units ?? []) for (const key of keys) for (const value of list(unit?.[key])) if (value) result.add(value);
  return result;
}
const opportunities = (probe) => (probe?.units ?? []).reduce((sum, unit) => sum + Number(unit?.targetOpportunityCount || 0), 0);
function weighted(probe, getter) {
  let total = 0; let weight = 0;
  for (const unit of probe?.units ?? []) {
    const value = getter(unit); if (!finite(value)) continue;
    const w = Math.max(1, Number(unit?.targetOpportunityCount || 1)); total += value * w; weight += w;
  }
  return weight ? total / weight : null;
}
function featureRms(a, b) {
  const values = FEATURE_KEYS.map((key) => {
    const left = weighted(a, (unit) => unit?.difficultyFeatures?.[key]);
    const right = weighted(b, (unit) => unit?.difficultyFeatures?.[key]);
    return finite(left) && finite(right) ? left - right : null;
  }).filter(finite);
  return values.length ? Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) : 0;
}
function launchProfile(probe) {
  const counts = new Map(); let total = 0;
  for (const unit of probe?.units ?? []) for (const signature of unit?.launchSignatures ?? []) {
    if (!signature || signature === "unknown") continue;
    counts.set(signature, (counts.get(signature) ?? 0) + 1); total += 1;
  }
  return { counts, total };
}
function launchTvd(a, b) {
  const left = launchProfile(a); const right = launchProfile(b);
  if (!left.total || !right.total) return null;
  const keys = new Set([...left.counts.keys(), ...right.counts.keys()]);
  let distance = 0;
  for (const key of keys) distance += Math.abs((left.counts.get(key) ?? 0) / left.total - (right.counts.get(key) ?? 0) / right.total);
  return 0.5 * distance;
}

export function scorePracticeProblemWordsProbePair(entry, exit, policy = PRACTICE_PROBLEM_WORDS_POLICY_V1) {
  const entryFamilies = ids(entry, ["familyId", "familyIds", "sourceFamilyIds"]);
  const exitFamilies = ids(exit, ["familyId", "familyIds", "sourceFamilyIds"]);
  const entryContents = ids(entry, ["contentId", "contentIds", "sourceContentIds"]);
  const exitContents = ids(exit, ["contentId", "contentIds", "sourceContentIds"]);
  const familyOverlap = [...entryFamilies].filter((id) => exitFamilies.has(id));
  const contentOverlap = [...entryContents].filter((id) => exitContents.has(id));
  const entryDifficulty = weighted(entry, (unit) => unit?.typabilityScore ?? unit?.difficultyIndex);
  const exitDifficulty = weighted(exit, (unit) => unit?.typabilityScore ?? unit?.difficultyIndex);
  const typabilityDelta = finite(entryDifficulty) && finite(exitDifficulty) ? Math.abs(entryDifficulty - exitDifficulty) : 0;
  const rms = featureRms(entry, exit);
  const launchDistance = launchTvd(entry, exit);
  const entryMode = entry?.compositionMode ?? entry?.units?.[0]?.compositionMode ?? null;
  const exitMode = exit?.compositionMode ?? exit?.units?.[0]?.compositionMode ?? null;
  const valid = opportunities(entry) === 3 && opportunities(exit) === 3
    && familyOverlap.length === 0 && contentOverlap.length === 0
    && Boolean(entryMode) && entryMode === exitMode
    && typabilityDelta <= policy.probes.typabilityDifferenceMaximum
    && rms <= policy.probes.featureRmsMaximum
    && (launchDistance == null || launchDistance <= policy.probes.launchContextTvdMaximum);
  return freezeDeep({
    valid,
    entryOpportunityCount: opportunities(entry), exitOpportunityCount: opportunities(exit),
    compositionMode: entryMode === exitMode ? entryMode : null,
    familyOverlap: familyOverlap.sort(), contentOverlap: contentOverlap.sort(),
    typabilityDelta, featureRms: rms,
    launchContextProfileDistance: launchDistance,
    launchContextProfileCoverage: launchDistance == null ? "reduced" : "available",
    score: valid ? typabilityDelta + rms + (launchDistance ?? 0) : Number.POSITIVE_INFINITY,
  });
}

export function selectPracticeProblemWordsProbePair({ entryCandidates = [], exitCandidateBuilder = null, exitCandidates = [], policy = PRACTICE_PROBLEM_WORDS_POLICY_V1 } = {}) {
  const valid = [];
  for (const entry of entryCandidates ?? []) {
    const exits = typeof exitCandidateBuilder === "function" ? exitCandidateBuilder(entry) : exitCandidates;
    for (const exit of exits ?? []) {
      const match = scorePracticeProblemWordsProbePair(entry, exit, policy);
      if (match.valid) valid.push({ entry, exit, match });
    }
  }
  valid.sort((a, b) => a.match.score - b.match.score || String(a.entry?.probeId ?? "").localeCompare(String(b.entry?.probeId ?? "")) || String(a.exit?.probeId ?? "").localeCompare(String(b.exit?.probeId ?? "")));
  return valid.length ? freezeDeep(valid[0]) : null;
}
