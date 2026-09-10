import { createPracticePunctuationCapitalsRuntime } from "./practicePunctuationCapitalsRuntime.js";
import { createPracticeSpecialDomainDescriptor, createPracticeSpecialDomainRegistration } from "./practiceSpecialDomainExperiment.js";
import { analyzePracticePunctuationCapitals } from "./practicePunctuationCapitalsAnalysis.js";
import { buildPracticePunctuationCapitalsAbilityMeasurement } from "./practicePunctuationCapitalsAbilityMeasurement.js";
import { PRACTICE_PUNCTUATION_PRIMARY_CATEGORIES } from "./practiceSpecialDomainConstants.js";
import {
  PRACTICE_PUNCTUATION_CAPITALS_CHECK_EXPERIMENT_ID,
  PRACTICE_PUNCTUATION_CAPITALS_EXPERIMENT_ID,
  PRACTICE_PUNCTUATION_CAPITALS_POLICY_VERSION,
  PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS,
  PRACTICE_PUNCTUATION_CAPITALS_VERSION,
} from "./practicePunctuationCapitalsConstants.js";

const sourceTypes = Object.freeze({ practice: "punctuation-capitals-training", check: "punctuation-capitals-diagnostic" });
const descriptor = (prepared, flow) => createPracticeSpecialDomainDescriptor({
  prepared, flow,
  visibleExperimentId: PRACTICE_PUNCTUATION_CAPITALS_EXPERIMENT_ID,
  checkExperimentId: PRACTICE_PUNCTUATION_CAPITALS_CHECK_EXPERIMENT_ID,
  version: PRACTICE_PUNCTUATION_CAPITALS_VERSION,
  policyVersion: PRACTICE_PUNCTUATION_CAPITALS_POLICY_VERSION,
  title: "Punctuation & Capitals",
  checkTitle: "Punctuation & Capitals Check",
  category: "real-world",
  practiceDurationsMs: PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS,
  primaryCategories: PRACTICE_PUNCTUATION_PRIMARY_CATEGORIES,
  abilityChannel: "punctuation",
  sourceTypes,
  analyze: analyzePracticePunctuationCapitals,
  buildAbilityMeasurement: buildPracticePunctuationCapitalsAbilityMeasurement,
});
export const createPracticePunctuationCapitalsExperiment = (prepared = null) => descriptor(prepared, "practice");
export const createPracticePunctuationCapitalsCheckDescriptor = (prepared = null) => descriptor(prepared, "check");

export function createPracticePunctuationCapitalsRegistration({ runtime = createPracticePunctuationCapitalsRuntime() } = {}) {
  return createPracticeSpecialDomainRegistration({
    experimentId: PRACTICE_PUNCTUATION_CAPITALS_EXPERIMENT_ID,
    version: PRACTICE_PUNCTUATION_CAPITALS_VERSION,
    runtime,
    createPracticeDescriptor: createPracticePunctuationCapitalsExperiment,
    createCheckDescriptor: createPracticePunctuationCapitalsCheckDescriptor,
    policyVersion: PRACTICE_PUNCTUATION_CAPITALS_POLICY_VERSION,
    practiceDurationsMs: PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS,
    unavailableCode: "PUNCTUATION_CAPITALS_UNAVAILABLE",
  });
}
export function registerPracticePunctuationCapitalsExperiment(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("Punctuation & Capitals registration requires registry");
  if (registry.hasImplementation?.(PRACTICE_PUNCTUATION_CAPITALS_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_PUNCTUATION_CAPITALS_EXPERIMENT_ID);
  return registry.register(createPracticePunctuationCapitalsRegistration(options));
}
