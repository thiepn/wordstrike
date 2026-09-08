export const PRACTICE_COACH_PLANNER_VERSION = 1;
export const PRACTICE_COACH_POLICY_VERSION = 1;
export const PRACTICE_COACH_PLAN_VERSION = 1;
export const PRACTICE_COACH_BLOCK_VERSION = 1;
export const PRACTICE_COACH_UTILITY_VERSION = 1;
export const PRACTICE_COACH_REVIEW_GENERATOR_VERSION = 1;

export const PRACTICE_COACH_ALLOWED_MINUTES = Object.freeze([5, 8, 12, 15]);
export const PRACTICE_COACH_DEFAULT_MINUTES = 12;
export const PRACTICE_COACH_PLAN_STATUSES = Object.freeze(["planned", "active", "finished", "abandoned", "expired"]);
export const PRACTICE_COACH_BLOCK_STATUSES = Object.freeze(["pending", "active", "completed", "skipped", "blocked", "invalid"]);
export const PRACTICE_COACH_BLOCK_KINDS = Object.freeze(["review", "targeted-intervention", "real-text"]);

export const PRACTICE_COACH_REVIEW_EXPERIMENT_ID = "daily-coach-review";
export const PRACTICE_COACH_REVIEW_EXPERIMENT_VERSION = 1;

export const PRACTICE_COACH_TARGET_EXPERIMENTS = Object.freeze({
  key: "weak-keys",
  bigram: "combination-repair",
  trigram: "combination-repair",
  word: "problem-words",
});

export const PRACTICE_COACH_TARGET_COST_MINUTES = 5;
export const PRACTICE_COACH_REVIEW_COST_MINUTES = 2;
export const PRACTICE_COACH_REAL_TEXT_MINUTES = Object.freeze([10, 5, 3]);

export const PRACTICE_COACH_REASON_CODES = Object.freeze([
  "overdue-review",
  "high-review-value",
  "high-impact-limiter",
  "high-confidence-limiter",
  "accuracy-recovery-match",
  "key-foundation",
  "combination-limiter",
  "word-limiter",
  "learning-headroom",
  "saturation-deemphasis",
  "broad-integration",
  "readiness-reduced",
  "warmup-observed",
  "invalid-budget-setting",
]);

export const PRACTICE_COACH_ACTIONABLE_UTILITY = 35;
export const PRACTICE_COACH_SECOND_TARGET_UTILITY = 60;
export const PRACTICE_COACH_SECOND_TARGET_DIVERSITY_WINDOW = 10;
export const PRACTICE_COACH_MAX_INITIAL_LIMITER_CANDIDATES = 32;
export const PRACTICE_COACH_MAX_ACTIONABLE_TARGETS = 8;
export const PRACTICE_COACH_MAX_FEASIBILITY_CHECKS = 8;
export const PRACTICE_COACH_REVIEW_MAX_ITEMS = 4;
export const PRACTICE_COACH_REVIEW_MAX_COST_UNITS = 4;
