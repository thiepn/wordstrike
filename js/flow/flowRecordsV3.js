import { compareFlowScoreV3Results } from "./flowScoreV3.js";

export const FLOW_RECORDS_V3_STORAGE_KEY = "wordstrike_flow_records_v3_timed_3m";
export const FLOW_RECORDS_V3_VERSION = 2;
export const FLOW_RECORDS_V3_MAX_HISTORY = 40;
export const FLOW_RECORDS_V3_MAX_SESSION_IDS = 120;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function cleanResult(value) {
  if (!value || typeof value !== "object") return null;
  const sessionId = typeof value.sessionId === "string" ? value.sessionId : "";
  if (!sessionId) return null;
  return {
    schemaVersion: 1,
    contractVersion: 3,
    rulesVersion: 4,
    metricVersion: 2,
    modeId: "flow",
    variantId: "flow-v3",
    boardKey: "flow-standard-3m-v1",
    sessionId,
    endedAt: Math.max(0, finite(value.endedAt)),
    endedReason: ["reset", "complete", "exit", "theme-change"].includes(value.endedReason)
      ? value.endedReason
      : "reset",
    sessionLength: "flow",
    sessionPreset: ["quick", "standard", "deep", "endless"].includes(value.sessionPreset)
      ? value.sessionPreset
      : "standard",
    completed: value.completed === true,
    recordEligible: value.recordEligible === true,
    score: Math.max(0, Math.round(finite(value.score))),
    wpm: Math.max(0, finite(value.wpm)),
    rawWpm: Math.max(0, finite(value.rawWpm)),
    accuracy: Math.max(0, Math.min(100, finite(value.accuracy))),
    consistency: Math.max(0, Math.min(100, finite(value.consistency))),
    consistencySamples: Math.max(0, Math.round(finite(value.consistencySamples))),
    activeDurationMs: Math.max(0, finite(value.activeDurationMs)),
    wordsCompleted: Math.max(0, Math.round(finite(value.wordsCompleted))),
    charactersCompleted: Math.max(0, Math.round(finite(value.charactersCompleted))),
    correctCharacters: Math.max(0, Math.round(finite(value.correctCharacters))),
    correctKeystrokes: Math.max(0, Math.round(finite(value.correctKeystrokes))),
    incorrectKeystrokes: Math.max(0, Math.round(finite(value.incorrectKeystrokes))),
    correctedErrors: Math.max(0, Math.round(finite(value.correctedErrors))),
    unresolvedErrors: Math.max(0, Math.round(finite(value.unresolvedErrors))),
    textId: typeof value.textId === "string" ? value.textId : "",
    seed: typeof value.seed === "string" ? value.seed : "",
    theme: typeof value.theme === "string" && value.theme ? value.theme : "mixed",
    seriesIds: Array.isArray(value.seriesIds) ? value.seriesIds.map(String).slice(0, 12) : [],
  };
}

export function createDefaultFlowRecordsV3() {
  return {
    version: FLOW_RECORDS_V3_VERSION,
    completedRuns: 0,
    eligibleRuns: 0,
    lastPlayedAt: null,
    personalBest: null,
    history: [],
    recordedSessionIds: [],
  };
}

export function sanitizeFlowRecordsV3(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const personalBest = cleanResult(source.personalBest);
  return {
    version: FLOW_RECORDS_V3_VERSION,
    completedRuns: Math.max(0, Math.round(finite(source.completedRuns))),
    eligibleRuns: Math.max(0, Math.round(finite(source.eligibleRuns))),
    lastPlayedAt: source.lastPlayedAt == null ? null : Math.max(0, finite(source.lastPlayedAt)),
    personalBest: personalBest?.recordEligible ? personalBest : null,
    history: (Array.isArray(source.history) ? source.history : [])
      .map(cleanResult)
      .filter(Boolean)
      .slice(0, FLOW_RECORDS_V3_MAX_HISTORY),
    recordedSessionIds: [...new Set(
      (Array.isArray(source.recordedSessionIds) ? source.recordedSessionIds : [])
        .filter((id) => typeof id === "string" && id),
    )].slice(0, FLOW_RECORDS_V3_MAX_SESSION_IDS),
  };
}

export function loadFlowRecordsV3() {
  try {
    const raw = globalThis.localStorage?.getItem(FLOW_RECORDS_V3_STORAGE_KEY);
    return raw ? sanitizeFlowRecordsV3(JSON.parse(raw)) : createDefaultFlowRecordsV3();
  } catch {
    return createDefaultFlowRecordsV3();
  }
}

export function saveFlowRecordsV3(value) {
  const clean = sanitizeFlowRecordsV3(value);
  try {
    globalThis.localStorage?.setItem(FLOW_RECORDS_V3_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Gameplay remains available when storage is unavailable.
  }
  return clean;
}

export function getFlowPersonalBestV3() {
  const best = loadFlowRecordsV3().personalBest;
  return best ? { ...best, seriesIds: [...best.seriesIds] } : null;
}

export function getFlowRecentRunsV3(limit = 5) {
  const safeLimit = Math.max(0, Math.min(FLOW_RECORDS_V3_MAX_HISTORY, Math.round(finite(limit, 5))));
  return loadFlowRecordsV3().history.slice(0, safeLimit).map((item) => ({
    ...item,
    seriesIds: [...item.seriesIds],
  }));
}

export function recordFlowResultV3(result) {
  const clean = cleanResult(result);
  const records = loadFlowRecordsV3();
  if (!clean || !clean.completed || records.recordedSessionIds.includes(clean.sessionId)) {
    return {
      recorded: false,
      isPersonalBest: false,
      previousBest: records.personalBest ? { ...records.personalBest } : null,
      personalBest: records.personalBest ? { ...records.personalBest } : null,
      records,
    };
  }

  const previousBest = records.personalBest;
  const qualifiesAsBest = clean.recordEligible
    && (!previousBest || compareFlowScoreV3Results(clean, previousBest) < 0);

  records.completedRuns += clean.completed ? 1 : 0;
  records.eligibleRuns += clean.recordEligible ? 1 : 0;
  records.lastPlayedAt = clean.endedAt;
  if (qualifiesAsBest) records.personalBest = clean;
  records.history = [
    clean,
    ...records.history.filter((item) => item.sessionId !== clean.sessionId),
  ].slice(0, FLOW_RECORDS_V3_MAX_HISTORY);
  records.recordedSessionIds = [
    clean.sessionId,
    ...records.recordedSessionIds.filter((id) => id !== clean.sessionId),
  ].slice(0, FLOW_RECORDS_V3_MAX_SESSION_IDS);

  const saved = saveFlowRecordsV3(records);
  return {
    recorded: true,
    isPersonalBest: qualifiesAsBest,
    previousBest: previousBest ? { ...previousBest, seriesIds: [...previousBest.seriesIds] } : null,
    personalBest: saved.personalBest ? { ...saved.personalBest, seriesIds: [...saved.personalBest.seriesIds] } : null,
    records: saved,
  };
}

export function resetFlowRecordsV3() {
  const defaults = createDefaultFlowRecordsV3();
  try { globalThis.localStorage?.removeItem(FLOW_RECORDS_V3_STORAGE_KEY); } catch { /* no-op */ }
  return defaults;
}
