import { PRACTICE_SPECIAL_DOMAIN_ANNOTATION_VERSION } from "./practiceSpecialDomainConstants.js";
import {
  PRACTICE_NUMBERS_SYMBOLS_CHECK_EXPERIMENT_ID,
  PRACTICE_NUMBERS_SYMBOLS_CHECK_FORM_SET_ID,
  PRACTICE_NUMBERS_SYMBOLS_DEFAULT_PRACTICE_DURATION_MS,
  PRACTICE_NUMBERS_SYMBOLS_EXPERIMENT_ID,
  PRACTICE_NUMBERS_SYMBOLS_POLICY_VERSION,
  PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS,
  PRACTICE_NUMBERS_SYMBOLS_PRACTICE_POOL_ID,
  PRACTICE_NUMBERS_SYMBOLS_SELECTION_VERSION,
  PRACTICE_NUMBERS_SYMBOLS_VERSION,
} from "./practiceNumbersSymbolsConstants.js";
import { PRACTICE_NUMBERS_SYMBOLS_POLICY_V1 } from "./practiceNumbersSymbolsPolicy.js";
import { getPracticeNumbersSymbolsAvailability } from "./practiceNumbersSymbolsAvailability.js";
import { createPracticeSpecialDomainRuntime } from "./practiceSpecialDomainRuntime.js";

export function createPracticeNumbersSymbolsRuntime(options = {}) {
  const runtime = createPracticeSpecialDomainRuntime({
    ...options,
    domain: "numbers-symbols",
    visibleExperimentId: PRACTICE_NUMBERS_SYMBOLS_EXPERIMENT_ID,
    checkExperimentId: PRACTICE_NUMBERS_SYMBOLS_CHECK_EXPERIMENT_ID,
    version: PRACTICE_NUMBERS_SYMBOLS_VERSION,
    policyVersion: PRACTICE_NUMBERS_SYMBOLS_POLICY_VERSION,
    selectionVersion: PRACTICE_NUMBERS_SYMBOLS_SELECTION_VERSION,
    annotationVersion: PRACTICE_SPECIAL_DOMAIN_ANNOTATION_VERSION,
    practiceFormSetId: PRACTICE_NUMBERS_SYMBOLS_PRACTICE_POOL_ID,
    checkFormSetId: PRACTICE_NUMBERS_SYMBOLS_CHECK_FORM_SET_ID,
    practiceMinimumReadyForms: PRACTICE_NUMBERS_SYMBOLS_POLICY_V1.practiceMinimumReadyForms,
    checkMinimumReadyForms: PRACTICE_NUMBERS_SYMBOLS_POLICY_V1.checkMinimumReadyForms,
    practiceDurationsMs: PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS,
    defaultPracticeDurationMs: PRACTICE_NUMBERS_SYMBOLS_DEFAULT_PRACTICE_DURATION_MS,
    getAvailability: getPracticeNumbersSymbolsAvailability,
    sourceTypes: { practice: "numbers-symbols-training", check: "numbers-symbols-diagnostic" },
  });
  return Object.freeze({
    ...runtime,
    getNumbersSymbolsAbilityState() { return runtime.getAbilityState("numbers-symbols"); },
  });
}
