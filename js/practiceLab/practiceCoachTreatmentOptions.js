import { PRACTICE_COACH_TARGET_EXPERIMENTS } from "./practiceCoachConstants.js";
import { PRACTICE_COACH_POLICY_V1 } from "./practiceCoachPolicy.js";
import {
  PRACTICE_COACH_ACCURACY_ALTERNATIVE_MIN_PRESSURE,
  PRACTICE_COACH_TREATMENT_OPTIONS_VERSION,
} from "./practiceCoachPersonalizationConstants.js";
import { resolvePracticeTreatmentIdentity } from "./practiceTreatmentRegistry.js";
import {
  PRACTICE_WEAK_KEYS_EXPERIMENT_ID,
  PRACTICE_WEAK_KEYS_EXPERIMENT_VERSION,
  PRACTICE_WEAK_KEYS_GENERATOR_VERSION,
  PRACTICE_WEAK_KEYS_POLICY_VERSION,
  PRACTICE_WEAK_KEYS_VERSION,
} from "./practiceWeakKeysConstants.js";
import {
  PRACTICE_COMBINATION_REPAIR_EXPERIMENT_ID,
  PRACTICE_COMBINATION_REPAIR_EXPERIMENT_VERSION,
} from "./practiceCombinationRepairConstants.js";
import {
  PRACTICE_PROBLEM_WORDS_EXPERIMENT_ID,
  PRACTICE_PROBLEM_WORDS_EXPERIMENT_VERSION,
  PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION,
  PRACTICE_PROBLEM_WORDS_POLICY_VERSION,
  PRACTICE_PROBLEM_WORDS_VERSION,
} from "./practiceProblemWordsConstants.js";
import {
  PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID,
  PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_VERSION,
  PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION,
  PRACTICE_ACCURACY_RECOVERY_GENERATOR_VERSION,
  PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION,
  PRACTICE_ACCURACY_RECOVERY_VERSION,
} from "./practiceAccuracyRecoveryConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const CURRENT_PROTOCOLS = Object.freeze({
  [PRACTICE_WEAK_KEYS_EXPERIMENT_ID]: Object.freeze({
    version: PRACTICE_WEAK_KEYS_EXPERIMENT_VERSION,
    configuration: Object.freeze({
      weakKeysVersion: PRACTICE_WEAK_KEYS_VERSION,
      policyVersion: PRACTICE_WEAK_KEYS_POLICY_VERSION,
      generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION,
    }),
  }),
  [PRACTICE_COMBINATION_REPAIR_EXPERIMENT_ID]: Object.freeze({
    version: PRACTICE_COMBINATION_REPAIR_EXPERIMENT_VERSION,
    configuration: Object.freeze({}),
  }),
  [PRACTICE_PROBLEM_WORDS_EXPERIMENT_ID]: Object.freeze({
    version: PRACTICE_PROBLEM_WORDS_EXPERIMENT_VERSION,
    configuration: Object.freeze({
      problemWordsVersion: PRACTICE_PROBLEM_WORDS_VERSION,
      policyVersion: PRACTICE_PROBLEM_WORDS_POLICY_VERSION,
      generatorVersion: PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION,
    }),
  }),
  [PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID]: Object.freeze({
    version: PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_VERSION,
    configuration: Object.freeze({
      accuracyRecoveryVersion: PRACTICE_ACCURACY_RECOVERY_VERSION,
      policyVersion: PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION,
      generatorVersion: PRACTICE_ACCURACY_RECOVERY_GENERATOR_VERSION,
      feedbackVersion: PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION,
    }),
  }),
});

export function getCurrentPracticeCoachTreatmentIdentity(experimentId) {
  const protocol = CURRENT_PROTOCOLS[experimentId];
  if (!protocol) return null;
  return resolvePracticeTreatmentIdentity({
    experiment: { id: experimentId, version: protocol.version },
    configuration: protocol.configuration,
    contentPlan: null,
  });
}

export function getCurrentPracticeCoachTreatmentFamilyKey(experimentId) {
  return getCurrentPracticeCoachTreatmentIdentity(experimentId)?.treatmentFamilyKey ?? null;
}

export function getCurrentPracticeCoachTreatmentFamilyKeys() {
  return Object.freeze(Object.keys(CURRENT_PROTOCOLS).map((experimentId) => getCurrentPracticeCoachTreatmentFamilyKey(experimentId)).filter(Boolean));
}

export function getPotentialPracticeCoachTreatmentExperimentIds(candidate = {}) {
  const canonical = PRACTICE_COACH_TARGET_EXPERIMENTS[candidate.entityType] ?? null;
  if (!canonical) return Object.freeze([]);
  const ar = Number(candidate.accuracyRecoveryPressure ?? 0);
  const ids = [canonical];
  if (ar >= PRACTICE_COACH_ACCURACY_ALTERNATIVE_MIN_PRESSURE && canonical !== PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID) ids.push(PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID);
  if (ar >= PRACTICE_COACH_ACCURACY_ALTERNATIVE_MIN_PRESSURE && canonical === PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID) ids.push(PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID);
  return Object.freeze([...new Set(ids)]);
}

export function buildPracticeCoachTreatmentOptions(candidate = {}, {
  preferredIntervention = null,
  availabilityByExperiment = null,
  policy = PRACTICE_COACH_POLICY_V1,
} = {}) {
  const canonicalEntityExperiment = PRACTICE_COACH_TARGET_EXPERIMENTS[candidate.entityType] ?? null;
  if (!canonicalEntityExperiment) return Object.freeze([]);
  const preferredExperimentId = preferredIntervention?.experimentId ?? canonicalEntityExperiment;
  const ar = Number(candidate.accuracyRecoveryPressure ?? preferredIntervention?.ar ?? 0);
  const ids = [canonicalEntityExperiment];
  if (ar >= PRACTICE_COACH_ACCURACY_ALTERNATIVE_MIN_PRESSURE) ids.push(PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID);
  if (preferredExperimentId && !ids.includes(preferredExperimentId)) ids.push(preferredExperimentId);
  const options = [];
  for (const experimentId of [...new Set(ids)]) {
    const availabilityStatus = availabilityByExperiment?.[experimentId] ?? "ready";
    if (availabilityStatus !== "ready") continue;
    const identity = getCurrentPracticeCoachTreatmentIdentity(experimentId);
    if (!identity?.treatmentFamilyKey) continue;
    const baseInterventionMatch = experimentId === preferredExperimentId
      ? policy.interventionMatch.canonical
      : policy.interventionMatch.secondary;
    options.push(freezeDeep({
      treatmentOptionsVersion: PRACTICE_COACH_TREATMENT_OPTIONS_VERSION,
      experimentId,
      experimentVersion: CURRENT_PROTOCOLS[experimentId]?.version ?? 1,
      treatmentFamilyKey: identity.treatmentFamilyKey,
      targetEntityType: candidate.entityType,
      baseInterventionMatch,
      availabilityStatus,
      isDefaultPreferred: experimentId === preferredExperimentId,
      isEntityCanonical: experimentId === canonicalEntityExperiment,
    }));
  }
  return Object.freeze(options);
}
