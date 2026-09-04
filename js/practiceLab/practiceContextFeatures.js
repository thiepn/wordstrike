import { classifyPracticeKeyboardGeometry } from "./practiceKeyboardGeometry.js";
import { createUnavailablePracticeReferenceFrequencyProvider } from "./practiceReferenceFrequency.js";

export const PRACTICE_CONTEXT_FEATURE_VERSION = 1;

export const PRACTICE_CONTEXT_STRUCTURAL_CLASSES = Object.freeze([
  "within-word",
  "word-boundary",
  "punctuation",
  "numeric",
  "mixed",
  "unknown",
]);

export const PRACTICE_WORD_POSITION_CLASSES = Object.freeze([
  "word-start",
  "word-middle",
  "word-end",
  "single-character-word",
  "non-word",
  "unknown",
]);

export const PRACTICE_WORD_LENGTH_BANDS = Object.freeze([
  "1-3",
  "4-6",
  "7-9",
  "10+",
  "unknown",
]);

export const PRACTICE_INPUT_CLASSES = Object.freeze([
  "letter-lower",
  "letter-upper",
  "digit",
  "whitespace",
  "punctuation",
  "symbol",
  "other",
]);

const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;
const PUNCTUATION = /\p{P}/u;
const SYMBOL = /\p{S}/u;
const WHITESPACE = /\s/u;

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function languageBase(value) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/_/g, "-").toLowerCase()
    : "und";
}

function mapStructuralClass(value) {
  if (value === "whitespace") return "word-boundary";
  return PRACTICE_CONTEXT_STRUCTURAL_CLASSES.includes(value) ? value : "unknown";
}

function classifyInput(value, language) {
  if (typeof value !== "string" || !value) return "other";
  if (WHITESPACE.test(value)) return "whitespace";
  if (DIGIT.test(value)) return "digit";
  if (PUNCTUATION.test(value)) return "punctuation";
  if (SYMBOL.test(value)) return "symbol";
  if (!LETTER.test(value)) return "other";
  let upper;
  let lower;
  try {
    upper = value.toLocaleUpperCase(language === "und" ? undefined : language);
    lower = value.toLocaleLowerCase(language === "und" ? undefined : language);
  } catch {
    upper = value.toUpperCase();
    lower = value.toLowerCase();
  }
  return upper !== lower && value === upper ? "letter-upper" : "letter-lower";
}

function wordLengthBand(length) {
  if (!Number.isInteger(length) || length < 1) return "unknown";
  if (length <= 3) return "1-3";
  if (length <= 6) return "4-6";
  if (length <= 9) return "7-9";
  return "10+";
}

function normalizeBigram(value, language) {
  try {
    return value.normalize("NFC").toLocaleLowerCase(language === "und" ? undefined : language);
  } catch {
    return value.normalize("NFC").toLowerCase();
  }
}

export function createPracticeSessionContextSnapshot(context, { profileId = null, contextId = null } = {}) {
  if (!context || typeof context !== "object") throw new TypeError("Practice normalization requires a context record");
  if (profileId != null && context.profileId !== profileId) throw new TypeError("Practice normalization context belongs to another profile");
  if (contextId != null && context.contextId !== contextId) throw new TypeError("Practice normalization context ID mismatch");
  for (const key of ["contextId", "fingerprint", "dataLocale", "keyboardLayout", "inputMethod"]) {
    if (typeof context[key] !== "string" || !context[key]) throw new TypeError(`Practice normalization context ${key} is required`);
  }
  if (context.hardwareProfileId != null && typeof context.hardwareProfileId !== "string") throw new TypeError("Practice normalization hardwareProfileId is invalid");
  return freezeDeep({
    contextId: context.contextId,
    fingerprint: context.fingerprint,
    dataLocale: context.dataLocale,
    keyboardLayout: context.keyboardLayout,
    inputMethod: context.inputMethod,
    hardwareProfileId: context.hardwareProfileId ?? null,
  });
}

