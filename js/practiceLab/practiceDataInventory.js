import { PRACTICE_RECORD_VERSIONS, PRACTICE_STORE_DEFINITIONS } from "./practiceConstants.js";

export const PRACTICE_DATA_INVENTORY_VERSION = 1;

export const PRACTICE_SENSITIVITY_CLASSES = Object.freeze({
  A: "user-authored-private-content",
  B: "high-sensitivity-local-telemetry",
  C: "protected-measurement-content",
  D: "model-data",
  E: "orchestration-study-data",
  F: "session-metadata",
  G: "static-public-or-structural-data",
});

const entry = (owner, sensitivityClass, {
  recordType = null,
  profileScoped = false,
  contextScoped = false,
  rawContentAllowed = false,
  networkAllowed = false,
  autoPrunable = false,
  resetBehavior = "clear",
  explicitDeleteBehavior = "subsystem-owned",
} = {}) => Object.freeze({
  owner,
  sensitivityClass,
  recordType,
  profileScoped,
  contextScoped,
  rawContentAllowed,
  networkAllowed,
  autoPrunable,
  resetBehavior,
  explicitDeleteBehavior,
});

const METADATA = Object.freeze({
  meta: entry("storage-foundation", "G", { resetBehavior: "reinitialize", explicitDeleteBehavior: "database-reset" }),
  profiles: entry("profile-context", "E", { recordType: "profile", profileScoped: true, resetBehavior: "reinitialize", explicitDeleteBehavior: "profile-delete-or-full-wipe" }),
  contexts: entry("profile-context", "E", { recordType: "context", profileScoped: true, contextScoped: true, resetBehavior: "reinitialize", explicitDeleteBehavior: "context-or-profile-delete" }),
  skillStats: entry("skill-evidence", "D", { recordType: "skillStat", profileScoped: true, contextScoped: true, autoPrunable: true }),
  abilityStates: entry("ability", "D", { recordType: "abilityState", profileScoped: true, contextScoped: true }),
  performanceStates: entry("performance", "D", { recordType: "performanceState", profileScoped: true, contextScoped: true }),
  learningStates: entry("learning", "D", { recordType: "learningState", profileScoped: true, contextScoped: true, autoPrunable: true }),
  evaluationStates: entry("protected-evaluation", "E", { recordType: "evaluationState", profileScoped: true, explicitDeleteBehavior: "reset-or-profile-delete" }),
  assessmentRuns: entry("assessment", "E", { recordType: "assessmentRun", profileScoped: true, contextScoped: true, autoPrunable: true }),
  coachPlans: entry("daily-coach", "E", { recordType: "coachPlan", profileScoped: true, contextScoped: true, autoPrunable: true }),
  sessionSummaries: entry("session-engine", "F", { recordType: "sessionSummary", profileScoped: true, contextScoped: true, autoPrunable: true }),
  reviewItems: entry("retention-review", "D", { recordType: "reviewItem", profileScoped: true, contextScoped: true, autoPrunable: true }),
  customTexts: entry("custom-text", "A", { recordType: "customText", profileScoped: true, rawContentAllowed: true, resetBehavior: "preserve", explicitDeleteBehavior: "explicit-custom-text-delete-or-full-wipe" }),
  presets: entry("practice-presets", "E", { recordType: "preset", profileScoped: true }),
  activeSessionCheckpoints: entry("session-engine", "F", { recordType: "checkpoint", profileScoped: true, contextScoped: true, autoPrunable: true }),
  quarantine: entry("storage-recovery", "F", { recordType: "quarantine", autoPrunable: true, explicitDeleteBehavior: "retention-or-full-wipe" }),
  treatmentEpisodes: entry("treatment-response", "E", { recordType: "treatmentEpisode", profileScoped: true, contextScoped: true, autoPrunable: true }),
  treatmentResponseStates: entry("treatment-response", "D", { recordType: "treatmentResponseState", profileScoped: true, contextScoped: true, autoPrunable: true }),
  physicalTelemetryStats: entry("physical-telemetry", "B", { recordType: "physicalTelemetryStat", profileScoped: true, contextScoped: true, autoPrunable: true, explicitDeleteBehavior: "telemetry-clear-reset-or-profile-delete" }),
  physicalTelemetrySessions: entry("physical-telemetry", "B", { recordType: "physicalTelemetrySession", profileScoped: true, contextScoped: true, autoPrunable: true, explicitDeleteBehavior: "telemetry-clear-reset-or-profile-delete" }),
  researchEnrollments: entry("research", "E", { recordType: "researchEnrollment", profileScoped: true, contextScoped: true, explicitDeleteBehavior: "research-delete-reset-or-profile-delete" }),
  researchAssignments: entry("research", "E", { recordType: "researchAssignment", profileScoped: true, contextScoped: true, autoPrunable: true, explicitDeleteBehavior: "research-delete-reset-or-profile-delete" }),
  researchAnalysisStates: entry("research", "E", { recordType: "researchAnalysisState", profileScoped: true, contextScoped: true, autoPrunable: true, explicitDeleteBehavior: "research-delete-reset-or-profile-delete" }),
});

export function getPracticeDataInventory() {
  return Object.freeze(Object.fromEntries(Object.entries(PRACTICE_STORE_DEFINITIONS).map(([storeName, definition]) => {
    const meta = METADATA[storeName];
    if (!meta) throw new Error(`PL39 inventory is missing store ${storeName}`);
    return [storeName, Object.freeze({
      storeName,
      purpose: meta.owner,
      owner: meta.owner,
      primaryKey: definition.keyPath,
      indexes: Object.freeze(definition.indexes.map((index) => Object.freeze({
        name: index.name,
        keyPath: index.keyPath,
        unique: Boolean(index.options?.unique),
      }))),
      profileScoped: meta.profileScoped,
      contextScoped: meta.contextScoped,
      recordVersion: meta.recordType ? PRACTICE_RECORD_VERSIONS[meta.recordType] ?? null : null,
      recordType: meta.recordType,
      rawContentAllowed: meta.rawContentAllowed,
      networkAllowed: meta.networkAllowed,
      autoPrunable: meta.autoPrunable,
      resetBehavior: meta.resetBehavior,
      explicitDeleteBehavior: meta.explicitDeleteBehavior,
      sensitivityClass: meta.sensitivityClass,
      sensitivity: PRACTICE_SENSITIVITY_CLASSES[meta.sensitivityClass],
    })];
  })));
}

export function validatePracticeDataInventory() {
  const inventory = getPracticeDataInventory();
  const stores = Object.keys(PRACTICE_STORE_DEFINITIONS);
  const errors = [];
  if (Object.keys(inventory).length !== stores.length) errors.push("store-count-mismatch");
  for (const storeName of stores) {
    const item = inventory[storeName];
    if (!item) { errors.push(`missing:${storeName}`); continue; }
    if (item.networkAllowed) errors.push(`network-enabled:${storeName}`);
    if (item.rawContentAllowed && storeName !== "customTexts") errors.push(`raw-content-allowlist:${storeName}`);
    if (storeName === "customTexts" && !item.rawContentAllowed) errors.push("custom-text-source-not-allowed");
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), inventory });
}
