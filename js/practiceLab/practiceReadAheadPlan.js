import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_READ_AHEAD_FORM_SCHEMA_VERSION,
  PRACTICE_READ_AHEAD_POLICY_VERSION,
  PRACTICE_READ_AHEAD_SCHEDULE_VERSION,
  PRACTICE_READ_AHEAD_VERSION,
  PRACTICE_READ_AHEAD_VISIBILITY_VERSION,
} from "./practiceReadAheadConstants.js";
import { buildPracticeReadAheadSchedule } from "./practiceReadAheadSchedule.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.keys(value).sort().reduce((out, key) => { out[key] = canonical(value[key]); return out; }, {})
    : value;

export function calculatePracticeReadAheadPlanHash(plan) {
  const payload = {
    version: plan.version,
    policyVersion: plan.policyVersion,
    visibilityVersion: plan.visibilityVersion,
    scheduleVersion: plan.scheduleVersion,
    formSchemaVersion: plan.formSchemaVersion,
    sessionId: plan.sessionId,
    durationMs: plan.durationMs,
    formSetId: plan.formSetId,
    formSetVersion: plan.formSetVersion,
    formId: plan.formId,
    formHash: plan.formHash,
    scheduleVariant: plan.scheduleVariant,
    blocks: plan.blocks.map((block) => ({
      blockId: block.blockId,
      ordinal: block.ordinal,
      startMs: block.startMs,
      endMs: block.endMs,
      visibleFutureWords: block.visibleFutureWords,
    })),
  };
  return hashPracticeContent(JSON.stringify(canonical(payload)));
}

export function createPracticeReadAheadPlan({ sessionId, durationMs, formSetId, formSetVersion, formId, formHash } = {}) {
  const schedule = buildPracticeReadAheadSchedule({ sessionId, durationMs });
  const plan = {
    version: PRACTICE_READ_AHEAD_VERSION,
    policyVersion: PRACTICE_READ_AHEAD_POLICY_VERSION,
    visibilityVersion: PRACTICE_READ_AHEAD_VISIBILITY_VERSION,
    scheduleVersion: PRACTICE_READ_AHEAD_SCHEDULE_VERSION,
    formSchemaVersion: PRACTICE_READ_AHEAD_FORM_SCHEMA_VERSION,
    sessionId,
    durationMs,
    formSetId,
    formSetVersion,
    formId,
    formHash,
    scheduleVariant: schedule.variant,
    baseline: schedule.blocks[0],
    constrainedBlocks: schedule.blocks.slice(1, -1),
    integration: schedule.blocks.at(-1),
    blocks: schedule.blocks,
    planHash: null,
  };
  plan.planHash = calculatePracticeReadAheadPlanHash(plan);
  return freezeDeep(plan);
}

export function validatePracticeReadAheadPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object") return { valid: false, errors: ["plan"] };
  if (plan.version !== PRACTICE_READ_AHEAD_VERSION) errors.push("version");
  if (plan.policyVersion !== PRACTICE_READ_AHEAD_POLICY_VERSION) errors.push("policyVersion");
  if (plan.visibilityVersion !== PRACTICE_READ_AHEAD_VISIBILITY_VERSION) errors.push("visibilityVersion");
  if (plan.scheduleVersion !== PRACTICE_READ_AHEAD_SCHEDULE_VERSION) errors.push("scheduleVersion");
  if (!Array.isArray(plan.blocks) || plan.blocks.length < 8 || plan.blocks.length > 20) errors.push("blocks");
  if (plan.planHash !== calculatePracticeReadAheadPlanHash(plan)) errors.push("planHash");
  return { valid: errors.length === 0, errors };
}