export function createPracticeTransitionContextResolver({
  contentAnalysis,
  context,
  frequencyProvider = null,
} = {}) {
  if (!contentAnalysis || !Array.isArray(contentAnalysis.graphemes) || !Array.isArray(contentAnalysis.words)) throw new TypeError("Practice transition context requires analyzed content");
  const language = languageBase(contentAnalysis.language || context?.dataLocale || "und");
  const provider = frequencyProvider ?? createUnavailablePracticeReferenceFrequencyProvider({ language });
  const graphemes = contentAnalysis.graphemes;
  const wordByPosition = Array(graphemes.length).fill(null);
  for (const word of contentAnalysis.words) {
    for (let index = word.startIndex; index < word.endIndex; index += 1) wordByPosition[index] = word;
  }
  const bigramByEndPosition = Array(graphemes.length).fill(null);
  for (const occurrence of contentAnalysis.bigramOccurrences || []) {
    if (occurrence.endIndex === occurrence.startIndex + 2 && occurrence.endIndex - 1 < graphemes.length) bigramByEndPosition[occurrence.endIndex - 1] = occurrence;
  }

  return Object.freeze({
    resolve(transition) {
      const position = Number.isInteger(transition?.textPosition) ? transition.textPosition : null;
      if (position == null || position < 0 || position >= graphemes.length) return freezeDeep({
        featureVersion: PRACTICE_CONTEXT_FEATURE_VERSION,
        structuralClass: "unknown",
        wordPositionClass: "unknown",
        wordLengthBand: "unknown",
        inputClass: "other",
        geometryClass: "unknown",
        wordFrequencyBand: "unknown",
        bigramFrequencyBand: "unknown",
        geometryKnown: false,
        wordFrequencyKnown: false,
        bigramFrequencyKnown: false,
      });
      const current = graphemes[position];
      const previous = position > 0 ? graphemes[position - 1] : null;
      const word = wordByPosition[position];
      let wordPositionClass = "non-word";
      let lengthBand = "unknown";
      if (word) {
        const length = word.endIndex - word.startIndex;
        lengthBand = wordLengthBand(length);
        if (length === 1) wordPositionClass = "single-character-word";
        else if (position === word.startIndex) wordPositionClass = "word-start";
        else if (position === word.endIndex - 1) wordPositionClass = "word-end";
        else wordPositionClass = "word-middle";
      }
      const structuralSource = position > 0 ? bigramByEndPosition[position]?.contextClass : contentAnalysis.keyOccurrences?.[position]?.contextClass;
      const geometry = classifyPracticeKeyboardGeometry({
        layout: context?.keyboardLayout,
        previousExpected: previous,
        currentExpected: current,
      });
      const wordFrequency = word ? provider.lookupWord(word.lexicalKey) : { known: false, band: "unknown" };
      const bigramFrequency = previous ? provider.lookupBigram(normalizeBigram(previous + current, language)) : { known: false, band: "unknown" };
      return freezeDeep({
        featureVersion: PRACTICE_CONTEXT_FEATURE_VERSION,
        structuralClass: mapStructuralClass(structuralSource),
        wordPositionClass,
        wordLengthBand: lengthBand,
        inputClass: classifyInput(current, language),
        geometryClass: geometry.geometryClass,
        wordFrequencyBand: wordFrequency.known ? wordFrequency.band : "unknown",
        bigramFrequencyBand: bigramFrequency.known ? bigramFrequency.band : "unknown",
        geometryKnown: geometry.known,
        wordFrequencyKnown: Boolean(wordFrequency.known),
        bigramFrequencyKnown: Boolean(bigramFrequency.known),
      });
    },
  });
}

export function resolvePracticeTransitionContext(options = {}) {
  const resolver = createPracticeTransitionContextResolver(options);
  return resolver.resolve(options.transition);
}
