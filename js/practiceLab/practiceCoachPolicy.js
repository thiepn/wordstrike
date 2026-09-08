import {
  PRACTICE_COACH_ACTIONABLE_UTILITY,
  PRACTICE_COACH_DEFAULT_MINUTES,
  PRACTICE_COACH_MAX_ACTIONABLE_TARGETS,
  PRACTICE_COACH_MAX_FEASIBILITY_CHECKS,
  PRACTICE_COACH_MAX_INITIAL_LIMITER_CANDIDATES,
  PRACTICE_COACH_POLICY_VERSION,
  PRACTICE_COACH_REVIEW_MAX_COST_UNITS,
  PRACTICE_COACH_REVIEW_MAX_ITEMS,
  PRACTICE_COACH_SECOND_TARGET_DIVERSITY_WINDOW,
  PRACTICE_COACH_SECOND_TARGET_UTILITY,
} from "./practiceCoachConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export const PRACTICE_COACH_POLICY_V1 = freezeDeep({
  version: PRACTICE_COACH_POLICY_VERSION,
  defaultMinutes: PRACTICE_COACH_DEFAULT_MINUTES,
  actionableUtility: PRACTICE_COACH_ACTIONABLE_UTILITY,
  secondTargetUtility: PRACTICE_COACH_SECOND_TARGET_UTILITY,
  diversityWindow: PRACTICE_COACH_SECOND_TARGET_DIVERSITY_WINDOW,
  candidateLimits: {
    limiter: PRACTICE_COACH_MAX_INITIAL_LIMITER_CANDIDATES,
    actionable: PRACTICE_COACH_MAX_ACTIONABLE_TARGETS,
    feasibility: PRACTICE_COACH_MAX_FEASIBILITY_CHECKS,
  },
  masteryModifier: {
    unmeasured: 0.75,
    learning: 1.00,
    acquired: 0.85,
    transferred: 0.60,
    robust: 0.30,
    retained: 0.15,
  },
  saturationModifier: {
    "insufficient-data": 0.75,
    "not-detected": 1.00,
    approaching: 0.85,
    possible: 0.65,
    likely: 0.40,
    supported: 0.20,
    resolved: 0.10,
  },
  marginalGainModifier: {
    high: 1.00,
    moderate: 0.95,
    low: 0.70,
    negative: 0.40,
    unknown: 0.85,
  },
  readinessModifier: {
    elevated: 1.00,
    normal: 1.00,
    reduced: 0.75,
    unknown: 0.90,
    stale: 0.90,
  },
  interventionMatch: {
    canonical: 1.00,
    secondary: 0.85,
    unsupported: 0,
  },
  review: {
    maxItems: PRACTICE_COACH_REVIEW_MAX_ITEMS,
    maxCostUnits: PRACTICE_COACH_REVIEW_MAX_COST_UNITS,
    urgentValue: 70,
    moderateValue: 30,
    inclusionThresholdByMinutes: { 5: 70, 8: 50, 12: 30, 15: 30 },
  },
  maxTargetBlocksByMinutes: { 5: 1, 8: 1, 12: 1, 15: 2 },
  realTextMinutes: [10, 5, 3],
});

export function normalizePracticeCoachRequestedMinutes(value, policy = PRACTICE_COACH_POLICY_V1) {
  const numeric = Number(value);
  return [5, 8, 12, 15].includes(numeric)
    ? { minutes: numeric, diagnostic: null }
    : { minutes: policy.defaultMinutes, diagnostic: "invalid-budget-setting" };
}
