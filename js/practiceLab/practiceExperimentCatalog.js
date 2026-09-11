import { PRACTICE_EXPERIMENT_CATALOG as CATALOG_V30, validatePracticeExperimentCatalog } from "./practiceExperimentCatalogV30.js";
export * from "./practiceExperimentCatalogV30.js";
export { validatePracticeExperimentCatalog };

const CUSTOM_CAPABILITIES = Object.freeze(["plain-text-editor", "local-save", "txt-import", "txt-export", "full-text", "selection", "timed-practice", "local-only"]);
const customDescription = "Paste or save your own plain text and practice it locally without sending the text to rankings, cloud services, standardized ability models, or protected evaluation systems.";
const METRONOME_CAPABILITIES = Object.freeze(["duration-options", "self-calibrated-fixed-tempo", "audio-with-visual-fallback", "counterbalanced-pulse-silent", "target-blind", "experimental", "same-session-profile"]);
const metronomeDescription = "Practice natural-text typing with a fixed self-calibrated pulse, alternating pulse and silent blocks to compare cadence descriptively.";
const metronomeLongDescription = "A target-blind cadence experiment. A silent natural baseline selects one fixed tempo for the session, then counterbalanced pulse-on and pulse-off blocks compare pace variation, effective pace, first-pass accuracy, disfluency, and correction cost. The pulse is an external cadence cue, not a one-key-per-beat target.";
const READ_AHEAD_CAPABILITIES = Object.freeze(["duration-options", "visual-preview-manipulation", "target-blind", "experimental", "same-session-profile"]);
const readAheadDescription = "Practice typing while WordStrike changes how many upcoming words remain visible. This experiment measures how visible preview affects typing—it does not track your eyes.";
const readAheadLongDescription = "An experimental visual-preview exercise that keeps the current text visible while varying whether one, two, or four future words can be seen. It measures how visible preview changes typing performance; it does not track gaze or eye movements.";

export const PRACTICE_EXPERIMENT_CATALOG = Object.freeze(CATALOG_V30.map((entry) => {
  if (entry.id === "custom-text") return Object.freeze({ ...entry, status: "preview", description: "Paste or save your own text and practice it locally.", longDescription: customDescription, requiresAssessment: false, requiresPracticeData: false, supportsMobile: true, supportsPhysicalKeyboard: true, supportsSoftwareKeyboard: true, capabilities: CUSTOM_CAPABILITIES });
  if (entry.id === "metronome-typing") return Object.freeze({ ...entry, status: "preview", description: metronomeDescription, longDescription: metronomeLongDescription, estimatedDurationMinutes: Object.freeze({ minimum: 2, recommended: 5, maximum: 8 }), requiresAssessment: false, requiresPracticeData: false, supportsMobile: true, supportsPhysicalKeyboard: true, supportsSoftwareKeyboard: true, capabilities: METRONOME_CAPABILITIES, tags: Object.freeze(["fluency", "cadence", "experimental"]), primarySkill: "cadence control" });
  if (entry.id === "read-ahead") return Object.freeze({ ...entry, status: "preview", description: readAheadDescription, longDescription: readAheadLongDescription, estimatedDurationMinutes: Object.freeze({ minimum: 3, recommended: 6, maximum: 10 }), requiresAssessment: false, requiresPracticeData: false, supportsMobile: true, supportsPhysicalKeyboard: true, supportsSoftwareKeyboard: true, capabilities: READ_AHEAD_CAPABILITIES, tags: Object.freeze(["fluency", "visible lookahead", "experimental"]), primarySkill: "visible preview" });
  return entry;
}));
const validation = validatePracticeExperimentCatalog(PRACTICE_EXPERIMENT_CATALOG);
if (!validation.valid) throw new Error(`Invalid PL35 Practice experiment catalog: ${validation.errors[0]?.code}`);
const BY_ID = new Map(PRACTICE_EXPERIMENT_CATALOG.map((entry) => [entry.id, entry]));
export const getPracticeExperiment = (experimentId) => BY_ID.get(experimentId) ?? null;
