import {
  PRACTICE_ASSESSMENT_BLOCK_STATUSES,
  PRACTICE_ASSESSMENT_INTEGRITY_STATUSES,
  PRACTICE_ASSESSMENT_LIMITS,
  PRACTICE_ASSESSMENT_POLICY_VERSION,
  PRACTICE_ASSESSMENT_PROTOCOL_VERSION,
} from "./practiceAssessmentConstants.js";
import { createPracticeAssessmentRunId } from "./practiceIds.js";

const iso = (value) => new Date(value).toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));

export function createDefaultPracticeAssessmentRun({ assessmentRunId = createPracticeAssessmentRunId(), profileId, contextId, depth, plan, now = Date.now } = {}) {
  const createdAt = iso(now());
  return {
    assessmentRunId,
    profileId,
    contextId,
    recordVersion: 1,
    protocolVersion: PRACTICE_ASSESSMENT_PROTOCOL_VERSION,
    policyVersion: PRACTICE_ASSESSMENT_POLICY_VERSION,
    depth,
    status: "created",
    integrityStatus: "standard",
    createdAt,
    startedAt: null,
    completedAt: null,
    expiresAt: iso(new Date(createdAt).getTime() + PRACTICE_ASSESSMENT_LIMITS.maximumAssessmentWallSpanMs),
    plan: clone(plan),
    progress: { currentBlockIndex: 0, completedBlockCount: 0, terminalBlockCount: 0 },
    blocks: plan.blocks.map((block) => ({
      blockId: block.blockId,
      ordinal: block.ordinal,
      status: "pending",
      durationMs: block.durationMs,
      diagnosticFormId: block.diagnosticFormId ?? null,
      evaluationReservationId: block.evaluationReservationId ?? null,
      childSessionId: null,
      startedAt: null,
      completedAt: null,
      result: null,
    })),
    report: null,
  };
}

export function validatePracticeAssessmentRun(run) {
  const errors = [];
  if (!run || typeof run !== "object" || Array.isArray(run)) return { valid: false, errors: [{ path: "run", code: "TYPE" }] };
  if (run.recordVersion !== 1) errors.push({ path: "recordVersion", code: "VERSION" });
  if (!String(run.assessmentRunId ?? "").startsWith("practice-assessment_")) errors.push({ path: "assessmentRunId", code: "IDENTITY" });
  if (!run.profileId || !run.contextId) errors.push({ path: "identity", code: "REQUIRED" });
  if (!["created", "active", "completed", "abandoned", "expired", "invalid"].includes(run.status)) errors.push({ path: "status", code: "ENUM" });
  if (!PRACTICE_ASSESSMENT_INTEGRITY_STATUSES.includes(run.integrityStatus)) errors.push({ path: "integrityStatus", code: "ENUM" });
  if (!Array.isArray(run.blocks) || run.blocks.length !== run.plan?.blocks?.length) errors.push({ path: "blocks", code: "PLAN_MISMATCH" });
  for (const [i, block] of (run.blocks ?? []).entries()) {
    const planned = run.plan?.blocks?.[i];
    if (!PRACTICE_ASSESSMENT_BLOCK_STATUSES.includes(block.status)) errors.push({ path: `blocks.${i}.status`, code: "ENUM" });
    if (!planned || block.blockId !== planned.blockId || block.ordinal !== planned.ordinal || block.durationMs !== planned.durationMs) errors.push({ path: `blocks.${i}`, code: "PLAN_MISMATCH" });
    if (block.status === "completed" && (!block.childSessionId || !block.completedAt || !block.result)) errors.push({ path: `blocks.${i}`, code: "COMPLETED_INCOMPLETE" });
  }
  if (run.status === "completed" && !run.completedAt) errors.push({ path: "completedAt", code: "REQUIRED" });
  if (run.report && JSON.stringify(run).length > 128 * 1024) errors.push({ path: "run", code: "SIZE" });
  return { valid: errors.length === 0, errors };
}

export function activatePracticeAssessmentRun(run, { now = Date.now } = {}) {
  if (run.status !== "created") throw new Error("Only created assessment runs can be activated");
  return { ...clone(run), status: "active", startedAt: iso(now()) };
}

export function reconcilePracticeAssessmentRunExpiry(run, { now = Date.now } = {}) {
  if (!["created", "active"].includes(run.status) || new Date(now()).getTime() <= new Date(run.expiresAt).getTime()) return run;
  return { ...clone(run), status: "expired", integrityStatus: run.integrityStatus === "invalid" ? "invalid" : "partial" };
}

export function markPracticeAssessmentBlockStarted(run, { blockId, childSessionId, now = Date.now } = {}) {
  const current = run.blocks[run.progress.currentBlockIndex];
  if (run.status !== "active" || !current || current.blockId !== blockId || current.status !== "pending") throw new Error("Assessment block cannot start out of order or be replayed");
  const next = clone(run);
  const block = next.blocks[next.progress.currentBlockIndex];
  block.status = "active";
  block.startedAt = iso(now());
  block.childSessionId = childSessionId;
  return next;
}

export function mergePracticeAssessmentBlockDelta(run, delta) {
  if (run.status !== "active") throw new Error("Assessment run is not active");
  const index = run.blocks.findIndex((block) => block.blockId === delta.blockId && block.ordinal === delta.blockOrdinal);
  if (index < 0) throw new Error("Assessment block identity mismatch");
  const current = run.blocks[index];
  if (index !== run.progress.currentBlockIndex || current.childSessionId !== delta.sessionId || current.status !== "active") throw new Error("Assessment block/session/ordinal mismatch");
  const next = clone(run);
  const block = next.blocks[index];
  block.status = delta.status === "completed" ? "completed" : "invalid";
  block.completedAt = delta.completedAtUtc;
  block.result = clone(delta);
  next.progress.terminalBlockCount += 1;
  if (block.status === "completed") next.progress.completedBlockCount += 1;
  next.progress.currentBlockIndex = Math.min(index + 1, next.blocks.length);
  if (block.status === "invalid" && next.integrityStatus !== "invalid") next.integrityStatus = "partial";
  return next;
}

export function abandonPracticeAssessmentRun(run, { now = Date.now } = {}) {
  if (!["created", "active"].includes(run.status)) return run;
  const next = clone(run);
  next.status = "abandoned";
  if (next.integrityStatus !== "invalid") next.integrityStatus = "partial";
  const active = next.blocks.find((block) => block.status === "active");
  if (active) {
    active.status = "invalid";
    active.completedAt = iso(now());
    next.progress.terminalBlockCount += 1;
  }
  return next;
}
