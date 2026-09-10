import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeContentPlan } from "./practiceSessionContract.js";
import { createPracticeSessionId } from "./practiceIds.js";
import { selectPracticeBurstSprintsContent } from "./practiceBurstSprintsContent.js";
import { createPracticeBurstSprintsPlan } from "./practiceBurstSprintsPlan.js";
import { PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS } from "./practiceBurstSprintsConstants.js";

export function createPracticeBurstSprintsRuntime({
  repository = null,
  dataStore = null,
  manifestStore = null,
  now = () => new Date(),
} = {}) {
  const ownedDataStore = repository ? null : (dataStore ?? createPracticeIndexedDbStore());
  const repo = repository ?? createPracticeRepository({
    dataStore: ownedDataStore,
    manifestStore: manifestStore ?? createPracticeManifestStore(),
  });
  let initializedPromise = null;
  const initialize = () => initializedPromise ??= repo.initializePracticeStorage();

  async function contextInputs() {
    const initialized = await initialize();
    const summaries = await repo.listSessionSummaries(initialized.profile.profileId, { contextId: initialized.context.contextId });
    const controlledState = typeof repo.getAbilityState === "function"
      ? await repo.getAbilityState(initialized.profile.profileId, initialized.context.contextId, "controlled-speed").catch(() => null)
      : null;
    return { initialized, summaries, controlledState };
  }

  async function getAvailability() {
    const { initialized } = await contextInputs();
    if (!initialized?.profile?.profileId || !initialized?.context?.contextId) {
      return Object.freeze({ status: "unavailable", reasons: ["BURST_CONTEXT_UNAVAILABLE"] });
    }
    return Object.freeze({ status: "ready", mode: "six-sprint-protocol", reasons: [] });
  }

  async function prepare() {
    const { initialized, summaries, controlledState } = await contextInputs();
    const runOrdinal = summaries.filter((summary) => summary.experimentId === "burst-sprints").length;
    const form = selectPracticeBurstSprintsContent({
      profileId: initialized.profile.profileId,
      contextId: initialized.context.contextId,
      runOrdinal,
    });
    const sessionId = createPracticeSessionId();
    const referenceControlledWpm = controlledState?.estimate?.estimateWpm ?? null;
    const plan = createPracticeBurstSprintsPlan({
      sessionId,
      profileId: initialized.profile.profileId,
      contextId: initialized.context.contextId,
      form,
      referenceControlledWpm,
    });
    const contentPlan = createPracticeContentPlan({
      contentId: `practice-content_burst-sprints-${form.formId}-${runOrdinal}`,
      contentGeneratorVersion: 1,
      text: form.text,
      targetEntities: [],
      completion: { mode: "duration", value: PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS },
      metadata: {
        sourceType: "burst-sprints-diagnostic",
        contentSource: "diagnostic-general",
        partition: "diagnostic",
        language: form.language,
        formId: form.formId,
        formFamilyId: form.formFamilyId,
        formOrdinal: form.formOrdinal,
        evaluationProtected: false,
        coldTransfer: false,
        protocolVersion: plan.protocolVersion,
      },
    });
    const nowValue = typeof now === "function" ? now() : now;
    const preparedAt = (nowValue instanceof Date ? nowValue : new Date(nowValue)).toISOString();
    return Object.freeze({
      status: "ready",
      sessionId,
      profileId: initialized.profile.profileId,
      contextId: initialized.context.contextId,
      form,
      plan,
      contentPlan,
      preparedAt,
    });
  }

  return Object.freeze({
    getAvailability,
    prepare,
    close() { ownedDataStore?.close?.(); },
  });
}
