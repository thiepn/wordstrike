import { buildPracticeAcquisitionCurve, buildPracticeTransferCurve } from "./practiceLearningCurve.js";
import { PRACTICE_LEARNING_MODEL_VERSION, PRACTICE_LEARNING_POLICY_VERSION } from "./practiceLearningConstants.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clone = (value) => value == null ? value : structuredClone(value);

function assertIdentity(state, delta) {
  for (const key of ["profileId", "contextId", "statId", "entityType", "entityKey"]) {
    if (state?.[key] !== delta?.[key]) throw new TypeError(`Practice learning delta ${key} does not match learning state`);
  }
}

function chronologicalGuard(lastObservedAt, completedAtUtc, kind) {
  const incoming = Date.parse(completedAtUtc);
  if (!Number.isFinite(incoming)) throw new TypeError(`Practice ${kind} observation timestamp is invalid`);
  if (lastObservedAt != null) {
    const previous = Date.parse(lastObservedAt);
    if (!Number.isFinite(previous) || incoming < previous) throw new TypeError(`Practice ${kind} observations must be applied chronologically`);
  }
}

function evidenceAfter(state, delta, phaseStatus) {
  const previous = state.evidence ?? {};
  const complete = delta.kind === "transfer" || phaseStatus === "complete";
  const partial = delta.kind === "acquisition" && phaseStatus !== "complete";
  return {
    partialObservationCount: Number(previous.partialObservationCount || 0) + Number(partial),
    completeObservationCount: Number(previous.completeObservationCount || 0) + Number(complete),
    skippedObservationCount: Number(previous.skippedObservationCount || 0),
    lastExperimentId: delta.experimentId ?? delta.observation?.experimentId ?? null,
    lastUpdatedFromSessionId: delta.sessionId,
  };
}

export function mergePracticeAcquisitionObservation(state, delta, policy = PRACTICE_LEARNING_POLICY_V1) {
  if (!state || !delta || delta.kind !== "acquisition") throw new TypeError("Practice acquisition merge requires state and acquisition delta");
  assertIdentity(state, delta);
  if (state.modelVersion !== PRACTICE_LEARNING_MODEL_VERSION || state.policyVersion !== PRACTICE_LEARNING_POLICY_VERSION) throw new TypeError("Practice learning state model version is unsupported");
  chronologicalGuard(state.acquisition.lastObservedAt, delta.observation.completedAtUtc, "acquisition");
  const incoming = clone(delta.observation);
  const doseBefore = Number(state.acquisition.cumulativeDoseUnits || 0);
  const doseUnits = Number(incoming.doseUnits);
  if (!Number.isFinite(doseUnits) || doseUnits <= 0) throw new TypeError("Practice acquisition dose must be positive");
  incoming.cumulativeDoseBefore = doseBefore;
  incoming.cumulativeDoseAfter = doseBefore + doseUnits;
  const allObservations = [...(state.acquisition.observations ?? []), incoming];
  const observations = allObservations.slice(-policy.rings.acquisition);
  const observationCount = Number(state.acquisition.observationCount || 0) + 1;
  const acquisition = {
    cumulativeTargetOpportunities: Number(state.acquisition.cumulativeTargetOpportunities || 0) + Number(incoming.opportunityCount || 0),
    cumulativeDoseUnits: incoming.cumulativeDoseAfter,
    observationCount,
    sessionCount: Number(state.acquisition.sessionCount || 0) + 1,
    dayCount: Number(state.acquisition.dayCount || 0) + Number(state.acquisition.lastObservedDayKey !== incoming.localDayKey),
    firstObservedAt: state.acquisition.firstObservedAt ?? incoming.completedAtUtc,
    lastObservedAt: incoming.completedAtUtc,
    lastObservedDayKey: incoming.localDayKey,
    observations,
    curve: buildPracticeAcquisitionCurve(observations, { observationCount, policy }),
  };
  return freezeDeep({
    ...state,
    updatedAt: incoming.completedAtUtc,
    acquisition,
    evidence: evidenceAfter(state, delta, incoming.phaseCoverage?.status),
  });
}

export function mergePracticeTransferObservation(state, delta, policy = PRACTICE_LEARNING_POLICY_V1) {
  if (!state || !delta || delta.kind !== "transfer") throw new TypeError("Practice transfer merge requires existing state and transfer delta");
  assertIdentity(state, delta);
  if (state.modelVersion !== PRACTICE_LEARNING_MODEL_VERSION || state.policyVersion !== PRACTICE_LEARNING_POLICY_VERSION) throw new TypeError("Practice learning state model version is unsupported");
  chronologicalGuard(state.transfer.lastObservedAt, delta.observation.completedAtUtc, "transfer");
  const incoming = clone(delta.observation);
  incoming.cumulativeDoseAtObservation = Number(state.acquisition.cumulativeDoseUnits || 0);
  const previousAcquisition = [...(state.acquisition.observations ?? [])]
    .filter((observation) => Date.parse(observation.completedAtUtc) <= Date.parse(incoming.completedAtUtc))
    .at(-1) ?? null;
  if (previousAcquisition) {
    incoming.timeSincePreviousAcquisitionMs = Math.max(0, Date.parse(incoming.completedAtUtc) - Date.parse(previousAcquisition.completedAtUtc));
    incoming.differentLocalDayFromPreviousAcquisition = incoming.localDayKey !== previousAcquisition.localDayKey;
  } else {
    incoming.timeSincePreviousAcquisitionMs = null;
    incoming.differentLocalDayFromPreviousAcquisition = null;
  }
  const allObservations = [...(state.transfer.observations ?? []), incoming];
  const observations = allObservations.slice(-policy.rings.transfer);
  const observationCount = Number(state.transfer.observationCount || 0) + 1;
  const transfer = {
    observationCount,
    sessionCount: Number(state.transfer.sessionCount || 0) + 1,
    dayCount: Number(state.transfer.dayCount || 0) + Number(state.transfer.lastObservedDayKey !== incoming.localDayKey),
    firstObservedAt: state.transfer.firstObservedAt ?? incoming.completedAtUtc,
    lastObservedAt: incoming.completedAtUtc,
    lastObservedDayKey: incoming.localDayKey,
    observations,
    curve: buildPracticeTransferCurve(observations, { observationCount, policy }),
  };
  return freezeDeep({
    ...state,
    updatedAt: incoming.completedAtUtc,
    transfer,
    evidence: evidenceAfter(state, delta, "complete"),
  });
}

export function mergePracticeLearningObservation(state, delta, policy = PRACTICE_LEARNING_POLICY_V1) {
  return delta?.kind === "acquisition"
    ? mergePracticeAcquisitionObservation(state, delta, policy)
    : delta?.kind === "transfer"
      ? mergePracticeTransferObservation(state, delta, policy)
      : (() => { throw new TypeError("Unsupported Practice learning observation kind"); })();
}
