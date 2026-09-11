import { createPracticeRepository as createPracticeRepositoryV31 } from "./practiceRepositoryV31.js";
import { PRACTICE_LIMITS } from "./practiceConstants.js";
import {
  validatePracticeTreatmentEpisode,
  validatePracticeTreatmentResponseState,
} from "./practiceTreatmentValidation.js";

const terminalEpisode = (episode) => ["closed", "invalid"].includes(episode?.status);

function treatmentValidationError(kind, validation) {
  const error = new TypeError(`${kind} failed PL32 validation`);
  error.code = "PRACTICE_TREATMENT_RECORD_INVALID";
  error.details = validation?.errors ?? [];
  return error;
}

function assertTreatmentEpisode(episode) {
  const validation = validatePracticeTreatmentEpisode(episode);
  if (!validation.valid) throw treatmentValidationError("Treatment Episode", validation);
  return episode;
}

function assertTreatmentResponseState(state) {
  const validation = validatePracticeTreatmentResponseState(state);
  if (!validation.valid) throw treatmentValidationError("Treatment Response state", validation);
  return state;
}

const validEpisode = (episode) => validatePracticeTreatmentEpisode(episode).valid;
const validState = (state) => validatePracticeTreatmentResponseState(state).valid;

export function createPracticeRepository(options = {}) {
  const core = createPracticeRepositoryV31(options);
  const dataStore = options.dataStore;
  if (!dataStore) return core;
  const now = options.now ?? Date.now;

  async function getTreatmentEpisode(treatmentEpisodeId) {
    const record = await dataStore.get("treatmentEpisodes", treatmentEpisodeId);
    return record && validEpisode(record) ? record : null;
  }

  async function getTreatmentEpisodeBySession(treatmentSessionId) {
    const records = await dataStore.query("treatmentEpisodes", "treatmentSessionId", treatmentSessionId);
    return records.find(validEpisode) ?? null;
  }

  async function createTreatmentEpisode(episode) {
    assertTreatmentEpisode(episode);
    return dataStore.runTransaction(["treatmentEpisodes"], "readwrite", async (transaction) => {
      const existingById = await transaction.get("treatmentEpisodes", episode.treatmentEpisodeId);
      if (existingById) {
        if (validEpisode(existingById)) return { created: false, episode: existingById };
        await transaction.delete("treatmentEpisodes", episode.treatmentEpisodeId);
      }
      const existing = await transaction.query("treatmentEpisodes", "treatmentSessionId", episode.treatment.treatmentSessionId);
      const canonical = existing.find(validEpisode);
      if (canonical) return { created: false, episode: canonical };
      for (const malformed of existing.filter((record) => !validEpisode(record))) {
        if (malformed?.treatmentEpisodeId) await transaction.delete("treatmentEpisodes", malformed.treatmentEpisodeId);
      }
      const open = await transaction.query("treatmentEpisodes", "contextId", episode.contextId);
      const openCount = open.filter((item) => validEpisode(item)
        && item.profileId === episode.profileId
        && ["prepared", "tracking"].includes(item.status)).length;
      if (openCount >= PRACTICE_LIMITS.treatmentOpenEpisodesPerContext) throw new TypeError("Treatment tracking open-episode cap reached");
      await transaction.put("treatmentEpisodes", episode);
      return { created: true, episode };
    });
  }

  async function saveTreatmentEpisode(episode) {
    assertTreatmentEpisode(episode);
    await dataStore.put("treatmentEpisodes", episode);
    return episode;
  }

  async function listTreatmentEpisodes(profileId, { contextId = null, status = null, limit = 100, offset = 0 } = {}) {
    const raw = contextId
      ? await dataStore.query("treatmentEpisodes", "contextId", contextId)
      : await dataStore.query("treatmentEpisodes", "profileId", profileId);
    return raw
      .filter((episode) => validEpisode(episode)
        && episode.profileId === profileId
        && (!contextId || episode.contextId === contextId)
        && (!status || episode.status === status))
      .sort((a, b) => String(b.treatment?.completedAt ?? b.createdAt).localeCompare(String(a.treatment?.completedAt ?? a.createdAt)) || a.treatmentEpisodeId.localeCompare(b.treatmentEpisodeId))
      .slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, Math.min(200, limit)));
  }

  async function listOpenTreatmentEpisodes(profileId, contextId) {
    const records = await dataStore.query("treatmentEpisodes", "contextId", contextId);
    return records
      .filter((episode) => validEpisode(episode)
        && episode.profileId === profileId
        && episode.contextId === contextId
        && ["prepared", "tracking"].includes(episode.status))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, PRACTICE_LIMITS.treatmentOpenEpisodesPerContext);
  }

  async function getTreatmentResponseState(treatmentResponseStateId) {
    const state = await dataStore.get("treatmentResponseStates", treatmentResponseStateId);
    return state && validState(state) ? state : null;
  }

  async function saveTreatmentResponseState(state) {
    assertTreatmentResponseState(state);
    await dataStore.put("treatmentResponseStates", state);
    return state;
  }

  async function listTreatmentResponseStates(profileId, { contextId = null, treatmentFamilyKey = null } = {}) {
    const raw = contextId
      ? await dataStore.query("treatmentResponseStates", "contextId", contextId)
      : await dataStore.query("treatmentResponseStates", "profileId", profileId);
    return raw
      .filter((state) => validState(state)
        && state.profileId === profileId
        && (!contextId || state.contextId === contextId)
        && (!treatmentFamilyKey || state.treatmentFamilyKey === treatmentFamilyKey))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async function saveTreatmentOutcomeAndResponseState(episode, state = null) {
    assertTreatmentEpisode(episode);
    if (state) assertTreatmentResponseState(state);
    const stores = state ? ["treatmentEpisodes", "treatmentResponseStates"] : ["treatmentEpisodes"];
    return dataStore.runTransaction(stores, "readwrite", async (transaction) => {
      const current = await transaction.get("treatmentEpisodes", episode.treatmentEpisodeId);
      if (!current || !validEpisode(current)) throw new TypeError("Treatment episode disappeared or became invalid before outcome attachment");
      await transaction.put("treatmentEpisodes", episode);
      if (state) await transaction.put("treatmentResponseStates", state);
      return { episode, state };
    });
  }

  async function listTreatmentIntervalSessions(profileId, contextId, afterUtc, beforeUtc) {
    const after = Date.parse(afterUtc ?? "");
    const before = Date.parse(beforeUtc ?? "");
    let records;
    const canUseRange = dataStore.kind === "indexeddb"
      && Number.isFinite(after)
      && Number.isFinite(before)
      && before > after
      && typeof globalThis.IDBKeyRange?.bound === "function";
    if (canUseRange) {
      const range = globalThis.IDBKeyRange.bound(
        [profileId, contextId, afterUtc],
        [profileId, contextId, beforeUtc],
        true,
        true,
      );
      records = await dataStore.query("sessionSummaries", "profileContextCompletedAt", range);
    } else {
      records = await dataStore.query("sessionSummaries", "contextId", contextId);
    }
    return records.filter((session) => session.profileId === profileId && session.contextId === contextId
      && Number.isFinite(Date.parse(session.completedAtUtc))
      && (!Number.isFinite(after) || Date.parse(session.completedAtUtc) > after)
      && (!Number.isFinite(before) || Date.parse(session.completedAtUtc) < before))
      .sort((a, b) => String(a.completedAtUtc).localeCompare(String(b.completedAtUtc)))
      .slice(-500);
  }

  async function getTreatmentAbilityState(profileId, contextId, channel) {
    const records = await dataStore.query("abilityStates", "profileContextChannel", [profileId, contextId, channel]);
    return records[0] ?? null;
  }

  async function getTreatmentPerformanceState(profileId, contextId) {
    const records = await dataStore.query("performanceStates", "profileContext", [profileId, contextId]);
    return records[0] ?? null;
  }

  async function pruneTreatmentTracking(profileId) {
    const currentValue = typeof now === "function" ? now() : now;
    const currentMs = currentValue instanceof Date ? currentValue.getTime() : Number(currentValue);
    const episodes = await dataStore.query("treatmentEpisodes", "profileId", profileId);
    const deletionMap = new Map();
    for (const episode of episodes) {
      if (!validEpisode(episode)) {
        if (episode?.treatmentEpisodeId) deletionMap.set(episode.treatmentEpisodeId, episode);
        continue;
      }
      if (!terminalEpisode(episode)) continue;
      const reference = Date.parse(episode.closedAt ?? episode.updatedAt ?? episode.createdAt ?? "");
      const horizonDays = episode.status === "invalid" ? PRACTICE_LIMITS.treatmentInvalidDays : PRACTICE_LIMITS.treatmentClosedDays;
      if (Number.isFinite(reference) && Number.isFinite(currentMs) && currentMs - reference > horizonDays * 86_400_000) deletionMap.set(episode.treatmentEpisodeId, episode);
    }
    const survivors = episodes.filter((episode) => validEpisode(episode) && !deletionMap.has(episode.treatmentEpisodeId));
    const excess = Math.max(0, survivors.length - PRACTICE_LIMITS.treatmentEpisodesPerProfile);
    if (excess) {
      survivors.filter((episode) => episode.status === "closed")
        .sort((a, b) => String(a.closedAt ?? a.updatedAt).localeCompare(String(b.closedAt ?? b.updatedAt)))
        .slice(0, excess)
        .forEach((episode) => deletionMap.set(episode.treatmentEpisodeId, episode));
    }
    for (const id of deletionMap.keys()) await dataStore.delete("treatmentEpisodes", id);

    const states = await dataStore.query("treatmentResponseStates", "profileId", profileId);
    const invalidStateIds = states.filter((state) => !validState(state)).map((state) => state?.treatmentResponseStateId).filter(Boolean);
    for (const id of invalidStateIds) await dataStore.delete("treatmentResponseStates", id);
    const validStates = states.filter(validState);
    if (validStates.length > PRACTICE_LIMITS.treatmentResponseStatesPerProfile) {
      const removable = validStates.slice().sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
        .slice(0, validStates.length - PRACTICE_LIMITS.treatmentResponseStatesPerProfile);
      for (const state of removable) await dataStore.delete("treatmentResponseStates", state.treatmentResponseStateId);
    }
    return { deletedEpisodeIds: [...deletionMap.keys()], deletedInvalidStateIds: invalidStateIds };
  }

  async function runPracticeRetention(...args) {
    const profile = await core.getPracticeProfile?.();
    const treatment = profile ? await pruneTreatmentTracking(profile.profileId) : { deletedEpisodeIds: [] };
    const coreResult = await core.runPracticeRetention(...args);
    return { ...coreResult, treatmentEpisodes: treatment.deletedEpisodeIds };
  }

  return Object.freeze({
    ...core,
    getTreatmentEpisode,
    getTreatmentEpisodeBySession,
    createTreatmentEpisode,
    saveTreatmentEpisode,
    listTreatmentEpisodes,
    listOpenTreatmentEpisodes,
    getTreatmentResponseState,
    saveTreatmentResponseState,
    listTreatmentResponseStates,
    saveTreatmentOutcomeAndResponseState,
    listTreatmentIntervalSessions,
    getTreatmentAbilityState,
    getTreatmentPerformanceState,
    pruneTreatmentTracking,
    runPracticeRetention,
  });
}
