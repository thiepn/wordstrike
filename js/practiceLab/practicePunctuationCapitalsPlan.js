import { buildPracticeSpecialDomainContentPlan, buildPracticeSpecialDomainPlan, selectPracticeSpecialDomainForm } from "./practiceSpecialDomainPlan.js";
export const selectPracticePunctuationCapitalsForm = (options = {}) => selectPracticeSpecialDomainForm(options);
export const buildPracticePunctuationCapitalsPracticePlan = (options = {}) => buildPracticeSpecialDomainPlan({ ...options, flow: "practice" });
export const buildPracticePunctuationCapitalsCheckPlan = (options = {}) => buildPracticeSpecialDomainPlan({ ...options, flow: "check", durationMs: null });
export const buildPracticePunctuationCapitalsContentPlan = (options = {}) => buildPracticeSpecialDomainContentPlan(options);
