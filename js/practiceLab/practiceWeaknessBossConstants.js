export const PRACTICE_WEAKNESS_BOSS_VERSION = 1;
export const PRACTICE_WEAKNESS_BOSS_POLICY_VERSION = 1;
export const PRACTICE_WEAKNESS_BOSS_SELECTION_VERSION = 1;
export const PRACTICE_WEAKNESS_BOSS_PLAN_VERSION = 1;
export const PRACTICE_WEAKNESS_BOSS_GENERATOR_VERSION = 1;
export const PRACTICE_WEAKNESS_BOSS_PROBE_VERSION = 1;
export const PRACTICE_WEAKNESS_BOSS_GAMEPLAY_VERSION = 1;
export const PRACTICE_WEAKNESS_BOSS_THEME_VERSION = 1;
export const PRACTICE_WEAKNESS_BOSS_RESULT_VERSION = 1;
export const PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID = "weakness-boss";
export const PRACTICE_WEAKNESS_BOSS_EXPERIMENT_VERSION = 1;

export const PRACTICE_WEAKNESS_BOSS_ENTITY_TYPES = Object.freeze(["key", "bigram", "trigram", "word"]);
export const PRACTICE_WEAKNESS_BOSS_TARGET_SOURCES = Object.freeze(["recommended", "candidate-choice"]);
export const PRACTICE_WEAKNESS_BOSS_ACTIONABLE_UTILITY = 35;
export const PRACTICE_WEAKNESS_BOSS_MAX_LIMITER_CANDIDATES = 32;
export const PRACTICE_WEAKNESS_BOSS_MAX_PREFLIGHT_CANDIDATES = 8;
export const PRACTICE_WEAKNESS_BOSS_MAX_INTERNAL_CANDIDATES = 8;
export const PRACTICE_WEAKNESS_BOSS_MAX_VISIBLE_CANDIDATES = 5;
export const PRACTICE_WEAKNESS_BOSS_MIN_QUALITY_COVERAGE = 0.60;

export const PRACTICE_WEAKNESS_BOSS_ESTIMATED_DURATION = Object.freeze({ minimum: 4, recommended: 6, maximum: 8 });

export const PRACTICE_WEAKNESS_BOSS_PHASES = Object.freeze([
  Object.freeze({ id: "opening-probe", label: "Opening Probe", cue: "off", acquisitionDoseEligible: false, hpAllocation: 0 }),
  Object.freeze({ id: "break-guard", label: "Break Guard", cue: "strong", acquisitionDoseEligible: true, hpAllocation: 30 }),
  Object.freeze({ id: "pressure", label: "Pressure", cue: "subtle", acquisitionDoseEligible: true, hpAllocation: 30 }),
  Object.freeze({ id: "final-form", label: "Final Form", cue: "off", acquisitionDoseEligible: true, hpAllocation: 30 }),
  Object.freeze({ id: "final-probe", label: "Final Probe", cue: "off", acquisitionDoseEligible: false, hpAllocation: 10 }),
]);

export const PRACTICE_WEAKNESS_BOSS_QUOTAS = Object.freeze({
  key: Object.freeze({ "opening-probe": 8, "break-guard": 24, pressure: 32, "final-form": 24, "final-probe": 8, battle: 80, total: 96 }),
  bigram: Object.freeze({ "opening-probe": 5, "break-guard": 15, pressure: 20, "final-form": 15, "final-probe": 5, battle: 50, total: 60 }),
  trigram: Object.freeze({ "opening-probe": 4, "break-guard": 10, pressure: 15, "final-form": 10, "final-probe": 4, battle: 35, total: 43 }),
  word: Object.freeze({ "opening-probe": 3, "break-guard": 4, pressure: 7, "final-form": 4, "final-probe": 3, battle: 15, total: 21 }),
});

export const PRACTICE_WEAKNESS_BOSS_ARCHETYPES = Object.freeze({
  slow: Object.freeze({ id: "anchor", name: "The Anchor", description: "Represents a target currently showing elevated normalized slowdown." }),
  hesitant: Object.freeze({ id: "fog", name: "The Fog", description: "Represents a target currently showing more delayed transitions than comparable targets." }),
  inaccurate: Object.freeze({ id: "trickster", name: "The Trickster", description: "Represents a target currently showing elevated first-pass errors across sufficient observations." }),
  "recovery-heavy": Object.freeze({ id: "hydra", name: "The Hydra", description: "Represents a target whose errors have required more repair than expected." }),
  "launch-limited": Object.freeze({ id: "gatekeeper", name: "The Gatekeeper", description: "Represents a word currently showing more difficulty at its start than during internal execution." }),
  unstable: Object.freeze({ id: "storm", name: "The Storm", description: "Represents a target whose recent execution has varied more than comparable targets." }),
  mixed: Object.freeze({ id: "chimera", name: "The Chimera", description: "Represents a target with more than one currently elevated limiter dimension." }),
});

export const PRACTICE_WEAKNESS_BOSS_REASON_CODES = Object.freeze([
  "confirmed-limiter", "likely-limiter", "high-impact", "learning-headroom", "independent-limiter", "partial-hierarchy",
  "slow-pattern", "hesitation-pattern", "accuracy-pattern", "recovery-pattern", "launch-pattern", "instability-pattern", "mixed-pattern",
]);

export const PRACTICE_WEAKNESS_BOSS_ERRORS = Object.freeze({
  NO_BOSS_READY: "PRACTICE_WEAKNESS_BOSS_NO_TARGET",
  TARGET_STALE: "PRACTICE_WEAKNESS_BOSS_TARGET_STALE",
  TARGET_UNSUPPORTED: "PRACTICE_WEAKNESS_BOSS_TARGET_UNSUPPORTED",
  CONTENT_UNAVAILABLE: "PRACTICE_WEAKNESS_BOSS_CONTENT_UNAVAILABLE",
  PROBE_UNAVAILABLE: "PRACTICE_WEAKNESS_BOSS_PROBE_UNAVAILABLE",
  PLAN_INVALID: "PRACTICE_WEAKNESS_BOSS_PLAN_INVALID",
  CONTEXT_MISMATCH: "PRACTICE_WEAKNESS_BOSS_CONTEXT_MISMATCH",
});
