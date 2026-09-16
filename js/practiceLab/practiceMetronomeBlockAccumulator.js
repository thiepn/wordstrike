import { PRACTICE_METRONOME_WINDOW_MS } from "./practiceMetronomeConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
function blockAt(blocks, ms) { return blocks.find((block) => ms >= block.startMs && ms < block.endMs) ?? null; }
function mergeInterval(list, start, end) {
  if (!(end > start)) return;
  let s = start; let e = end; let i = 0;
  while (i < list.length && list[i][1] < s) i += 1;
  while (i < list.length && list[i][0] <= e) { s = Math.min(s, list[i][0]); e = Math.max(e, list[i][1]); list.splice(i, 1); }
  list.splice(i, 0, [s, e]);
}
function makeWindow() { return { acceptedForwardInsertions: 0, firstPassOpportunityCount: 0, correctFirstPassAttempts: 0, eligibleTimingCount: 0, disfluentTimingCount: 0 }; }

export function createPracticeMetronomeBlockAccumulator({ plan } = {}) {
  if (!plan?.blocks?.length) throw new TypeError("Metronome accumulator requires plan");
  const states = new Map(plan.blocks.map((block) => [block.blockId, { block: { ...block }, windows: new Map(), correctionIntervals: [], protocolCorrupt: false, contentExhausted: false }]));
  function stateAt(ms) { const block = blockAt(plan.blocks, Number(ms)); return block ? states.get(block.blockId) : null; }
  function windowFor(state, ms) {
    const ordinal = Math.max(0, Math.floor((Number(ms) - state.block.startMs) / PRACTICE_METRONOME_WINDOW_MS));
    if (!state.windows.has(ordinal)) state.windows.set(ordinal, makeWindow());
    return state.windows.get(ordinal);
  }
  function recordProcessedInput(event = {}) {
    const state = stateAt(event.activeSessionMs); if (!state) return false;
    const window = windowFor(state, event.activeSessionMs);
    if (event.type === "character" && event.acceptedForward === true) window.acceptedForwardInsertions += 1;
    if (event.isFirstAttempt === true) { window.firstPassOpportunityCount += 1; if (event.correctness === "correct" || event.firstPassCorrect === true) window.correctFirstPassAttempts += 1; }
    if (["fluent", "disfluent"].includes(event.latencyClass) && Number.isFinite(event.previousActiveSessionMs)) {
      const previous = stateAt(event.previousActiveSessionMs);
      if (previous?.block.blockId === state.block.blockId) { window.eligibleTimingCount += 1; if (event.latencyClass === "disfluent") window.disfluentTimingCount += 1; }
    }
    return true;
  }
  function recordClosedErrorEpisode(episode = {}) {
    const start = Number(episode.startActiveSessionMs ?? episode.startedAtActiveMs); const end = Number(episode.endActiveSessionMs ?? episode.closedAtActiveMs);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
    const a = stateAt(start); const b = stateAt(Math.max(start, end - 0.0001));
    if (!a || !b || a.block.blockId !== b.block.blockId) return false;
    mergeInterval(a.correctionIntervals, start, end); return true;
  }
  function mark(kind, ms) { const state = stateAt(ms); if (!state) return false; state[kind] = true; return true; }
  function finalize(activeDurationMs = plan.durationMs) {
    const total = Math.max(0, Math.min(plan.durationMs, Number(activeDurationMs) || 0));
    const blocks = plan.blocks.map((block) => {
      const state = states.get(block.blockId);
      const observedDurationMs = Math.max(0, Math.min(total, block.endMs) - block.startMs);
      const windows = [...state.windows.entries()].sort((a, b) => a[0] - b[0]).map(([ordinal, value]) => {
        const startMs = block.startMs + ordinal * PRACTICE_METRONOME_WINDOW_MS;
        const endMs = Math.min(block.endMs, startMs + PRACTICE_METRONOME_WINDOW_MS, total);
        return freezeDeep({ ordinal, startMs, endMs, observedDurationMs: Math.max(0, endMs - startMs), ...value });
      });
      const sum = (key) => windows.reduce((totalValue, window) => totalValue + (Number(window[key]) || 0), 0);
      return freezeDeep({ ...block, observedDurationMs, acceptedForwardInsertions: sum("acceptedForwardInsertions"), firstPassOpportunityCount: sum("firstPassOpportunityCount"), correctFirstPassAttempts: sum("correctFirstPassAttempts"), eligibleTimingCount: sum("eligibleTimingCount"), disfluentTimingCount: sum("disfluentTimingCount"), correctionCostMs: state.correctionIntervals.reduce((totalValue, [a, z]) => totalValue + (z - a), 0), protocolCorrupt: state.protocolCorrupt, contentExhausted: state.contentExhausted, windows });
    });
    return freezeDeep({ blocks });
  }
  return Object.freeze({ recordProcessedInput, recordClosedErrorEpisode, markProtocolCorrupt: (ms) => mark("protocolCorrupt", ms), markContentExhausted: (ms) => mark("contentExhausted", ms), finalize });
}
