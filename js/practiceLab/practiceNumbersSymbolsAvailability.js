import { PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS } from "./practiceNumbersSymbolsConstants.js";
import { PRACTICE_NUMBERS_DIGITS, PRACTICE_NUMBERS_SYMBOL_SET } from "./practiceSpecialDomainConstants.js";
import { getPracticeSpecialDomainAvailability } from "./practiceSpecialDomainAvailability.js";

const REQUIRED = Object.freeze([...PRACTICE_NUMBERS_DIGITS, ...PRACTICE_NUMBERS_SYMBOL_SET]);
export function getPracticeNumbersSymbolsAvailability(options = {}) {
  return getPracticeSpecialDomainAvailability({
    ...options,
    practiceDurationsMs: PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS,
    requiredCharacters: REQUIRED,
    codePrefix: "NUMBERS_SYMBOLS",
  });
}
