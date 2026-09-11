const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
export function getPracticeMetronomeAvailability({ context, naturalTextAvailable = true, audioSupported = false, audioUnlocked = false, visualSupported = true, correctionBehavior = "allow", error = null } = {}) {
  const reasons = [];
  const language = String(context?.language ?? context?.dataLocale ?? context?.locale ?? "").toLowerCase();
  if (!language.startsWith("en")) reasons.push("METRONOME_LANGUAGE_UNSUPPORTED");
  if (error || !naturalTextAvailable) reasons.push("METRONOME_TEXT_UNAVAILABLE");
  if (!(audioSupported && audioUnlocked) && !visualSupported) reasons.push("METRONOME_CUE_UNAVAILABLE");
  if (correctionBehavior !== "allow") reasons.push("METRONOME_CORRECTION_POLICY_UNSUPPORTED");
  return freezeDeep({ available: reasons.length === 0, reasons, resolvedCueMode: audioSupported && audioUnlocked ? "audio" : visualSupported ? "visual" : null, requiresPracticeData: false, requiresAssessment: false });
}
