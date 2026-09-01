export const ARCADE_RUSH_CONTRACT_VERSION = 1;
export const ARCADE_RUSH_MODE_ID = "arcade-rush";
export const ARCADE_RUSH_DISPLAY_NAME = "Arcade Rush";
export const ARCADE_RUSH_READY_ROUTE = "arcade-rush-ready";

export const ARCADE_RUSH_TARGET_DURATION_MS = Object.freeze({
  minimum: 4 * 60 * 1000,
  maximum: 6 * 60 * 1000,
});

export const ARCADE_RUSH_WAVE_COUNT = 6;
export const ARCADE_RUSH_FINALE_COUNT = 1;
export const ARCADE_RUSH_STARTING_INTEGRITY = 5;

// AR10 owns the numeric gameplay/leaderboard rules freeze. AR0 freezes the
// product and data contract only so balancing can still change safely.
export const ARCADE_RUSH_RULES_STATUS = "UNFROZEN_UNTIL_AR10";

export const ARCADE_RUSH_LIFECYCLE_SEQUENCE = Object.freeze([
  "READY",
  "WAVE_1",
  "WAVE_TRANSITION",
  "WAVE_2",
  "WAVE_TRANSITION",
  "WAVE_3",
  "WAVE_TRANSITION",
  "WAVE_4",
  "WAVE_TRANSITION",
  "WAVE_5",
  "WAVE_TRANSITION",
  "WAVE_6",
  "BOSS_INTRO",
  "BOSS",
  "COMPLETE",
]);

export const ARCADE_RUSH_TERMINAL_STATES = Object.freeze([
  "COMPLETE",
  "FAILED",
]);

export const ARCADE_RUSH_FAILURE_REASONS = Object.freeze([
  "core-destroyed",
]);

// These are the common SessionResult fields Arcade Rush must populate with
// meaningful values. SessionResult may carry additional shared fields such as
// grade without changing this mode contract.
export const ARCADE_RUSH_REQUIRED_RESULT_FIELDS = Object.freeze([
  "sessionId",
  "modeId",
  "variantId",
  "sessionSource",
  "startedAt",
  "endedAt",
  "durationMs",
  "activeDurationMs",
  "seed",
  "developerMode",
  "success",
  "failureReason",
  "score",
  "accuracy",
  "wpm",
  "characters",
  "words",
  "combo",
  "modeData",
]);

export const ARCADE_RUSH_MODE_DATA_FIELDS = Object.freeze([
  "contractVersion",
  "rulesVersion",
  "recordEligible",
  "wavesCompleted",
  "finalWave",
  "bossDefeated",
  "bossTimeRemainingMs",
  "integrityRemaining",
  "perfectWaves",
  "wordPoints",
  "waveClearBonus",
  "perfectWaveBonus",
  "bossBonus",
  "integrityBonus",
  "accuracyBonus",
  "timeBonus",
]);

export const ARCADE_RUSH_SCORE_COMPONENT_FIELDS = Object.freeze([
  "wordPoints",
  "waveClearBonus",
  "perfectWaveBonus",
  "bossBonus",
  "integrityBonus",
  "accuracyBonus",
  "timeBonus",
]);

export const ARCADE_RUSH_GLOBAL_RANKING_POLICY = Object.freeze({
  completedRunsOnly: true,
  requiresFinalBossDefeat: true,
  retryUsesNewSeed: true,
  calendarScoped: false,
  attemptLimited: false,
  tieBreakOrder: Object.freeze([
    "score:desc",
    "accuracy:desc",
    "activeDurationMs:asc",
    "endedAt:asc",
  ]),
});

export const ARCADE_RUSH_V1_NON_GOALS = Object.freeze([
  "daily-seeds",
  "calendar-challenges",
  "daily-streaks",
  "attempt-limits",
  "power-ups",
  "shops",
  "roguelike-upgrades",
  "currencies",
  "skill-trees",
  "seasons",
  "multiple-difficulties",
  "multiple-run-lengths",
  "random-rule-modifiers",
  "gameplay-attestation",
]);

export function isArcadeRushWaveState(value) {
  return /^WAVE_[1-6]$/.test(String(value || ""));
}

export function isArcadeRushTerminalState(value) {
  return ARCADE_RUSH_TERMINAL_STATES.includes(value);
}
