export const PRACTICE_PHYSICAL_TELEMETRY_VERSION = 1;
export const PRACTICE_PHYSICAL_TELEMETRY_POLICY_VERSION = 1;
export const PRACTICE_PHYSICAL_CODE_MAP_VERSION = 1;
export const PRACTICE_PHYSICAL_MODIFIER_VERSION = 1;
export const PRACTICE_PHYSICAL_STAT_VERSION = 1;
export const PRACTICE_PHYSICAL_SESSION_VERSION = 1;
export const PRACTICE_PHYSICAL_DIAGNOSTICS_VERSION = 1;

export const PRACTICE_PHYSICAL_TELEMETRY_SETTING = "physicalKeyboardTelemetryEnabled";
export const PRACTICE_PHYSICAL_ENTITY_TYPES = Object.freeze(["physical-key", "physical-transition", "modifier-route"]);
export const PRACTICE_PHYSICAL_SESSION_STATUSES = Object.freeze(["applied", "skipped", "insufficient", "failed"]);
export const PRACTICE_PHYSICAL_SHIFT_SIDES = Object.freeze(["none", "left", "right", "both", "unknown"]);
export const PRACTICE_PHYSICAL_OUTPUT_CLASSES = Object.freeze([
  "lowercase-letter", "uppercase-letter", "digit", "punctuation", "symbol", "whitespace", "other",
]);

export const PRACTICE_PHYSICAL_LIMITS = Object.freeze({
  minimumEligibleTextEvents: 30,
  minimumCodeCoverage: 0.8,
  sessionTransitions: 512,
  sessionModifierRoutes: 64,
  sessionSamplesPerEntity: 8,
  recentSamplesPerEntity: 32,
  keyStatsPerContext: 128,
  transitionStatsPerContext: 2048,
  modifierStatsPerContext: 128,
  totalStatsPerContext: 2304,
  sessionMarkersPerProfile: 500,
  sessionMarkerRetentionDays: 180,
  maxStatBytes: 8 * 1024,
});

export const PRACTICE_PHYSICAL_CONFIDENCE_THRESHOLDS = Object.freeze({
  "physical-key": Object.freeze({
    low: Object.freeze({ observations: 20, sessions: 2 }),
    medium: Object.freeze({ observations: 50, sessions: 3 }),
    high: Object.freeze({ observations: 150, sessions: 5 }),
  }),
  "physical-transition": Object.freeze({
    low: Object.freeze({ observations: 12, sessions: 2 }),
    medium: Object.freeze({ observations: 30, sessions: 3 }),
    high: Object.freeze({ observations: 80, sessions: 5 }),
  }),
  "modifier-route": Object.freeze({
    low: Object.freeze({ observations: 10, sessions: 2 }),
    medium: Object.freeze({ observations: 30, sessions: 3 }),
    high: Object.freeze({ observations: 80, sessions: 5 }),
  }),
});

export const PRACTICE_PHYSICAL_ELIGIBLE_EVIDENCE_ROLES = Object.freeze(["training", "diagnostic"]);
export const PRACTICE_PHYSICAL_EXCLUDED_EVIDENCE_ROLES = Object.freeze(["custom", "transfer", "benchmark", "research-holdout"]);
