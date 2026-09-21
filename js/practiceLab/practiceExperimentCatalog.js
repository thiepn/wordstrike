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
const WEAKNESS_BOSS_CAPABILITIES = Object.freeze(["auto-target", "candidate-select", "fixed-dose", "boss-ui", "same-session-probe", "treatment-tracking"]);
const weaknessBoss = Object.freeze({
  id: "weakness-boss", version: 1, title: "Weakness Boss", shortTitle: "Boss",
  description: "Face one of your strongest currently measured weaknesses in a focused Practice challenge.",
  longDescription: "Weakness Boss turns one current measured limiter into a fixed-dose Practice encounter. The target comes from existing Practice evidence rather than a separate weakness model. Boss HP represents challenge progress only; defeating a Boss does not establish mastery, retention, transfer, or a permanent fix.",
  category: "advanced", iconKey: "target", accentKey: "precision", status: "available", requiresAssessment: false, requiresPracticeData: true, difficulty: "adaptive",
  estimatedDurationMinutes: Object.freeze({ minimum: 4, recommended: 6, maximum: 8 }), supportsMobile: true, supportsPhysicalKeyboard: true, supportsSoftwareKeyboard: true,
  capabilities: WEAKNESS_BOSS_CAPABILITIES, tags: Object.freeze(["adaptive", "weakness", "fixed-dose", "experimental"]), primarySkill: "current limiter practice", implementationPrompt: 37, displayOrder: 60,
});
const paceLongDescription = "A reference segment followed by eight controlled pace rungs maps where typing control begins to deteriorate. The Control Frontier model owns the final inference; the guide is pace-position only and no live actual WPM or metronome is used.";
const burstLongDescription = "Six short typing sprints with preview and recovery intervals estimate repeatable brief upper-speed capacity. A 30-second warm-up precedes the six bouts; one valid run contributes at most one robust burst-ability observation and the best single sprint remains descriptive.";

export const PRACTICE_EXPERIMENT_CATALOG = Object.freeze([
  ...CATALOG_V30.map((entry) => {
    const released = { ...entry, status: "available" };
    if (entry.id === "pace-ladder") return Object.freeze({ ...released, description: "A reference segment followed by eight controlled pace rungs maps where typing control begins to deteriorate.", longDescription: paceLongDescription, capabilities: Object.freeze(["target-blind", "fixed-protocol", "control-frontier", "pace-guide", "eight-rung-protocol"]) });
    if (entry.id === "burst-sprints") return Object.freeze({ ...released, description: "Six short typing sprints with preview and recovery intervals estimate repeatable brief upper-speed capacity.", longDescription: burstLongDescription, estimatedDurationMinutes: Object.freeze({ minimum: 3, recommended: 4, maximum: 4 }), capabilities: Object.freeze(["target-blind", "six-sprint-protocol", "warmup", "preview-intervals", "recovery-intervals", "burst-ability", "robust-top-three"]) });
    if (entry.id === "common-words") return Object.freeze({ ...released, longDescription: "Build fluent execution across a broad common-word repertoire and run a standardized Typing Breadth Check. Practice prioritizes less-observed words within four frequency bands rather than targeting weaknesses; the Check contributes one standardized common-word typing-ability measurement." });
    if (entry.id === "real-text") return Object.freeze({ ...released, longDescription: "Natural Practice is repeatable training from an approved target-blind pool. Cold Transfer Check is a separate scarce protected measurement selected independently of current targets and revealed only after a reservation is claimed." });
    if (entry.id === "endurance") return Object.freeze({ ...released, longDescription: "Practice continuous natural text for 5, 10, or 20 minutes, or run a standardized 10-minute Endurance Check that compares late-session performance with an earlier settled period and can contribute one endurance-ability observation." });
    if (entry.id === "combination-repair") return Object.freeze({ ...released, longDescription: "Train one bigram or trigram through a fixed Baseline → Focus → Context → Mix → Check protocol, using target-bearing material without treating the final same-session check as mastery or transfer." });
    if (entry.id === "custom-text") return Object.freeze({ ...released, description: "Paste or save your own text and practice it locally.", longDescription: customDescription, requiresAssessment: false, requiresPracticeData: false, supportsMobile: true, supportsPhysicalKeyboard: true, supportsSoftwareKeyboard: true, capabilities: CUSTOM_CAPABILITIES });
    if (entry.id === "metronome-typing") return Object.freeze({ ...released, description: metronomeDescription, longDescription: metronomeLongDescription, estimatedDurationMinutes: Object.freeze({ minimum: 2, recommended: 5, maximum: 8 }), requiresAssessment: false, requiresPracticeData: false, supportsMobile: true, supportsPhysicalKeyboard: true, supportsSoftwareKeyboard: true, capabilities: METRONOME_CAPABILITIES, tags: Object.freeze(["fluency", "cadence", "experimental"]), primarySkill: "cadence control" });
    if (entry.id === "read-ahead") return Object.freeze({ ...released, description: readAheadDescription, longDescription: readAheadLongDescription, estimatedDurationMinutes: Object.freeze({ minimum: 3, recommended: 6, maximum: 10 }), requiresAssessment: false, requiresPracticeData: false, supportsMobile: true, supportsPhysicalKeyboard: true, supportsSoftwareKeyboard: true, capabilities: READ_AHEAD_CAPABILITIES, tags: Object.freeze(["fluency", "visible lookahead", "experimental"]), primarySkill: "visible preview" });
    return Object.freeze(released);
  }),
  weaknessBoss,
]);
export const PRACTICE_EXPERIMENT_IDS = Object.freeze(PRACTICE_EXPERIMENT_CATALOG.map((entry) => entry.id));
const validation = validatePracticeExperimentCatalog(PRACTICE_EXPERIMENT_CATALOG);
if (!validation.valid) throw new Error(`Invalid PL37 Practice experiment catalog: ${validation.errors[0]?.code}`);
const BY_ID = new Map(PRACTICE_EXPERIMENT_CATALOG.map((entry) => [entry.id, entry]));
export const getPracticeExperiment = (experimentId) => BY_ID.get(experimentId) ?? null;
