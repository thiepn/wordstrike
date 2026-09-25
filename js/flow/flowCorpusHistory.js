import { getResilientBrowserStorage } from "../browserStorage.js";

const STORAGE_KEY = "wordstrike:flow-corpus-v2-history";
const SCHEMA_VERSION = 1;
const MAX_RECENT_DOCUMENTS = 30;
const MAX_RECENT_EXCERPTS = 60;
const MAX_RECENT_RUNS = 20;

function emptyHistory() {
  return {
    schemaVersion: SCHEMA_VERSION,
    recentDocumentIds: [],
    recentExcerptIds: [],
    recentRuns: [],
  };
}

function dedupe(values, limit) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function resolveStorage(storage) {
  return storage || getResilientBrowserStorage();
}

export function normalizeFlowCorpusHistory(value) {
  const source = value && typeof value === "object" ? value : {};
  const recentRuns = Array.isArray(source.recentRuns)
    ? source.recentRuns
        .filter((run) => run && typeof run === "object")
        .slice(0, MAX_RECENT_RUNS)
        .map((run) => Object.freeze({
          planId: String(run.planId || ""),
          completedAt: Number.isFinite(Number(run.completedAt)) ? Number(run.completedAt) : 0,
          documentIds: Object.freeze(dedupe(run.documentIds || [], MAX_RECENT_DOCUMENTS)),
          excerptIds: Object.freeze(dedupe(run.excerptIds || [], MAX_RECENT_EXCERPTS)),
        }))
    : [];

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    recentDocumentIds: Object.freeze(dedupe(source.recentDocumentIds || [], MAX_RECENT_DOCUMENTS)),
    recentExcerptIds: Object.freeze(dedupe(source.recentExcerptIds || [], MAX_RECENT_EXCERPTS)),
    recentRuns: Object.freeze(recentRuns),
  });
}

export function loadFlowCorpusHistory(storage = null) {
  const target = resolveStorage(storage);
  if (!target?.getItem) return normalizeFlowCorpusHistory(emptyHistory());
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return normalizeFlowCorpusHistory(emptyHistory());
    return normalizeFlowCorpusHistory(JSON.parse(raw));
  } catch {
    return normalizeFlowCorpusHistory(emptyHistory());
  }
}

export function saveFlowCorpusHistory(history, storage = null) {
  const normalized = normalizeFlowCorpusHistory(history);
  const target = resolveStorage(storage);
  if (!target?.setItem) return normalized;
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Flow remains fully playable if private browsing or quota rules block storage.
  }
  return normalized;
}

export function recordFlowCorpusRun(plan, {
  storage = null,
  completedAt = Date.now(),
} = {}) {
  if (!plan || plan.corpusVersion !== 2 || !Array.isArray(plan.documents)) {
    return loadFlowCorpusHistory(storage);
  }

  const documentIds = dedupe(
    plan.documents.map((document) => document.documentId || document.seriesId || document.id),
    MAX_RECENT_DOCUMENTS,
  );
  const excerptIds = dedupe(
    plan.documents.map((document) => document.excerptId),
    MAX_RECENT_EXCERPTS,
  );
  const current = loadFlowCorpusHistory(storage);
  const next = {
    schemaVersion: SCHEMA_VERSION,
    recentDocumentIds: dedupe([...documentIds, ...current.recentDocumentIds], MAX_RECENT_DOCUMENTS),
    recentExcerptIds: dedupe([...excerptIds, ...current.recentExcerptIds], MAX_RECENT_EXCERPTS),
    recentRuns: [
      {
        planId: String(plan.id || ""),
        completedAt: Number.isFinite(Number(completedAt)) ? Number(completedAt) : Date.now(),
        documentIds,
        excerptIds,
      },
      ...current.recentRuns,
    ].slice(0, MAX_RECENT_RUNS),
  };
  return saveFlowCorpusHistory(next, storage);
}

export function clearFlowCorpusHistory(storage = null) {
  const target = resolveStorage(storage);
  try {
    target?.removeItem?.(STORAGE_KEY);
  } catch {
    // Ignore storage failures; callers still receive a clean in-memory state.
  }
  return normalizeFlowCorpusHistory(emptyHistory());
}

export const FLOW_CORPUS_HISTORY_LIMITS = Object.freeze({
  documents: MAX_RECENT_DOCUMENTS,
  excerpts: MAX_RECENT_EXCERPTS,
  runs: MAX_RECENT_RUNS,
});

export { STORAGE_KEY as FLOW_CORPUS_HISTORY_STORAGE_KEY };
