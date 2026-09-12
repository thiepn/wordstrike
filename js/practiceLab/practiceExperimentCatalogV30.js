import { validatePracticeSerializable } from "./practiceValidation.js";

export const PRACTICE_EXPERIMENT_STATUSES = Object.freeze(["planned", "available", "preview", "disabled", "hidden"]);
export const PRACTICE_EXPERIMENT_DIFFICULTIES = Object.freeze(["beginner", "intermediate", "advanced", "adaptive", "all-levels"]);
export const PRACTICE_EXPERIMENT_CATEGORIES = Object.freeze(["assessment", "precision", "speed", "fluency", "real-world", "advanced", "custom"]);
export const PRACTICE_CATEGORY_LABELS = Object.freeze({
  assessment: "Assess", precision: "Precision", speed: "Speed", fluency: "Fluency",
  "real-world": "Real-world", advanced: "Advanced", custom: "Custom",
});
export const PRACTICE_ICON_KEYS = Object.freeze(["assessment", "key", "combination", "word", "target", "bolt", "words", "text", "wave", "metronome", "eye", "endurance", "punctuation", "numbers", "custom"]);
export const PRACTICE_ACCENT_KEYS = Object.freeze(["assessment", "precision", "speed", "fluency", "real-world", "custom"]);

const IDS = [
  "full-assessment", "weak-keys", "combination-repair", "problem-words", "accuracy-control",
  "burst-sprints", "pace-ladder", "common-words", "real-text", "consistency-trainer", "metronome-typing",
  "read-ahead", "endurance", "punctuation-capitals", "numbers-symbols", "custom-text",
];
export const PRACTICE_EXPERIMENT_IDS = Object.freeze(IDS);

