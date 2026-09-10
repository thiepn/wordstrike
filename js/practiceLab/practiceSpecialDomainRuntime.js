import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionId } from "./practiceIds.js";
import { loadPracticeSpecialDomainFormSet } from "./practiceSpecialDomainForms.js";
import {
  buildPracticeSpecialDomainContentPlan,
  buildPracticeSpecialDomainPlan,
  selectPracticeSpecialDomainForm,
} from "./practiceSpecialDomainPlan.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createPracticeSpecialDomainRuntime({
  repository = null,
  dataStore = null,
  manifestStore = null,
  fetchImpl = globalThis.fetch,
  inputCapability = null,
  domain,
  visibleExperimentId,
  checkExperimentId,
  version,
  policyVersion,
  selectionVersion,
  annotationVersion,
  practiceFormSetId,
  checkFormSetId,
  practiceMinimumReadyForms,
  checkMinimumReadyForms,
  practiceDurationsMs,
  defaultPracticeDurationMs,
  getAvailability,
  sourceTypes,
} = {}) {
  const ownedDataStore = repository ? null : (dataStore ?? createPracticeIndexedDbStore());
  const repo = repository ?? createPracticeRepository({ dataStore: ownedDataStore, manifestStore: manifestStore ?? createPracticeManifestStore() });
  let initializedPromise = null;
  let practiceFormsPromise = null;
  let checkFormsPromise = null;
  const initialize = () => initializedPromise ??= repo.initializePracticeStorage();
  const loadPractice = () => practiceFormsPromise ??= loadPracticeSpecialDomainFormSet({
    fetchImpl, folder: domain, formSetId: practiceFormSetId, expectedPartition: "training",
    minimumReadyForms: practiceMinimumReadyForms, requiredDomain: domain,
  });
  const loadCheck = () => checkFormsPromise ??= loadPracticeSpecialDomainFormSet({
    fetchImpl, folder: domain, formSetId: checkFormSetId, expectedPartition: "diagnostic",
    minimumReadyForms: checkMinimumReadyForms, requiredDomain: domain,
  });

  async function availabilityInputs() {
    const initialized = await initialize();
    let practiceFormSet = null; let checkFormSet = null; let practiceError = null; let checkError = null;
    try { practiceFormSet = await loadPractice(); } catch (error) { practiceError = error; }
    try { checkFormSet = await loadCheck(); } catch (error) { checkError = error; }
    return { initialized, practiceFormSet, checkFormSet, practiceError, checkError };
  }

  async function availability() {
    const input = await availabilityInputs();
    return getAvailability({
      context: input.initialized.context,
      practiceFormSet: input.practiceFormSet,
      checkFormSet: input.checkFormSet,
      practiceError: input.practiceError,
      checkError: input.checkError,
      inputCapability,
    });
  }

  async function prepare({ flow = "practice", durationMs = defaultPracticeDurationMs } = {}) {
    if (!["practice", "check"].includes(flow)) throw new TypeError("PL30 flow must be practice or check");
    if (flow === "practice" && !practiceDurationsMs.includes(durationMs)) throw new TypeError("Unsupported PL30 Practice duration");
    const input = await availabilityInputs();
    const currentAvailability = getAvailability({
      context: input.initialized.context,
      practiceFormSet: input.practiceFormSet,
      checkFormSet: input.checkFormSet,
      practiceError: input.practiceError,
      checkError: input.checkError,
      inputCapability,
    });
    if (flow === "practice" && !currentAvailability.practiceAvailable) throw Object.assign(new Error("PL30 Practice unavailable"), { code: `${domain.toUpperCase().replaceAll("-", "_")}_PRACTICE_UNAVAILABLE` });
    if (flow === "check" && !currentAvailability.checkAvailable) throw Object.assign(new Error("PL30 Check unavailable"), { code: `${domain.toUpperCase().replaceAll("-", "_")}_CHECK_UNAVAILABLE` });

    const formSet = flow === "check" ? input.checkFormSet : input.practiceFormSet;
    const sessionId = createPracticeSessionId();
    const language = "en";
    const form = selectPracticeSpecialDomainForm({ sessionId, contextLanguage: language, formSet, selectionVersion });
    const plan = buildPracticeSpecialDomainPlan({
      version, policyVersion, sessionId,
      profileId: input.initialized.profile.profileId,
      contextId: input.initialized.context.contextId,
      language,
      experimentId: flow === "check" ? checkExperimentId : visibleExperimentId,
      flow,
      durationMs: flow === "check" ? null : durationMs,
      formSet,
      form,
      annotationVersion,
    });
    const contentPlan = buildPracticeSpecialDomainContentPlan({
      plan,
      form,
      sourceType: flow === "check" ? sourceTypes.check : sourceTypes.practice,
    });
    return freezeDeep({
      status: "ready",
      flow,
      sessionId,
      profileId: input.initialized.profile.profileId,
      contextId: input.initialized.context.contextId,
      form,
      formSet: { manifest: formSet.manifest },
      plan,
      contentPlan,
      availability: currentAvailability,
    });
  }

  return Object.freeze({
    getAvailability: availability,
    prepare,
    async getAbilityState(channel) {
      const initialized = await initialize();
      return repo.getAbilityState?.(initialized.profile.profileId, initialized.context.contextId, channel) ?? null;
    },
    close() { ownedDataStore?.close?.(); },
  });
}
