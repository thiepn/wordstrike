export const PRACTICE_PACE_LADDER_VERSION = 2;
export const PRACTICE_PACE_LADDER_POLICY_VERSION = 2;
export const PRACTICE_PACE_LADDER_PROTOCOL_VERSION = 2;
export const PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION = 1;
export const PRACTICE_PACE_LADDER_GENERATOR_VERSION = 1;
export const PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION = 2;
export const PRACTICE_PACE_LADDER_STAGE_VERSION = 2;
export const PRACTICE_PACE_GUIDE_VERSION = 1;
export const PRACTICE_PACE_LADDER_RESULT_VERSION = 2;
export const PRACTICE_PACE_LADDER_ARTIFACT_VERSION = 2;
export const PRACTICE_PACE_LADDER_EXPERIMENT_ID = "pace-ladder";
export const PRACTICE_PACE_LADDER_EXPERIMENT_VERSION = 2;
export const PRACTICE_PACE_LADDER_FORM_SET_ID = "WS-PACE-EN-1";
export const PRACTICE_PACE_LADDER_FORM_SET_VERSION = 1;
export const PRACTICE_PACE_LADDER_SELECTION_VERSION = 1;

export const PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS = 30_000;
export const PRACTICE_PACE_LADDER_RUNG_DURATION_MS = 20_000;
export const PRACTICE_PACE_LADDER_RATIOS = Object.freeze([0.75, 0.85, 0.95, 1.05, 1.15, 1.25, 1.10, 0.90]);
export const PRACTICE_PACE_LADDER_RUNG_COUNT = PRACTICE_PACE_LADDER_RATIOS.length;
export const PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS = PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS + PRACTICE_PACE_LADDER_RUNG_COUNT * PRACTICE_PACE_LADDER_RUNG_DURATION_MS;
export const PRACTICE_PACE_LADDER_STAGE_IDS = Object.freeze(["reference", ...PRACTICE_PACE_LADDER_RATIOS.map((_, index) => `rung-${index + 1}`)]);
export const PRACTICE_PACE_LADDER_MAIN_STAGE_IDS = Object.freeze(PRACTICE_PACE_LADDER_STAGE_IDS.slice(1));
export const PRACTICE_PACE_LADDER_FRONTIER_MIN_STAGE_POINTS = 5;
export const PRACTICE_PACE_LADDER_REFERENCE_MIN_INSERTIONS = 50;
export const PRACTICE_PACE_LADDER_REFERENCE_MIN_FIRST_PASS_ACCURACY = 0.70;
export const PRACTICE_PACE_LADDER_TARGET_WPM_MIN = 5;
export const PRACTICE_PACE_LADDER_TARGET_WPM_MAX = 400;
export const PRACTICE_PACE_LADDER_TARGET_PRECISION_WPM = 0.1;
export const PRACTICE_PACE_LADDER_PACE_BAND_SECONDS = 0.75;

// Historical protocol values are named explicitly so persisted v1 results can be
// identified without making the superseded schedule launchable.
export const PRACTICE_PACE_LADDER_LEGACY_V1 = Object.freeze({
  experimentVersion: 1,
  policyVersion: 1,
  referenceMs: 25_000,
  rungMs: 25_000,
  ratios: Object.freeze([0.85, 0.95, 1.05, 1.15, 1.25]),
  validationMs: 40_000,
});

export const PRACTICE_PACE_GUIDE_STATUSES = Object.freeze(["behind", "on-pace", "ahead"]);
export const PRACTICE_PACE_LADDER_ANCHOR_SOURCES = Object.freeze(["pl14-frontier", "in-session-reference", "unavailable"]);
export const PRACTICE_PACE_LADDER_RESULT_STATUSES = Object.freeze(["complete", "insufficient-measurement", "unavailable", "interrupted"]);
export const PRACTICE_PACE_LADDER_STAGE_INVALID_REASONS = Object.freeze([
  "duration", "too-few-characters", "accuracy-floor", "coverage", "protocol-interruption", "measurement-corruption",
]);
export const PRACTICE_PACE_LADDER_EVIDENCE_BOUNDARY = Object.freeze({
  supportsPaceControl: true,
  supportsMaxSpeed: false,
  supportsEndurance: false,
  supportsLatentAbility: false,
  producesAbilityObservation: false,
  producesLearningDose: false,
});