const definitions = [
  ["full-assessment", "Full Assessment", "Assessment", "assessment", "Measure a structured baseline with protected natural text and fixed diagnostics.", "Choose Quick, Standard, or Deep. The battery measures natural-text performance, first-pass control, diagnostic coverage, limiter evidence, and—when Deep is fully available—precommitted cold transfer. It reports uncertainty and unmeasured dimensions without producing one universal score.", 4, 12, 12, "all-levels", false, false, 6, 10, "assessment", "assessment", "structured typing measurement"],
  ["weak-keys", "Weak Keys", "Weak Keys", "precision", "Focused practice for one difficult letter, using varied words and contexts rather than isolated repetition.", "Train one measured letter across varied words, word positions, and surrounding transitions. A fixed Baseline → Focus → Context → Mix → Check protocol supplies one direct key-learning dose without prescribing a finger or treating the final check as transfer.", 4, 5, 6, "adaptive", false, false, 8, 10, "key", "precision", "context-dependent key execution"],
  ["combination-repair", "Combination Repair", "Combinations", "precision", "Train slow or inaccurate key combinations.", "Targeted bigram and trigram practice will smooth transitions that repeatedly slow you down or cause mistakes.", 1, 3, 5, "adaptive", false, false, 9, 20, "combination", "precision", "combination timing"],
  ["problem-words", "Problem Words", "Problem Words", "precision", "Focused practice for difficult words, separating how you start the word from how you execute it internally.", "Train one canonical lexical target across Baseline, Focus, Context, Mix, and Check. The mode keeps whole-word first-pass accuracy, starting-the-word execution, and inside-the-word execution distinct while avoiding spelling recall and rote adjacent repetition.", 4, 5, 6, "adaptive", false, false, 10, 30, "word", "precision", "lexical execution"],
  ["accuracy-control", "Accuracy & Recovery", "Accuracy", "precision", "Practice clean first-pass typing and more precise recovery when errors occur, without chasing an artificially slow perfect score.", "Train one canonical key, combination, or word through Baseline, Control, Repair, Mix, and Check. Natural errors remain optional observations: correction is allowed, never forced, and repair feedback appears only after real target-attributed episodes close.", 4, 5, 6, "adaptive", false, false, 11, 40, "target", "precision", "first-pass control and recovery"],
  ["burst-sprints", "Burst Sprints", "Sprints", "speed", "Practice short, controlled bursts above sustainable speed.", "Six 10-second controlled sprints separated by 15-second recovery intervals estimate short-form burst ability without treating one lucky spike as a personal best. The median of the three fastest eligible bouts supplies at most one PL13 burst observation.", 1, 3, 5, "adaptive", false, true, 12, 10, "bolt", "speed", "burst speed"],
  ["pace-ladder", "Pace Ladder", "Pace Ladder", "advanced", "Find the short-form pace where accuracy and control begin to degrade under one fixed diagnostic protocol.", "A 25-second comfortable calibration is followed by five target-blind 25-second stages at 85%, 95%, 105%, 115%, and 125% of the anchor, then a 40-second validation stage. PL14 owns frontier inference. This does not estimate true maximum speed or endurance.", 4, 4, 4, "adaptive", false, true, 26, 15, "wave", "speed", "speed-control frontier"],
  ["common-words", "Common Words", "Common Words", "fluency", "Build fast, fluent execution across a broad range of frequently used words.", "Build fast, fluent execution across a broad common-word repertoire and run a standardized Typing Breadth Check. Practice prioritizes less-observed words within four frequency bands rather than targeting weaknesses; the Check supplies one standardized PL13 common-words ability measurement.", 2, 5, 8, "all-levels", false, false, 13, 10, "words", "fluency", "common-word typing breadth"],
  ["real-text", "Real Text", "Real Text", "real-world", "Practice broad natural text without target-specific cues, or run a protected Cold Transfer Check to measure generalization on fresh material.", "Natural Practice is repeatable training from an approved target-blind training pool. Cold Transfer Check is a separate scarce 60-second PL18 measurement selected independently of current targets and revealed only after a protected reservation is claimed.", 3, 5, 10, "all-levels", false, false, 14, 10, "text", "real-world", "broad natural-text integration"],
  ["consistency-trainer", "Consistency Trainer", "Consistency", "fluency", "Practice steadier natural-text pacing with a gentle self-calibrated pace guide.", "Type natural text at a comfortable pace. After a 30-second self-calibration, a gentle guide shows whether recent pace is slower, steady, or faster relative to your fixed reference. Short-timescale variation and directional drift remain separate measurements.", 3, 6, 10, "all-levels", false, false, 25, 20, "wave", "fluency", "pacing consistency"],
  ["metronome-typing", "Metronome Typing", "Metronome", "fluency", "Develop controlled cadence at adjustable tempos.", "A guided pulse will support deliberate rhythm practice while preserving accuracy and correction awareness.", 2, 5, 8, "intermediate", false, false, 26, 30, "metronome", "fluency", "cadence"],
  ["read-ahead", "Read-Ahead", "Read-Ahead", "fluency", "Train visual preparation beyond the current word.", "Progressive text presentation will encourage planning ahead while keeping the active target understandable.", 3, 6, 10, "intermediate", false, true, 27, 40, "eye", "fluency", "visual preparation"],
  ["endurance", "Endurance", "Endurance", "fluency", "Practice sustained natural-text typing or run a standardized Endurance Check.", "Practice continuous natural text for 5, 10, or 20 minutes, or run a standardized 10-minute Endurance Check that compares late-session performance with an earlier settled period and can supply one PL13 endurance ability observation.", 5, 10, 20, "all-levels", false, false, 28, 50, "endurance", "fluency", "sustained performance"],
  ["punctuation-capitals", "Punctuation & Capitals", "Punctuation", "real-world", "Practice capitalization and common punctuation in realistic text, or run a standardized Check for punctuation-and-capitals ability.", "Practice reliable capitalization, sentence punctuation, quotes, separators, and punctuation boundaries in realistic typing contexts. The protocol scores textual output and does not prescribe a physical Shift-key technique.", 2, 5, 8, "all-levels", false, false, 31, 20, "punctuation", "real-world", "punctuation and capitals"],
  ["numbers-symbols", "Numbers & Symbols", "Numbers", "real-world", "Practice digits and common symbols in practical transcription patterns, or run a standardized Numbers & Symbols Check.", "Practice digits and common practical symbols in structured transcription without assuming one keyboard layout, physical modifier route, numeracy skill, or mental arithmetic.", 2, 5, 8, "all-levels", false, false, 32, 30, "numbers", "real-world", "numbers and symbols"],
  ["custom-text", "Custom Text", "Custom Text", "custom", "Practice with text you choose.", "A future local-only editor will let you train personal material without sending it to rankings or cloud services.", 1, 5, 30, "all-levels", false, false, 33, 10, "custom", "custom", "user-selected material"],
];

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const buildEntry = ([id, title, shortTitle, category, description, longDescription, minimum, recommended, maximum, difficulty, requiresAssessment, requiresPracticeData, implementationPrompt, displayOrder, iconKey, accentKey, primarySkill]) => deepFreeze({
  id, version: 1, title, shortTitle, category, description, longDescription,
  status: ["full-assessment", "weak-keys", "combination-repair", "problem-words", "accuracy-control", "burst-sprints", "real-text", "pace-ladder", "common-words", "consistency-trainer", "endurance", "punctuation-capitals", "numbers-symbols"].includes(id) ? "preview" : "planned",
  estimatedDurationMinutes: { minimum, recommended, maximum }, difficulty,
  requiresAssessment, requiresPracticeData, supportsMobile: true,
  supportsPhysicalKeyboard: true, supportsSoftwareKeyboard: true,
  capabilities: id === "real-text"
    ? ["duration-options", "broad-training", "cold-transfer-launch"]
    : id === "pace-ladder"
      ? ["target-blind", "fixed-protocol", "control-frontier", "pace-guide"]
      : id === "burst-sprints"
        ? ["target-blind", "six-sprint-protocol", "recovery-intervals", "burst-ability", "robust-top-three"]
        : id === "common-words"
          ? ["coverage-first", "balanced-frequency-bands", "word-count-options", "typing-breadth-check", "common-words-ability"]
          : ["punctuation-capitals", "numbers-symbols"].includes(id)
            ? ["duration-options", "standardized-check", "target-blind", "domain-diagnostics", "layout-neutral"]
            : ["weak-keys", "combination-repair", "problem-words", "accuracy-control"].includes(id)
              ? ["manual-target", "recommended-target", "fixed-dose", "same-session-check"]
              : [],
  tags: [category, primarySkill], implementationPrompt, displayOrder,
  iconKey, accentKey, primarySkill,
});

