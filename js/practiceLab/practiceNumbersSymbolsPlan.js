import { buildPracticeSpecialDomainContentPlan, buildPracticeSpecialDomainPlan, selectPracticeSpecialDomainForm } from "./practiceSpecialDomainPlan.js";
export const selectPracticeNumbersSymbolsForm = (options = {}) => selectPracticeSpecialDomainForm(options);
export const buildPracticeNumbersSymbolsPracticePlan = (options = {}) => buildPracticeSpecialDomainPlan({ ...options, flow: "practice" });
export const buildPracticeNumbersSymbolsCheckPlan = (options = {}) => buildPracticeSpecialDomainPlan({ ...options, flow: "check", durationMs: null });
export const buildPracticeNumbersSymbolsContentPlan = (options = {}) => buildPracticeSpecialDomainContentPlan(options);
