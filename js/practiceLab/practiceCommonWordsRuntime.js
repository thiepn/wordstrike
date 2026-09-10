import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionId } from "./practiceIds.js";
import { buildPracticeMasteryEvaluationSet } from "./practiceMasterySnapshot.js";
import { loadPracticeCommonWordArtifacts } from "./practiceCommonWordReference.js";
import { getPracticeCommonWordsAvailability } from "./practiceCommonWordsAvailability.js";
import { createPracticeCommonWordsPlan } from "./practiceCommonWordsPlan.js";
import { createPracticeCommonWordCheckPlan } from "./practiceCommonWordCheckPlan.js";
import { buildPracticeCommonWordBreadthSnapshot } from "./practiceCommonWordBreadth.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function createPracticeCommonWordsRuntime({ repository = null, dataStore = null, manifestStore = null, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const ownedDataStore = repository ? null : (dataStore ?? createPracticeIndexedDbStore());
  const repo = repository ?? createPracticeRepository({ dataStore: ownedDataStore, manifestStore: manifestStore ?? createPracticeManifestStore() });
  const store = dataStore ?? ownedDataStore;
  let initializedPromise = null;
  let artifactsPromise = null;
  const initialize = () => initializedPromise ??= repo.initializePracticeStorage();
  const artifacts = () => artifactsPromise ??= loadPracticeCommonWordArtifacts({ fetchImpl });

  async function contextData({ includeMastery = false } = {}) {
    const [initialized, loadedArtifacts] = await Promise.all([initialize(), artifacts()]);
    const allStats = store?.list ? await store.list("skillStats") : [];
    const wordStats = (allStats ?? []).filter((stat) => stat?.profileId === initialized.profile.profileId && stat?.contextId === initialized.context.contextId && stat?.entityType === "word");
    let masterySnapshot = null;
    if (includeMastery && wordStats.length) {
      const entities = buildPracticeMasteryEvaluationSet({ skillStats: wordStats, context: { profileId: initialized.profile.profileId, contextId: initialized.context.contextId } });
      masterySnapshot = freezeDeep({ entities });
    }
    const breadthSnapshot = buildPracticeCommonWordBreadthSnapshot({
      profileId: initialized.profile.profileId,
      contextId: initialized.context.contextId,
      referenceBank: loadedArtifacts.reference,
      skillStats: wordStats,
      masterySnapshot,
      generatedAt: (typeof now === "function" ? now() : now)?.toISOString?.() ?? null,
    });
    return { initialized, loadedArtifacts, wordStats, masterySnapshot, breadthSnapshot };
  }

  async function getAvailability() {
    try {
      const [initialized, loadedArtifacts] = await Promise.all([initialize(), artifacts()]);
      return getPracticeCommonWordsAvailability({ context: initialized.context, artifacts: loadedArtifacts });
    } catch (error) {
      return freezeDeep({ practiceAvailable: false, practiceSizes: [], checkAvailable: false, reasons: [error?.code ?? "COMMON_WORDS_UNAVAILABLE"], diagnostics: null });
    }
  }

  async function getBreadthSnapshot() {
    const data = await contextData({ includeMastery: true });
    return data.breadthSnapshot;
  }

  async function prepare({ flow = "practice", wordCount = 160 } = {}) {
    const data = await contextData({ includeMastery: false });
    const availability = getPracticeCommonWordsAvailability({ context: data.initialized.context, artifacts: data.loadedArtifacts });
    const sessionId = createPracticeSessionId();
    if (flow === "practice") {
      if (!availability.practiceAvailable || !availability.practiceSizes.includes(wordCount)) throw Object.assign(new Error("Common Words Practice unavailable"), { code: "COMMON_WORDS_PRACTICE_UNAVAILABLE" });
      const prepared = createPracticeCommonWordsPlan({
        sessionId,
        profileId: data.initialized.profile.profileId,
        contextId: data.initialized.context.contextId,
        bank: data.loadedArtifacts.practiceBank,
        skillStats: data.wordStats,
        wordCount,
      });
      return freezeDeep({ status: "ready", flow, sessionId, profileId: data.initialized.profile.profileId, contextId: data.initialized.context.contextId, ...prepared, breadthSnapshotBefore: data.breadthSnapshot, availability });
    }
    if (flow === "check") {
      if (!availability.checkAvailable) throw Object.assign(new Error("Typing Breadth Check unavailable"), { code: "COMMON_WORD_CHECK_UNAVAILABLE" });
      const prepared = createPracticeCommonWordCheckPlan({ sessionId, profileId: data.initialized.profile.profileId, contextId: data.initialized.context.contextId, formSet: data.loadedArtifacts.checkFormSet });
      return freezeDeep({ status: "ready", flow, sessionId, profileId: data.initialized.profile.profileId, contextId: data.initialized.context.contextId, ...prepared, breadthSnapshotBefore: data.breadthSnapshot, availability });
    }
    throw new TypeError("Common Words flow must be practice or check");
  }

  return Object.freeze({
    getAvailability,
    getBreadthSnapshot,
    prepare,
    async getCommonWordsAbilityState() {
      const initialized = await initialize();
      return typeof repo.getAbilityState === "function" ? repo.getAbilityState(initialized.profile.profileId, initialized.context.contextId, "common-words") : null;
    },
    close() { ownedDataStore?.close?.(); },
  });
}
