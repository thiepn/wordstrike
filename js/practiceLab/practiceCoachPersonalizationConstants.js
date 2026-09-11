export const PRACTICE_COACH_PERSONALIZATION_VERSION = 1;
export const PRACTICE_COACH_PERSONALIZATION_POLICY_VERSION = 1;
export const PRACTICE_COACH_TREATMENT_OPTIONS_VERSION = 1;

export const PRACTICE_COACH_PERSONALIZATION_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;
export const PRACTICE_COACH_ACCURACY_ALTERNATIVE_MIN_PRESSURE = 20;
export const PRACTICE_COACH_PERSONALIZATION_MAX_AMPLITUDE = 0.20;
export const PRACTICE_COACH_RESPONSE_MODIFIER_MIN = 0.80;
export const PRACTICE_COACH_RESPONSE_MODIFIER_MAX = 1.20;
export const PRACTICE_COACH_PERSONALIZATION_TIE_TOLERANCE = 1e-9;

export const PRACTICE_COACH_PERSONALIZATION_DEPTH_WEIGHTS = Object.freeze({
  insufficient: 0,
  low: 0,
  medium: 0.50,
  high: 1.00,
});

export const PRACTICE_COACH_PERSONALIZATION_FRESHNESS = Object.freeze([
  Object.freeze({ id: "0-30d", maximumAgeMs: 30 * 24 * 60 * 60 * 1000, weight: 1.00 }),
  Object.freeze({ id: "31-90d", maximumAgeMs: 90 * 24 * 60 * 60 * 1000, weight: 0.75 }),
  Object.freeze({ id: "91-180d", maximumAgeMs: PRACTICE_COACH_PERSONALIZATION_LOOKBACK_MS, weight: 0.50 }),
]);

export const PRACTICE_COACH_PERSONALIZATION_OUTCOME_ORDER = Object.freeze({
  "cold-transfer": 3,
  "retention-review": 2,
  "same-protocol-retest": 1,
});

export const PRACTICE_COACH_PERSONALIZATION_DELAY_ORDER = Object.freeze({
  long: 3,
  short: 2,
  "next-day": 1,
});

export const PRACTICE_COACH_PERSONALIZATION_SCOPE_ORDER = Object.freeze({
  "exact-target": 2,
  family: 1,
  none: 0,
});

export const PRACTICE_COACH_PERSONALIZATION_SUPPORTED_ENTITY_TYPES = Object.freeze(["key", "bigram", "trigram", "word"]);
export const PRACTICE_COACH_PERSONALIZATION_SUPPORTED_OUTCOMES = Object.freeze(["cold-transfer", "retention-review", "same-protocol-retest"]);
