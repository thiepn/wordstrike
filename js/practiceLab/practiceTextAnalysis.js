import {
  PRACTICE_INDEX_CONTEXT_CLASSES,
  PRACTICE_INDEX_ERROR_CODES,
  PRACTICE_INDEX_RAW_TARGET_TYPES,
  PRACTICE_INDEX_TARGET_TYPES,
  PRACTICE_TEXT_SEGMENTATION_VERSION,
  PRACTICE_TOKENIZATION_VERSION,
} from "./practiceIndexConstants.js";
import {
  classifyPracticeCapitalization,
  createPracticeSegmenter,
  derivePracticeWordUnits,
  normalizePracticeLexicalKey,
} from "./practiceTextSegmentation.js";
import { validatePracticeEntityKey } from "./practiceValidation.js";

const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
const DIGIT = /\p{N}/u;
const PUNCTUATION = /\p{P}/u;
const WHITESPACE = /\s/u;

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function analysisError(code, message, details = null) {
  const error = new TypeError(message);
  error.code = code;
  error.details = details;
  return error;
}

function indexWordByGrapheme(words, graphemeCount) {
  const result = Array(graphemeCount).fill(null);
  for (const word of words) {
    for (let index = word.startIndex; index < word.endIndex; index += 1) result[index] = word.wordOrdinal;
  }
  return result;
}

function classifyOccurrence(graphemes, startIndex, endIndex, wordAt) {
  const slice = graphemes.slice(startIndex, endIndex);
  const allNumeric = slice.length > 0 && slice.every((value) => DIGIT.test(value));
  if (allNumeric) return "numeric";
  const ordinals = new Set(wordAt.slice(startIndex, endIndex).filter((value) => value != null));
  if (ordinals.size === 1 && wordAt.slice(startIndex, endIndex).every((value) => value != null)) return "within-word";
  if (slice.some((value) => PUNCTUATION.test(value))) return "punctuation";
  const hasWhitespace = slice.some((value) => WHITESPACE.test(value));
  const hasWordMaterial = slice.some((value) => LETTER_OR_MARK.test(value) || DIGIT.test(value));
  if (hasWhitespace && hasWordMaterial) return "word-boundary";
  if (slice.every((value) => WHITESPACE.test(value))) return "whitespace";
  return "mixed";
}

function occurrenceFor(graphemes, startIndex, endIndex, wordAt) {
  const contextClass = classifyOccurrence(graphemes, startIndex, endIndex, wordAt);
  const wordOrdinal = contextClass === "within-word" ? wordAt[startIndex] : null;
  return {
    target: graphemes.slice(startIndex, endIndex).join(""),
    startIndex,
    endIndex,
    contextClass,
    wordOrdinal,
  };
}

export function normalizePracticeTarget({ entityType, entityKey, language = "en", segmenter = null } = {}) {
  if (!PRACTICE_INDEX_TARGET_TYPES.includes(entityType)) throw analysisError(PRACTICE_INDEX_ERROR_CODES.TARGET_INVALID, `Unsupported Practice index target type: ${entityType}`);
  if (typeof entityKey !== "string" || !entityKey.length) throw analysisError(PRACTICE_INDEX_ERROR_CODES.TARGET_INVALID, "Practice target entityKey must be a non-empty string");
  if (entityType === "word") {
    const lexicalKey = normalizePracticeLexicalKey(entityKey.normalize("NFC"), language);
    const validation = validatePracticeEntityKey("word", lexicalKey);
    if (!validation.valid) throw analysisError(PRACTICE_INDEX_ERROR_CODES.TARGET_INVALID, "Practice word target is not representable by the current entity contract", validation.errors);
    return lexicalKey;
  }
  const normalized = entityKey.normalize("NFC");
  const segment = createPracticeSegmenter(segmenter);
  const expectedLength = entityType === "key" ? 1 : entityType === "bigram" ? 2 : 3;
  if (segment(normalized).length !== expectedLength) throw analysisError(PRACTICE_INDEX_ERROR_CODES.TARGET_INVALID, `${entityType} must contain exactly ${expectedLength} Practice grapheme${expectedLength === 1 ? "" : "s"}`);
  const validation = validatePracticeEntityKey(entityType, normalized);
  if (!validation.valid) throw analysisError(PRACTICE_INDEX_ERROR_CODES.TARGET_INVALID, `${entityType} target is not representable by the current Practice entity contract`, validation.errors);
  return normalized;
}

