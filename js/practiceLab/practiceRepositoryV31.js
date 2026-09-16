import { createPracticeRepository as createPracticeRepositoryV30 } from "./practiceRepositoryV30.js";
import { PRACTICE_STORE_NAMES } from "./practiceConstants.js";
import { getPracticeStoreKey } from "./practiceStorageContract.js";
import { createPracticeCustomTextRepositoryFacade } from "./practiceCustomTextRepository.js";
import { createDefaultPracticeEvaluationState } from "./practiceEvaluationState.js";
import { reconcilePracticePl30ModelBoundary } from "./practicePl30ModelBoundaryRepair.js";

const PROFILE_RESET_META_KEYS = Object.freeze(["pl5ContextIdentity", "manifestReconciliation"]);
const PROFILE_RESET_STORES = Object.freeze(PRACTICE_STORE_NAMES.filter((storeName) => !["meta", "customTexts"].includes(storeName)));

function belongsToProfile(storeName, record, profileId) {
  if (!record || typeof record !== "object") return false;
  if (record.profileId === profileId) return true;
  if (storeName === "quarantine" && record.originalRecord?.profileId === profileId) return true;
  return false;
}

export function createPracticeRepository(options = {}) {
  if (!options.dataStore) return createPracticeRepositoryV30(options);

  const dataStore = options.dataStore;
  const now = options.now ?? Date.now;
  const core = createPracticeRepositoryV30({ ...options, dataStore });
  const custom = createPracticeCustomTextRepositoryFacade({ dataStore, now });

  async function initializePracticeStorage(...args) {
    const result = await core.initializePracticeStorage(...args);
    await reconcilePracticePl30ModelBoundary(dataStore, { now });
    return result;
  }

  async function resolveActiveScope(requestedProfileId = null, requestedContextId = null) {
    const active = await core.getPracticeProfile?.();
    const activeProfileId = active?.profileId ?? null;
    if (!activeProfileId) return null;
    if (requestedProfileId && requestedProfileId !== activeProfileId) return null;
    return Object.freeze({
      profileId: requestedProfileId ?? activeProfileId,
      contextId: requestedContextId ?? null,
    });
  }

  const inScope = (record, scope) => Boolean(record && scope
    && record.profileId === scope.profileId
    && (!scope.contextId || record.contextId === scope.contextId));

  async function getCustomText(customTextId, { profileId = null } = {}) {
    const scope = await resolveActiveScope(profileId);
    if (!scope) return null;
    return custom.getCustomText(customTextId, { profileId: scope.profileId });
  }

  async function createCustomText(input) {
    const scope = await resolveActiveScope(input?.profileId ?? null);
    if (!scope) return null;
    return custom.createCustomText({ ...input, profileId: scope.profileId });
  }

  async function updateCustomText(input) {
    const scope = await resolveActiveScope(input?.profileId ?? null);
    if (!scope) return null;
    return custom.updateCustomText({ ...input, profileId: scope.profileId });
  }

  async function deleteCustomText(customTextId, { profileId = null } = {}) {
    const scope = await resolveActiveScope(profileId);
    if (!scope) return false;
    return custom.deleteCustomText(customTextId, { profileId: scope.profileId });
  }

  async function deleteAllCustomTexts(profileId = null) {
    const scope = await resolveActiveScope(profileId);
    if (!scope) return 0;
    return custom.deleteAllCustomTexts(scope.profileId);
  }

  async function markCustomTextPractised(input) {
    const scope = await resolveActiveScope(input?.profileId ?? null);
    if (!scope) return false;
    return custom.markCustomTextPractised({ ...input, profileId: scope.profileId });
  }

  async function getCoachPlan(coachPlanId, { profileId = null, contextId = null } = {}) {
    const scope = await resolveActiveScope(profileId, contextId);
    if (!scope) return null;
    const record = await core.getCoachPlan(coachPlanId);
    return inScope(record, scope) ? record : null;
  }

  async function deleteCoachPlan(coachPlanId, { profileId = null, contextId = null } = {}) {
    const plan = await getCoachPlan(coachPlanId, { profileId, contextId });
    if (!plan) return false;
    return dataStore.delete("coachPlans", coachPlanId);
  }

  async function listCoachChildSessions(coachPlanId, { profileId = null, contextId = null } = {}) {
    const plan = await getCoachPlan(coachPlanId, { profileId, contextId });
    if (!plan) return [];
    const sessions = await core.listCoachChildSessions(coachPlanId);
    return sessions.filter((record) => record.profileId === plan.profileId && record.contextId === plan.contextId);
  }

  async function getAssessmentRun(assessmentRunId, { profileId = null, contextId = null } = {}) {
    const scope = await resolveActiveScope(profileId, contextId);
    if (!scope) return null;
    const record = await core.getAssessmentRun(assessmentRunId);
    return inScope(record, scope) ? record : null;
  }

  async function deleteReviewItem(reviewItemId, { profileId = null, contextId = null } = {}) {
    const scope = await resolveActiveScope(profileId, contextId);
    if (!scope) return false;
    const record = await dataStore.get("reviewItems", reviewItemId);
    if (!inScope(record, scope)) return false;
    return dataStore.delete("reviewItems", reviewItemId);
  }

  async function resetActiveProfileData(profileId) {
    const stores = [...PROFILE_RESET_STORES, "meta"];
    await dataStore.runTransaction(stores, "readwrite", async (transaction) => {
      for (const storeName of PROFILE_RESET_STORES) {
        const rows = await transaction.list(storeName);
        for (const row of rows) {
          if (!belongsToProfile(storeName, row, profileId)) continue;
          const key = getPracticeStoreKey(storeName, row);
          if (key != null && (!Array.isArray(key) || key.every((entry) => entry != null))) await transaction.delete(storeName, key);
        }
      }
      // A surviving database can no longer prove prior protected-content coldness
      // after reset. Persist a conservative marker instead of allowing a missing
      // state to be recreated as complete/fresh on the next measurement.
      await transaction.put("evaluationStates", createDefaultPracticeEvaluationState({
        profileId,
        now,
        historyStatus: "partial",
      }));
      for (const key of PROFILE_RESET_META_KEYS) await transaction.delete("meta", key);
    });
  }

  async function resetPracticeData(resetOptions = {}) {
    const deleteUserContent = resetOptions === true || resetOptions?.deleteUserContent === true;
    if (deleteUserContent) return core.resetPracticeData();

    const activeProfile = await core.getPracticeProfile?.();
    if (!activeProfile?.profileId) return core.resetPracticeData();

    await resetActiveProfileData(activeProfile.profileId);
    await initializePracticeStorage();
    return true;
  }

  return Object.freeze({
    ...core,
    ...custom,
    initializePracticeStorage,
    getCustomText,
    createCustomText,
    createPracticeCustomText: createCustomText,
    updateCustomText,
    updatePracticeCustomText: updateCustomText,
    deleteCustomText,
    deletePracticeCustomText: deleteCustomText,
    deleteAllCustomTexts,
    markCustomTextPractised,
    getCoachPlan,
    deleteCoachPlan,
    listCoachChildSessions,
    getAssessmentRun,
    deleteReviewItem,
    resetPracticeData,
  });
}
