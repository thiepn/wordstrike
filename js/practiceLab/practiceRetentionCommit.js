import { mergePracticeRetentionReviewDelta } from "./practiceReviewItemMerge.js";
import { validatePracticeRetentionReviewDeltaBatch } from "./practiceRetentionAnalysis.js";
import { validatePracticeReviewItemV3 } from "./practiceReviewValidation.js";
import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";

function validationError(message, details) {
  const error = new TypeError(message);
  error.code = "PRACTICE_RETENTION_DELTA_INVALID";
  error.details = details;
  return error;
}

async function listContextReviewItems(repository, profileId, contextId) {
  if (typeof repository.listReviewItems === "function") return repository.listReviewItems(profileId, contextId);
  if (typeof repository.listReviewItemsAcrossContexts !== "function") throw new TypeError("Practice retention commit requires review-item batch read");
  const all = await repository.listReviewItemsAcrossContexts(profileId);
  return all.filter((item) => item.contextId === contextId);
}

export async function preparePracticeRetentionReviewChanges({
  repository,
  sessionSummary,
  reviewDeltas = [],
  policy = PRACTICE_REVIEW_POLICY_V1,
} = {}) {
  const validation = validatePracticeRetentionReviewDeltaBatch(reviewDeltas, {
    sessionId: sessionSummary?.sessionId,
    profileId: sessionSummary?.profileId,
    contextId: sessionSummary?.contextId,
  }, policy);
  if (!validation.valid) throw validationError("Practice retention review delta batch failed validation", validation.errors);
  if (!reviewDeltas.length) return Object.freeze({ reviewItemChanges: Object.freeze([]), staleReviewDeltaCount: 0 });
  const items = await listContextReviewItems(repository, sessionSummary.profileId, sessionSummary.contextId);
  const byId = new Map(items.map((item) => [item.reviewItemId, item]));
  const reviewItemChanges = [];
  let staleReviewDeltaCount = 0;
  for (const delta of reviewDeltas) {
    const item = byId.get(delta.reviewItemId);
    if (!item) {
      staleReviewDeltaCount += 1;
      continue;
    }
    if (item.profileId !== delta.profileId || item.contextId !== delta.contextId || item.entityType !== delta.entityType || item.entityKey !== delta.entityKey) {
      throw validationError("Practice retention delta identity does not match review item", [{ reviewItemId: delta.reviewItemId }]);
    }
    const merged = mergePracticeRetentionReviewDelta(item, delta, policy);
    if (merged.stale) {
      staleReviewDeltaCount += 1;
      continue;
    }
    const itemValidation = validatePracticeReviewItemV3(merged.item);
    if (!itemValidation.valid) throw validationError("Merged Practice review item failed validation", itemValidation.errors);
    reviewItemChanges.push(merged.item);
  }
  return Object.freeze({ reviewItemChanges: Object.freeze(reviewItemChanges), staleReviewDeltaCount });
}

export async function commitCompletedPracticeRetentionSession({
  repository,
  sessionSummary,
  skillEvidenceDeltas = [],
  abilityObservation = null,
  performanceStateDelta = null,
  learningObservationDeltas = [],
  retentionReviewDeltas = [],
  experimentReviewItemChanges = [],
  updatedProfileSummary = null,
  clearCheckpoint = true,
  policy = PRACTICE_REVIEW_POLICY_V1,
} = {}) {
  if (!repository || typeof repository.commitCompletedPracticeSession !== "function") throw new TypeError("Practice retention commit requires canonical repository");

  // Duplicate session check happens before retention-delta work. The canonical repository
  // repeats the check inside its transaction, preserving race-safe exactly-once session semantics.
  const existingSession = typeof repository.getSessionSummary === "function"
    ? await repository.getSessionSummary(sessionSummary.sessionId)
    : null;
  if (existingSession) {
    return repository.commitCompletedPracticeSession({
      sessionSummary,
      skillEvidenceDeltas,
      abilityObservation,
      performanceStateDelta,
      learningObservationDeltas,
      reviewItemChanges: experimentReviewItemChanges,
      updatedProfileSummary,
      clearCheckpoint,
    });
  }

  const prepared = await preparePracticeRetentionReviewChanges({ repository, sessionSummary, reviewDeltas: retentionReviewDeltas, policy });
  const result = await repository.commitCompletedPracticeSession({
    sessionSummary,
    skillEvidenceDeltas,
    abilityObservation,
    performanceStateDelta,
    learningObservationDeltas,
    reviewItemChanges: [...experimentReviewItemChanges, ...prepared.reviewItemChanges],
    updatedProfileSummary,
    clearCheckpoint,
  });
  return Object.freeze({ ...result, staleReviewDeltaCount: prepared.staleReviewDeltaCount, retentionReviewUpdated: prepared.reviewItemChanges.length });
}
