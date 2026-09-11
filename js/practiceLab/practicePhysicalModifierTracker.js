import { PRACTICE_PHYSICAL_MODIFIER_VERSION } from "./practicePhysicalTelemetryConstants.js";
import { isPracticePhysicalModifierCode } from "./practicePhysicalCodeMap.js";

const downKey = Object.freeze({
  ShiftLeft: "leftShiftDown", ShiftRight: "rightShiftDown",
  AltLeft: "leftAltDown", AltRight: "rightAltDown",
  ControlLeft: "leftControlDown", ControlRight: "rightControlDown",
  MetaLeft: "leftMetaDown", MetaRight: "rightMetaDown",
});

function modifierState(event, name) {
  try { return event?.getModifierState?.(name) === true; } catch { return false; }
}

export function createPracticePhysicalModifierTracker() {
  const state = {
    leftShiftDown: false, rightShiftDown: false,
    leftAltDown: false, rightAltDown: false,
    leftControlDown: false, rightControlDown: false,
    leftMetaDown: false, rightMetaDown: false,
  };
  const reset = () => Object.keys(state).forEach((key) => { state[key] = false; });
  const observeKeyDown = (event) => {
    const key = downKey[event?.code];
    if (key) state[key] = true;
    return Boolean(key || event?.code === "CapsLock");
  };
  const observeKeyUp = (event) => {
    const key = downKey[event?.code];
    if (key) state[key] = false;
    return Boolean(key);
  };
  const getShiftSide = (event) => {
    if (!event?.shiftKey) return "none";
    if (state.leftShiftDown && state.rightShiftDown) return "both";
    if (state.leftShiftDown) return "left";
    if (state.rightShiftDown) return "right";
    return "unknown";
  };
  const snapshot = (event) => Object.freeze({
    modifierVersion: PRACTICE_PHYSICAL_MODIFIER_VERSION,
    shift: event?.shiftKey === true,
    alt: event?.altKey === true,
    altGraph: modifierState(event, "AltGraph"),
    capsLock: modifierState(event, "CapsLock"),
    shiftSide: getShiftSide(event),
  });
  return Object.freeze({ observeKeyDown, observeKeyUp, snapshot, reset, getShiftSide, isModifierCode: isPracticePhysicalModifierCode });
}
