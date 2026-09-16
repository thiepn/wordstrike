export const PRACTICE_RESEARCH_VERSION = 1;
export const PRACTICE_RESEARCH_STUDY_SCHEMA_VERSION = 1;
export const PRACTICE_RESEARCH_ENROLLMENT_VERSION = 1;
export const PRACTICE_RESEARCH_ASSIGNMENT_VERSION = 1;
export const PRACTICE_RESEARCH_RANDOMIZATION_VERSION = 1;
export const PRACTICE_RESEARCH_PROBE_VERSION = 1;
export const PRACTICE_RESEARCH_CONTAMINATION_VERSION = 1;
export const PRACTICE_RESEARCH_ANALYSIS_VERSION = 1;
export const PRACTICE_RESEARCH_RESULT_VERSION = 1;
export const PRACTICE_RESEARCH_CONSENT_VERSION = 1;

export const PRACTICE_RESEARCH_STUDY_ID = "WS-AB-WEAKNESS-BOSS-1";
export const PRACTICE_RESEARCH_STUDY_VERSION = 1;
export const PRACTICE_RESEARCH_DESIGN = "two-arm-randomized";
export const PRACTICE_RESEARCH_ENTITY_TYPES = Object.freeze(["key", "bigram", "trigram", "word"]);
export const PRACTICE_RESEARCH_STUDY_STATUSES = Object.freeze(["draft", "preview", "available", "paused", "retired"]);
export const PRACTICE_RESEARCH_ENROLLMENT_STATUSES = Object.freeze(["active", "paused", "withdrawn", "completed", "expired"]);
export const PRACTICE_RESEARCH_ASSIGNMENT_STATUSES = Object.freeze([
  "assigned", "baseline-active", "baseline-complete", "treatment-revealed", "treatment-active",
  "followup-waiting", "followup-ready", "followup-complete", "expired", "abandoned", "technical-invalid", "closed",
]);
export const PRACTICE_RESEARCH_ANALYSIS_ELIGIBILITY = Object.freeze([
  "eligible", "missing-baseline", "treatment-incomplete", "followup-missing", "followup-expired", "contaminated", "version-incompatible", "technical-invalid",
]);
export const PRACTICE_RESEARCH_ANALYSIS_STATUSES = Object.freeze(["insufficient", "randomized-signal", "little-observed-difference", "inconclusive"]);
export const PRACTICE_RESEARCH_CONTAMINATION_LEVELS = Object.freeze(["none", "background", "uncertain", "material"]);
export const PRACTICE_RESEARCH_PHASES = Object.freeze(["baseline", "treatment", "followup"]);
export const PRACTICE_RESEARCH_ARMS = Object.freeze({
  FOCUSED: "focused-practice",
  BOSS: "weakness-boss",
});
export const PRACTICE_RESEARCH_ARM_NAMES = Object.freeze({
  [PRACTICE_RESEARCH_ARMS.FOCUSED]: "Focused Practice",
  [PRACTICE_RESEARCH_ARMS.BOSS]: "Weakness Boss",
});
export const PRACTICE_RESEARCH_FOCUSED_MAPPING = Object.freeze({
  key: "weak-keys",
  bigram: "combination-repair",
  trigram: "combination-repair",
  word: "problem-words",
});
export const PRACTICE_RESEARCH_BLOCK_PERMUTATIONS = Object.freeze([
  Object.freeze(["focused-practice", "focused-practice", "weakness-boss", "weakness-boss"]),
  Object.freeze(["focused-practice", "weakness-boss", "focused-practice", "weakness-boss"]),
  Object.freeze(["focused-practice", "weakness-boss", "weakness-boss", "focused-practice"]),
  Object.freeze(["weakness-boss", "focused-practice", "focused-practice", "weakness-boss"]),
  Object.freeze(["weakness-boss", "focused-practice", "weakness-boss", "focused-practice"]),
  Object.freeze(["weakness-boss", "weakness-boss", "focused-practice", "focused-practice"]),
]);
export const PRACTICE_RESEARCH_PROBE_QUOTAS = Object.freeze({ key: 12, bigram: 8, trigram: 6, word: 4 });
export const PRACTICE_RESEARCH_POLICY = Object.freeze({
  blockSize: 4,
  blockArmCount: 2,
  maximumAssignments: 24,
  maximumEnrollmentDays: 90,
  minimumFollowupMs: 24 * 60 * 60 * 1000,
  maximumFollowupMs: 72 * 60 * 60 * 1000,
  directPracticeExclusionMs: 24 * 60 * 60 * 1000,
  targetHardRecencyMs: 7 * 24 * 60 * 60 * 1000,
  targetPreferenceRecencyMs: 30 * 24 * 60 * 60 * 1000,
  qualityCoverageMinimum: 0.60,
  practicalEffectPoints: 5,
  baselineImbalancePoints: 10,
  attritionConcernPp: 20,
  minimumAnalysisTotal: 8,
  minimumAnalysisPerArm: 4,
  strongAnalysisTotal: 12,
  strongAnalysisPerArm: 6,
  minimumCompleteBlocks: 2,
  exploratoryRandomizationP: 0.10,
  recentProbeFamilyMaximum: 64,
});
export const PRACTICE_RESEARCH_PROBE_CONTRACT = Object.freeze({
  experimentId: "research-target-probe",
  role: "diagnostic",
  partition: "diagnostic",
  resumable: false,
  correction: "allow",
  acquisitionDoseEligible: false,
  abilityChannel: null,
  performanceMeasurementKind: null,
  retentionMeasurementKind: null,
  evaluationMeasurementKind: null,
  completion: "content-complete",
  liveWpm: false,
  aggregateAccuracy: false,
  targetCues: false,
  metronome: false,
  bossUi: false,
});