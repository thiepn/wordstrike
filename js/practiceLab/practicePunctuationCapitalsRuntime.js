import { PRACTICE_SPECIAL_DOMAIN_ANNOTATION_VERSION } from "./practiceSpecialDomainConstants.js";
import {
  PRACTICE_PUNCTUATION_CAPITALS_CHECK_EXPERIMENT_ID,
  PRACTICE_PUNCTUATION_CAPITALS_CHECK_FORM_SET_ID,
  PRACTICE_PUNCTUATION_CAPITALS_DEFAULT_PRACTICE_DURATION_MS,
  PRACTICE_PUNCTUATION_CAPITALS_EXPERIMENT_ID,
  PRACTICE_PUNCTUATION_CAPITALS_POLICY_VERSION,
  PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS,
  PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_POOL_ID,
  PRACTICE_PUNCTUATION_CAPITALS_SELECTION_VERSION,
  PRACTICE_PUNCTUATION_CAPITALS_VERSION,
} from "./practicePunctuationCapitalsConstants.js";
import { PRACTICE_PUNCTUATION_CAPITALS_POLICY_V1 } from "./practicePunctuationCapitalsPolicy.js";
import { getPracticePunctuationCapitalsAvailability } from "./practicePunctuationCapitalsAvailability.js";
import { createPracticeSpecialDomainRuntime } from "./practiceSpecialDomainRuntime.js";

export function createPracticePunctuationCapitalsRuntime(options = {}) {
  const runtime = createPracticeSpecialDomainRuntime({
    ...options,
    domain: "punctuation-capitals",
    visibleExperimentId: PRACTICE_PUNCTUATION_CAPITALS_EXPERIMENT_ID,
    checkExperimentId: PRACTICE_PUNCTUATION_CAPITALS_CHECK_EXPERIMENT_ID,
    version: PRACTICE_PUNCTUATION_CAPITALS_VERSION,
    policyVersion: PRACTICE_PUNCTUATION_CAPITALS_POLICY_VERSION,
    selectionVersion: PRACTICE_PUNCTUATION_CAPITALS_SELECTION_VERSION,
    annotationVersion: PRACTICE_SPECIAL_DOMAIN_ANNOTATION_VERSION,
    practiceFormSetId: PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_POOL_ID,
    checkFormSetId: PRACTICE_PUNCTUATION_CAPITALS_CHECK_FORM_SET_ID,
    practiceMinimumReadyForms: PRACTICE_PUNCTUATION_CAPITALS_POLICY_V1.practiceMinimumReadyForms,
    checkMinimumReadyForms: PRACTICE_PUNCTUATION_CAPITALS_POLICY_V1.checkMinimumReadyForms,
    practiceDurationsMs: PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS,
    defaultPracticeDurationMs: PRACTICE_PUNCTUATION_CAPITALS_DEFAULT_PRACTICE_DURATION_MS,
    getAvailability: getPracticePunctuationCapitalsAvailability,
    sourceTypes: { practice: "punctuation-capitals-training", check: "punctuation-capitals-diagnostic" },
  });
  return Object.freeze({
    ...runtime,
    getPunctuationAbilityState() { return runtime.getAbilityState("punctuation"); },
  });
}
