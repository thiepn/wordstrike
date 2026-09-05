import { PRACTICE_ABILITY_POLICY_V1, validatePracticeAbilityPolicy } from "./practiceAbilityPolicy.js";

const freezeDeep = (value) => Object.freeze(value);

export function comparePracticeAbilityEstimates(earlier, later, policy = PRACTICE_ABILITY_POLICY_V1) {
  validatePracticeAbilityPolicy(policy);
  const earlierMean = earlier?.meanLogWpm;
  const laterMean = later?.meanLogWpm;
  const earlierVariance = earlier?.varianceLogWpm;
  const laterVariance = later?.varianceLogWpm;
  if (![earlierMean, laterMean, earlierVariance, laterVariance].every(Number.isFinite) || earlierVariance < 0 || laterVariance < 0) throw new TypeError("Practice ability comparison requires measured finite estimates");
  const deltaLog = laterMean - earlierMean;
  const relativeChange = Math.exp(deltaLog) - 1;
  const absoluteWpmChange = Math.exp(laterMean) - Math.exp(earlierMean);
  const standardErrorLog = Math.sqrt(earlierVariance + laterVariance);
  const z = standardErrorLog > 0 ? deltaLog / standardErrorLog : deltaLog === 0 ? 0 : Math.sign(deltaLog) * Infinity;
  const threshold = policy.comparison.minimumMeaningfulRelativeChange;
  const direction = relativeChange >= threshold ? "higher" : relativeChange <= -threshold ? "lower" : "similar";
  return freezeDeep({
    deltaLog,
    relativeChange,
    absoluteWpmChange,
    standardErrorLog,
    z,
    modelReliable: Math.abs(z) >= policy.comparison.reliableZ,
    practicallyMeaningful: Math.abs(relativeChange) >= threshold,
    direction,
  });
}
