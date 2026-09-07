import { hashPracticeContent } from "./practiceIds.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const list = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const identity = (candidate) => String(candidate?.candidateId ?? candidate?.contentId ?? candidate?.generatedUnitId ?? "");

function diversity(units) {
  const families = new Set();
  const launches = new Set();
  const preceding = new Set();
  const lexical = new Set();
  for (const unit of units) {
    for (const value of list(unit.familyIds ?? unit.familyId ?? unit.sourceFamilyIds)) if (value) families.add(value);
    for (const value of list(unit.launchSignatures)) if (value && value !== "unknown") launches.add(value);
    for (const value of list(unit.precedingLexicalKeys)) if (value) preceding.add(value);
    for (const value of list(unit.lexicalKeys ?? unit.wordKeys)) if (value) lexical.add(value);
  }
  return { familyCount: families.size, launchContextCount: launches.size, precedingLexicalCount: preceding.size, lexicalCount: lexical.size };
}

function better(left, right, orderKeys) {
  if (!right) return true;
  const a = diversity(left); const b = diversity(right);
  for (const key of ["familyCount", "launchContextCount", "precedingLexicalCount", "lexicalCount"]) {
    if (a[key] !== b[key]) return a[key] > b[key];
  }
  if (left.length !== right.length) return left.length < right.length;
  const ak = left.map((unit) => orderKeys.get(unit)).sort().join("|");
  const bk = right.map((unit) => orderKeys.get(unit)).sort().join("|");
  return ak.localeCompare(bk) < 0;
}

export function practiceProblemWordsCandidateOrderKey(candidate, { sessionId, entityKey, generatorVersion = 1, policyVersion = 1, salt = "default" } = {}) {
  return hashPracticeContent([sessionId ?? "", entityKey ?? "", generatorVersion, policyVersion, salt, identity(candidate)].join("|"));
}

export function selectPracticeProblemWordsExactQuota(candidates, quota, options = {}) {
  if (!Number.isInteger(quota) || quota < 0 || quota > 15) throw new TypeError("Problem Words quota must be an integer from 0 to 15");
  if (quota === 0) return freezeDeep({ units: [], targetOpportunityCount: 0, metrics: diversity([]) });
  const source = (Array.isArray(candidates) ? candidates : []).filter((candidate) => Number.isInteger(candidate?.targetOpportunityCount) && candidate.targetOpportunityCount > 0 && candidate.targetOpportunityCount <= quota && identity(candidate));
  const orderKeys = new Map(source.map((candidate) => [candidate, practiceProblemWordsCandidateOrderKey(candidate, options)]));
  const ordered = [...source].sort((a, b) => orderKeys.get(a).localeCompare(orderKeys.get(b)) || identity(a).localeCompare(identity(b)));
  const dp = Array(quota + 1).fill(null); dp[0] = [];
  for (const candidate of ordered) {
    const count = candidate.targetOpportunityCount;
    for (let sum = quota; sum >= count; sum -= 1) {
      if (!dp[sum - count]) continue;
      const proposed = [...dp[sum - count], candidate];
      if (better(proposed, dp[sum], orderKeys)) dp[sum] = proposed;
    }
  }
  if (!dp[quota]) return null;
  return freezeDeep({ units: dp[quota], targetOpportunityCount: quota, metrics: diversity(dp[quota]), solutionHash: hashPracticeContent(dp[quota].map(identity).join("|")) });
}

export function orderPracticeProblemWordsNeutralLexicalItems(items, options = {}) {
  return Object.freeze([...(items ?? [])].sort((a, b) => practiceProblemWordsCandidateOrderKey(a, options).localeCompare(practiceProblemWordsCandidateOrderKey(b, options)) || identity(a).localeCompare(identity(b))));
}
