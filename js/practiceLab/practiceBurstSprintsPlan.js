import {
  PRACTICE_BURST_RECOVERY_DURATION_MS,
  PRACTICE_BURST_SPRINT_COUNT,
  PRACTICE_BURST_SPRINT_DURATION_MS,
  PRACTICE_BURST_SPRINT_IDS,
  PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS,
  PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS,
  PRACTICE_BURST_SPRINTS_POLICY_V1,
  validatePracticeBurstSprintsPolicy,
} from "./practiceBurstSprintsConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createPracticeBurstSprintsPlan({
  sessionId,
  profileId,
  contextId,
  form,
  referenceControlledWpm = null,
  policy = PRACTICE_BURST_SPRINTS_POLICY_V1,
} = {}) {
  if (!validatePracticeBurstSprintsPolicy(policy)) throw new TypeError("Invalid Burst Sprints policy");
  if (!sessionId || !profileId || !contextId) throw new TypeError("Burst Sprints plan requires session identity");
  if (!form?.formId || !form?.formFamilyId) throw new TypeError("Burst Sprints plan requires a frozen content form");

  const sprints = PRACTICE_BURST_SPRINT_IDS.map((sprintId, index) => freezeDeep({
    sprintId,
    sprintOrdinal: index + 1,
    activeStartMs: index * PRACTICE_BURST_SPRINT_DURATION_MS,
    activeEndMs: (index + 1) * PRACTICE_BURST_SPRINT_DURATION_MS,
    durationMs: PRACTICE_BURST_SPRINT_DURATION_MS,
    recoveryAfterMs: index < PRACTICE_BURST_SPRINT_COUNT - 1 ? PRACTICE_BURST_RECOVERY_DURATION_MS : 0,
  }));

  return freezeDeep({
    planVersion: 1,
    protocolVersion: policy.protocolVersion,
    experimentId: "burst-sprints",
    sessionId,
    profileId,
    contextId,
    formId: form.formId,
    formFamilyId: form.formFamilyId,
    formOrdinal: form.formOrdinal,
    language: form.language,
    sprintCount: PRACTICE_BURST_SPRINT_COUNT,
    sprintDurationMs: PRACTICE_BURST_SPRINT_DURATION_MS,
    recoveryDurationMs: PRACTICE_BURST_RECOVERY_DURATION_MS,
    totalActiveDurationMs: PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS,
    totalProtocolDurationMs: PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS,
    referenceControlledWpm: Number.isFinite(referenceControlledWpm) && referenceControlledWpm > 0 ? referenceControlledWpm : null,
    instructions: "Type as fast as you can while keeping the burst controlled. Recovery intervals are part of the protocol and are not scored.",
    sprints,
  });
}

export function getPracticeBurstSprintForActiveMs(plan, activeMs) {
  if (!plan || !Number.isFinite(activeMs) || activeMs < 0) return null;
  const capped = Math.min(Math.max(0, activeMs), Math.max(0, plan.totalActiveDurationMs - 0.001));
  const index = Math.min(plan.sprints.length - 1, Math.floor(capped / plan.sprintDurationMs));
  const sprint = plan.sprints[index] ?? null;
  if (!sprint) return null;
  return freezeDeep({
    ...sprint,
    elapsedMs: Math.max(0, Math.min(sprint.durationMs, activeMs - sprint.activeStartMs)),
    remainingMs: Math.max(0, sprint.activeEndMs - activeMs),
  });
}
