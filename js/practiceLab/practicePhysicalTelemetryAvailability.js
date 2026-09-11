import { isPracticePhysicalTelemetryEnabled } from "./practicePhysicalTelemetryPolicy.js";

export function getPracticePhysicalTelemetryAvailability({ settings = {}, context = null, codeApiSupported = typeof globalThis.KeyboardEvent !== "undefined" } = {}) {
  const inputMethod = context?.inputMethod ?? "unknown";
  const reasons = [];
  if (inputMethod !== "physical") reasons.push("context-not-physical");
  if (!codeApiSupported) reasons.push("keyboard-code-api-unavailable");
  return Object.freeze({
    supported: Boolean(codeApiSupported),
    enabled: isPracticePhysicalTelemetryEnabled(settings),
    contextEligible: inputMethod === "physical",
    inputMethod,
    codeApiSupported: Boolean(codeApiSupported),
    reasons: Object.freeze(reasons),
  });
}
