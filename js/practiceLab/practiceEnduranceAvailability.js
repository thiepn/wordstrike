import { PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS } from "./practiceEnduranceConstants.js";

const freeze = (value) => Object.freeze(value);
export function getPracticeEnduranceAvailability({ context, practiceFormSet = null, checkFormSet = null, timingSupported = true, practiceError = null, checkError = null } = {}) {
  const language = String(context?.language ?? context?.locale ?? "en").toLowerCase();
  const english = language === "en" || language.startsWith("en-");
  const reasons = [];
  if (!english) reasons.push("ENDURANCE_UNSUPPORTED_LANGUAGE");
  if (!timingSupported) reasons.push("ENDURANCE_TIMING_UNAVAILABLE");
  if (!practiceFormSet?.forms?.length) reasons.push(practiceError?.code ?? "ENDURANCE_PRACTICE_FORMS_UNAVAILABLE");
  if (!checkFormSet?.forms?.length) reasons.push(checkError?.code ?? "ENDURANCE_CHECK_FORMS_UNAVAILABLE");
  const practiceAvailable = english && timingSupported && Boolean(practiceFormSet?.forms?.length);
  const checkAvailable = english && timingSupported && Boolean(checkFormSet?.forms?.length);
  return freeze({ practiceAvailable, practiceDurationsMs: practiceAvailable ? [...PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS] : [], checkAvailable, reasons: freeze([...new Set(reasons)]) });
}
