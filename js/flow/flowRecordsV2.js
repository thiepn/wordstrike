import { getResilientBrowserStorage } from "../browserStorage.js";
import { compareFlowScoreV2Results } from "./flowScoreV2.js";

export const FLOW_RECORDS_V2_STORAGE_KEY = "wordstrike_flow_records_v2";
export const FLOW_RECORDS_V2_VERSION = 1;
export const FLOW_RECORDS_V2_MAX_HISTORY = 25;
export const FLOW_RECORDS_V2_MAX_SESSION_IDS = 100;

const LENGTHS = Object.freeze(["quick", "standard", "long"]);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function safeLength(value) {
  return LENGTHS.includes(value) ? value : "standard";
}

function cleanResult(value) {
  if (!value || typeof value !== "object") return null;
  const sessionId = typeof value.sessionId === "string" ? value.sessionId : "";
  if (!sessionId) return null;
  return {
    schemaVersion: 1,
    contractVersion: 1,
    rulesVersion: Math.max(1, Math.round(finite(value.rulesVersion, 2))),
    metricVersion: Math.max(1, Math.round(finite(value.metricVersion, 1))),
    modeId: "flow",
    variantId: typeof value.variantId === "string" ? value.variantId : `flow-${safeLength(value.sessionLength)}-v2`,
    boardKey: typeof value.boardKey === "string" ? value.boardKey : "",
    sessionId,
    endedAt: Math.max(0, finite(value.endedAt)),
    sessionLength: safeLength(value.sessionLength),
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
    correctKeystrokes: Math.max(0, Math.round(finite(value.correctKeystrokes))),
    incorrectKeystrokes: Math.max(0, Math.round(finite(value.incorrectKeystrokes))),
    correctedErrors: Math.max(0, Math.round(finite(value.correctedErrors))),
    unresolvedErrors: Math.max(0, Math.round(finite(value.unresolvedErrors))),
    textId: typeof value.textId === "string" ? value.textId : "",
    seed: typeof value.seed === "string" ? value.seed : "",
    seriesIds: Array.isArray(value.seriesIds) ? value.seriesIds.map(String).slice(0, 4) : [],
  };
}

function emptyBestByLength() {
  return { quick: null, standard: null, long: null };
}

export function createDefaultFlowRecordsV2() {
  return {
    version: FLOW_RECORDS_V2_VERSION,
    completedRuns: 0,
    eligibleRuns: 0,
    lastPlayedAt: null,
    bestByLength: emptyBestByLength(),
    history: [],
    recordedSessionIds: [],
  };
}

export function sanitizeFlowRecordsV2(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const bestSource = source.bestByLength && typeof source.bestByLength === "object"
    ? source.bestByLength
    : {};
  const bestByLength = emptyBestByLength();
  for (const length of LENGTHS) {
    const record = cleanResult(bestSource[length]);
    bestByLength[length] = record?.recordEligible && record.sessionLength === length ? record : null;
  }
  return {
    version: FLOW_RECORDS_V2_VERSION,
    completedRuns: Math.max(0, Math.round(finite(source.completedRuns))),
    eligibleRuns: Math.max(0, Math.round(finite(source.eligibleRuns))),
    lastPlayedAt: source.lastPlayedAt == null ? null : Math.max(0, finite(source.lastPlayedAt)),
    bestByLength,
    history: (Array.isArray(source.history) ? source.history : [])
      .map(cleanResult)
      .filter(Boolean)
      .slice(0, FLOW_RECORDS_V2_MAX_HISTORY),
    recordedSessionIds: [...new Set(
      (Array.isArray(source.recordedSessionIds) ? source.recordedSessionIds : [])
        .filter((id) => typeof id === "string" && id),
    )].slice(0, FLOW_RECORDS_V2_MAX_SESSION_IDS),
  };
}

export function loadFlowRecordsV2() {
  try {
    const raw = getResilientBrowserStorage()?.getItem(FLOW_RECORDS_V2_STORAGE_KEY);
    return raw ? sanitizeFlowRecordsV2(JSON.parse(raw)) : createDefaultFlowRecordsV2();
  } catch {
    return createDefaultFlowRecordsV2();
  }
}

export function saveFlowRecordsV2(value) {
  const clean = sanitizeFlowRecordsV2(value);
  try {
    getResilientBrowserStorage()?.setItem(FLOW_RECORDS_V2_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Local records are best-effort; gameplay/results remain available if storage is full.
  }
  return clean;
}

export function getFlowPersonalBestV2(sessionLength) {
  const length = safeLength(sessionLength);
  const record = loadFlowRecordsV2().bestByLength[length];
  return record ? { ...record, seriesIds: [...record.seriesIds] } : null;
}

export function getFlowRecentRunsV2(limit = 5) {
  const safeLimit = Math.max(0, Math.min(FLOW_RECORDS_V2_MAX_HISTORY, Math.round(finite(limit, 5))));
  return loadFlowRecordsV2().history.slice(0, safeLimit).map((item) => ({
    ...item,
    seriesIds: [...item.seriesIds],
  }));
}

export function recordFlowResultV2(result) {
  const clean = cleanResult(result);
  const records = loadFlowRecordsV2();
  if (!clean || records.recordedSessionIds.includes(clean.sessionId)) {
    const currentBest = clean ? records.bestByLength[safeLength(clean.sessionLength)] : null;
    return {
      recorded: false,
      isPersonalBest: false,
      previousBest: currentBest ? { ...currentBest } : null,
      personalBest: currentBest ? { ...currentBest } : null,
      records,
    };
  }

  const length = clean.sessionLength;
  const previousBest = records.bestByLength[length];
  const qualifiesAsBest = clean.recordEligible
    && (!previousBest || compareFlowScoreV2Results(clean, previousBest) < 0);

  records.completedRuns += clean.completed ? 1 : 0;
  records.eligibleRuns += clean.recordEligible ? 1 : 0;
  records.lastPlayedAt = clean.endedAt;
  if (qualifiesAsBest) records.bestByLength[length] = clean;
  records.history = [
    clean,
    ...records.history.filter((item) => item.sessionId !== clean.sessionId),
  ].slice(0, FLOW_RECORDS_V2_MAX_HISTORY);
  records.recordedSessionIds = [
    clean.sessionId,
    ...records.recordedSessionIds.filter((id) => id !== clean.sessionId),
  ].slice(0, FLOW_RECORDS_V2_MAX_SESSION_IDS);

  const saved = saveFlowRecordsV2(records);
  const personalBest = saved.bestByLength[length];
  return {
    recorded: true,
    isPersonalBest: qualifiesAsBest,
    previousBest: previousBest ? { ...previousBest, seriesIds: [...previousBest.seriesIds] } : null,
    personalBest: personalBest ? { ...personalBest, seriesIds: [...personalBest.seriesIds] } : null,
    records: saved,
  };
}

export function resetFlowRecordsV2() {
  const defaults = createDefaultFlowRecordsV2();
  try { getResilientBrowserStorage()?.removeItem(FLOW_RECORDS_V2_STORAGE_KEY); } catch { /* no-op */ }
  return defaults;
}
