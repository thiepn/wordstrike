import { buildPracticeSpecialDomainAbilityMeasurement } from "./practiceSpecialDomainAbilityMeasurement.js";
export const buildPracticeNumbersSymbolsAbilityMeasurement = (options = {}) => buildPracticeSpecialDomainAbilityMeasurement({
  ...options,
  channel: "numbers-symbols",
  protocol: "numbers-symbols-check",
  requiredPrimaryOpportunities: 180,
});