export function validatePracticeExperimentCatalog(catalog) {
  const errors = [];
  const seen = new Set();
  if (!Array.isArray(catalog)) return { valid: false, errors: [{ path: "catalog", code: "INVALID_TYPE" }] };
  catalog.forEach((entry, index) => {
    const path = `catalog.${index}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) { errors.push({ path, code: "INVALID_ENTRY" }); return; }
    if (!/^[a-z0-9][a-z0-9-]{1,99}$/.test(entry.id || "")) errors.push({ path: `${path}.id`, code: "INVALID_ID" });
    if (seen.has(entry.id)) errors.push({ path: `${path}.id`, code: "DUPLICATE_ID" });
    seen.add(entry.id);
    if (!Number.isInteger(entry.version) || entry.version < 1) errors.push({ path: `${path}.version`, code: "INVALID_VERSION" });
    for (const key of ["title", "shortTitle", "description", "longDescription", "primarySkill"]) if (typeof entry[key] !== "string" || !entry[key].trim() || entry[key].length > 600) errors.push({ path: `${path}.${key}`, code: "INVALID_TEXT" });
    if (!PRACTICE_EXPERIMENT_CATEGORIES.includes(entry.category)) errors.push({ path: `${path}.category`, code: "INVALID_CATEGORY" });
    if (!PRACTICE_EXPERIMENT_STATUSES.includes(entry.status)) errors.push({ path: `${path}.status`, code: "INVALID_STATUS" });
    if (!PRACTICE_EXPERIMENT_DIFFICULTIES.includes(entry.difficulty)) errors.push({ path: `${path}.difficulty`, code: "INVALID_DIFFICULTY" });
    if (!Number.isInteger(entry.displayOrder)) errors.push({ path: `${path}.displayOrder`, code: "INVALID_ORDER" });
    if (!Number.isInteger(entry.implementationPrompt) || entry.implementationPrompt < 1) errors.push({ path: `${path}.implementationPrompt`, code: "INVALID_PROMPT" });
    const duration = entry.estimatedDurationMinutes || {};
    if (![duration.minimum, duration.recommended, duration.maximum].every((number) => Number.isFinite(number) && number >= 0) || duration.minimum > duration.recommended || duration.recommended > duration.maximum) errors.push({ path: `${path}.estimatedDurationMinutes`, code: "INVALID_DURATION" });
    if (!PRACTICE_ICON_KEYS.includes(entry.iconKey) || !PRACTICE_ACCENT_KEYS.includes(entry.accentKey)) errors.push({ path, code: "INVALID_VISUAL_KEY" });
    for (const key of ["requiresAssessment", "requiresPracticeData", "supportsMobile", "supportsPhysicalKeyboard", "supportsSoftwareKeyboard"]) if (typeof entry[key] !== "boolean") errors.push({ path: `${path}.${key}`, code: "INVALID_BOOLEAN" });
    for (const key of ["capabilities", "tags"]) if (!Array.isArray(entry[key]) || entry[key].length > 32 || entry[key].some((value) => typeof value !== "string" || value.length > 100)) errors.push({ path: `${path}.${key}`, code: "INVALID_ARRAY" });
    if (!validatePracticeSerializable(entry).valid) errors.push({ path, code: "NOT_SERIALIZABLE" });
  });
  return { valid: errors.length === 0, errors };
}

export const PRACTICE_EXPERIMENT_CATALOG = deepFreeze(definitions.map(buildEntry));
const catalogValidation = validatePracticeExperimentCatalog(PRACTICE_EXPERIMENT_CATALOG);
if (!catalogValidation.valid) throw new Error(`Invalid Practice experiment catalog: ${catalogValidation.errors[0]?.code}`);
const CATALOG_BY_ID = new Map(PRACTICE_EXPERIMENT_CATALOG.map((entry) => [entry.id, entry]));
export const getPracticeExperiment = (experimentId) => CATALOG_BY_ID.get(experimentId) || null;

export const PRACTICE_DAILY_TRAINING = deepFreeze({
  id: "daily-training", version: 1, title: "Today's Training",
  description: "Personalized sessions will combine weakness repair, accuracy, fluency, transfer, and speed practice.",
  recommendedDurationMinutes: 12, supportedDurationsMinutes: [5, 8, 12, 15], status: "planned",
  requiresAssessment: false, requiresPracticeData: true, implementationPrompt: 15,
});
