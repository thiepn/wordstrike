import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionId } from "./practiceIds.js";
import { buildPracticeEvaluationPlan } from "./practiceEvaluationPlan.js";
import { loadPracticeEvaluationContent } from "./practiceEvaluationContentLoader.js";
import { createPracticeContentPlan, validatePracticeExperimentDescriptor } from "./practiceSessionContract.js";
import { getRealTextColdTransferAvailability } from "./practiceRealTextAvailability.js";
import { registerPracticeTrustedRealTextColdTransferBinding } from "./practiceRealTextColdTransferTrust.js";
import {
  PRACTICE_COLD_TRANSFER_LAUNCH_VERSION,
  PRACTICE_REAL_TEXT_COLD_TRANSFER_EXPERIMENT_ID,
  PRACTICE_REAL_TEXT_COLD_TRANSFER_EXPERIMENT_VERSION,
  PRACTICE_REAL_TEXT_ERRORS,
} from "./practiceRealTextConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const fail = (code, message, details = null) => Object.assign(new Error(message), { code, details, recoverable: true });

export const PRACTICE_REAL_TEXT_COLD_TRANSFER_DESCRIPTOR = freezeDeep({
  id: PRACTICE_REAL_TEXT_COLD_TRANSFER_EXPERIMENT_ID,
  version: PRACTICE_REAL_TEXT_COLD_TRANSFER_EXPERIMENT_VERSION,
  sessionSchemaVersion: 1,
  title: "Real Text — Cold Transfer Check",
  category: "real-world",
  defaultCorrectionBehavior: "allow",
  supportedCompletionModes: ["duration"],
  resumable: false,
  abilityChannel: "cold-natural-text",
  performanceMeasurementKind: null,
  performanceReferenceChannel: null,
  retentionMeasurementKind: null,
  evaluationMeasurementKind: "cold-transfer",
  internalRealTextOnly: true,
});
const descriptorValidation = validatePracticeExperimentDescriptor(PRACTICE_REAL_TEXT_COLD_TRANSFER_DESCRIPTOR);
if (!descriptorValidation.valid) throw new TypeError(`Invalid PL24 cold-transfer descriptor: ${descriptorValidation.errors[0]?.code}`);

async function withRepository(task) {
  const dataStore = createPracticeIndexedDbStore(); const manifestStore = createPracticeManifestStore(); const repository = createPracticeRepository({ dataStore, manifestStore });
  try { const initialized = await repository.initializePracticeStorage(); return await task({ repository, ...initialized }); } finally { try { dataStore.close?.(); } catch {} }
}

export function createPracticeRealTextColdTransferRuntime({
  transferRegistry,
  preferredPoolId = "WS-TRANSFER-EN-1",
  loadProtectedContentItems,
  repositoryProvider = null,
  now = () => new Date(),
} = {}) {
  if (!transferRegistry || typeof transferRegistry.loadPool !== "function") throw new TypeError("Cold Transfer runtime requires PL18 transfer registry");
  if (typeof loadProtectedContentItems !== "function") throw new TypeError("Cold Transfer runtime requires explicit protected-content loader");
  const runWithRepository = async (task) => typeof repositoryProvider === "function" ? task(await repositoryProvider()) : withRepository(task);
  const loadPool = async () => transferRegistry.getPool(preferredPoolId) ?? await transferRegistry.loadPool(preferredPoolId);

  return Object.freeze({
    async getAvailability() {
      try {
        const pool = await loadPool();
        return runWithRepository(async ({ repository, profile, context }) => {
          const state = await repository.ensureEvaluationState(profile.profileId);
          return freezeDeep({ ...getRealTextColdTransferAvailability({ pool, evaluationState: state, language: context.dataLocale }), poolId: pool?.poolId ?? preferredPoolId, poolStatus: pool?.status ?? null, launchVersion: PRACTICE_COLD_TRANSFER_LAUNCH_VERSION });
        });
      } catch (error) { return freezeDeep({ status: "unavailable", reason: error?.code ?? PRACTICE_REAL_TEXT_ERRORS.COLD_TRANSFER_UNAVAILABLE, freshUnitAvailable: false, strictColdEligible: false, poolId: preferredPoolId, poolStatus: null }); }
    },

    async reserve() {
      const pool = await loadPool();
      return runWithRepository(async ({ repository, profile, context }) => {
        const state = await repository.ensureEvaluationState(profile.profileId);
        const availability = getRealTextColdTransferAvailability({ pool, evaluationState: state, language: context.dataLocale });
        if (availability.status !== "ready") throw fail(availability.reason ?? PRACTICE_REAL_TEXT_ERRORS.COLD_TRANSFER_UNAVAILABLE, "Cold Transfer Check is unavailable", availability);
        const reserved = await repository.reservePracticeColdTransferUnit({ profileId: profile.profileId, contextId: context.contextId, pool, now });
        return freezeDeep({ reservation: reserved.reservation, poolId: pool.poolId, poolVersion: pool.poolVersion, profileId: profile.profileId, contextId: context.contextId, language: context.dataLocale });
      });
    },

    async claimAndPrepare({ reservationId, sessionId = createPracticeSessionId() } = {}) {
      if (!reservationId) throw new TypeError("Cold Transfer preparation requires reservationId");
      const pool = await loadPool();
      return runWithRepository(async ({ repository, profile, context }) => {
        const claim = await repository.claimPracticeEvaluationReservation({ profileId: profile.profileId, contextId: context.contextId, reservationId, sessionId, artifact: pool, now });
        const evaluationPlan = buildPracticeEvaluationPlan({ binding: claim.binding, artifact: pool, historyStatus: claim.state?.historyStatus ?? "partial" });
        const rawContent = await loadPracticeEvaluationContent({ plan: evaluationPlan, loadContentItems: loadProtectedContentItems });
        const contentPlan = createPracticeContentPlan(rawContent);
        registerPracticeTrustedRealTextColdTransferBinding(contentPlan, claim.binding);
        return freezeDeep({
          sessionId,
          experiment: PRACTICE_REAL_TEXT_COLD_TRANSFER_DESCRIPTOR,
          configuration: { correctionBehavior: "allow", timingMode: "on-first-input", coldTransferLaunchVersion: PRACTICE_COLD_TRANSFER_LAUNCH_VERSION },
          contentPlan,
          evaluationPlan,
          evaluationArtifact: pool,
          binding: claim.binding,
          context: { contextId: context.contextId, fingerprint: context.fingerprint, dataLocale: context.dataLocale, keyboardLayout: context.keyboardLayout, inputMethod: context.inputMethod, hardwareProfileId: context.hardwareProfileId ?? null },
        });
      });
    },
  });
}
