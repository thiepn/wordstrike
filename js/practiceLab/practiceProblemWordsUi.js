import {
  PRACTICE_PROBLEM_WORDS_PHASE_IDS,
  PRACTICE_PROBLEM_WORDS_PHASE_LABELS,
  PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS,
} from "./practiceProblemWordsConstants.js";
import { normalizePracticeProblemWordInput } from "./practiceProblemWordsTargets.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const TARGET_STATUSES = new Set(["idle", "checking", "ready", "limited-content", "unsupported", "unavailable", "preparing", "error"]);
const RECOMMENDATION_STATUSES = new Set(["idle", "loading", "ready", "no-evidence", "unsupported", "unavailable"]);
export function createDefaultPracticeProblemWordsUiState() { return freezeDeep({ targetValue: "", selectedSource: "manual", status: "idle", reasonCode: null, message: null, availability: null, warnings: [], recommendationStatus: "idle", recommendations: [], recommendationErrorCode: null }); }
export function normalizePracticeProblemWordsUiState(value = {}) {
  const base = createDefaultPracticeProblemWordsUiState();
  return freezeDeep({
    targetValue: typeof value.targetValue === "string" ? value.targetValue : base.targetValue,
    selectedSource: ["recommended", "manual", "external-plan"].includes(value.selectedSource) ? value.selectedSource : "manual",
    status: TARGET_STATUSES.has(value.status) ? value.status : "idle",
    reasonCode: typeof value.reasonCode === "string" ? value.reasonCode : null,
    message: typeof value.message === "string" ? value.message : null,
    availability: value.availability && typeof value.availability === "object" ? value.availability : null,
    warnings: Object.freeze((Array.isArray(value.warnings) ? value.warnings : []).slice(0, 4)),
    recommendationStatus: RECOMMENDATION_STATUSES.has(value.recommendationStatus) ? value.recommendationStatus : "idle",
    recommendations: Object.freeze((Array.isArray(value.recommendations) ? value.recommendations : []).slice(0, 8)),
    recommendationErrorCode: typeof value.recommendationErrorCode === "string" ? value.recommendationErrorCode : null,
  });
}
export function normalizePracticeProblemWordsManualInput(value, language = "en") { return normalizePracticeProblemWordInput(value, language); }
function reasonMessage(state) {
  if (state.message) return state.message;
  const code = state.reasonCode ?? state.availability?.reasons?.[0] ?? null;
  const messages = {
    UNSUPPORTED_WORD_TARGET: "Enter one English alphabetic word from 2 to 24 letters. Spaces, apostrophes, hyphens, digits, and symbols are unsupported in v1.",
    WORD_INDEX_NOT_FOUND: "No approved training index evidence is available for this word.",
    WORD_NOT_IN_TRAINING_CORPUS: "This word is not present in the approved training corpus.",
    INSUFFICIENT_WORD_CONTEXTS: "There are not enough approved target-bearing contexts for the fixed word protocol.",
    INSUFFICIENT_TARGET_FAMILIES: "The approved corpus cannot provide enough independent word-context families.",
    INSUFFICIENT_NEUTRAL_CONTENT: "The Mix phase cannot be built with enough target-free training words.",
    INSUFFICIENT_PROBE_MATCH: "No responsible family-disjoint matched Baseline/Check pair is available for this word.",
    TRAINING_CORPUS_NOT_READY: "The approved Problem Words training corpus is not ready.",
    CORPUS_VERSION_MISMATCH: "The Problem Words corpus version is incompatible with this build.",
    INDEX_VERSION_MISMATCH: "The Problem Words target index version is incompatible with this build.",
    CONTENT_HASH_MISMATCH: "A training content binding changed and the word plan was rejected.",
  };
  return messages[code] ?? "This word cannot currently start the standard Problem Words protocol.";
}
export function buildPracticeProblemWordsDetailViewModel({ entry, resolved, state = null } = {}) {
  const ui = normalizePracticeProblemWordsUiState(state ?? createDefaultPracticeProblemWordsUiState());
  return freezeDeep({
    kind: "problem-words-detail",
    title: entry?.title ?? "Problem Words",
    description: entry?.description ?? "Focused practice for difficult words, separating how you start the word from how you execute it internally.",
    longDescription: entry?.longDescription ?? "Train one lexical target across varied launch and internal contexts without turning the session into spelling recall or rote adjacent repetition.",
    category: "Precision Drills", runnable: Boolean(resolved?.runnable), duration: "4-6 min",
    targetValue: ui.targetValue, targetSource: ui.selectedSource, status: ui.status,
    reasonCode: ui.reasonCode ?? ui.availability?.reasons?.[0] ?? null, message: reasonMessage(ui), availability: ui.availability,
    canStart: ui.status === "ready", checking: ui.status === "checking", preparing: ui.status === "preparing", warnings: ui.warnings,
    recommendationStatus: ui.recommendationStatus, recommendations: ui.recommendations, recommendationErrorCode: ui.recommendationErrorCode,
    totalOpportunityCount: 15,
    phases: PRACTICE_PROBLEM_WORDS_PHASE_IDS.map((id, index) => freezeDeep({ id, label: PRACTICE_PROBLEM_WORDS_PHASE_LABELS[id], ordinal: index + 1, opportunityQuota: PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS[id] })),
    backLabel: "Back to Practice Lab",
  });
}
