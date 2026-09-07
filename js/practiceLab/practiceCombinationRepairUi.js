import { PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS, PRACTICE_COMBINATION_REPAIR_PHASES } from "./practiceCombinationRepairConstants.js";

const REASON_COPY = Object.freeze({
  UNSUPPORTED_COMBINATION_TARGET: "Use exactly two lowercase letters for a bigram or three lowercase letters for a trigram.",
  TARGET_INDEX_NOT_FOUND: "The target index is not available for this corpus build.",
  INSUFFICIENT_TARGET_WORDS: "This combination does not yet appear in enough distinct training words.",
  INSUFFICIENT_TARGET_CONTENT: "The training corpus does not yet contain enough bounded target material for the fixed dose.",
  INSUFFICIENT_PROBE_MATCH: "The training corpus cannot yet produce family-disjoint matched Baseline and Check probes for this target.",
  TRAINING_CORPUS_NOT_READY: "The approved training corpus is not ready.",
  CORPUS_VERSION_MISMATCH: "The training corpus version does not match the active Practice manifest.",
  INDEX_VERSION_MISMATCH: "The target index version does not match the active training corpus.",
  CONTENT_HASH_MISMATCH: "A selected training item changed after the plan was built. Start with a fresh plan.",
});

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function createDefaultPracticeCombinationRepairUiState() {
  return freezeDeep({
    entityType: "bigram",
    targetValue: "",
    status: "idle",
    reasonCode: null,
    message: null,
    recommendations: [],
    selectedSource: "manual",
  });
}

export function normalizePracticeCombinationRepairUiState(state = {}) {
  const entityType = state.entityType === "trigram" ? "trigram" : "bigram";
  const targetValue = typeof state.targetValue === "string" ? state.targetValue.slice(0, entityType === "bigram" ? 2 : 3) : "";
  return freezeDeep({
    ...createDefaultPracticeCombinationRepairUiState(),
    ...state,
    entityType,
    targetValue,
    recommendations: Array.isArray(state.recommendations) ? state.recommendations.slice(0, 8) : [],
  });
}

export function getPracticeCombinationRepairReasonCopy(code) {
  return REASON_COPY[code] ?? "Combination Repair could not prepare this target with the current approved training data.";
}

export function buildPracticeCombinationRepairDetailViewModel({ entry, resolved, state } = {}) {
  const ui = normalizePracticeCombinationRepairUiState(state);
  const quotas = PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS[ui.entityType];
  return freezeDeep({
    kind: "combination-repair-detail",
    entry,
    resolved,
    title: entry?.title ?? "Combination Repair",
    entityType: ui.entityType,
    targetValue: ui.targetValue,
    status: ui.status,
    reasonCode: ui.reasonCode,
    message: ui.message ?? (ui.reasonCode ? getPracticeCombinationRepairReasonCopy(ui.reasonCode) : null),
    selectedSource: ui.selectedSource,
    recommendations: ui.recommendations,
    totalOpportunityCount: quotas.total,
    phases: PRACTICE_COMBINATION_REPAIR_PHASES.map((phase) => ({
      ...phase,
      opportunityQuota: quotas[phase.id],
    })),
    canPrepare: resolved?.runnable === true && ui.status !== "preparing",
    preparationPending: ui.status === "preparing",
    isLimited: ui.status === "limited-content",
    isReady: ui.status === "ready",
  });
}
