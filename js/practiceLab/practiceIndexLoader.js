import {
  PRACTICE_INDEX_ERROR_CODES,
  PRACTICE_INDEX_LIMITS,
  PRACTICE_INDEX_REVERSE_PARTITIONS,
} from "./practiceIndexConstants.js";
import {
  derivePracticeIndexShardId,
  getPracticeIndexShardPath,
} from "./practiceIndexSharding.js";
import {
  assertPracticeIndexArtifact,
  validatePracticeIndexArtifact,
  validatePracticeIndexManifest,
} from "./practiceIndexValidation.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function loaderError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

async function defaultSha256Text(value) {
  if (!globalThis.crypto?.subtle) throw loaderError(PRACTICE_INDEX_ERROR_CODES.ARTIFACT_CHECKSUM_MISMATCH, "Web Crypto is unavailable for Practice index integrity validation");
  const bytes = new TextEncoder().encode(String(value));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return `sha256-${[...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl ?? "data/practice/indexes").replace(/\/+$/u, "");
  if (!value || /:\/\//u.test(value)) throw new TypeError("Practice index loader baseUrl must be a WordStrike-controlled relative/static path");
  return value;
}

export function createPracticeIndexLoader({
  fetchImpl = globalThis.fetch,
  baseUrl = "data/practice/indexes",
  maxCacheEntries = PRACTICE_INDEX_LIMITS.cacheEntries,
  hashText = defaultSha256Text,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Practice index loader requires fetchImpl");
  if (!Number.isInteger(maxCacheEntries) || maxCacheEntries < 1 || maxCacheEntries > 128) throw new TypeError("Practice index loader cache bound is invalid");
  if (typeof hashText !== "function") throw new TypeError("Practice index loader requires a SHA-256 hash function");
  const root = normalizeBaseUrl(baseUrl);
  const cache = new Map();
  const inFlight = new Map();

  const touch = (key, value) => {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value);
    return value;
  };

  const loadText = async (url, cacheKey) => {
    if (cache.has(cacheKey)) return touch(cacheKey, cache.get(cacheKey));
    if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);
    const promise = (async () => {
      const response = await fetchImpl(url);
      if (!response?.ok) throw loaderError(PRACTICE_INDEX_ERROR_CODES.INDEX_NOT_FOUND, `Practice index asset was not found: ${url}`, { status: response?.status ?? null });
      const text = await response.text();
      return touch(cacheKey, text);
    })();
    inFlight.set(cacheKey, promise);
    try { return await promise; } finally { inFlight.delete(cacheKey); }
  };

  const loadManifest = async ({ language, corpusVersion } = {}) => {
    if (typeof language !== "string" || !Number.isInteger(corpusVersion) || corpusVersion < 1) throw new TypeError("Practice index manifest lookup requires language and corpusVersion");
    const relativeRoot = `${language}-v${corpusVersion}`;
    const cacheKey = `manifest|${relativeRoot}`;
    const text = await loadText(`${root}/${relativeRoot}/manifest.json`, cacheKey);
    let manifest;
    try { manifest = JSON.parse(text); } catch { throw loaderError(PRACTICE_INDEX_ERROR_CODES.SHARD_INVALID, "Practice index manifest is not valid JSON"); }
    const validation = validatePracticeIndexManifest(manifest);
    if (!validation.valid) throw loaderError(PRACTICE_INDEX_ERROR_CODES.INDEX_VERSION_MISMATCH, "Practice index manifest failed validation", validation.errors);
    return freezeDeep(manifest);
  };

  const loadArtifact = async ({ manifest, relativePath, partition, indexType, shardId = null } = {}) => {
    const inventory = manifest?.artifactChecksums?.find((entry) => entry.path === relativePath);
    if (!inventory) throw loaderError(PRACTICE_INDEX_ERROR_CODES.INDEX_NOT_FOUND, `Practice index manifest does not declare ${relativePath}`);
    const cacheKey = [manifest.corpusId, manifest.corpusVersion, manifest.indexSchemaVersion, manifest.indexGeneratorVersion, partition, indexType, shardId ?? "content"].join("|");
    const text = await loadText(`${root}/${manifest.language}-v${manifest.corpusVersion}/${relativePath}`, cacheKey);
    const actualHash = await hashText(text);
    if (actualHash !== inventory.sha256) {
      cache.delete(cacheKey);
      throw loaderError(PRACTICE_INDEX_ERROR_CODES.ARTIFACT_CHECKSUM_MISMATCH, "Practice index artifact checksum does not match manifest", { path: relativePath, partition, indexType, shardId });
    }
    let artifact;
    try { artifact = JSON.parse(text); } catch { cache.delete(cacheKey); throw loaderError(PRACTICE_INDEX_ERROR_CODES.SHARD_INVALID, "Practice index artifact is not valid JSON", { path: relativePath }); }
    const validation = validatePracticeIndexArtifact(artifact, { manifest, expectedPartition: partition, expectedIndexType: indexType, expectedShardId: shardId });
    try { assertPracticeIndexArtifact(validation, relativePath); } catch (cause) { cache.delete(cacheKey); throw cause; }
    const frozen = freezeDeep(artifact);
    touch(cacheKey, text); // raw integrity cache remains bounded; parsed objects are returned immutable and not persisted.
    return frozen;
  };

  const loadContentIndex = ({ manifest, partition }) => loadArtifact({ manifest, relativePath: `${partition}/content.json`, partition, indexType: "content" });

  const loadAnnotationShard = ({ manifest, partition, contentId }) => {
    const shardId = derivePracticeIndexShardId({ indexType: "annotations", entityType: "content", entityKey: contentId });
    const declared = manifest.generatedPartitions?.[partition]?.annotationShards ?? [];
    if (!declared.includes(shardId)) return Promise.resolve(null);
    return loadArtifact({ manifest, relativePath: getPracticeIndexShardPath({ partition, indexType: "annotations", shardId }), partition, indexType: "annotations", shardId });
  };

  const loadTargetShard = ({ manifest, partition, entityType, entityKey }) => {
    if (!PRACTICE_INDEX_REVERSE_PARTITIONS.includes(partition)) throw loaderError(PRACTICE_INDEX_ERROR_CODES.PROTECTED_REVERSE_LOOKUP, `Target-driven lookup is forbidden for protected partition ${partition}`, { partition, entityType, entityKey });
    const indexType = entityType === "word" ? "words" : "targets";
    const lookupType = entityType === "word" ? "word" : entityType;
    const shardId = derivePracticeIndexShardId({ indexType, entityType: lookupType, entityKey });
    const field = indexType === "words" ? "wordShards" : "targetShards";
    const declared = manifest.generatedPartitions?.[partition]?.[field] ?? [];
    if (!declared.includes(shardId)) return Promise.resolve(null);
    return loadArtifact({ manifest, relativePath: getPracticeIndexShardPath({ partition, indexType, shardId }), partition, indexType, shardId });
  };

  return Object.freeze({
    loadManifest,
    loadContentIndex,
    loadAnnotationShard,
    loadTargetShard,
    clear() { cache.clear(); inFlight.clear(); },
    getCacheSize() { return cache.size; },
  });
}
