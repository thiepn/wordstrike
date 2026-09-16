import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeContentPlan } from "./practiceSessionContract.js";
import { createPracticeSessionId } from "./practiceIds.js";
import { resolvePracticePaceLadderFrontierAnchor, calculatePracticePaceLadderDifficultyAdjustment } from "./practicePaceLadderAnchor.js";
import { getPracticePaceLadderAvailability } from "./practicePaceLadderAvailability.js";
import { loadPracticePaceLadderForms, selectPracticePaceLadderForm } from "./practicePaceLadderForms.js";
import { createPracticePaceLadderPlan } from "./practicePaceLadderPlan.js";
import { PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS } from "./practicePaceLadderConstants.js";
import { registerPracticePaceLadderBinding } from "./practicePaceLadderTrust.js";

export function createPracticePaceLadderRuntime({ repository = null, dataStore = null, manifestStore = null, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const ownedDataStore = repository ? null : (dataStore ?? createPracticeIndexedDbStore());
  const repo = repository ?? createPracticeRepository({ dataStore: ownedDataStore, manifestStore: manifestStore ?? createPracticeManifestStore() });
  let initializedPromise = null;
  const initialize = () => initializedPromise ??= repo.initializePracticeStorage();

  async function contextInputs() {
    const initialized = await initialize();
    const summaries = await repo.listSessionSummaries(initialized.profile.profileId, { contextId: initialized.context.contextId });
    const performanceState = await repo.getPerformanceState?.(initialized.profile.profileId, initialized.context.contextId).catch?.(() => null) ?? null;
    return { initialized, summaries, performanceState };
  }

  async function getAvailability() {
    const { initialized } = await contextInputs();
    let artifact = null; try { artifact = await loadPracticePaceLadderForms({ fetchImpl }); } catch {}
    return getPracticePaceLadderAvailability({ profile: initialized.profile, context: initialized.context, formsReady: Boolean(artifact), telemetryCapable: true });
  }

  async function prepare() {
    const { initialized, summaries, performanceState } = await contextInputs();
    const artifact = await loadPracticePaceLadderForms({ fetchImpl });
    const runOrdinal = summaries.filter((summary) => summary.experimentId === "pace-ladder").length;
    const form = selectPracticePaceLadderForm({ artifact, profileId: initialized.profile.profileId, contextId: initialized.context.contextId, runOrdinal });
    const difficulty = calculatePracticePaceLadderDifficultyAdjustment(form.typability);
    const anchor = resolvePracticePaceLadderFrontierAnchor({ controlFrontier: performanceState?.controlFrontier ?? null, difficultyAdjustmentLog: difficulty.status === "adjusted" ? difficulty.adjustmentLog : 0, now });
    const sessionId = createPracticeSessionId();
    const plan = createPracticePaceLadderPlan({ sessionId, profileId: initialized.profile.profileId, contextId: initialized.context.contextId, formSetId: form.formSetId, formSetVersion: form.formSetVersion, formId: form.formId, formFamilyId: form.formFamilyId, formOrdinal: form.formOrdinal, formHash: form.formHash, anchor });
    const contentPlan = createPracticeContentPlan({
      contentId: `practice-content_pace-ladder-${form.formId}`,
      contentGeneratorVersion: 1,
      text: form.text,
      targetEntities: [],
      completion: { mode: "duration", value: PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS },
      metadata: { sourceType: "pace-ladder-diagnostic", contentSource: "diagnostic-general", partition: "diagnostic", language: "en", formSetId: form.formSetId, formId: form.formId, formFamilyId: form.formFamilyId, formOrdinal: form.formOrdinal, evaluationProtected: false, coldTransfer: false },
    });
    registerPracticePaceLadderBinding(contentPlan, { profileId: initialized.profile.profileId, contextId: initialized.context.contextId, sessionId, formId: form.formId });
    return Object.freeze({ status: "ready", sessionId, profileId: initialized.profile.profileId, contextId: initialized.context.contextId, form, plan, contentPlan, difficultyAdjustmentLog: difficulty.status === "adjusted" ? difficulty.adjustmentLog : 0, preparedAt: (typeof now === "function" ? now() : now).toISOString?.() ?? new Date().toISOString() });
  }

  return Object.freeze({ getAvailability, prepare, close() { ownedDataStore?.close?.(); } });
}
