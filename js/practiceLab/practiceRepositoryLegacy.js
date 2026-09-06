import { createPracticeRepository as createPracticeRepositoryV17 } from "./practiceRepositoryLegacyV17.js";
import { createDefaultPracticeEvaluationState, reconstructPracticeEvaluationStateFromSessionSummaries } from "./practiceEvaluationState.js";
import { claimPracticeEvaluationReservationState } from "./practiceEvaluationBinding.js";
import {
  abandonPracticeEvaluationReservationState,
  reservePracticeBenchmarkFormState,
  reservePracticeColdTransferUnitState,
} from "./practiceEvaluationReservation.js";
import { validatePracticeEvaluationState } from "./practiceEvaluationValidation.js";
import { createPracticeEvaluationStateId, createPracticeQuarantineId } from "./practiceIds.js";
import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { toPracticeUtcIso } from "./practiceTime.js";

function storageError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function assertValidState(state, operation) {
  const validation = validatePracticeEvaluationState(state);
  if (!validation.valid) throw storageError("PRACTICE_EVALUATION_STATE_INVALID", "Practice evaluation state failed validation", { operation, errors: validation.errors });
  return state;
}

function makeQuarantineEntry(record, reason, now) {
  const detectedAt = toPracticeUtcIso(now);
  return {
    quarantineId: createPracticeQuarantineId(),
    recordVersion: PRACTICE_RECORD_VERSIONS.quarantine,
    createdAt: detectedAt,
    updatedAt: detectedAt,
    sourceStore: "evaluationStates",
    sourceKey: String(record?.evaluationStateId ?? "unknown"),
    reason: String(reason).slice(0, 300),
    detectedAt,
    originalRecord: record,
  };
}

export function createPracticeRepository({ dataStore, manifestStore, now = Date.now } = {}) {
  const base = createPracticeRepositoryV17({ dataStore, manifestStore, now });

  const assertContext = async (profileId, contextId, transaction = null) => {
    const context = transaction ? await transaction.get("contexts", contextId) : await base.getPracticeContext(contextId);
    if (!context || context.profileId !== profileId) throw storageError("PRACTICE_EVALUATION_CONTEXT_MISMATCH", "Practice evaluation context belongs to another profile", { profileId, contextId });
    return context;
  };

  const recoverPartialState = async (profileId, raw) => {
    await dataStore.runTransaction(["evaluationStates", "quarantine"], "readwrite", async (transaction) => {
      await transaction.put("quarantine", makeQuarantineEntry(raw, "evaluation-state-validation-failed", now));
      await transaction.delete("evaluationStates", createPracticeEvaluationStateId(profileId));
    });
    const sessionSummaries = await base.listSessionSummaries(profileId);
    const recovered = assertValidState(reconstructPracticeEvaluationStateFromSessionSummaries({ profileId, sessionSummaries, now }), "evaluation-recovery");
    await dataStore.put("evaluationStates", recovered);
    return recovered;
  };

  const getEvaluationState = async (profileId) => {
    const key = createPracticeEvaluationStateId(profileId);
    const raw = await dataStore.get("evaluationStates", key);
    if (!raw) return null;
    const validation = validatePracticeEvaluationState(raw);
    if (validation.valid) return raw;
    return recoverPartialState(profileId, raw);
  };

  const ensureEvaluationState = async (profileId) => {
    const existing = await getEvaluationState(profileId);
    if (existing) return existing;
    const created = assertValidState(createDefaultPracticeEvaluationState({ profileId, now }), "evaluation-create");
    await dataStore.put("evaluationStates", created);
    return created;
  };

  const mutateEvaluationState = async ({ profileId, contextId, operation, mutate }) => dataStore.runTransaction(
    ["contexts", "evaluationStates"],
    "readwrite",
    async (transaction) => {
      await assertContext(profileId, contextId, transaction);
      const key = createPracticeEvaluationStateId(profileId);
      let state = await transaction.get("evaluationStates", key);
      if (!state) state = createDefaultPracticeEvaluationState({ profileId, now });
      const validation = validatePracticeEvaluationState(state);
      if (!validation.valid) throw storageError("PRACTICE_EVALUATION_STATE_INVALID", "Practice evaluation state requires recovery before protected material can be selected", { operation, errors: validation.errors });
      const result = mutate(state);
      assertValidState(result.state, operation);
      await transaction.put("evaluationStates", result.state);
      return result;
    },
  );

  return Object.freeze({
    ...base,
    getEvaluationState,
    ensureEvaluationState,
    async saveEvaluationState(state) {
      assertValidState(state, "save-evaluation-state");
      const profile = await base.getPracticeProfile();
      if (!profile || state.profileId !== profile.profileId) throw storageError("PRACTICE_EVALUATION_PROFILE_MISMATCH", "Evaluation state does not belong to active Practice profile");
      await dataStore.put("evaluationStates", state);
      return state;
    },
    reservePracticeBenchmarkForm({ profileId, contextId, suite, now: suppliedNow = now } = {}) {
      return mutateEvaluationState({
        profileId,
        contextId,
        operation: "reserve-benchmark",
        mutate: (state) => reservePracticeBenchmarkFormState({ profileId, contextId, suiteId: suite?.suiteId, suite, evaluationState: state, now: suppliedNow }),
      });
    },
    reservePracticeColdTransferUnit({ profileId, contextId, pool, now: suppliedNow = now } = {}) {
      return mutateEvaluationState({
        profileId,
        contextId,
        operation: "reserve-cold-transfer",
        mutate: (state) => reservePracticeColdTransferUnitState({ profileId, contextId, poolId: pool?.poolId, pool, evaluationState: state, now: suppliedNow }),
      });
    },
    claimPracticeEvaluationReservation({ profileId, contextId, reservationId, sessionId, artifact, now: suppliedNow = now } = {}) {
      return mutateEvaluationState({
        profileId,
        contextId,
        operation: "claim-evaluation",
        mutate: (state) => claimPracticeEvaluationReservationState({ evaluationState: state, profileId, contextId, reservationId, sessionId, artifact, now: suppliedNow }),
      });
    },
    abandonPracticeEvaluationReservation({ profileId, contextId, reservationId, now: suppliedNow = now } = {}) {
      return mutateEvaluationState({
        profileId,
        contextId,
        operation: "abandon-evaluation-reservation",
        mutate: (state) => ({ state: abandonPracticeEvaluationReservationState({ evaluationState: state, reservationId, now: suppliedNow }) }),
      });
    },
  });
}
