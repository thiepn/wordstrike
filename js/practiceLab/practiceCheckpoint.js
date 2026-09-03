import {
  PRACTICE_LIMITS,
} from "./practiceConstants.js";
import { createDefaultCheckpoint } from "./practiceDefaults.js";
import {
  PRACTICE_SESSION_ERROR_CODES,
  PRACTICE_SESSION_LIMITS,
} from "./practiceSessionConstants.js";
import {
  createPracticeContentPlan,
  createPracticeSegmenter,
  practiceSessionError,
} from "./practiceSessionContract.js";
import { isValidPracticeUtcIso } from "./practiceTime.js";
import { validateCheckpoint } from "./practiceValidation.js";

export function buildPracticeCheckpoint({
  profileId,
  contextId,
  sessionId,
  experiment,
  configuration,
  contentPlan,
  typingSnapshot,
  metricsSnapshot,
  recentInputTail = [],
  startedAtUtc = null,
  sessionTimeContext = null,
  activeElapsedMs,
  pausedElapsedMs,
  phase,
  reason = null,
  wallClock = Date.now,
}) {
  const contentDescriptor = {
    contentPlanVersion: contentPlan.contentPlanVersion,
    contentId: contentPlan.contentId,
    contentGeneratorVersion: contentPlan.contentGeneratorVersion,
    units: contentPlan.units,
    targetEntities: contentPlan.targetEntities,
    completion: contentPlan.completion,
    metadata: contentPlan.metadata,
  };
  const checkpoint = createDefaultCheckpoint({
    profileId,
    contextId,
    sessionId,
    experimentId: experiment.id,
    now: wallClock,
    overrides: {
      experimentVersion: experiment.version,
      sessionSchemaVersion: experiment.sessionSchemaVersion,
      phase,
      configuration,
      contentDescriptor,
      contentSnapshot: contentPlan.text,
      contentReference: null,
      contentHash: contentPlan.contentHash,
      cursorState: {
        unitIndex: contentPlan.units.findIndex((unit) => unit.unitId === typingSnapshot.currentUnitId),
        characterIndex: typingSnapshot.cursorIndex,
      },
      typedBuffer: typingSnapshot.typedGraphemes.join(""),
      completedUnitCount: typingSnapshot.completedUnitIds.length,
      activeElapsedMs,
      pausedElapsedMs,
      metricsSnapshot: {
        ...metricsSnapshot,
        sessionStartedAtUtc: startedAtUtc,
        sessionTimeContext,
        recentInputTail: recentInputTail.slice(-PRACTICE_SESSION_LIMITS.checkpointRecentEvents),
      },
      resumable: experiment.resumable,
      recoveryReason: reason,
    },
  });
  const validation = validateCheckpoint(checkpoint);
  if (!validation.valid) throw practiceSessionError(
    PRACTICE_SESSION_ERROR_CODES.CHECKPOINT_FAILED,
    "Practice checkpoint validation failed",
    { operation: "build-checkpoint", sessionId, lifecycleState: phase, recoverable: true, details: validation.errors },
  );
  return checkpoint;
}

export function validatePracticeCheckpointRestore({
  checkpoint,
  experiment,
  profileId = checkpoint?.profileId,
  contextId = checkpoint?.contextId,
  wallClock = Date.now,
  segmenter,
}) {
  const validation = validateCheckpoint(checkpoint);
  const errors = [...validation.errors];
  if (checkpoint?.profileId !== profileId) errors.push({ path: "profileId", code: "PROFILE_MISMATCH", message: "checkpoint profile does not match" });
  if (checkpoint?.contextId !== contextId) errors.push({ path: "contextId", code: "CONTEXT_MISMATCH", message: "checkpoint context does not match" });
  if (checkpoint?.experimentId !== experiment?.id) errors.push({ path: "experimentId", code: "EXPERIMENT_MISMATCH", message: "checkpoint experiment does not match" });
  if (checkpoint?.experimentVersion !== experiment?.version) errors.push({ path: "experimentVersion", code: "VERSION_MISMATCH", message: "checkpoint experiment version does not match" });
  if (checkpoint?.sessionSchemaVersion !== experiment?.sessionSchemaVersion) errors.push({ path: "sessionSchemaVersion", code: "VERSION_MISMATCH", message: "checkpoint session version does not match" });
  if (checkpoint?.resumable !== true) errors.push({ path: "resumable", code: "NOT_RESUMABLE", message: "checkpoint is not resumable" });
  if (isValidPracticeUtcIso(checkpoint?.expiresAt) && Date.parse(checkpoint.expiresAt) <= new Date(typeof wallClock === "function" ? wallClock() : wallClock).getTime()) errors.push({ path: "expiresAt", code: "EXPIRED", message: "checkpoint has expired" });
  let contentPlan = null;
  try {
    contentPlan = createPracticeContentPlan({
      ...checkpoint.contentDescriptor,
      text: checkpoint.contentSnapshot ?? "",
    }, { segmenter });
  } catch (cause) {
    errors.push({ path: "contentDescriptor", code: "INVALID_CONTENT", message: cause.message });
  }
  if (contentPlan && contentPlan.contentHash !== checkpoint.contentHash) errors.push({ path: "contentHash", code: "CONTENT_MISMATCH", message: "checkpoint content hash does not match" });
  const segment = createPracticeSegmenter(segmenter);
  if (contentPlan && segment(checkpoint.typedBuffer).length > segment(contentPlan.text).length) errors.push({ path: "typedBuffer", code: "CURSOR_BOUNDS", message: "typed buffer exceeds content" });
  if (errors.length) return { valid: false, errors, contentPlan: null };
  return { valid: true, errors: [], contentPlan };
}
