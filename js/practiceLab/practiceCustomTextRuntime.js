import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionId } from "./practiceIds.js";
import { buildPracticeCustomTextPlan } from "./practiceCustomTextPlan.js";
import { buildPracticeCustomTypingProjection } from "./practiceCustomTextProjection.js";
import { getPracticeCustomTextTimedAvailability } from "./practiceCustomTextAvailability.js";
import { PRACTICE_CUSTOM_TEXT_ERROR_CODES } from "./practiceCustomTextConstants.js";
import { customTextError } from "./practiceCustomTextValidation.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function createPracticeCustomTextRuntime({ repository = null, dataStore = null, manifestStore = null, now = Date.now } = {}) {
  const ownedDataStore = repository ? null : (dataStore ?? createPracticeIndexedDbStore());
  const repo = repository ?? createPracticeRepository({ dataStore: ownedDataStore, manifestStore: manifestStore ?? createPracticeManifestStore(), now });
  let initializedPromise = null;
  const initialize = () => initializedPromise ??= repo.initializePracticeStorage();

  async function getWorkspaceState() {
    const initialized = await initialize();
    const texts = await repo.listCustomTexts(initialized.profile.profileId);
    return freezeDeep({
      profileId: initialized.profile.profileId,
      contextId: initialized.context.contextId,
      dataLocale: initialized.context.dataLocale,
      texts,
    });
  }

  async function getCustomText(customTextId) {
    const initialized = await initialize();
    return repo.getCustomText(customTextId, { profileId: initialized.profile.profileId });
  }

  async function createCustomText(input) {
    const initialized = await initialize();
    return repo.createCustomText({ ...input, profileId: initialized.profile.profileId, dataLocale: input.dataLocale ?? initialized.context.dataLocale });
  }

  async function updateCustomText(input) {
    const initialized = await initialize();
    return repo.updateCustomText({ ...input, profileId: initialized.profile.profileId });
  }

  async function deleteCustomText(customTextId) {
    const initialized = await initialize();
    return repo.deleteCustomText(customTextId, { profileId: initialized.profile.profileId });
  }

  async function rebindCustomTextLocale({ customTextId, expectedRevision }) {
    const initialized = await initialize();
    const current = await repo.getCustomText(customTextId, { profileId: initialized.profile.profileId });
    if (!current) throw customTextError(PRACTICE_CUSTOM_TEXT_ERROR_CODES.NOT_FOUND, "Custom Text does not exist");
    return repo.updateCustomText({ customTextId, profileId: initialized.profile.profileId, expectedRevision, title: current.title, sourceText: current.sourceText, dataLocale: initialized.context.dataLocale });
  }

  async function prepare({ sourceText, sourceKind = "ephemeral", customTextId = null, revision = null, sourceHash = null, sessionMode = "full-text", timedDurationMs = null, selectionRange = null } = {}) {
    const initialized = await initialize();
    let resolvedText = sourceText;
    let resolvedRevision = revision;
    let resolvedHash = sourceHash;
    if (sourceKind === "saved") {
      const current = await repo.getCustomText(customTextId, { profileId: initialized.profile.profileId });
      if (!current) throw customTextError(PRACTICE_CUSTOM_TEXT_ERROR_CODES.NOT_FOUND, "Saved Custom Text no longer exists");
      if (current.dataLocale !== initialized.context.dataLocale) throw customTextError(PRACTICE_CUSTOM_TEXT_ERROR_CODES.LOCALE_MISMATCH, "Saved Custom Text belongs to a different Practice locale", { savedLocale: current.dataLocale, activeLocale: initialized.context.dataLocale });
      if (current.revision !== revision || current.sourceHash !== sourceHash) throw customTextError(PRACTICE_CUSTOM_TEXT_ERROR_CODES.REVISION_MISMATCH, "Saved Custom Text changed before session start", { expectedRevision: revision, actualRevision: current.revision });
      resolvedText = current.sourceText;
      resolvedRevision = current.revision;
      resolvedHash = current.sourceHash;
    }
    const sessionId = createPracticeSessionId();
    const customTextPlan = await buildPracticeCustomTextPlan({
      sessionId,
      profileId: initialized.profile.profileId,
      contextId: initialized.context.contextId,
      dataLocale: initialized.context.dataLocale,
      sourceText: resolvedText,
      sourceKind,
      customTextId,
      revision: resolvedRevision,
      sourceHash: resolvedHash,
      sessionMode,
      timedDurationMs,
      selectionRange,
    });
    return freezeDeep({
      status: "ready",
      sessionId,
      profileId: initialized.profile.profileId,
      contextId: initialized.context.contextId,
      dataLocale: initialized.context.dataLocale,
      customTextPlan,
      contentPlan: customTextPlan.contentPlan,
    });
  }

  return Object.freeze({
    getWorkspaceState,
    getCustomText,
    createCustomText,
    updateCustomText,
    deleteCustomText,
    rebindCustomTextLocale,
    getTimedAvailability(sourceText) { return getPracticeCustomTextTimedAvailability(buildPracticeCustomTypingProjection(sourceText).graphemeCount); },
    prepare,
    async markPractised(session, completedAt) {
      if (session?.customTextPlan?.sourceKind !== "saved") return false;
      const initialized = await initialize();
      return repo.markCustomTextPractised({
        customTextId: session.customTextPlan.customTextId,
        profileId: initialized.profile.profileId,
        revision: session.customTextPlan.revision,
        sourceHash: session.customTextPlan.sourceHash,
        completedAt,
      });
    },
    async deleteAllCustomTexts() { const initialized = await initialize(); return repo.deleteAllCustomTexts(initialized.profile.profileId); },
    close() { ownedDataStore?.close?.(); },
  });
}
