import { createPracticeRepository as createPracticeRepositoryV31 } from "./practiceRepositoryV31.js";
import { PRACTICE_LIMITS } from "./practiceConstants.js";

const byteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const terminalEpisode = (episode) => ["closed", "invalid"].includes(episode?.status);

export function createPracticeRepository(options = {}) {
  const core = createPracticeRepositoryV31(options);
  const dataStore = options.dataStore;
  if (!dataStore) return core;
  const now = options.now ?? Date.now;

  async function getTreatmentEpisode(treatmentEpisodeId) {
    return dataStore.get("treatmentEpisodes", treatmentEpisodeId);
  }

  async function getTreatmentEpisodeBySession(treatmentSessionId) {
    const records = await dataStore.query("treatmentEpisodes", "treatmentSessionId", treatmentSessionId);
    return records[0] ?? null;
  }

  async function createTreatmentEpisode(episode) {
    if (!episode?.treatmentEpisodeId || !episode?.treatment?.treatmentSessionId) throw new TypeError("Treatment episode identity is required");
    if (byteLength(episode) > PRACTICE_LIMITS.treatmentEpisodeBytes) throw new TypeError("Treatment episode exceeds serialized size limit");
    return dataStore.runTransaction(["treatmentEpisodes"], "readwrite", async (transaction) => {
      const existingById = await transaction.get("treatmentEpisodes", episode.treatmentEpisodeId);
      if (existingById) return { created: false, episode: existingById };
      const existing = await transaction.query("treatmentEpisodes", "treatmentSessionId", episode.treatment.treatmentSessionId);
      if (existing.length) return { created: false, episode: existing[0] };
      const open = await transaction.query("treatmentEpisodes", "contextId", episode.contextId);
      const openCount = open.filter((item) => item.profileId === episode.profileId && ["prepared", "tracking"].includes(item.status)).length;
      if (openCount >= PRACTICE_LIMITS.treatmentOpenEpisodesPerContext) throw new TypeError("Treatment tracking open-episode cap reached");
      await transaction.put("treatmentEpisodes", episode);
      return { created: true, episode };
    });
  }

  async function saveTreatmentEpisode(episode) {
    if (!episode?.treatmentEpisodeId || byteLength(episode) > PRACTICE_LIMITS.treatmentEpisodeBytes) throw new TypeError("Invalid Treatment Episode");
    await dataStore.put("treatmentEpisodes", episode);
    return episode;
  }

  async function listTreatmentEpisodes(profileId, { contextId = null, status = null, limit = 100, offset = 0 } = {}) {
    const raw = contextId
      ? await dataStore.query("treatmentEpisodes", "contextId", contextId)
      : await dataStore.query("treatmentEpisodes", "profileId", profileId);
    return raw
      .filter((episode) => episode.profileId === profileId && (!contextId || episode.contextId === contextId) && (!status || episode.status === status))
      .sort((a, b) => String(b.treatment?.completedAt ?? b.createdAt).localeCompare(String(a.treatment?.completedAt ?? a.createdAt)) || a.treatmentEpisodeId.localeCompare(b.treatmentEpisodeId))
      .slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, Math.min(200, limit)));
  }

  async function listOpenTreatmentEpisodes(profileId, contextId) {
    const records = await dataStore.query("treatmentEpisodes", "contextId", contextId);
    return records
      .filter((episode) => episode.profileId === profileId && episode.contextId === contextId && ["prepared", "tracking"].includes(episode.status))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, PRACTICE_LIMITS.treatmentOpenEpisodesPerContext);
  }

  async function getTreatmentResponseState(treatmentResponseStateId) {
    return dataStore.get("treatmentResponseStates", treatmentResponseStateId);
  }

  async function saveTreatmentResponseState(state) {
    await dataStore.put("treatmentResponseStates", state);
    return state;
  }

  async function listTreatmentResponseStates(profileId, { contextId = null, treatmentFamilyKey = null } = {}) {
    const raw = contextId
      ? await dataStore.query("treatmentResponseStates", "contextId", contextId)
      : await dataStore.query("treatmentResponseStates", "profileId", profileId);
    return raw
      .filter((state) => state.profileId === profileId && (!contextId || state.contextId === contextId) && (!treatmentFamilyKey || state.treatmentFamilyKey === treatmentFamilyKey))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async function saveTreatmentOutcomeAndResponseState(episode, state = null) {
    const stores = state ? ["treatmentEpisodes", "treatmentResponseStates"] : ["treatmentEpisodes"];
    return dataStore.runTransaction(stores, "readwrite", async (transaction) => {
      const current = await transaction.get("treatmentEpisodes", episode.treatmentEpisodeId);
      if (!current) throw new TypeError("Treatment episode disappeared before outcome attachment");
      await transaction.put("treatmentEpisodes", episode);
      if (state) await transaction.put("treatmentResponseStates", state);
      return { episode, state };
    });
  }

  async function listTreatmentIntervalSessions(profileId, contextId, afterUtc, beforeUtc) {
    const records = await dataStore.query("sessionSummaries", "contextId", contextId);
    const after = Date.parse(afterUtc ?? "");
    const before = Date.parse(beforeUtc ?? "");
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
      if (!terminalEpisode(episode)) continue;
      const reference = Date.parse(episode.closedAt ?? episode.updatedAt ?? episode.createdAt ?? "");
      const horizonDays = episode.status === "invalid" ? PRACTICE_LIMITS.treatmentInvalidDays : PRACTICE_LIMITS.treatmentClosedDays;
      if (Number.isFinite(reference) && Number.isFinite(currentMs) && currentMs - reference > horizonDays * 86_400_000) deletionMap.set(episode.treatmentEpisodeId, episode);
    }
    const survivors = episodes.filter((episode) => !deletionMap.has(episode.treatmentEpisodeId));
    const excess = Math.max(0, survivors.length - PRACTICE_LIMITS.treatmentEpisodesPerProfile);
    if (excess) {
      survivors.filter((episode) => episode.status === "closed")
        .sort((a, b) => String(a.closedAt ?? a.updatedAt).localeCompare(String(b.closedAt ?? b.updatedAt)))
        .slice(0, excess)
        .forEach((episode) => deletionMap.set(episode.treatmentEpisodeId, episode));
    }
    for (const id of deletionMap.keys()) await dataStore.delete("treatmentEpisodes", id);

    const states = await dataStore.query("treatmentResponseStates", "profileId", profileId);
    if (states.length > PRACTICE_LIMITS.treatmentResponseStatesPerProfile) {
      const removable = states.slice().sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
        .slice(0, states.length - PRACTICE_LIMITS.treatmentResponseStatesPerProfile);
      for (const state of removable) await dataStore.delete("treatmentResponseStates", state.treatmentResponseStateId);
    }
    return { deletedEpisodeIds: [...deletionMap.keys()] };
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
