import { isPracticePhysicalTextCode } from "./practicePhysicalCodeMap.js";

const PUNCTUATION_RE = /^[\p{P}]$/u;
const SYMBOL_RE = /^[\p{S}]$/u;
const DIGIT_RE = /^\p{N}$/u;
const LOWER_RE = /^\p{Ll}$/u;
const UPPER_RE = /^\p{Lu}$/u;

function modifierState(event, name) {
  try { return event?.getModifierState?.(name) === true; } catch { return false; }
}

export function classifyPracticePhysicalOutputClass(value) {
  const text = String(value ?? "");
  if (/^\s$/u.test(text)) return "whitespace";
  if (LOWER_RE.test(text)) return "lowercase-letter";
  if (UPPER_RE.test(text)) return "uppercase-letter";
  if (DIGIT_RE.test(text)) return "digit";
  if (PUNCTUATION_RE.test(text)) return "punctuation";
  if (SYMBOL_RE.test(text)) return "symbol";
  return "other";
}

export function isPracticePhysicalCommandShortcut(event) {
  const altGraph = modifierState(event, "AltGraph");
  if (event?.metaKey) return true;
  if (event?.ctrlKey && !altGraph) return true;
  return false;
}

export function normalizePracticePhysicalKeyEvent(event, modifierTracker, timestamp = globalThis.performance?.now?.() ?? Date.now()) {
  if (!event || typeof event !== "object") return null;
  modifierTracker?.observeKeyDown?.(event);
  const modifiers = modifierTracker?.snapshot?.(event) ?? Object.freeze({
    shift: event.shiftKey === true,
    alt: event.altKey === true,
    altGraph: modifierState(event, "AltGraph"),
    capsLock: modifierState(event, "CapsLock"),
    shiftSide: event.shiftKey ? "unknown" : "none",
  });
  return Object.freeze({
    code: typeof event.code === "string" ? event.code : "",
    location: Number.isInteger(event.location) ? event.location : 0,
    repeat: event.repeat === true,
    composing: event.isComposing === true || event.keyCode === 229,
    dead: event.key === "Dead",
    commandShortcut: isPracticePhysicalCommandShortcut(event),
    modifierMask: Object.freeze({ shift: modifiers.shift, alt: modifiers.alt, altGraph: modifiers.altGraph, capsLock: modifiers.capsLock }),
    shiftSide: modifiers.shiftSide,
    timestamp: Math.max(0, Number(timestamp) || 0),
  });
}

export function isPracticePhysicalTelemetryEventEligible(event) {
  return Boolean(event
    && !event.repeat
    && !event.composing
    && !event.dead
    && !event.commandShortcut
    && isPracticePhysicalTextCode(event.code));
}

export function createPracticePhysicalModifierRouteKey({ outputClass, physicalEvent } = {}) {
  if (!physicalEvent || typeof outputClass !== "string") return null;
  const mask = physicalEvent.modifierMask ?? {};
  let route = "none";
  if (mask.altGraph) route = "altgraph";
  else if (mask.capsLock && !mask.shift) route = "capslock";
  else if (mask.shift && mask.alt) route = "shift+alt";
  else if (mask.shift) route = "shift";
  else if (mask.alt) route = "alt";
  else if (mask.capsLock) route = "capslock";
  const shiftSide = mask.shift ? (physicalEvent.shiftSide ?? "unknown") : "none";
  return `${outputClass}|${route}|${shiftSide}`;
}

export function parsePracticePhysicalModifierRouteKey(entityKey) {
  const [outputClass, route, shiftSide, extra] = String(entityKey ?? "").split("|");
  if (extra != null) return null;
  if (!["lowercase-letter", "uppercase-letter", "digit", "punctuation", "symbol", "whitespace", "other"].includes(outputClass)) return null;
  if (!["none", "shift", "capslock", "altgraph", "alt", "shift+alt"].includes(route)) return null;
  if (!["none", "left", "right", "both", "unknown"].includes(shiftSide)) return null;
  return Object.freeze({ outputClass, route, shiftSide });
}
