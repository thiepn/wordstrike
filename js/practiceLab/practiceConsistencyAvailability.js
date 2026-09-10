import { PRACTICE_CONSISTENCY_DURATIONS_MS } from "./practiceConsistencyConstants.js";

const freeze = (value) => Object.freeze(value);
export function getPracticeConsistencyAvailability({ context, formSet = null, timingSupported = true, error = null } = {}) {
  const language = String(context?.language ?? context?.locale ?? "en").toLowerCase();
  const english = language === "en" || language.startsWith("en-");
  const reasons = [];
  if (!english) reasons.push("CONSISTENCY_UNSUPPORTED_LANGUAGE");
  if (!timingSupported) reasons.push("CONSISTENCY_TIMING_UNAVAILABLE");
  if (!formSet?.forms?.length) reasons.push(error?.code ?? "CONSISTENCY_FORMS_UNAVAILABLE");
  const available = english && timingSupported && Boolean(formSet?.forms?.length);
  return freeze({ status: available ? "ready" : "unavailable", available, supportedDurationsMs: available ? [...PRACTICE_CONSISTENCY_DURATIONS_MS] : [], reasons: freeze([...new Set(reasons)]) });
}
