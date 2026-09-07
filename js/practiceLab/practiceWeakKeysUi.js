import {
  PRACTICE_WEAK_KEYS_PHASE_QUOTAS,
  PRACTICE_WEAK_KEYS_PHASES,
} from "./practiceWeakKeysConstants.js";
import { normalizePracticeWeakKeyTarget } from "./practiceWeakKeysTargets.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const TARGET_STATUSES = new Set(["idle", "checking", "ready", "limited-content", "unsupported", "unavailable", "preparing", "error"]);
const RECOMMENDATION_STATUSES = new Set(["idle", "loading", "ready", "no-evidence", "unsupported", "unavailable"]);

export function createDefaultPracticeWeakKeysUiState() {
  return freezeDeep({
    targetValue: "",
    selectedSource: "manual",
    status: "idle",
    reasonCode: null,
    message: null,
    availability: null,
    saturationWarning: null,
    recommendationStatus: "idle",
    recommendations: [],
    recommendationErrorCode: null,
  });
}

export function normalizePracticeWeakKeysUiState(value = {}) {
  const base = createDefaultPracticeWeakKeysUiState();
  const targetValue = typeof value.targetValue === "string" ? value.targetValue : base.targetValue;
  return freezeDeep({
    targetValue,
    selectedSource: ["recommended", "manual", "external-plan"].includes(value.selectedSource) ? value.selectedSource : "manual",
    status: TARGET_STATUSES.has(value.status) ? value.status : "idle",
    reasonCode: typeof value.reasonCode === "string" ? value.reasonCode : null,
    message: typeof value.message === "string" ? value.message : null,
    availability: value.availability && typeof value.availability === "object" ? value.availability : null,
    saturationWarning: value.saturationWarning && typeof value.saturationWarning === "object" ? value.saturationWarning : null,
    recommendationStatus: RECOMMENDATION_STATUSES.has(value.recommendationStatus) ? value.recommendationStatus : "idle",
    recommendations: Object.freeze((Array.isArray(value.recommendations) ? value.recommendations : []).slice(0, 8)),
    recommendationErrorCode: typeof value.recommendationErrorCode === "string" ? value.recommendationErrorCode : null,
  });
}

export function normalizePracticeWeakKeysManualInput(value, language = "en") {
  if (typeof value !== "string") return freezeDeep({ normalizedValue: "", target: null, valid: false, message: "Weak Keys trains one letter at a time." });
  const trimmed = value.trim().normalize("NFC");
  let lowered;
  try { lowered = trimmed.toLocaleLowerCase(language); } catch { lowered = trimmed.toLowerCase(); }
  const target = normalizePracticeWeakKeyTarget({ entityType: "key", entityKey: lowered, language });
  return freezeDeep({
    normalizedValue: target?.entityKey ?? lowered,
    target,
    valid: Boolean(target),
    message: target ? null : trimmed.length > 1 ? "Weak Keys trains one letter at a time." : "Choose one English letter from a to z.",
  });
}

function reasonMessage(state) {
  if (state.message) return state.message;
  const code = state.reasonCode ?? state.availability?.reasons?.[0] ?? null;
  const messages = {
    UNSUPPORTED_KEY_TARGET: "Weak Keys trains one English letter from a to z at a time.",
    KEY_INDEX_NOT_FOUND: "No approved training index evidence is available for this key.",
    INSUFFICIENT_KEY_WORDS: "There are not enough approved target-containing words for the fixed v1 protocol.",
    INSUFFICIENT_KEY_CONTENT: "There is not enough approved indexed training content for the fixed v1 protocol.",
    INSUFFICIENT_POSITION_VARIETY: "The approved corpus cannot provide the minimum natural word-position variety for this key.",
    INSUFFICIENT_NEUTRAL_CONTENT: "The Mix phase cannot be built with enough genuine target-free training material.",
    INSUFFICIENT_PROBE_MATCH: "No responsible family-disjoint matched Baseline/Check pair is available for this key.",
    TRAINING_CORPUS_NOT_READY: "The approved Weak Keys training corpus is not ready.",
    CORPUS_VERSION_MISMATCH: "The Weak Keys corpus version is incompatible with this build.",
    INDEX_VERSION_MISMATCH: "The Weak Keys target index version is incompatible with this build.",
    CONTENT_HASH_MISMATCH: "A training content binding changed and the key plan was rejected.",
  };
  return messages[code] ?? "This key cannot currently start the standard Weak Keys protocol.";
}

export function buildPracticeWeakKeysDetailViewModel({ entry, resolved, state = null } = {}) {
  const ui = normalizePracticeWeakKeysUiState(state ?? createDefaultPracticeWeakKeysUiState());
  return freezeDeep({
    kind: "weak-keys-detail",
    title: entry?.title ?? "Weak Keys",
    description: entry?.description ?? "Focused practice for one difficult letter, using varied words and contexts rather than isolated repetition.",
    longDescription: entry?.longDescription ?? "Train one measured key across varied words, positions, and surrounding transitions with a matched same-session check.",
    category: "Precision Drills",
    runnable: Boolean(resolved?.runnable),
    duration: "4-6 min",
    targetValue: ui.targetValue,
    targetSource: ui.selectedSource,
    status: ui.status,
    reasonCode: ui.reasonCode ?? ui.availability?.reasons?.[0] ?? null,
    message: reasonMessage(ui),
    availability: ui.availability,
    canStart: ui.status === "ready",
    checking: ui.status === "checking",
    preparing: ui.status === "preparing",
    saturationWarning: ui.saturationWarning,
    recommendationStatus: ui.recommendationStatus,
    recommendations: ui.recommendations,
    recommendationErrorCode: ui.recommendationErrorCode,
    totalOpportunityCount: PRACTICE_WEAK_KEYS_PHASE_QUOTAS.total,
    phases: PRACTICE_WEAK_KEYS_PHASES.map((phase, index) => freezeDeep({
      ...phase,
      ordinal: index + 1,
      opportunityQuota: PRACTICE_WEAK_KEYS_PHASE_QUOTAS[phase.id],
    })),
    backLabel: "Back to Practice Lab",
  });
}
