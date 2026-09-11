import { createPracticeCoachService as createPracticeCoachServiceBase } from "./practiceCoachServiceBaseV25.js";
import { createPracticeLimiterModel } from "./practiceLimiterService.js";
import { calculatePracticeCoachExecutionPressure } from "./practiceCoachTargets.js";
import {
  getCurrentPracticeCoachTreatmentFamilyKeys,
  getPotentialPracticeCoachTreatmentExperimentIds,
} from "./practiceCoachTreatmentOptions.js";
import {
  calculatePracticeCoachPlanHash,
  createPracticeCoachFingerprint,
  validatePracticeCoachPlan,
} from "./practiceCoachPlan.js";
import { PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION } from "./practiceTreatmentConstants.js";
import { getPracticeLocalDayKey } from "./practiceTime.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const currentFamilies = new Set(getCurrentPracticeCoachTreatmentFamilyKeys());

function availabilityStatus(result) {
  if (result?.status === "ready" || result?.eligible === true && result?.status !== "unavailable") return "ready";
  if (result?.status === "limited-content") return "limited-content";
  return "unavailable";
}

async function inspectOption(experimentRegistry, candidate, experimentId) {
  const registration = experimentRegistry?.getRegistration?.(experimentId);
  if (!registration?.runtime) return "unavailable";
  try {
    let result = null;
    if (experimentId === "weak-keys") result = await registration.runtime.inspectTarget?.({ entityKey: candidate.entityKey });
    else if (experimentId === "combination-repair") result = await registration.runtime.inspectTarget?.({ entityType: candidate.entityType, entityKey: candidate.entityKey });
    else if (experimentId === "problem-words") result = await registration.runtime.inspectTarget?.({ entityKey: candidate.entityKey });
    else if (experimentId === "accuracy-control") result = await registration.runtime.inspectTarget?.({ entityType: candidate.entityType, entityKey: candidate.entityKey });
    return availabilityStatus(result);
  } catch {
    return "unavailable";
  }
}

export function createPracticeCoachService(options = {}) {
  const { repository, experimentRegistry } = options;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  if (!repository || !experimentRegistry) return createPracticeCoachServiceBase(options);
  const responseCache = new Map();
  const responseStateSnapshots = new Map();
  const baseLimiter = options.limiterService ?? createPracticeLimiterModel({ repository, now });

  function cacheKey(profileId, contextId) {
    return `${profileId}\u0000${contextId}\u0000${getPracticeLocalDayKey(now)}`;
  }

  async function loadResponseStates(profileId, contextId) {
    const key = cacheKey(profileId, contextId);
    if (!responseCache.has(key)) {
      const pending = (typeof repository.listTreatmentResponseStates === "function"
        ? repository.listTreatmentResponseStates(profileId, { contextId })
        : Promise.resolve([]))
        .catch(() => [])
        .then((states) => Object.freeze((Array.isArray(states) ? states : []).slice(0, 256)));
      responseCache.set(key, pending);
    }
    const states = await responseCache.get(key);
    responseStateSnapshots.set(key, states);
    return states;
  }

  const personalizationLimiter = Object.freeze({
    ...baseLimiter,
    async buildContextLimiterSnapshot(args = {}) {
      const snapshot = await baseLimiter.buildContextLimiterSnapshot(args);
      const profileId = args.profileId;
      const contextId = args.contextId;
      const responseStates = await loadResponseStates(profileId, contextId);
      const personalizationNow = now();
      const candidates = await Promise.all((snapshot?.candidates ?? []).map(async (candidate) => {
        const pressure = calculatePracticeCoachExecutionPressure(candidate);
        const enriched = { ...candidate, ...pressure };
        const ids = getPotentialPracticeCoachTreatmentExperimentIds(enriched);
        const statuses = await Promise.all(ids.map((experimentId) => inspectOption(experimentRegistry, candidate, experimentId)));
        const availability = Object.freeze(ids.reduce((out, experimentId, index) => {
          out[experimentId] = statuses[index];
          return out;
        }, {}));
        return Object.freeze({
          ...candidate,
          coachProfileId: profileId,
          coachContextId: contextId,
          coachPersonalizationNow: personalizationNow,
          coachTreatmentResponseStates: responseStates,
          coachTreatmentOptionAvailability: availability,
        });
      }));
      return Object.freeze({ ...snapshot, candidates: Object.freeze(candidates) });
    },
  });

  const repositoryProxy = Object.freeze({
    ...repository,
    async createCoachPlan(plan) {
      if (plan?.plannerVersion !== 2) return repository.createCoachPlan(plan);
      const key = cacheKey(plan.profileId, plan.contextId);
      const states = responseStateSnapshots.get(key) ?? [];
      const relevantStates = states
        .filter((state) => currentFamilies.has(state?.treatmentFamilyKey)
          && ["key", "bigram", "trigram", "word"].includes(state?.targetEntityType)
          && state?.responseModelVersion === PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION)
        .map((state) => ({ treatmentResponseStateId: state.treatmentResponseStateId, updatedAt: state.updatedAt }))
        .sort((a, b) => a.treatmentResponseStateId.localeCompare(b.treatmentResponseStateId));
      const next = clone(plan);
      next.inputFingerprint = createPracticeCoachFingerprint({
        baseCoachFingerprint: plan.inputFingerprint,
        responseModelVersion: PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
        treatmentResponseStates: relevantStates,
      });
      next.planHash = calculatePracticeCoachPlanHash(next);
      const validation = validatePracticeCoachPlan(next);
      if (!validation.valid) {
        const error = new TypeError("PL33 Coach plan failed post-personalization validation");
        error.details = validation.errors;
        throw error;
      }
      return repository.createCoachPlan(next);
    },
  });

  const base = createPracticeCoachServiceBase({
    ...options,
    repository: repositoryProxy,
    limiterService: personalizationLimiter,
  });

  return Object.freeze({
    ...base,
    async createTodayPracticeCoachPlan(input) {
      try { return await base.createTodayPracticeCoachPlan(input); }
      catch (error) {
        responseCache.clear();
        responseStateSnapshots.clear();
        throw error;
      }
    },
    clearCaches() {
      responseCache.clear();
      responseStateSnapshots.clear();
      base.clearCaches?.();
    },
  });
}

export async function getTodayPracticeCoachPlan(service, profileId, contextId, nowValue) {
  return service.getTodayPracticeCoachPlan(profileId, contextId, nowValue);
}
