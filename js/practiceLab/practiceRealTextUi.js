import { PRACTICE_REAL_TEXT_DEFAULT_DURATION_MS, PRACTICE_REAL_TEXT_DURATIONS_MS } from "./practiceRealTextConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function createDefaultPracticeRealTextUiState() {
  return freezeDeep({
    durationMs: PRACTICE_REAL_TEXT_DEFAULT_DURATION_MS,
    practiceStatus: "loading",
    practiceAvailability: null,
    coldStatus: "loading",
    coldAvailability: null,
    starting: null,
    errorCode: null,
  });
}

export function normalizePracticeRealTextUiState(state = {}) {
  return freezeDeep({
    ...createDefaultPracticeRealTextUiState(),
    ...state,
    durationMs: PRACTICE_REAL_TEXT_DURATIONS_MS.includes(state.durationMs) ? state.durationMs : PRACTICE_REAL_TEXT_DEFAULT_DURATION_MS,
  });
}

export function buildPracticeRealTextDetailViewModel({ entry, resolved, state } = {}) {
  const ui = normalizePracticeRealTextUiState(state);
  const supported = new Set(ui.practiceAvailability?.supportedDurationsMs ?? []);
  return freezeDeep({
    kind: "real-text-detail",
    title: entry?.title ?? "Real Text",
    category: entry?.category ?? "Real-world",
    description: entry?.description ?? "Practice broad natural text without target-specific cues, or run a protected Cold Transfer Check to measure generalization on fresh material.",
    longDescription: entry?.longDescription ?? "Natural Practice and Cold Transfer are separate protocols with different evidence roles.",
    runnable: resolved?.runnable === true,
    durationMs: ui.durationMs,
    durations: PRACTICE_REAL_TEXT_DURATIONS_MS.map((durationMs) => ({ durationMs, minutes: durationMs / 60_000, available: supported.has(durationMs) })),
    practiceStatus: ui.practiceStatus,
    practiceAvailability: ui.practiceAvailability,
    naturalCanStart: resolved?.runnable === true && ui.practiceStatus === "ready" && supported.has(ui.durationMs) && ui.starting == null,
    coldStatus: ui.coldStatus,
    coldAvailability: ui.coldAvailability,
    coldCanStart: resolved?.runnable === true && ui.coldStatus === "ready" && ui.coldAvailability?.strictColdEligible === true && ui.starting == null,
    starting: ui.starting,
    errorCode: ui.errorCode,
    backLabel: "Back to Practice Lab",
  });
}
