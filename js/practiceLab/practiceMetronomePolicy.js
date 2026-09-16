import {
  PRACTICE_METRONOME_COUNT_IN_BEATS,
  PRACTICE_METRONOME_DURATIONS_MS,
  PRACTICE_METRONOME_MAX_BPM,
  PRACTICE_METRONOME_MAX_CHARS_PER_BEAT,
  PRACTICE_METRONOME_MIN_BPM,
  PRACTICE_METRONOME_MIN_CHARS_PER_BEAT,
  PRACTICE_METRONOME_POLICY_VERSION,
  PRACTICE_METRONOME_TARGET_BPM,
} from "./practiceMetronomeConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const PROTOCOLS = Object.freeze({
  120000: Object.freeze({ baselineMs: 20_000, conditionBlockCount: 4, conditionBlockMs: 20_000, integrationMs: 20_000 }),
  300000: Object.freeze({ baselineMs: 30_000, conditionBlockCount: 6, conditionBlockMs: 40_000, integrationMs: 30_000 }),
  480000: Object.freeze({ baselineMs: 30_000, conditionBlockCount: 6, conditionBlockMs: 70_000, integrationMs: 30_000 }),
});

export function getPracticeMetronomeProtocol(durationMs) {
  const protocol = PROTOCOLS[durationMs];
  if (!protocol) throw new RangeError("Unsupported Metronome Typing duration");
  return freezeDeep({
    version: PRACTICE_METRONOME_POLICY_VERSION,
    durationMs,
    ...protocol,
    countInBeats: PRACTICE_METRONOME_COUNT_IN_BEATS,
    targetBlind: true,
    correctionBehavior: "allow",
    tempoAdaptiveAfterCalibration: false,
    beatMeaning: "external-cadence-cue-not-keystroke-target",
  });
}

export function calculatePracticeMetronomeGrossCpm({ acceptedForwardInsertions, durationMs } = {}) {
  const chars = Number(acceptedForwardInsertions);
  const duration = Number(durationMs);
  if (!Number.isFinite(chars) || chars < 0 || !Number.isFinite(duration) || duration <= 0) return null;
  return chars * 60_000 / duration;
}

export function selectPracticeMetronomeTempo(grossCpm) {
  const cpm = Number(grossCpm);
  if (!Number.isFinite(cpm) || cpm <= 0) return null;
  const candidates = [];
  for (let charsPerBeat = PRACTICE_METRONOME_MIN_CHARS_PER_BEAT; charsPerBeat <= PRACTICE_METRONOME_MAX_CHARS_PER_BEAT; charsPerBeat += 1) {
    const bpm = cpm / charsPerBeat;
    if (bpm < PRACTICE_METRONOME_MIN_BPM || bpm > PRACTICE_METRONOME_MAX_BPM) continue;
    candidates.push({ charsPerBeat, bpm, distanceFromTarget: Math.abs(bpm - PRACTICE_METRONOME_TARGET_BPM) });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.distanceFromTarget - b.distanceFromTarget
    || Math.abs(a.charsPerBeat - cpm / PRACTICE_METRONOME_TARGET_BPM) - Math.abs(b.charsPerBeat - cpm / PRACTICE_METRONOME_TARGET_BPM)
    || a.charsPerBeat - b.charsPerBeat);
  const selected = candidates[0];
  return freezeDeep({
    policyVersion: PRACTICE_METRONOME_POLICY_VERSION,
    grossCpm: cpm,
    charsPerBeat: selected.charsPerBeat,
    bpm: selected.bpm,
    targetBpm: PRACTICE_METRONOME_TARGET_BPM,
    fixedForSession: true,
    candidateCount: candidates.length,
  });
}

export function resolvePracticeMetronomeCueMode({ audioSupported = false, audioUnlocked = false, visualSupported = true } = {}) {
  if (audioSupported && audioUnlocked) return "audio";
  if (visualSupported) return "visual";
  return null;
}

export function validatePracticeMetronomeDuration(durationMs) {
  return PRACTICE_METRONOME_DURATIONS_MS.includes(durationMs);
}
