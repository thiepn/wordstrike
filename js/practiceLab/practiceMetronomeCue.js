import { PRACTICE_METRONOME_COUNT_IN_BEATS, PRACTICE_METRONOME_CUE_MODES, PRACTICE_METRONOME_CUE_VERSION } from "./practiceMetronomeConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function getPracticeMetronomePulseOffsets({ bpm, durationMs, countInBeats = 0 } = {}) {
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(durationMs) || durationMs < 0) return Object.freeze([]);
  const intervalMs = 60_000 / bpm;
  const offsets = [];
  for (let beat = 0; beat < countInBeats; beat += 1) offsets.push({ phase: "count-in", beat: beat + 1, offsetMs: beat * intervalMs });
  const bodyStart = countInBeats * intervalMs;
  for (let beat = 0, offsetMs = bodyStart; offsetMs < bodyStart + durationMs - 0.0001; beat += 1, offsetMs = bodyStart + beat * intervalMs) {
    offsets.push({ phase: "pulse", beat: beat + 1, offsetMs });
  }
  return freezeDeep(offsets);
}

export function createPracticeMetronomeCueScheduler({ scheduleAudioCue, scheduleVisualCue, cancelCue } = {}) {
  if (typeof cancelCue !== "function") throw new TypeError("Metronome cue scheduler requires cancelCue");
  const handles = new Set();
  let active = null;
  function cancelAll() {
    for (const handle of handles) cancelCue(handle);
    handles.clear();
    active = null;
  }
  function start({ block, bpm, cueMode, startAtMs = 0, includeCountIn = false } = {}) {
    cancelAll();
    if (!block || !PRACTICE_METRONOME_CUE_MODES.includes(cueMode)) return null;
    const scheduleCue = cueMode === "audio" ? scheduleAudioCue : scheduleVisualCue;
    if (typeof scheduleCue !== "function") return null;
    const durationMs = Math.max(0, Number(block.endMs) - Number(block.startMs));
    const countInBeats = includeCountIn ? PRACTICE_METRONOME_COUNT_IN_BEATS : 0;
    const offsets = getPracticeMetronomePulseOffsets({ bpm, durationMs: block.condition === "pulse" ? durationMs : 0, countInBeats });
    for (const pulse of offsets) {
      const handle = scheduleCue({ atMs: startAtMs + pulse.offsetMs, phase: pulse.phase, beat: pulse.beat, blockId: block.blockId, cueMode });
      if (handle != null) handles.add(handle);
    }
    active = freezeDeep({ version: PRACTICE_METRONOME_CUE_VERSION, blockId: block.blockId, cueMode, bpm, countInBeats, scheduledCueCount: offsets.length });
    return active;
  }
  return Object.freeze({ start, transition: cancelAll, cancelAll, getActive: () => active, getScheduledCount: () => handles.size });
}
