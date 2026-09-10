import { PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS } from "./practicePunctuationCapitalsConstants.js";
import { PRACTICE_PUNCTUATION_CHARACTER_SET } from "./practiceSpecialDomainConstants.js";
import { getPracticeSpecialDomainAvailability } from "./practiceSpecialDomainAvailability.js";

const REQUIRED = Object.freeze(["A", "Z", ...PRACTICE_PUNCTUATION_CHARACTER_SET]);
export function getPracticePunctuationCapitalsAvailability(options = {}) {
  return getPracticeSpecialDomainAvailability({
    ...options,
    practiceDurationsMs: PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS,
    requiredCharacters: REQUIRED,
    codePrefix: "PUNCTUATION_CAPITALS",
  });
}
