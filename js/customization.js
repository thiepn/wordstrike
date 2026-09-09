/** Curated appearance preferences. No gameplay, scoring, or DOM dependencies. */
import { normalizeSpeedTestFontSize } from "./speedTestPresentation.js";

export const THEMES = Object.freeze([
  Object.freeze({ value: "wordstrike", label: "WordStrike", description: "The original charcoal and neon balance.", background: "#0a0e14" }),
  Object.freeze({ value: "oled", label: "OLED", description: "True black, clear surfaces, restrained atmosphere.", background: "#000000" }),
  Object.freeze({ value: "midnight", label: "Midnight", description: "Deep navy with cool blue surfaces.", background: "#080e20" }),
  Object.freeze({ value: "monochrome", label: "Monochrome", description: "Neutral graphite. Your accent marks interaction.", background: "#111111" }),
]);
export const ACCENTS = Object.freeze([
  Object.freeze({ value: "cyan", label: "Cyan", color: "#00fff2" }),
  Object.freeze({ value: "blue", label: "Blue", color: "#70a7ff" }),
  Object.freeze({ value: "violet", label: "Violet", color: "#b2a0ff" }),
  Object.freeze({ value: "magenta", label: "Magenta", color: "#ff80cf" }),
  Object.freeze({ value: "orange", label: "Orange", color: "#ffb470" }),
  Object.freeze({ value: "green", label: "Green", color: "#70e1b2" }),
]);
export const EFFECTS = Object.freeze([
  Object.freeze({ value: "reduced", label: "Reduced", description: "Less ambient motion and glow; no burst particles or screen shake." }),
  Object.freeze({ value: "standard", label: "Standard", description: "The original WordStrike presentation." }),
  Object.freeze({ value: "cinematic", label: "Cinematic", description: "Richer decorative glow, with the same gameplay timing." }),
]);
export const CUSTOMIZATION_FIELDS = Object.freeze(["theme", "accent", "effectsIntensity"]);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const choose = (value, options, fallback) => options.some((option) => (option.value ?? option) === value) ? value : fallback;

export function createDefaultCustomization() {
  return {
    theme: "wordstrike", accent: "cyan", effectsIntensity: "standard",
    // Mode-local preferences. The existing Typing Test size control remains authoritative.
    typingTest: { hudLayout: "balanced", textSize: "auto", liveStats: true },
    gameplayHud: "standard", actionModeIntensity: "full",
  };
}

export function normalizeCustomization(settings) {
  const source = object(settings);
  const typing = object(source.typingTest);
  return {
    theme: choose(source.theme, THEMES, "wordstrike"),
    accent: choose(source.accent, ACCENTS, "cyan"),
    effectsIntensity: choose(source.effectsIntensity, EFFECTS, "standard"),
    typingTest: {
      hudLayout: choose(typing.hudLayout, ["focus", "balanced", "data"], "balanced"),
      textSize: normalizeSpeedTestFontSize(source.speedTestFontSize ?? typing.textSize),
      liveStats: typeof typing.liveStats === "boolean" ? typing.liveStats : true,
    },
    gameplayHud: choose(source.gameplayHud, ["minimal", "standard"], "standard"),
    actionModeIntensity: choose(source.actionModeIntensity, ["focused", "full"], "full"),
  };
}

export function normalizeCustomizationValue(field, value) {
  if (!CUSTOMIZATION_FIELDS.includes(field)) throw new TypeError(`Unknown appearance preference: ${field}`);
  return normalizeCustomization({ [field]: value })[field];
}

export function resolveEffectsIntensity(settings, reducedMotion = false) {
  return reducedMotion ? "reduced" : normalizeCustomization(settings).effectsIntensity;
}

/** Renderer-only opt-out; a preference never mutates an engine's clock or state. */
export function presentationEffectsReduced(element) {
  if (!element || element.closest?.(".practice-lab-screen")) return false;
  const host = element.closest?.("[data-effective-effects]");
  return host?.getAttribute?.("data-effective-effects") === "reduced"
    || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}
