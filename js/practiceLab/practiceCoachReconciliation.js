import {
  calculatePracticeCoachCompletion,
  isPracticeCoachBlockTerminal,
  validatePracticeCoachPlan,
} from "./practiceCoachPlan.js";
import { getPracticeLocalDayKey, toPracticeUtcIso } from "./practiceTime.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clone = (value) => JSON.parse(JSON.stringify(value));

function finalize(plan, blocks, now, status = plan.status) {
  const next = {
    ...clone(plan),
    blocks,
    updatedAt: toPracticeUtcIso(now),
    status,
    completion: calculatePracticeCoachCompletion(blocks),
  };
  if (!["abandoned", "expired"].includes(next.status) && blocks.length > 0 && blocks.every((block) => isPracticeCoachBlockTerminal(block.status))) next.status = "finished";
  const validation = validatePracticeCoachPlan(next);
  if (!validation.valid) {
    const error = new TypeError("Reconciled Practice Coach plan failed validation");
    error.details = validation.errors;
    throw error;
  }
  return freezeDeep(next);
}

export function applyPracticeCoachBlockDelta(plan, delta, { now = () => new Date() } = {}) {
  if (!plan || !delta || delta.coachPlanId !== plan.coachPlanId) return Object.freeze({ updated: false, reason: "coach-plan-stale", plan });
  const index = plan.blocks.findIndex((block) => block.blockId === delta.blockId && block.plannedSessionId === delta.plannedSessionId);
  if (index < 0) return Object.freeze({ updated: false, reason: "coach-plan-stale", plan });
  const current = plan.blocks[index];
  if (current.status === "completed" && current.childSessionId === delta.sessionId) return Object.freeze({ updated: false, idempotent: true, reason: null, plan });
  if (current.status !== "active" || current.childSessionId !== delta.sessionId) return Object.freeze({ updated: false, reason: "coach-plan-stale", plan });
  const terminalStatus = delta.terminalStatus === "completed" ? "completed" : "invalid";
  const blocks = clone(plan.blocks);
  blocks[index] = {
    ...blocks[index],
    status: terminalStatus,
    completedAt: delta.completedAt,
    blockResult: {
      sessionId: delta.sessionId,
      terminalStatus,
      completedAt: delta.completedAt,
    },
  };
  return Object.freeze({ updated: true, idempotent: false, reason: null, plan: finalize(plan, blocks, now) });
}

export function reconcilePracticeCoachPlanRecord(plan, {
  childSessions = [],
  activeSessionIds = [],
  now = () => new Date(),
} = {}) {
  if (!plan) return null;
  const currentDay = getPracticeLocalDayKey(now);
  const sessionById = new Map((childSessions ?? []).map((session) => [session.sessionId, session]));
  const active = new Set(activeSessionIds ?? []);
  let blocks = clone(plan.blocks);
  let changed = false;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.status !== "active") continue;
    const session = block.childSessionId ? sessionById.get(block.childSessionId) : null;
    if (session) {
      const status = session.status === "completed" ? "completed" : "invalid";
      blocks[index] = {
        ...block,
        status,
        completedAt: session.completedAtUtc ?? block.completedAt ?? toPracticeUtcIso(now),
        blockResult: block.blockResult ?? { sessionId: session.sessionId, terminalStatus: status, completedAt: session.completedAtUtc ?? toPracticeUtcIso(now) },
      };
      changed = true;
    } else if (!active.has(block.childSessionId)) {
      blocks[index] = {
        ...block,
        status: "invalid",
        completedAt: toPracticeUtcIso(now),
        blockResult: { sessionId: block.childSessionId, terminalStatus: "invalid", completedAt: toPracticeUtcIso(now), reason: "interrupted-nonresumable" },
      };
      changed = true;
    }
  }
  let status = plan.status;
  if (plan.localDayKey !== currentDay && !["finished", "abandoned", "expired"].includes(status)) {
    status = "expired";
    changed = true;
  }
  if (!changed) return plan;
  return finalize(plan, blocks, now, status);
}

export function skipPracticeCoachBlockRecord(plan, blockId, { now = () => new Date() } = {}) {
  const index = plan?.blocks?.findIndex((block) => block.blockId === blockId) ?? -1;
  if (index < 0 || plan.blocks[index].status !== "pending") return Object.freeze({ updated: false, plan, reason: "block-not-pending" });
  const blocks = clone(plan.blocks);
  blocks[index] = { ...blocks[index], status: "skipped", completedAt: toPracticeUtcIso(now), blockResult: { terminalStatus: "skipped", completedAt: toPracticeUtcIso(now) } };
  return Object.freeze({ updated: true, plan: finalize(plan, blocks, now) });
}

export function blockPracticeCoachBlockRecord(plan, blockId, reason, { now = () => new Date() } = {}) {
  const index = plan?.blocks?.findIndex((block) => block.blockId === blockId) ?? -1;
  if (index < 0 || !["pending", "active"].includes(plan.blocks[index].status)) return Object.freeze({ updated: false, plan, reason: "block-not-startable" });
  const blocks = clone(plan.blocks);
  blocks[index] = { ...blocks[index], status: "blocked", completedAt: toPracticeUtcIso(now), blockResult: { terminalStatus: "blocked", completedAt: toPracticeUtcIso(now), reason: String(reason || "evidence-changed").slice(0, 80) } };
  return Object.freeze({ updated: true, plan: finalize(plan, blocks, now) });
}

export function abandonPracticeCoachPlanRecord(plan, { now = () => new Date() } = {}) {
  if (!plan || ["finished", "abandoned", "expired"].includes(plan.status)) return plan;
  const blocks = clone(plan.blocks).map((block) => block.status === "pending"
    ? { ...block, status: "skipped", completedAt: toPracticeUtcIso(now), blockResult: { terminalStatus: "skipped", completedAt: toPracticeUtcIso(now), reason: "end-for-today" } }
    : block);
  return finalize(plan, blocks, now, "abandoned");
}
