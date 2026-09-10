import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionId } from "./practiceIds.js";
import { getPracticeConsistencyAvailability } from "./practiceConsistencyAvailability.js";
import {
  PRACTICE_CONSISTENCY_ANALYSIS_WINDOW_MS,
  PRACTICE_CONSISTENCY_CALIBRATION_MS,
  PRACTICE_CONSISTENCY_DURATIONS_MS,
  PRACTICE_CONSISTENCY_EXPERIMENT_ID,
  PRACTICE_CONSISTENCY_FORM_SET_ID,
  PRACTICE_CONSISTENCY_FORM_SET_VERSION,
  PRACTICE_CONSISTENCY_POLICY_VERSION,
  PRACTICE_CONSISTENCY_SELECTION_VERSION,
  PRACTICE_CONSISTENCY_VERSION,
} from "./practiceConsistencyConstants.js";
import { PRACTICE_CONSISTENCY_POLICY_V1 } from "./practiceConsistencyPolicy.js";
import { createPracticeSustainedTypabilityScorer, loadPracticeSustainedFormSet } from "./practiceSustainedForms.js";
import { buildPracticeSustainedContentPlan, buildPracticeSustainedPlan, selectPracticeSustainedForm } from "./practiceSustainedPlan.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
export function createPracticeConsistencyRuntime({ repository = null, dataStore = null, manifestStore = null, fetchImpl = globalThis.fetch, timingSupported = true } = {}) {
  const ownedDataStore = repository ? null : (dataStore ?? createPracticeIndexedDbStore());
  const repo = repository ?? createPracticeRepository({ dataStore: ownedDataStore, manifestStore: manifestStore ?? createPracticeManifestStore() });
  let initializedPromise = null; let formsPromise = null; let scorerPromise = null;
  const initialize = () => initializedPromise ??= repo.initializePracticeStorage();
  const forms = () => formsPromise ??= loadPracticeSustainedFormSet({ fetchImpl, folder: "consistency", formSetId: PRACTICE_CONSISTENCY_FORM_SET_ID, expectedPartition: "training", minimumReadyForms: PRACTICE_CONSISTENCY_POLICY_V1.form.minimumReadyForms });
  const scorer = () => scorerPromise ??= createPracticeSustainedTypabilityScorer({ fetchImpl });
  async function getAvailability() {
    const initialized = await initialize(); let formSet = null; let error = null;
    try { formSet = await forms(); } catch (caught) { error = caught; }
    return getPracticeConsistencyAvailability({ context: initialized.context, formSet, timingSupported, error });
  }
  async function prepare({ durationMs = PRACTICE_CONSISTENCY_POLICY_V1.defaultDurationMs } = {}) {
    if (!PRACTICE_CONSISTENCY_DURATIONS_MS.includes(durationMs)) throw new TypeError("Unsupported Consistency duration");
    const [initialized, formSet, typabilityScorer] = await Promise.all([initialize(), forms(), scorer()]);
    const availability = getPracticeConsistencyAvailability({ context: initialized.context, formSet, timingSupported });
    if (!availability.available) throw Object.assign(new Error("Consistency Trainer unavailable"), { code: availability.reasons[0] ?? "CONSISTENCY_UNAVAILABLE" });
    const sessionId = createPracticeSessionId();
    const language = String(initialized.context?.language ?? initialized.context?.locale ?? "en").toLowerCase().startsWith("en") ? "en" : "en";
    const form = selectPracticeSustainedForm({ sessionId, contextLanguage: language, formSet, selectionVersion: PRACTICE_CONSISTENCY_SELECTION_VERSION });
    const plan = buildPracticeSustainedPlan({ version: PRACTICE_CONSISTENCY_VERSION, policyVersion: PRACTICE_CONSISTENCY_POLICY_VERSION, sessionId, profileId: initialized.profile.profileId, contextId: initialized.context.contextId, language, experimentId: PRACTICE_CONSISTENCY_EXPERIMENT_ID, flow: "practice", durationMs, analysisStartMs: PRACTICE_CONSISTENCY_CALIBRATION_MS, windowMs: PRACTICE_CONSISTENCY_ANALYSIS_WINDOW_MS, formSet, form, extra: { formSetVersion: PRACTICE_CONSISTENCY_FORM_SET_VERSION, calibrationDurationMs: PRACTICE_CONSISTENCY_CALIBRATION_MS, guidePolicy: { version: 1, windowMs: 15_000, lowerRatio: 0.9, upperRatio: 1.1 } } });
    const contentPlan = buildPracticeSustainedContentPlan({ plan, form, sourceType: "consistency-training" });
    const graphemes = Array.from(form.text);
    const scoreRange = (start, end) => typabilityScorer.score(graphemes.slice(Math.max(0, start ?? 0), Math.max(0, end ?? 0)).join(""));
    return freezeDeep({ status: "ready", flow: "practice", sessionId, profileId: initialized.profile.profileId, contextId: initialized.context.contextId, form, formSet: { manifest: formSet.manifest }, plan, contentPlan, scoreRange, availability });
  }
  return Object.freeze({ getAvailability, prepare, close() { ownedDataStore?.close?.(); } });
}
