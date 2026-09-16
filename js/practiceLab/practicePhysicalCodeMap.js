import { PRACTICE_PHYSICAL_CODE_MAP_VERSION } from "./practicePhysicalTelemetryConstants.js";

const letters = Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`);
const digits = Array.from({ length: 10 }, (_, index) => `Digit${index}`);
const numpadDigits = Array.from({ length: 10 }, (_, index) => `Numpad${index}`);
const punctuation = [
  "Backquote", "Minus", "Equal", "BracketLeft", "BracketRight", "Backslash", "Semicolon", "Quote", "Comma", "Period", "Slash", "IntlBackslash",
];
const numpad = ["NumpadDecimal", "NumpadAdd", "NumpadSubtract", "NumpadMultiply", "NumpadDivide", "NumpadEnter"];
export const PRACTICE_PHYSICAL_TEXT_CODES = Object.freeze([...letters, ...digits, ...punctuation, ...numpadDigits, ...numpad, "Space"]);
export const PRACTICE_PHYSICAL_MODIFIER_CODES = Object.freeze([
  "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "ControlLeft", "ControlRight", "MetaLeft", "MetaRight", "CapsLock",
]);

const textCodeSet = new Set(PRACTICE_PHYSICAL_TEXT_CODES);
const modifierCodeSet = new Set(PRACTICE_PHYSICAL_MODIFIER_CODES);

function rowForCode(code) {
  if (/^Digit\d$/.test(code) || ["Backquote", "Minus", "Equal"].includes(code)) return "number-row";
  if (/^Key[QWERTYUIOP]$/.test(code) || ["BracketLeft", "BracketRight", "Backslash"].includes(code)) return "upper-row";
  if (/^Key[ASDFGHJKL]$/.test(code) || ["Semicolon", "Quote"].includes(code)) return "home-row";
  if (/^Key[ZXCVBNM]$/.test(code) || ["Comma", "Period", "Slash", "IntlBackslash"].includes(code)) return "lower-row";
  if (code.startsWith("Numpad")) return "numpad";
  return "other";
}

function zoneForCode(code) {
  const left = new Set(["KeyQ", "KeyW", "KeyE", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyX", "KeyC", "Digit1", "Digit2", "Digit3", "Digit4", "Backquote"]);
  const right = new Set(["KeyU", "KeyI", "KeyO", "KeyP", "KeyJ", "KeyK", "KeyL", "KeyM", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal", "BracketLeft", "BracketRight", "Backslash", "Semicolon", "Quote", "Comma", "Period", "Slash"]);
  if (code.startsWith("Numpad")) return "right-zone";
  if (left.has(code)) return "left-zone";
  if (right.has(code)) return "right-zone";
  return "center-zone";
}

export function isPracticePhysicalTextCode(code) {
  return textCodeSet.has(String(code ?? ""));
}

export function isPracticePhysicalModifierCode(code) {
  return modifierCodeSet.has(String(code ?? ""));
}

export function isPracticePhysicalKnownCode(code) {
  return isPracticePhysicalTextCode(code) || isPracticePhysicalModifierCode(code);
}

export function getPracticePhysicalCodeMetadata(code) {
  if (!isPracticePhysicalTextCode(code)) return null;
  return Object.freeze({
    code,
    codeMapVersion: PRACTICE_PHYSICAL_CODE_MAP_VERSION,
    row: rowForCode(code),
    zone: zoneForCode(code),
    label: code,
  });
}
