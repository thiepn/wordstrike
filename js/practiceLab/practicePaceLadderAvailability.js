import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freeze = (value) => Object.freeze(value);
const baseLanguage = (value) => String(value ?? "").trim().replace(/_/g, "-").toLowerCase().split("-")[0];

export function getPracticePaceLadderAvailability({ profile = null, context = null, formsReady = false, telemetryCapable = true, userSelectedWpm = null, ordinaryPerformance = null, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  const reasons = [];
  if (!profile?.profileId || !context?.contextId || context.profileId !== profile.profileId) reasons.push("PACE_LADDER_CONTEXT_UNAVAILABLE");
  if (!policy.supportedLanguages.includes(baseLanguage(context?.dataLocale ?? "en"))) reasons.push("PACE_LADDER_LANGUAGE_UNSUPPORTED");
  if (!formsReady) reasons.push("PACE_LADDER_CONTENT_UNAVAILABLE");
  if (!telemetryCapable) reasons.push("PACE_LADDER_TELEMETRY_UNAVAILABLE");
  if (reasons.length) return freeze({ status: "unavailable", mode: "unavailable", reasons });
  const explicit = Number(userSelectedWpm);
  if (Number.isFinite(explicit) && explicit >= policy.targetMinimumWpm && explicit <= policy.targetMaximumWpm) return freeze({ status: "ready", mode: "user-selected-anchor", reasons: [] });
  if (Number.isFinite(ordinaryPerformance?.measuredWpm) && ordinaryPerformance.measuredWpm > 0) return freeze({ status: "ready", mode: "measured-anchor", reasons: [] });
  return freeze({ status: "ready", mode: "user-selected-anchor-required", reasons: ["PACE_LADDER_USER_ANCHOR_REQUIRED"] });
}
