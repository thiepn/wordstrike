import { hashPracticeContent } from "./practiceIds.js";
import { PRACTICE_METRONOME_SCHEDULE_VERSION } from "./practiceMetronomeConstants.js";
import { getPracticeMetronomeProtocol } from "./practiceMetronomePolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const BASE = Object.freeze(["pulse", "silent", "silent", "pulse", "pulse", "silent"]);
const flip = (condition) => condition === "pulse" ? "silent" : "pulse";

function variantFor(sessionId) {
  const hash = hashPracticeContent(String(sessionId ?? ""));
  let parity = 0;
  for (const ch of String(hash)) parity ^= ch.charCodeAt(0) & 1;
  return parity & 1;
}

export function buildPracticeMetronomeSchedule({ sessionId, durationMs } = {}) {
  if (!sessionId) throw new TypeError("Metronome schedule requires sessionId");
  const protocol = getPracticeMetronomeProtocol(durationMs);
  const variant = variantFor(sessionId);
  const conditions = BASE.slice(0, protocol.conditionBlockCount).map((condition) => variant ? flip(condition) : condition);
  const blocks = [];
  let cursor = 0;
  blocks.push({ blockId: "baseline", ordinal: 0, kind: "baseline", condition: "silent", cueEnabled: false, startMs: cursor, endMs: cursor + protocol.baselineMs });
  cursor += protocol.baselineMs;
  conditions.forEach((condition, index) => {
    blocks.push({ blockId: `condition-${index + 1}`, ordinal: index + 1, kind: "condition", condition, cueEnabled: condition === "pulse", startMs: cursor, endMs: cursor + protocol.conditionBlockMs });
    cursor += protocol.conditionBlockMs;
  });
  blocks.push({ blockId: "integration", ordinal: blocks.length, kind: "integration", condition: "silent", cueEnabled: false, startMs: cursor, endMs: cursor + protocol.integrationMs });
  cursor += protocol.integrationMs;
  if (cursor !== durationMs) throw new Error("Metronome schedule duration mismatch");
  const firstPulse = blocks.find((block) => block.kind === "condition" && block.condition === "pulse");
  return freezeDeep({
    version: PRACTICE_METRONOME_SCHEDULE_VERSION,
    durationMs,
    variant,
    assignmentKind: "counterbalanced-deterministic",
    randomized: false,
    countInBeats: protocol.countInBeats,
    countInBeforeBlockId: firstPulse?.blockId ?? null,
    conditions,
    blocks,
  });
}
