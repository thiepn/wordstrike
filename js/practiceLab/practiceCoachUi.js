import { PRACTICE_COACH_ALLOWED_MINUTES, PRACTICE_COACH_DEFAULT_MINUTES } from "./practiceCoachConstants.js";
import { normalizePracticeCoachRequestedMinutes } from "./practiceCoachPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const BLOCK_TITLES = Object.freeze({
  "daily-coach-review": "Review",
  "weak-keys": "Weak Keys",
  "combination-repair": "Combination Repair",
  "problem-words": "Problem Words",
  "accuracy-control": "Accuracy & Recovery",
  "real-text": "Real Text",
});

const REASON_COPY = Object.freeze({
  "overdue-review": "Several retention checks are due.",
  "high-review-value": "Retention checks with useful timing are due.",
  "high-impact-limiter": "This limiter has broad real-world importance in the current evidence.",
  "high-confidence-limiter": "The current evidence supports this limiter with relatively high confidence.",
  "accuracy-recovery-match": "Accuracy or recovery pressure is the strongest matching execution issue.",
  "key-foundation": "A key-level limiter is still unresolved.",
  "combination-limiter": "A high-value combination is still unresolved.",
  "word-limiter": "A word-level limiter is still unresolved.",
  "learning-headroom": "Recent learning evidence still leaves room for focused practice.",
  "saturation-deemphasis": "Recent similar practice has been de-emphasized because learning headroom is limited.",
  "broad-integration": "Broad natural-text practice adds non-weakness-only integration.",
  "readiness-reduced": "Today's plan starts with broader practice before focused work.",
  "warmup-observed": "Today's plan starts with broader practice before focused work.",
});

const BLOCKED_COPY = Object.freeze({
  "target-practised-after-plan": "This target was directly practiced after today's plan was created.",
  "review-binding-stale": "This review is no longer current because its retention schedule changed.",
  "PRACTICE_COACH_REVIEW_HASH_MISMATCH": "This review is no longer current because its approved practice content changed.",
  "PRACTICE_COACH_REAL_TEXT_STALE": "This Real Text block is no longer compatible with the current approved pool.",
});

function targetLabel(block) {
  const target = block?.target;
  if (!target?.entityKey) return null;
  if (target.entityType === "key") return target.entityKey.toUpperCase();
  return target.entityKey;
}

function blockReason(block) {
  for (const code of block?.reasonCodes ?? []) if (REASON_COPY[code]) return REASON_COPY[code];
  if (block?.kind === "real-text") return REASON_COPY["broad-integration"];
  return "This block fits the evidence available when today's plan was created.";
}

function blockStatusLabel(block) {
  if (block?.status === "completed") return "Completed";
  if (block?.status === "skipped") return "Skipped";
  if (block?.status === "blocked") return "Blocked";
  if (block?.status === "invalid") return "Interrupted";
  if (block?.status === "active") return "Active";
  return "Pending";
}

function blockView(block) {
  const reason = blockReason(block);
  const blockedReason = block?.status === "blocked"
    ? BLOCKED_COPY[block?.blockResult?.reason] ?? "This block is no longer current because the underlying Practice evidence changed after today's plan was created."
    : null;
  return freezeDeep({
    blockId: block.blockId,
    ordinal: block.ordinal,
    kind: block.kind,
    title: BLOCK_TITLES[block.experimentId] ?? "Practice",
    target: targetLabel(block),
    estimatedMinutes: block.estimatedMinutes,
    status: block.status,
    statusLabel: blockStatusLabel(block),
    reason,
    blockedReason,
    canSkip: block.status === "pending",
  });
}

function progress(plan) {
  const terminal = (plan?.blocks ?? []).filter((block) => ["completed", "skipped", "blocked", "invalid"].includes(block.status)).length;
  const completed = Number(plan?.completion?.completedCount || 0);
  return freezeDeep({ terminal, completed, total: plan?.blocks?.length ?? 0, label: `${completed} of ${plan?.blocks?.length ?? 0} completed` });
}

