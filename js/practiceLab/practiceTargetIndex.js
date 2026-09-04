import { assertPracticeContentUse } from "./practiceCorpusUseGuard.js";
import {
  PRACTICE_INDEX_ERROR_CODES,
  PRACTICE_INDEX_RAW_TARGET_TYPES,
  PRACTICE_INDEX_REVERSE_PARTITIONS,
} from "./practiceIndexConstants.js";
import { normalizePracticeTarget, verifyPracticeContentAnnotations } from "./practiceTextAnalysis.js";
import { assertPracticeIndexCompatibility } from "./practiceIndexValidation.js";

function queryError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function assertPurpose(partition, purpose, contentId = null) {
  return assertPracticeContentUse({ item: { partition, contentId }, purpose });
}

function assertReversePartition(partition, purpose, entityType, entityKey) {
  assertPurpose(partition, purpose);
  if (!PRACTICE_INDEX_REVERSE_PARTITIONS.includes(partition)) throw queryError(PRACTICE_INDEX_ERROR_CODES.PROTECTED_REVERSE_LOOKUP, `Target-driven Practice selection is forbidden for ${partition}`, { partition, entityType, entityKey });
}

function findEntry(shard, entityType, entityKey) {
  if (!shard) return null;
  if (entityType === "word") return shard.entries.find((entry) => entry.lexicalKey === entityKey) ?? null;
  return shard.entries.find((entry) => entry.entityType === entityType && entry.entityKey === entityKey) ?? null;
}

export function intersectPracticeContentRefs(...groups) {
  if (!groups.length) return Object.freeze([]);
  const normalized = groups.map((group) => new Map((group ?? []).map((ref) => [ref.contentId, ref])));
  const ids = [...normalized[0].keys()].filter((id) => normalized.every((map) => map.has(id))).sort();
  return Object.freeze(ids.map((id) => Object.freeze({ ...normalized[0].get(id) })));
}

export function unionPracticeContentRefs(...groups) {
  const byId = new Map();
  for (const group of groups) for (const ref of group ?? []) if (!byId.has(ref.contentId)) byId.set(ref.contentId, ref);
  return Object.freeze([...byId.values()].sort((a, b) => a.contentId.localeCompare(b.contentId)).map((ref) => Object.freeze({ ...ref })));
}

export function createPracticeTargetIndex({ loader, corpusManifest, indexManifest } = {}) {
  if (!loader || typeof loader.loadTargetShard !== "function" || typeof loader.loadAnnotationShard !== "function") throw new TypeError("Practice target index requires a loader");
  assertPracticeIndexCompatibility({ indexManifest, corpusManifest });

  const getTargetSummary = async ({ partition, entityType, entityKey, purpose } = {}) => {
    const normalized = normalizePracticeTarget({ entityType, entityKey, language: indexManifest.language });
    assertReversePartition(partition, purpose, entityType, normalized);
    const shard = await loader.loadTargetShard({ manifest: indexManifest, partition, entityType, entityKey: normalized });
    return findEntry(shard, entityType, normalized);
  };

  const getTargetContentRefs = async (query) => {
    const entry = await getTargetSummary(query);
    return entry?.contents ?? Object.freeze([]);
  };

  const getTargetWordRefs = async (query) => {
    const entry = await getTargetSummary(query);
    if (!entry) return Object.freeze([]);
    if (query.entityType === "word") return Object.freeze([entry.lexicalKey]);
    if (!PRACTICE_INDEX_RAW_TARGET_TYPES.includes(query.entityType)) return Object.freeze([]);
    return entry.wordKeys ?? Object.freeze([]);
  };

  const getWordSummary = ({ partition, lexicalKey, purpose }) => getTargetSummary({ partition, entityType: "word", entityKey: lexicalKey, purpose });

  const getContentAnnotations = async ({ partition, contentId, purpose, content = null } = {}) => {
    if (typeof contentId !== "string" || !contentId) throw new TypeError("Practice annotation lookup requires contentId");
    assertPurpose(partition, purpose, contentId);
    const shard = await loader.loadAnnotationShard({ manifest: indexManifest, partition, contentId });
    const annotation = shard?.records.find((record) => record.contentId === contentId) ?? null;
    if (!annotation) throw queryError(PRACTICE_INDEX_ERROR_CODES.CONTENT_NOT_FOUND, `Practice content annotations not found for ${contentId}`, { partition, contentId });
    if (content) verifyPracticeContentAnnotations({ annotation, text: content.text, contentHash: content.contentHash });
    return annotation;
  };

  const getContentSummary = async ({ partition, contentId, purpose } = {}) => {
    assertPurpose(partition, purpose, contentId);
    const index = await loader.loadContentIndex({ manifest: indexManifest, partition });
    const summary = index.items.find((item) => item.contentId === contentId) ?? null;
    if (!summary) throw queryError(PRACTICE_INDEX_ERROR_CODES.CONTENT_NOT_FOUND, `Practice content summary not found for ${contentId}`, { partition, contentId });
    return summary;
  };

  return Object.freeze({
    getTargetSummary,
    getTargetContentRefs,
    getTargetWordRefs,
    getWordSummary,
    getContentAnnotations,
    getContentSummary,
  });
}
