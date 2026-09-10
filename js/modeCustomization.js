/** P2 presentation preferences. Never part of a competitive session's config. */
import { normalizeCustomization, resolveEffectsIntensity } from "./customization.js";
import { normalizeSpeedTestFontSize } from "./speedTestPresentation.js";

export const TYPING_HUD_LAYOUTS = Object.freeze([
  Object.freeze({ value: "focus", label: "Focus" }),
  Object.freeze({ value: "balanced", label: "Balanced" }),
  Object.freeze({ value: "data", label: "Data" }),
]);
export const GAMEPLAY_HUD_LAYOUTS = Object.freeze([
  Object.freeze({ value: "minimal", label: "Minimal" }),
  Object.freeze({ value: "standard", label: "Standard" }),
]);
export const ACTION_INTENSITIES = Object.freeze([
  Object.freeze({ value: "focused", label: "Focused" }),
  Object.freeze({ value: "full", label: "Full" }),
]);
export const MODE_CUSTOMIZATION_FIELDS = Object.freeze([
  "typingTest.hudLayout", "typingTest.textSize", "typingTest.liveStats",
  "gameplayHud", "actionModeIntensity",
]);
const choice = (value, options, fallback) => options.some((item) => item.value === value) ? value : fallback;

export function normalizeModeCustomizationValue(field, value) {
  switch (field) {
    case "typingTest.hudLayout": return choice(value, TYPING_HUD_LAYOUTS, "balanced");
    case "typingTest.textSize": return normalizeSpeedTestFontSize(value);
    case "typingTest.liveStats": return typeof value === "boolean" ? value : true;
    case "gameplayHud": return choice(value, GAMEPLAY_HUD_LAYOUTS, "standard");
    case "actionModeIntensity": return choice(value, ACTION_INTENSITIES, "full");
    default: throw new TypeError(`Unknown mode presentation preference: ${field}`);
  }
}

/** Focus hides live stats without overwriting the player's saved On/Off choice. */
export function resolveTypingPresentation(settings) {
  const typing = normalizeCustomization(settings).typingTest;
  return { ...typing, showLiveStats: typing.hudLayout !== "focus" && typing.liveStats };
}

export function resolveModeEffectsIntensity(settings, mode, reducedMotion = false) {
  const globalEffects = resolveEffectsIntensity(settings, reducedMotion);
  const isActionMode = mode === "boss" || mode === "arcade-rush";
  return isActionMode && normalizeCustomization(settings).actionModeIntensity === "focused"
    ? "reduced" : globalEffects;
}
