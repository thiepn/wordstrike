import { validatePracticeSerializable } from "./practiceValidation.js";

export const PRACTICE_EXPERIMENT_STATUSES = Object.freeze(["planned", "available", "preview", "disabled", "hidden"]);
export const PRACTICE_EXPERIMENT_DIFFICULTIES = Object.freeze(["beginner", "intermediate", "advanced", "adaptive", "all-levels"]);
export const PRACTICE_EXPERIMENT_CATEGORIES = Object.freeze(["assessment", "precision", "speed", "fluency", "real-world", "advanced", "custom"]);
export const PRACTICE_CATEGORY_LABELS = Object.freeze({
  assessment: "Assess", precision: "Precision", speed: "Speed", fluency: "Fluency",
  "real-world": "Real-world", advanced: "Advanced", custom: "Custom",
});

const IDS = [
  "full-assessment", "weak-keys", "combination-repair", "problem-words", "accuracy-control",
  "burst-sprints", "common-words", "real-text", "consistency-trainer", "metronome-typing",
  "read-ahead", "endurance", "punctuation-capitals", "numbers-symbols", "custom-text",
];
export const PRACTICE_EXPERIMENT_IDS = Object.freeze(IDS);

const definitions = [
  ["full-assessment", "Full Assessment", "Assessment", "assessment", "Build a complete baseline of your typing skills.", "Measure sustainable and burst speed, accuracy, consistency, weak keys, combinations, problem words, and real-text performance.", 4, 4, 6, "adaptive", false, false, 6, 10, "assessment", "assessment", "complete typing profile"],
  ["weak-keys", "Weak Keys", "Weak Keys", "precision", "Strengthen individual keys that cause errors or hesitation.", "Focused repetitions will use assessment and practice evidence to repair specific weak keys without wasting time on mastered keys.", 1, 3, 5, "adaptive", true, true, 8, 10, "key", "precision", "key speed and accuracy"],
  ["combination-repair", "Combination Repair", "Combinations", "precision", "Train slow or inaccurate key combinations.", "Targeted bigram and trigram practice will smooth transitions that repeatedly slow you down or cause mistakes.", 1, 3, 5, "adaptive", false, true, 9, 20, "combination", "precision", "combination timing"],
  ["problem-words", "Problem Words", "Problem Words", "precision", "Repair words that repeatedly break your rhythm.", "Practice troublesome words in varied contexts while tracking accuracy, correction cost, and fluent completion.", 2, 4, 6, "adaptive", false, true, 10, 30, "word", "precision", "word accuracy"],
  ["accuracy-control", "Accuracy Control", "Accuracy", "precision", "Build control at a sustainable error rate.", "Pacing and correction constraints will help you value clean execution before adding more speed.", 2, 4, 6, "all-levels", false, false, 11, 40, "target", "precision", "accuracy control"],
  ["burst-sprints", "Burst Sprints", "Sprints", "speed", "Practice short, controlled bursts above sustainable speed.", "Brief sprint intervals will develop top-end speed while separating useful acceleration from uncontrolled errors.", 1, 3, 5, "adaptive", false, true, 12, 10, "bolt", "speed", "burst speed"],
  ["common-words", "Common Words", "Common Words", "fluency", "Build automatic rhythm on high-frequency words.", "Repeat and vary common words to reduce hesitation and make everyday typing more fluent.", 2, 5, 8, "all-levels", false, false, 13, 10, "words", "fluency", "common-word fluency"],
  ["real-text", "Real Text", "Real Text", "real-world", "Practice natural prose and realistic sentence flow.", "Curated passages will transfer isolated typing skills into punctuation, context, and varied word patterns.", 3, 5, 10, "all-levels", false, false, 14, 10, "text", "real-world", "real-text transfer"],
  ["consistency-trainer", "Consistency Trainer", "Consistency", "fluency", "Reduce uneven pacing across longer sequences.", "Timing feedback will help smooth pauses and spikes without demanding a single rigid typing rhythm.", 3, 6, 10, "adaptive", false, true, 25, 20, "wave", "fluency", "pacing consistency"],
  ["metronome-typing", "Metronome Typing", "Metronome", "fluency", "Develop controlled cadence at adjustable tempos.", "A guided pulse will support deliberate rhythm practice while preserving accuracy and correction awareness.", 2, 5, 8, "intermediate", false, false, 26, 30, "metronome", "fluency", "cadence"],
  ["read-ahead", "Read-Ahead", "Read-Ahead", "fluency", "Train visual preparation beyond the current word.", "Progressive text presentation will encourage planning ahead while keeping the active target understandable.", 3, 6, 10, "intermediate", false, true, 27, 40, "eye", "fluency", "visual preparation"],
  ["endurance", "Endurance", "Endurance", "fluency", "Sustain clean typing through longer sessions.", "Longer passages will measure how speed, accuracy, and consistency change as a session continues.", 5, 10, 20, "all-levels", false, false, 28, 50, "endurance", "fluency", "sustained performance"],
  ["punctuation-capitals", "Punctuation & Capitals", "Punctuation", "real-world", "Practice punctuation, capitalization, and Shift transitions.", "Targeted material will develop reliable sentence mechanics without treating symbols as an afterthought.", 2, 5, 8, "all-levels", false, true, 31, 20, "punctuation", "real-world", "punctuation and capitals"],
  ["numbers-symbols", "Numbers & Symbols", "Numbers", "real-world", "Improve control of numbers and common symbols.", "Structured patterns will train number-row and symbol transitions used in practical typing tasks.", 2, 5, 8, "intermediate", false, true, 32, 30, "numbers", "real-world", "numbers and symbols"],
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
  status: id === "full-assessment" ? "preview" : "planned",
  estimatedDurationMinutes: { minimum, recommended, maximum }, difficulty,
  requiresAssessment, requiresPracticeData, supportsMobile: true,
  supportsPhysicalKeyboard: true, supportsSoftwareKeyboard: true,
  capabilities: [], tags: [category, primarySkill], implementationPrompt, displayOrder,
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
    const duration = entry.estimatedDurationMinutes || {};
    if (![duration.minimum, duration.recommended, duration.maximum].every((n) => Number.isFinite(n) && n >= 0) || duration.minimum > duration.recommended || duration.recommended > duration.maximum) errors.push({ path: `${path}.estimatedDurationMinutes`, code: "INVALID_DURATION" });
    if (!/^[a-z0-9-]+$/.test(entry.iconKey || "") || !/^[a-z0-9-]+$/.test(entry.accentKey || "")) errors.push({ path, code: "INVALID_VISUAL_KEY" });
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
  requiresAssessment: true, requiresPracticeData: true, implementationPrompt: 15,
});