function rationales(plan) {
  const output = [];
  if (plan?.blocks?.some((block) => block.kind === "review")) output.push("Due retention checks come before today's acquisition practice.");
  if (plan?.decisionContext?.readinessBand === "reduced" || plan?.decisionContext?.warmupStatus === "observed") output.push("Today's plan starts with broader practice before focused work.");
  const target = plan?.blocks?.find((block) => block.kind === "targeted-intervention");
  if (target) output.push(blockReason(target));
  if (plan?.blocks?.some((block) => block.kind === "real-text")) output.push("Broad natural-text practice keeps the plan from becoming weakness-only.");
  return freezeDeep([...new Set(output)].slice(0, 3));
}

export function createDefaultPracticeCoachUiState({ requestedMinutes = PRACTICE_COACH_DEFAULT_MINUTES } = {}) {
  const normalized = normalizePracticeCoachRequestedMinutes(requestedMinutes);
  return freezeDeep({
    status: "idle",
    requestedMinutes: normalized.minutes,
    plan: null,
    errorCode: null,
    startingBlockId: null,
  });
}

export function normalizePracticeCoachUiState(value = {}) {
  const normalized = normalizePracticeCoachRequestedMinutes(value.requestedMinutes);
  return freezeDeep({
    status: ["idle", "loading", "creating", "ready", "starting", "error"].includes(value.status) ? value.status : "idle",
    requestedMinutes: normalized.minutes,
    plan: value.plan ?? null,
    errorCode: value.errorCode ?? null,
    startingBlockId: value.startingBlockId ?? null,
  });
}

export function buildPracticeCoachViewModel({ state, preview = true } = {}) {
  const normalized = normalizePracticeCoachUiState(state);
  const plan = normalized.plan;
  if (!plan) return freezeDeep({
    kind: "daily-training",
    title: "Daily Training",
    subtitle: "A small evidence-informed plan that combines due review, one focused need when justified, and broad natural-text practice.",
    preview,
    status: normalized.status,
    errorCode: normalized.errorCode,
    requestedMinutes: normalized.requestedMinutes,
    durationChoices: PRACTICE_COACH_ALLOWED_MINUTES.map((minutes) => ({ minutes, selected: minutes === normalized.requestedMinutes })),
    plan: null,
    canCreate: normalized.status !== "loading" && normalized.status !== "creating",
  });
  const blocks = plan.blocks.map(blockView);
  const nextBlock = plan.blocks.find((block) => block.status === "pending") ?? null;
  const activeBlock = plan.blocks.find((block) => block.status === "active") ?? null;
  return freezeDeep({
    kind: "daily-training",
    title: "Daily Training",
    subtitle: "Today's plan is frozen. Completing, skipping, or blocking a block does not replace the remaining blocks.",
    preview,
    status: normalized.status,
    errorCode: normalized.errorCode,
    requestedMinutes: plan.requestedMinutes,
    durationChoices: PRACTICE_COACH_ALLOWED_MINUTES.map((minutes) => ({ minutes, selected: minutes === plan.requestedMinutes })),
    plan: {
      coachPlanId: plan.coachPlanId,
      status: plan.status,
      statusLabel: plan.status === "abandoned" ? "Ended for today" : plan.status === "expired" ? "Expired" : plan.status === "finished" ? "Finished" : "Today's plan",
      requestedMinutes: plan.requestedMinutes,
      plannedMinutes: plan.plannedMinutes,
      coverageLabel: plan.coverage?.label ?? null,
      blockCount: plan.blocks.length,
      blocks,
      progress: progress(plan),
      nextBlockId: nextBlock?.blockId ?? null,
      activeBlockId: activeBlock?.blockId ?? null,
      canStartNext: Boolean(nextBlock) && !activeBlock && !["finished", "abandoned", "expired"].includes(plan.status),
      canEndToday: !activeBlock && !["finished", "abandoned", "expired"].includes(plan.status),
      rationales: rationales(plan),
      suggestions: plan.suggestions ?? {},
    },
  });
}