export function analyzePracticeText({ text, language = "en", segmenter = null } = {}) {
  if (typeof text !== "string") throw new TypeError("Practice text analysis requires text");
  const segment = createPracticeSegmenter(segmenter);
  const graphemes = segment(text);
  const rawWords = derivePracticeWordUnits(text, { segmenter });
  const words = rawWords.map((word) => ({
    surfaceText: word.surfaceText,
    lexicalKey: normalizePracticeLexicalKey(word.surfaceText, language),
    startIndex: word.startIndex,
    endIndex: word.endIndex,
    wordOrdinal: word.wordOrdinal,
    capitalizationClass: classifyPracticeCapitalization(word.surfaceText, language),
  }));
  const wordAt = indexWordByGrapheme(words, graphemes.length);
  const keyOccurrences = graphemes.map((_, index) => occurrenceFor(graphemes, index, index + 1, wordAt));
  const bigramOccurrences = [];
  const trigramOccurrences = [];
  for (let index = 0; index + 1 < graphemes.length; index += 1) bigramOccurrences.push(occurrenceFor(graphemes, index, index + 2, wordAt));
  for (let index = 0; index + 2 < graphemes.length; index += 1) trigramOccurrences.push(occurrenceFor(graphemes, index, index + 3, wordAt));

  let uppercaseCount = 0;
  let digitCount = 0;
  let punctuationCount = 0;
  for (const grapheme of graphemes) {
    if (DIGIT.test(grapheme)) digitCount += 1;
    if (PUNCTUATION.test(grapheme)) punctuationCount += 1;
    if (LETTER_OR_MARK.test(grapheme)) {
      let upper;
      let lower;
      try {
        upper = grapheme.toLocaleUpperCase(language || undefined);
        lower = grapheme.toLocaleLowerCase(language || undefined);
      } catch {
        upper = grapheme.toUpperCase();
        lower = grapheme.toLowerCase();
      }
      if (upper !== lower && grapheme === upper) uppercaseCount += 1;
    }
  }

  const value = {
    segmentationVersion: PRACTICE_TEXT_SEGMENTATION_VERSION,
    tokenizationVersion: PRACTICE_TOKENIZATION_VERSION,
    language,
    graphemeCount: graphemes.length,
    wordCount: words.length,
    graphemes,
    words,
    keyOccurrences,
    bigramOccurrences,
    trigramOccurrences,
    structuralCounts: { uppercaseCount, digitCount, punctuationCount },
  };
  return freezeDeep(value);
}

export function verifyPracticeContentAnnotations({ annotation, text, contentHash = null, segmenter = null } = {}) {
  if (!annotation || typeof annotation !== "object") throw analysisError(PRACTICE_INDEX_ERROR_CODES.POSITION_MISMATCH, "Practice content annotation is required");
  if (contentHash != null && annotation.contentHash !== contentHash) throw analysisError(PRACTICE_INDEX_ERROR_CODES.CORPUS_MISMATCH, "Practice content annotation hash does not match selected content", { contentId: annotation.contentId });
  const segment = createPracticeSegmenter(segmenter);
  const graphemes = segment(String(text ?? ""));
  if (graphemes.length !== annotation.graphemeCount) throw analysisError(PRACTICE_INDEX_ERROR_CODES.POSITION_MISMATCH, "Practice content grapheme count differs from indexed annotation", { contentId: annotation.contentId });
  const checkOccurrence = (occurrence, entityType) => {
    if (!PRACTICE_INDEX_CONTEXT_CLASSES.includes(occurrence.contextClass)
      || !Number.isInteger(occurrence.startIndex)
      || !Number.isInteger(occurrence.endIndex)
      || occurrence.startIndex < 0
      || occurrence.endIndex <= occurrence.startIndex
      || occurrence.endIndex > graphemes.length
      || graphemes.slice(occurrence.startIndex, occurrence.endIndex).join("") !== occurrence.target) {
      throw analysisError(PRACTICE_INDEX_ERROR_CODES.POSITION_MISMATCH, `Indexed ${entityType} position does not reconstruct its target`, { contentId: annotation.contentId, startIndex: occurrence.startIndex, endIndex: occurrence.endIndex });
    }
  };
  for (const [entityType, field] of [["key", "keyOccurrences"], ["bigram", "bigramOccurrences"], ["trigram", "trigramOccurrences"]]) {
    for (const occurrence of annotation[field] ?? []) checkOccurrence(occurrence, entityType);
  }
  for (const word of annotation.words ?? []) {
    if (!Number.isInteger(word.startIndex) || !Number.isInteger(word.endIndex)
      || word.startIndex < 0 || word.endIndex <= word.startIndex || word.endIndex > graphemes.length
      || graphemes.slice(word.startIndex, word.endIndex).join("") !== word.surfaceText
      || normalizePracticeLexicalKey(word.surfaceText, annotation.language) !== word.lexicalKey) {
      throw analysisError(PRACTICE_INDEX_ERROR_CODES.POSITION_MISMATCH, "Indexed word range does not reconstruct its surface/lexical identity", { contentId: annotation.contentId, wordOrdinal: word.wordOrdinal });
    }
  }
  return true;
}

export function getPracticeNgramOccurrences(analysis, length) {
  if (length === 1) return analysis.keyOccurrences;
  if (length === 2) return analysis.bigramOccurrences;
  if (length === 3) return analysis.trigramOccurrences;
  if (!Number.isInteger(length) || length < 1 || length > 16) throw new TypeError("Practice n-gram length must be a bounded positive integer");
  const graphemes = analysis.graphemes;
  const rawWords = analysis.words;
  const wordAt = indexWordByGrapheme(rawWords, graphemes.length);
  const occurrences = [];
  for (let index = 0; index + length <= graphemes.length; index += 1) occurrences.push(occurrenceFor(graphemes, index, index + length, wordAt));
  return freezeDeep(occurrences);
}
