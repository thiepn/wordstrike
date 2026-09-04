const WORD_LIKE_GRAPHEME = /[\p{L}\p{M}\p{N}'-]/u;
const CASED_LETTER = /\p{L}/u;

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createPracticeSegmenter(segmenter = null) {
  if (typeof segmenter === "function") return (text) => {
    const result = segmenter(String(text));
    return Array.isArray(result) ? [...result] : [...result];
  };
  if (globalThis.Intl?.Segmenter) {
    const instance = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return (text) => [...instance.segment(String(text))].map(({ segment }) => segment);
  }
  return (text) => Array.from(String(text));
}

export function segmentPracticeGraphemes(text, { segmenter = null } = {}) {
  return Object.freeze(createPracticeSegmenter(segmenter)(String(text)));
}

export function isPracticeWordLikeGrapheme(grapheme) {
  return typeof grapheme === "string" && grapheme.length > 0 && WORD_LIKE_GRAPHEME.test(grapheme);
}

export function derivePracticeWordUnits(text, { segmenter = null } = {}) {
  const graphemes = createPracticeSegmenter(segmenter)(String(text));
  const units = [];
  let start = null;
  for (let index = 0; index <= graphemes.length; index += 1) {
    const wordLike = index < graphemes.length && isPracticeWordLikeGrapheme(graphemes[index]);
    if (wordLike && start == null) start = index;
    if (!wordLike && start != null) {
      units.push({
        wordOrdinal: units.length,
        startIndex: start,
        endIndex: index,
        surfaceText: graphemes.slice(start, index).join(""),
      });
      start = null;
    }
  }
  return freezeDeep(units);
}

export function normalizePracticeLexicalKey(surfaceText, language = "en") {
  const normalized = String(surfaceText ?? "").normalize("NFC");
  try {
    return normalized.toLocaleLowerCase(language || undefined);
  } catch {
    return normalized.toLowerCase();
  }
}

export function classifyPracticeCapitalization(surfaceText, language = "en") {
  const text = String(surfaceText ?? "");
  const letters = [...text].filter((value) => CASED_LETTER.test(value));
  if (!letters.length) return "uncased";
  const lower = normalizePracticeLexicalKey(text, language);
  let upper;
  try { upper = text.toLocaleUpperCase(language || undefined); } catch { upper = text.toUpperCase(); }
  if (text === lower) return "lower";
  if (text === upper) return "upper";
  const firstLetterIndex = [...text].findIndex((value) => CASED_LETTER.test(value));
  if (firstLetterIndex >= 0) {
    const points = [...text];
    const first = points[firstLetterIndex];
    let firstUpper;
    try { firstUpper = first.toLocaleUpperCase(language || undefined); } catch { firstUpper = first.toUpperCase(); }
    const rest = points.slice(firstLetterIndex + 1).join("");
    if (first === firstUpper && rest === normalizePracticeLexicalKey(rest, language)) return "initial-cap";
  }
  return "mixed";
}
