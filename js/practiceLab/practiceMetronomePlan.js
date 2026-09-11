import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_METRONOME_CUE_MODES,
  PRACTICE_METRONOME_PLAN_VERSION,
  PRACTICE_METRONOME_POLICY_VERSION,
  PRACTICE_METRONOME_SCHEDULE_VERSION,
} from "./practiceMetronomeConstants.js";
import { selectPracticeMetronomeTempo } from "./practiceMetronomePolicy.js";
import { buildPracticeMetronomeSchedule } from "./practiceMetronomeSchedule.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.keys(value).sort().reduce((out, key) => { out[key] = canonical(value[key]); return out; }, {}) : value;

export function calculatePracticeMetronomePlanHash(plan) {
  const payload = {
    version: plan.version,
    policyVersion: plan.policyVersion,
    scheduleVersion: plan.scheduleVersion,
    sessionId: plan.sessionId,
    durationMs: plan.durationMs,
    cueMode: plan.cueMode,
    content: plan.content,
    calibration: plan.calibration,
    tempo: plan.tempo,
    scheduleVariant: plan.scheduleVariant,
    blocks: plan.blocks.map((block) => ({ blockId: block.blockId, kind: block.kind, condition: block.condition, startMs: block.startMs, endMs: block.endMs })),
  };
  return hashPracticeContent(JSON.stringify(canonical(payload)));
}

export function createPracticeMetronomePlan({ sessionId, durationMs, cueMode, baselineGrossCpm, contentId, contentHash } = {}) {
  if (!PRACTICE_METRONOME_CUE_MODES.includes(cueMode)) throw new TypeError("Metronome plan requires resolved audio or visual cue mode");
  const tempo = selectPracticeMetronomeTempo(baselineGrossCpm);
  if (!tempo) throw new RangeError("Metronome calibration did not yield a supported fixed tempo");
  const schedule = buildPracticeMetronomeSchedule({ sessionId, durationMs });
  const plan = {
    version: PRACTICE_METRONOME_PLAN_VERSION,
    policyVersion: PRACTICE_METRONOME_POLICY_VERSION,
    scheduleVersion: PRACTICE_METRONOME_SCHEDULE_VERSION,
    sessionId,
    durationMs,
    cueMode,
    content: { contentId: contentId ?? null, contentHash: contentHash ?? null, targetBlind: true, sourceRole: "natural-training-text" },
    calibration: { kind: "silent-natural-baseline", grossCpm: baselineGrossCpm, blockId: "baseline" },
    tempo,
    scheduleVariant: schedule.variant,
    counterbalanceAssignmentKind: schedule.assignmentKind,
    randomizedAssignment: false,
    countInBeats: schedule.countInBeats,
    countInBeforeBlockId: schedule.countInBeforeBlockId,
    baseline: schedule.blocks[0],
    conditionBlocks: schedule.blocks.slice(1, -1),
    integration: schedule.blocks.at(-1),
    blocks: schedule.blocks,
    planHash: null,
  };
  plan.planHash = calculatePracticeMetronomePlanHash(plan);
  return freezeDeep(plan);
}

export function validatePracticeMetronomePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object") return { valid: false, errors: ["plan"] };
  if (plan.version !== PRACTICE_METRONOME_PLAN_VERSION) errors.push("version");
  if (plan.policyVersion !== PRACTICE_METRONOME_POLICY_VERSION) errors.push("policyVersion");
  if (plan.scheduleVersion !== PRACTICE_METRONOME_SCHEDULE_VERSION) errors.push("scheduleVersion");
  if (!PRACTICE_METRONOME_CUE_MODES.includes(plan.cueMode)) errors.push("cueMode");
  if (plan.content?.targetBlind !== true) errors.push("targetBlind");
  if (plan.tempo?.fixedForSession !== true || !Number.isFinite(plan.tempo?.bpm)) errors.push("tempo");
  if (plan.randomizedAssignment !== false || plan.counterbalanceAssignmentKind !== "counterbalanced-deterministic") errors.push("assignment");
  if (plan.integration?.condition !== "silent" || plan.integration?.cueEnabled !== false) errors.push("integration");
  if (plan.planHash !== calculatePracticeMetronomePlanHash(plan)) errors.push("planHash");
  return { valid: errors.length === 0, errors };
}
