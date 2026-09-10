import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionId } from "./practiceIds.js";
import { getPracticeEnduranceAvailability } from "./practiceEnduranceAvailability.js";
import {
  PRACTICE_ENDURANCE_CHECK_DURATION_MS,
  PRACTICE_ENDURANCE_CHECK_EXPERIMENT_ID,
  PRACTICE_ENDURANCE_CHECK_FORM_SET_ID,
  PRACTICE_ENDURANCE_CHECK_SETTLING_MS,
  PRACTICE_ENDURANCE_EXPERIMENT_ID,
  PRACTICE_ENDURANCE_FORM_SET_VERSION,
  PRACTICE_ENDURANCE_POLICY_VERSION,
  PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS,
  PRACTICE_ENDURANCE_SELECTION_VERSION,
  PRACTICE_ENDURANCE_TRAINING_FORM_SET_ID,
  PRACTICE_ENDURANCE_VERSION,
  PRACTICE_ENDURANCE_WINDOW_MS,
} from "./practiceEnduranceConstants.js";
import { PRACTICE_ENDURANCE_POLICY_V1 } from "./practiceEndurancePolicy.js";
import { createPracticeSustainedTypabilityScorer, loadPracticeSustainedFormSet } from "./practiceSustainedForms.js";
import { buildPracticeSustainedContentPlan, buildPracticeSustainedPlan, selectPracticeSustainedForm } from "./practiceSustainedPlan.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
export function createPracticeEnduranceRuntime({ repository = null, dataStore = null, manifestStore = null, fetchImpl = globalThis.fetch, timingSupported = true } = {}) {
  const ownedDataStore = repository ? null : (dataStore ?? createPracticeIndexedDbStore());
  const repo = repository ?? createPracticeRepository({ dataStore: ownedDataStore, manifestStore: manifestStore ?? createPracticeManifestStore() });
  let initializedPromise = null; let practiceFormsPromise = null; let checkFormsPromise = null; let scorerPromise = null;
  const initialize = () => initializedPromise ??= repo.initializePracticeStorage();
  const practiceForms = () => practiceFormsPromise ??= loadPracticeSustainedFormSet({ fetchImpl, folder: "endurance", formSetId: PRACTICE_ENDURANCE_TRAINING_FORM_SET_ID, expectedPartition: "training", minimumReadyForms: PRACTICE_ENDURANCE_POLICY_V1.form.practiceMinimumReadyForms });
  const checkForms = () => checkFormsPromise ??= loadPracticeSustainedFormSet({ fetchImpl, folder: "endurance", formSetId: PRACTICE_ENDURANCE_CHECK_FORM_SET_ID, expectedPartition: "diagnostic", minimumReadyForms: PRACTICE_ENDURANCE_POLICY_V1.form.checkMinimumReadyForms });
  const scorer = () => scorerPromise ??= createPracticeSustainedTypabilityScorer({ fetchImpl });
  async function availabilityInputs() {
    const initialized = await initialize(); let practiceFormSet = null; let checkFormSet = null; let practiceError = null; let checkError = null;
    try { practiceFormSet = await practiceForms(); } catch (error) { practiceError = error; }
    try { checkFormSet = await checkForms(); } catch (error) { checkError = error; }
    return { initialized, practiceFormSet, checkFormSet, practiceError, checkError };
  }
  async function getAvailability() { const input = await availabilityInputs(); return getPracticeEnduranceAvailability({ context: input.initialized.context, practiceFormSet: input.practiceFormSet, checkFormSet: input.checkFormSet, timingSupported, practiceError: input.practiceError, checkError: input.checkError }); }
  async function prepare({ flow = "practice", durationMs = PRACTICE_ENDURANCE_POLICY_V1.defaultPracticeDurationMs } = {}) {
    if (!['practice','check'].includes(flow)) throw new TypeError("Endurance flow must be practice or check");
    if (flow === "check") durationMs = PRACTICE_ENDURANCE_CHECK_DURATION_MS;
    if (flow === "practice" && !PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS.includes(durationMs)) throw new TypeError("Unsupported Endurance Practice duration");
    const [input, typabilityScorer] = await Promise.all([availabilityInputs(), scorer()]);
    const availability = getPracticeEnduranceAvailability({ context: input.initialized.context, practiceFormSet: input.practiceFormSet, checkFormSet: input.checkFormSet, timingSupported, practiceError: input.practiceError, checkError: input.checkError });
    if (flow === "practice" && !availability.practiceAvailable) throw Object.assign(new Error("Endurance Practice unavailable"), { code: "ENDURANCE_PRACTICE_UNAVAILABLE" });
    if (flow === "check" && !availability.checkAvailable) throw Object.assign(new Error("Endurance Check unavailable"), { code: "ENDURANCE_CHECK_UNAVAILABLE" });
    const formSet = flow === "check" ? input.checkFormSet : input.practiceFormSet;
    const sessionId = createPracticeSessionId(); const language = "en";
    const form = selectPracticeSustainedForm({ sessionId, contextLanguage: language, formSet, selectionVersion: PRACTICE_ENDURANCE_SELECTION_VERSION });
    const analysisStartMs = flow === "check" ? PRACTICE_ENDURANCE_CHECK_SETTLING_MS : durationMs === 300_000 ? PRACTICE_ENDURANCE_POLICY_V1.fiveMinutePracticeSettlingMs : PRACTICE_ENDURANCE_POLICY_V1.longPracticeSettlingMs;
    const plan = buildPracticeSustainedPlan({ version: PRACTICE_ENDURANCE_VERSION, policyVersion: PRACTICE_ENDURANCE_POLICY_VERSION, sessionId, profileId: input.initialized.profile.profileId, contextId: input.initialized.context.contextId, language, experimentId: flow === "check" ? PRACTICE_ENDURANCE_CHECK_EXPERIMENT_ID : PRACTICE_ENDURANCE_EXPERIMENT_ID, flow, durationMs, analysisStartMs, windowMs: PRACTICE_ENDURANCE_WINDOW_MS, formSet, form, extra: { formSetVersion: PRACTICE_ENDURANCE_FORM_SET_VERSION, settlingDurationMs: analysisStartMs } });
    const contentPlan = buildPracticeSustainedContentPlan({ plan, form, sourceType: flow === "check" ? "endurance-diagnostic" : "endurance-training" });
    const graphemes = Array.from(form.text); const scoreRange = (start, end) => typabilityScorer.score(graphemes.slice(Math.max(0, start ?? 0), Math.max(0, end ?? 0)).join(""));
    return freezeDeep({ status: "ready", flow, sessionId, profileId: input.initialized.profile.profileId, contextId: input.initialized.context.contextId, form, formSet: { manifest: formSet.manifest }, plan, contentPlan, scoreRange, availability });
  }
  return Object.freeze({ getAvailability, prepare, async getEnduranceAbilityState() { const initialized = await initialize(); return repo.getAbilityState?.(initialized.profile.profileId, initialized.context.contextId, "endurance") ?? null; }, close() { ownedDataStore?.close?.(); } });
}
