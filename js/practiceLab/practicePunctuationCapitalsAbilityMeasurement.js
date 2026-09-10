import { buildPracticeSpecialDomainAbilityMeasurement } from "./practiceSpecialDomainAbilityMeasurement.js";
export const buildPracticePunctuationCapitalsAbilityMeasurement = (options = {}) => buildPracticeSpecialDomainAbilityMeasurement({
  ...options,
  channel: "punctuation",
  protocol: "punctuation-capitals-check",
  requiredPrimaryOpportunities: 180,
});
