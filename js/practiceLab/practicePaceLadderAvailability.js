import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freeze = (value) => Object.freeze(value);
const baseLanguage = (value) => String(value ?? "").trim().replace(/_/g, "-").toLowerCase().split("-")[0];

export function getPracticePaceLadderAvailability({ profile = null, context = null, formsReady = false, telemetryCapable = true, frontierAnchor = null, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  const reasons = [];
  if (!profile?.profileId || !context?.contextId || context.profileId !== profile.profileId) reasons.push("PACE_LADDER_CONTEXT_UNAVAILABLE");
  if (!policy.supportedLanguages.includes(baseLanguage(context?.dataLocale ?? "en"))) reasons.push("PACE_LADDER_LANGUAGE_UNSUPPORTED");
  if (!formsReady) reasons.push("PACE_LADDER_CONTENT_UNAVAILABLE");
  if (!telemetryCapable) reasons.push("PACE_LADDER_TELEMETRY_UNAVAILABLE");
  if (reasons.length) return freeze({ status: "unavailable", mode: "unavailable", reasons });
  return freeze({ status: "ready", mode: frontierAnchor?.status === "ready" ? "pl14-frontier-anchor" : "in-session-reference-anchor", reasons: [] });
}
