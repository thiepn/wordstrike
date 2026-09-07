import { hashPracticeContent } from "./practiceIds.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function arrayOf(value) {
  return Array.isArray(value) ? value.filter((entry) => entry != null) : value == null ? [] : [value];
}

function candidateIdentity(candidate) {
  return String(candidate?.candidateId ?? candidate?.generatedUnitId ?? candidate?.contentId ?? candidate?.wordKey ?? candidate?.lexicalKey ?? "");
}

export function practiceWeakKeysCandidateOrderKey(candidate, {
  sessionId,
  entityKey,
  generatorVersion,
  policyVersion,
  salt = "default",
} = {}) {
  return hashPracticeContent([
    String(sessionId ?? ""),
    String(entityKey ?? ""),
    Number(generatorVersion || 0),
    Number(policyVersion || 0),
    String(salt),
    candidateIdentity(candidate),
  ].join("|"));
}

function solutionMetrics(candidates, preferredTypabilityRange) {
  const families = new Set();
  const lexical = new Set();
  const positions = new Set();
  const preceding = new Set();
  const following = new Set();
  const geometry = new Set();
  const lexicalCounts = new Map();
  let typabilityCost = 0;
  let typabilityKnown = 0;
  for (const candidate of candidates) {
    for (const value of arrayOf(candidate.familyIds ?? candidate.familyId)) families.add(value);
    for (const value of arrayOf(candidate.lexicalKeys ?? candidate.wordKeys ?? candidate.lexicalKey)) {
      lexical.add(value);
      lexicalCounts.set(value, (lexicalCounts.get(value) ?? 0) + 1);
    }
    for (const value of arrayOf(candidate.positionClasses)) if (value !== "unknown") positions.add(value);
    for (const value of arrayOf(candidate.precedingGraphemes)) preceding.add(value);
    for (const value of arrayOf(candidate.followingGraphemes)) following.add(value);
    for (const value of arrayOf(candidate.geometryClasses)) if (value !== "unknown") geometry.add(value);
    if (Number.isFinite(candidate.typabilityPercentile)) {
      typabilityKnown += 1;
      if (Array.isArray(preferredTypabilityRange) && preferredTypabilityRange.length === 2) {
        const [minimum, maximum] = preferredTypabilityRange;
        if (candidate.typabilityPercentile < minimum) typabilityCost += minimum - candidate.typabilityPercentile;
        else if (candidate.typabilityPercentile > maximum) typabilityCost += candidate.typabilityPercentile - maximum;
      }
    }
  }
  const repetitionPenalty = [...lexicalCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return {
    uniqueFamilyCount: families.size,
    distinctLexicalCount: lexical.size,
    positionClassCount: positions.size,
    precedingContextCount: preceding.size,
    followingContextCount: following.size,
    geometryClassCount: geometry.size,
    repetitionPenalty,
    typabilityCost: typabilityKnown ? typabilityCost / typabilityKnown : 0,
  };
}

function compareMetric(left, right, key, descending = true) {
  const delta = Number(left[key] || 0) - Number(right[key] || 0);
  return descending ? delta : -delta;
}

function solutionTieKey(candidates, orderKeys) {
  return candidates.map((candidate) => orderKeys.get(candidate)).sort().join("|");
}

function betterSolution(left, right, options, orderKeys) {
  if (!right) return true;
  const a = solutionMetrics(left, options.preferredTypabilityRange);
  const b = solutionMetrics(right, options.preferredTypabilityRange);
  for (const [key, descending] of [
    ["uniqueFamilyCount", true],
    ["distinctLexicalCount", true],
    ["positionClassCount", true],
    ["precedingContextCount", true],
    ["followingContextCount", true],
    ["geometryClassCount", true],
    ["repetitionPenalty", false],
    ["typabilityCost", false],
  ]) {
    const comparison = compareMetric(a, b, key, descending);
    if (comparison > 0) return true;
    if (comparison < 0) return false;
  }
  if (left.length !== right.length) return left.length < right.length;
  return solutionTieKey(left, orderKeys).localeCompare(solutionTieKey(right, orderKeys)) < 0;
}

export function selectPracticeWeakKeysExactQuota(candidates, quota, options = {}) {
  if (!Number.isInteger(quota) || quota < 0 || quota > 80) throw new TypeError("Weak Keys exact quota must be an integer from 0 to 80");
  const source = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => Number.isInteger(candidate?.targetOpportunityCount)
      && candidate.targetOpportunityCount > 0
      && candidate.targetOpportunityCount <= quota
      && candidateIdentity(candidate));
  if (quota === 0) return freezeDeep({ units: [], targetOpportunityCount: 0, metrics: solutionMetrics([], options.preferredTypabilityRange) });
  if (!source.length) return null;

  const orderKeys = new Map(source.map((candidate) => [candidate, practiceWeakKeysCandidateOrderKey(candidate, options)]));
  const ordered = [...source].sort((a, b) => orderKeys.get(a).localeCompare(orderKeys.get(b)) || candidateIdentity(a).localeCompare(candidateIdentity(b)));
  const dp = Array(quota + 1).fill(null);
  dp[0] = [];
  for (const candidate of ordered) {
    const count = candidate.targetOpportunityCount;
    for (let sum = quota; sum >= count; sum -= 1) {
      if (!dp[sum - count]) continue;
      const proposed = [...dp[sum - count], candidate];
      if (betterSolution(proposed, dp[sum], options, orderKeys)) dp[sum] = proposed;
    }
  }
  if (!dp[quota]) return null;
  const units = Object.freeze([...dp[quota]]);
  return freezeDeep({
    units,
    targetOpportunityCount: quota,
    metrics: solutionMetrics(units, options.preferredTypabilityRange),
    solutionHash: hashPracticeContent(solutionTieKey(units, orderKeys)),
  });
}

export function summarizePracticeWeakKeysSolution(units = []) {
  return freezeDeep(solutionMetrics(Array.isArray(units) ? units : [], null));
}
