import { createPracticeNumbersSymbolsRuntime } from "./practiceNumbersSymbolsRuntime.js";
import { createPracticeSpecialDomainDescriptor, createPracticeSpecialDomainRegistration } from "./practiceSpecialDomainExperiment.js";
import { analyzePracticeNumbersSymbols } from "./practiceNumbersSymbolsAnalysis.js";
import { buildPracticeNumbersSymbolsAbilityMeasurement } from "./practiceNumbersSymbolsAbilityMeasurement.js";
import { PRACTICE_NUMBERS_PRIMARY_CATEGORIES } from "./practiceSpecialDomainConstants.js";
import {
  PRACTICE_NUMBERS_SYMBOLS_CHECK_EXPERIMENT_ID,
  PRACTICE_NUMBERS_SYMBOLS_EXPERIMENT_ID,
  PRACTICE_NUMBERS_SYMBOLS_POLICY_VERSION,
  PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS,
  PRACTICE_NUMBERS_SYMBOLS_VERSION,
} from "./practiceNumbersSymbolsConstants.js";

const sourceTypes = Object.freeze({ practice: "numbers-symbols-training", check: "numbers-symbols-diagnostic" });
const descriptor = (prepared, flow) => createPracticeSpecialDomainDescriptor({
  prepared, flow,
  visibleExperimentId: PRACTICE_NUMBERS_SYMBOLS_EXPERIMENT_ID,
  checkExperimentId: PRACTICE_NUMBERS_SYMBOLS_CHECK_EXPERIMENT_ID,
  version: PRACTICE_NUMBERS_SYMBOLS_VERSION,
  policyVersion: PRACTICE_NUMBERS_SYMBOLS_POLICY_VERSION,
  title: "Numbers & Symbols",
  checkTitle: "Numbers & Symbols Check",
  category: "real-world",
  practiceDurationsMs: PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS,
  primaryCategories: PRACTICE_NUMBERS_PRIMARY_CATEGORIES,
  abilityChannel: "numbers-symbols",
  sourceTypes,
  analyze: analyzePracticeNumbersSymbols,
  buildAbilityMeasurement: buildPracticeNumbersSymbolsAbilityMeasurement,
});
export const createPracticeNumbersSymbolsExperiment = (prepared = null) => descriptor(prepared, "practice");
export const createPracticeNumbersSymbolsCheckDescriptor = (prepared = null) => descriptor(prepared, "check");

export function createPracticeNumbersSymbolsRegistration({ runtime = createPracticeNumbersSymbolsRuntime() } = {}) {
  return createPracticeSpecialDomainRegistration({
    experimentId: PRACTICE_NUMBERS_SYMBOLS_EXPERIMENT_ID,
    version: PRACTICE_NUMBERS_SYMBOLS_VERSION,
    runtime,
    createPracticeDescriptor: createPracticeNumbersSymbolsExperiment,
    createCheckDescriptor: createPracticeNumbersSymbolsCheckDescriptor,
    policyVersion: PRACTICE_NUMBERS_SYMBOLS_POLICY_VERSION,
    practiceDurationsMs: PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS,
    unavailableCode: "NUMBERS_SYMBOLS_UNAVAILABLE",
  });
}
export function registerPracticeNumbersSymbolsExperiment(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("Numbers & Symbols registration requires registry");
  if (registry.hasImplementation?.(PRACTICE_NUMBERS_SYMBOLS_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_NUMBERS_SYMBOLS_EXPERIMENT_ID);
  return registry.register(createPracticeNumbersSymbolsRegistration(options));
}
