import { segmentPracticeGraphemes } from "./practiceTextSegmentation.js";
import { PRACTICE_LIMITER_POLICY_V1 } from "./practiceLimiterPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const finite = Number.isFinite;
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const keyFor = (type, key) => `${type}|${key}`;
const strongStatus = (status) => status === "likely" || status === "confirmed";

export function decomposePracticeEntity({ entityType, entityKey } = {}) {
  const graphemes = segmentPracticeGraphemes(String(entityKey ?? ""));
  if (entityType === "bigram" && graphemes.length >= 2) return freezeDeep({ terminal: { entityType: "key", entityKey: graphemes.at(-1) }, prefix: { entityType: "key", entityKey: graphemes.at(-2) }, constituents: [] });
  if (entityType === "trigram" && graphemes.length >= 3) return freezeDeep({ terminal: { entityType: "bigram", entityKey: graphemes.slice(-2).join("") }, constituents: [] });
  if (entityType === "word" && graphemes.length) {
    const bigrams = [];
    for (let index = 1; index < graphemes.length; index += 1) bigrams.push({ entityType: "bigram", entityKey: graphemes.slice(index - 1, index + 1).join(""), position: index - 1 });
    return freezeDeep({ terminal: null, launch: { entityType: "key", entityKey: graphemes[0] }, constituents: bigrams });
  }
  return freezeDeep({ terminal: null, constituents: [] });
}

function effectFor(dimension) {
  if (!dimension) return null;
  switch (dimension.type) {
    case "slow": return dimension.effect?.positiveResidualMs;
    case "hesitant": return dimension.effect?.excessDisfluency;
    case "inaccurate": return dimension.effect?.excessErrorRate;
    case "recovery-heavy": return Math.max(0, Number(dimension.effect?.recoveryRatio || 0));
    case "unstable": return dimension.effect?.instabilityRatio;
    case "launch-limited": return dimension.effect?.positiveLaunchResidualMs;
    default: return null;
  }
}

function eligibleChild(parentDimension, childDimension, policy) {
  if (!parentDimension || !childDimension || !strongStatus(childDimension.status)) return false;
  if (childDimension.evidenceConfidenceScore < parentDimension.evidenceConfidenceScore - policy.hierarchy.confidenceTolerance) return false;
  const parentEffect = effectFor(parentDimension);
  const childEffect = effectFor(childDimension);
  return finite(parentEffect) && parentEffect > 0 && finite(childEffect) && childEffect >= 0;
}

function simpleRelation(parent, child, dimensionType, policy, { childDimensionType = dimensionType, capAtPartial = false } = {}) {
  if (!child) return null;
  const parentDimension = parent.dimensions[dimensionType];
  const childDimension = child.dimensions[childDimensionType];
  if (!eligibleChild(parentDimension, childDimension, policy)) return null;
  const denominator = effectFor(parentDimension);
  const numerator = effectFor(childDimension);
  if (!(denominator > 0) || !finite(numerator)) return null;
  const ratio = clamp01(numerator / denominator);
  return { ratio: capAtPartial ? Math.min(ratio, policy.hierarchy.explainedThreshold - 1e-9) : ratio, child, dimensionType };
}

function wordConstituentRelation(parent, candidatesByEntity, dimensionType, decomposition, policy, { capAtPartial = false } = {}) {
  const parentDimension = parent.dimensions[dimensionType];
  const parentEffect = effectFor(parentDimension);
  if (!(parentEffect > 0) || !decomposition.constituents.length) return null;
  const effects = [];
  const explainers = [];
  for (const constituent of decomposition.constituents) {
    const child = candidatesByEntity.get(keyFor(constituent.entityType, constituent.entityKey));
    const childDimension = child?.dimensions?.[dimensionType];
    if (!child || !eligibleChild(parentDimension, childDimension, policy)) continue;
    const effect = effectFor(childDimension);
    if (!finite(effect) || effect < 0) continue;
    effects.push(effect);
    explainers.push({ child, ratio: clamp01(effect / parentEffect), dimensionType });
  }
  if (!effects.length) return null;
  const mean = effects.reduce((sum, value) => sum + value, 0) / decomposition.constituents.length;
  let ratio = clamp01(mean / parentEffect);
  if (capAtPartial) ratio = Math.min(ratio, policy.hierarchy.explainedThreshold - 1e-9);
  return { ratio, explainers, dimensionType };
}

export function evaluatePracticeCandidateHierarchy(candidate, candidatesByEntity, policy = PRACTICE_LIMITER_POLICY_V1) {
  if (!candidate || candidate.entityType === "key") return freezeDeep({ status: "independent", explanationRatio: 0, explainedBy: [], penalty: policy.hierarchy.penalties.independent });
  const decomposition = decomposePracticeEntity(candidate);
  const relations = [];
  const dimensionTypes = ["slow", "hesitant", "inaccurate", "recovery-heavy"];

  if (candidate.entityType === "bigram" || candidate.entityType === "trigram") {
    const child = decomposition.terminal ? candidatesByEntity.get(keyFor(decomposition.terminal.entityType, decomposition.terminal.entityKey)) : null;
    for (const dimensionType of dimensionTypes) {
      const relation = simpleRelation(candidate, child, dimensionType, policy, { capAtPartial: dimensionType === "recovery-heavy" });
      if (relation) relations.push({ ratio: relation.ratio, explainers: [relation], dimensionType });
    }
  } else if (candidate.entityType === "word") {
    for (const dimensionType of dimensionTypes) {
      const relation = wordConstituentRelation(candidate, candidatesByEntity, dimensionType, decomposition, policy, { capAtPartial: dimensionType === "recovery-heavy" || dimensionType === "inaccurate" });
      if (relation) relations.push(relation);
    }
    const launchChild = decomposition.launch ? candidatesByEntity.get(keyFor(decomposition.launch.entityType, decomposition.launch.entityKey)) : null;
    const launch = simpleRelation(candidate, launchChild, "launch-limited", policy, { childDimensionType: "slow" });
    if (launch) relations.push({ ratio: launch.ratio, explainers: [launch], dimensionType: "launch-limited" });
  }

  // Instability is deliberately not hierarchy-suppressed in v1.
  relations.sort((a, b) => b.ratio - a.ratio || a.dimensionType.localeCompare(b.dimensionType));
  const best = relations[0];
  if (!best || best.ratio < policy.hierarchy.partialThreshold) return freezeDeep({ status: "independent", explanationRatio: best?.ratio ?? 0, explainedBy: [], penalty: policy.hierarchy.penalties.independent });
  const status = best.ratio >= policy.hierarchy.explainedThreshold ? "explained" : "partially-explained";
  const explainers = (best.explainers ?? [])
    .sort((a, b) => b.ratio - a.ratio || a.child.statId.localeCompare(b.child.statId))
    .slice(0, policy.hierarchy.maxExplainers)
    .map(({ child, ratio, dimensionType }) => ({ statId: child.statId, entityType: child.entityType, entityKey: child.entityKey, dimension: dimensionType, explanationRatio: ratio }));
  return freezeDeep({ status, explanationRatio: best.ratio, explainedBy: explainers, penalty: policy.hierarchy.penalties[status] });
}
