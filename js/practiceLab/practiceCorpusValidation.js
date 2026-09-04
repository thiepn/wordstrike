import {
  PRACTICE_CORPUS_ARTIFACT_VERSION,
  PRACTICE_CORPUS_CONTENT_TYPES,
  PRACTICE_CORPUS_ID_PATTERN,
  PRACTICE_CORPUS_LIMITS,
  PRACTICE_CORPUS_MANIFEST_VERSION,
  PRACTICE_CORPUS_PARTITIONS,
  PRACTICE_CORPUS_REVIEW_STATUSES,
  PRACTICE_CORPUS_SCHEMA_VERSION,
  PRACTICE_CORPUS_SHA256_PATTERN,
  PRACTICE_CORPUS_SOURCE_REGISTRY_VERSION,
  PRACTICE_CORPUS_SOURCE_TYPES,
  PRACTICE_CORPUS_STATUSES,
  PRACTICE_CORPUS_USAGE_APPROVALS,
} from "./practiceCorpusConstants.js";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const FORBIDDEN_METADATA_KEYS = new Set(["html", "script", "style", "callback"]);
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const RAW_HTML = /<\/?[A-Za-z][^>]*>/u;
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+/iu;
const EMAIL_LIKE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const textLimit = Object.freeze({
  word: PRACTICE_CORPUS_LIMITS.wordCharacters,
  phrase: PRACTICE_CORPUS_LIMITS.phraseCharacters,
  sentence: PRACTICE_CORPUS_LIMITS.sentenceCharacters,
  passage: PRACTICE_CORPUS_LIMITS.passageCharacters,
  probe: PRACTICE_CORPUS_LIMITS.probeCharacters,
});

function result(errors) {
  return { valid: errors.length === 0, errors };
}

function add(errors, path, code, message) {
  errors.push({ path, code, message });
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidId(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= PRACTICE_CORPUS_LIMITS.idLength
    && PRACTICE_CORPUS_ID_PATTERN.test(value);
}

function validateId(errors, value, path) {
  if (!isValidId(value)) add(errors, path, "INVALID_ID", `${path} must be a bounded machine-safe identifier`);
}

function validatePositiveVersion(errors, value, path, expected = null) {
  if (!Number.isInteger(value) || value < 1) add(errors, path, "INVALID_VERSION", `${path} must be a positive integer`);
  else if (expected != null && value !== expected) add(errors, path, "UNSUPPORTED_VERSION", `${path} must equal ${expected}`);
}

function validateSha(errors, value, path, { nullable = false } = {}) {
  if (value == null && nullable) return;
  if (typeof value !== "string" || !PRACTICE_CORPUS_SHA256_PATTERN.test(value)) {
    add(errors, path, "INVALID_SHA256", `${path} must be a sha256- prefixed lowercase SHA-256 digest`);
  }
}

function serializedBytes(value) {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
  catch { return Infinity; }
}

export function validatePracticeCorpusJsonSafe(value, {
  path = "value",
  maxDepth = 8,
  maxBytes = PRACTICE_CORPUS_LIMITS.metadataBytes,
} = {}) {
  const errors = [];
  const seen = new Set();
  const visit = (entry, currentPath, depth) => {
    if (depth > maxDepth) return add(errors, currentPath, "MAX_DEPTH", `${currentPath} exceeds maximum nesting depth`);
    if (entry == null || typeof entry === "string" || typeof entry === "boolean") return;
    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) add(errors, currentPath, "NON_FINITE", `${currentPath} must be finite`);
      return;
    }
    if (typeof entry !== "object") return add(errors, currentPath, "UNSERIALIZABLE", `${currentPath} is not JSON-safe`);
    if (seen.has(entry)) return add(errors, currentPath, "CYCLIC", `${currentPath} contains a cycle`);
    if (!Array.isArray(entry) && !isPlainObject(entry)) return add(errors, currentPath, "NON_PLAIN_OBJECT", `${currentPath} must contain only plain objects`);
    seen.add(entry);
    if (Array.isArray(entry)) entry.forEach((child, index) => visit(child, `${currentPath}[${index}]`, depth + 1));
    else Object.entries(entry).forEach(([key, child]) => {
      if (UNSAFE_KEYS.has(key)) add(errors, `${currentPath}.${key}`, "UNSAFE_KEY", `${currentPath} contains a prototype-sensitive key`);
      else visit(child, `${currentPath}.${key}`, depth + 1);
    });
    seen.delete(entry);
  };
  visit(value, path, 0);
  if (serializedBytes(value) > maxBytes) add(errors, path, "SERIALIZED_SIZE", `${path} exceeds its serialized-size limit`);
  return result(errors);
}

function containsUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) return true;
  }
  return false;
}

export function normalizePracticeCorpusText(value, {
  contentType = "sentence",
  allowUrls = false,
  allowEmails = false,
} = {}) {
  if (typeof value !== "string") throw new TypeError("Practice corpus text must be a string");
  if (!PRACTICE_CORPUS_CONTENT_TYPES.includes(contentType)) throw new TypeError("Practice corpus contentType is invalid");
  if (containsUnpairedSurrogate(value)) throw new TypeError("Practice corpus text contains unpaired surrogate data");
  let normalized = value.replace(/\r\n?/g, "\n").normalize("NFC").trim();
  if (!normalized) throw new TypeError("Practice corpus text must not be empty");
  if (normalized.includes("\0")) throw new TypeError("Practice corpus text contains a null byte");
  if (BIDI_CONTROLS.test(normalized)) throw new TypeError("Practice corpus text contains disallowed bidi controls");
  if (contentType !== "passage" && normalized.includes("\n")) throw new TypeError(`${contentType} corpus text may not contain newlines`);
  for (const character of normalized) {
    const code = character.codePointAt(0);
    const allowedNewline = character === "\n" && contentType === "passage";
    if (!allowedNewline && ((code >= 0x00 && code <= 0x1F) || (code >= 0x7F && code <= 0x9F))) {
      throw new TypeError("Practice corpus text contains unsafe control characters");
    }
  }
  if (RAW_HTML.test(normalized)) throw new TypeError("Practice corpus text may not require raw HTML rendering");
  if (!allowUrls && URL_LIKE.test(normalized)) throw new TypeError("Practice corpus text contains a URL excluded by corpus policy");
  if (!allowEmails && EMAIL_LIKE.test(normalized)) throw new TypeError("Practice corpus text contains an email excluded by corpus policy");
  const maximum = textLimit[contentType];
  if ([...normalized].length > maximum) throw new TypeError(`Practice ${contentType} text exceeds ${maximum} Unicode code points`);
  if (contentType === "word" && /\s/u.test(normalized)) throw new TypeError("Practice word content may not contain whitespace");
  return normalized;
}

function validateMetadata(errors, metadata, path = "metadata") {
  if (!isPlainObject(metadata)) return add(errors, path, "INVALID_METADATA", `${path} must be a plain object`);
  const safe = validatePracticeCorpusJsonSafe(metadata, { path, maxBytes: PRACTICE_CORPUS_LIMITS.metadataBytes });
  errors.push(...safe.errors);
  for (const key of Object.keys(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) add(errors, `${path}.${key}`, "FORBIDDEN_FIELD", `${key} is not allowed in corpus metadata`);
  }
  if (metadata.tags != null) {
    if (!Array.isArray(metadata.tags) || metadata.tags.length > PRACTICE_CORPUS_LIMITS.tags
      || metadata.tags.some((tag) => typeof tag !== "string" || !tag || tag.length > PRACTICE_CORPUS_LIMITS.tagLength)) {
      add(errors, `${path}.tags`, "INVALID_TAGS", "metadata.tags must be a bounded non-empty string array");
    }
  }
}

export function validatePracticeCorpusSource(source) {
  const errors = [];
  if (!isPlainObject(source)) return result([{ path: "source", code: "INVALID_TYPE", message: "source must be an object" }]);
  validateId(errors, source.sourceId, "sourceId");
  if (typeof source.title !== "string" || !source.title.trim() || source.title.length > PRACTICE_CORPUS_LIMITS.sourceTitleLength) add(errors, "title", "INVALID_TITLE", "source title is invalid");
  if (!PRACTICE_CORPUS_SOURCE_TYPES.includes(source.sourceType)) add(errors, "sourceType", "INVALID_ENUM", "sourceType is not canonical");
  if (!PRACTICE_CORPUS_USAGE_APPROVALS.includes(source.usageApproval)) add(errors, "usageApproval", "INVALID_ENUM", "usageApproval is not canonical");
  if (source.upstream != null && (typeof source.upstream !== "string" || source.upstream.length > 1000)) add(errors, "upstream", "INVALID_UPSTREAM", "upstream must be null or a bounded string");
  if (source.retrievedAt != null && (typeof source.retrievedAt !== "string" || !UTC_ISO.test(source.retrievedAt))) add(errors, "retrievedAt", "INVALID_TIMESTAMP", "retrievedAt must be null or canonical UTC ISO time");
  validateSha(errors, source.sourceChecksum, "sourceChecksum", { nullable: true });
  if (source.snapshotPath != null && (typeof source.snapshotPath !== "string" || !source.snapshotPath || source.snapshotPath.length > 300 || source.snapshotPath.includes("..") || source.snapshotPath.startsWith("/"))) add(errors, "snapshotPath", "INVALID_PATH", "snapshotPath must remain inside data/practice");
  if (!isPlainObject(source.license)) add(errors, "license", "INVALID_LICENSE_METADATA", "license must be explicit content-license metadata");
  else {
    if (typeof source.license.name !== "string" || !source.license.name.trim() || source.license.name.length > 200) add(errors, "license.name", "INVALID_LICENSE_METADATA", "license.name is required");
    for (const key of ["spdx", "url", "notes"]) if (source.license[key] != null && (typeof source.license[key] !== "string" || source.license[key].length > 1000)) add(errors, `license.${key}`, "INVALID_LICENSE_METADATA", `${key} must be null or a bounded string`);
    if (typeof source.license.attributionRequired !== "boolean") add(errors, "license.attributionRequired", "INVALID_LICENSE_METADATA", "attributionRequired must be boolean");
  }
  if (source.notes != null && (typeof source.notes !== "string" || source.notes.length > PRACTICE_CORPUS_LIMITS.notesLength)) add(errors, "notes", "INVALID_NOTES", "source notes exceed their limit");
  const safe = validatePracticeCorpusJsonSafe(source, { path: "source", maxBytes: 16 * 1024 });
  errors.push(...safe.errors);
  return result(errors);
}

export function validatePracticeCorpusSourceRegistry(registry) {
  const errors = [];
  if (!isPlainObject(registry)) return result([{ path: "registry", code: "INVALID_TYPE", message: "source registry must be an object" }]);
  validatePositiveVersion(errors, registry.registryVersion, "registryVersion", PRACTICE_CORPUS_SOURCE_REGISTRY_VERSION);
  if (!Array.isArray(registry.sources)) add(errors, "sources", "INVALID_ARRAY", "sources must be an array");
  else {
    const ids = new Set();
    registry.sources.forEach((source, index) => {
      const validation = validatePracticeCorpusSource(source);
      errors.push(...validation.errors.map((entry) => ({ ...entry, path: `sources[${index}].${entry.path}` })));
      if (isValidId(source?.sourceId)) {
        if (ids.has(source.sourceId)) add(errors, `sources[${index}].sourceId`, "DUPLICATE_ID", `duplicate sourceId ${source.sourceId}`);
        ids.add(source.sourceId);
      }
    });
  }
  return result(errors);
}

export function validatePracticeCorpusContentRecord(item, { hashText = null } = {}) {
  const errors = [];
  if (!isPlainObject(item)) return result([{ path: "content", code: "INVALID_TYPE", message: "content item must be an object" }]);
  validateId(errors, item.contentId, "contentId");
  validateId(errors, item.familyId, "familyId");
  validateId(errors, item.sourceId, "sourceId");
  if (typeof item.language !== "string" || !/^[a-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(item.language)) add(errors, "language", "INVALID_LANGUAGE", "language must be a bounded language tag");
  validatePositiveVersion(errors, item.corpusVersion, "corpusVersion");
  if (!PRACTICE_CORPUS_PARTITIONS.includes(item.partition)) add(errors, "partition", "INVALID_PARTITION", "partition is not canonical");
  if (!PRACTICE_CORPUS_CONTENT_TYPES.includes(item.contentType)) add(errors, "contentType", "INVALID_ENUM", "contentType is not canonical");
  if (!PRACTICE_CORPUS_REVIEW_STATUSES.includes(item.reviewStatus)) add(errors, "reviewStatus", "INVALID_ENUM", "reviewStatus is not canonical");
  let normalized = null;
  try {
    normalized = normalizePracticeCorpusText(item.text, { contentType: item.contentType });
    if (normalized !== item.text) add(errors, "text", "NOT_NORMALIZED", "content text must already be canonical NFC/whitespace normalized text");
  } catch (cause) {
    add(errors, "text", "INVALID_TEXT", cause.message);
  }
  validateSha(errors, item.contentHash, "contentHash");
  if (normalized && typeof hashText === "function") {
    const expected = hashText(normalized);
    if (item.contentHash !== expected) add(errors, "contentHash", "HASH_MISMATCH", "contentHash does not match canonical normalized text");
  }
  validateMetadata(errors, item.metadata ?? {}, "metadata");
  return result(errors);
}

function validatePartitionCounts(errors, counts, path) {
  if (!isPlainObject(counts)) return add(errors, path, "INVALID_COUNTS", `${path} must be an object`);
  for (const partition of PRACTICE_CORPUS_PARTITIONS) {
    if (!Number.isInteger(counts[partition]) || counts[partition] < 0) add(errors, `${path}.${partition}`, "INVALID_COUNT", "partition count must be a non-negative integer");
  }
  for (const key of Object.keys(counts)) if (!PRACTICE_CORPUS_PARTITIONS.includes(key)) add(errors, `${path}.${key}`, "UNKNOWN_PARTITION", "count object contains an unknown partition");
}

export function validatePracticeCorpusManifest(manifest) {
  const errors = [];
  if (!isPlainObject(manifest)) return result([{ path: "manifest", code: "INVALID_TYPE", message: "manifest must be an object" }]);
  validatePositiveVersion(errors, manifest.manifestVersion, "manifestVersion", PRACTICE_CORPUS_MANIFEST_VERSION);
  validatePositiveVersion(errors, manifest.corpusSchemaVersion, "corpusSchemaVersion", PRACTICE_CORPUS_SCHEMA_VERSION);
  validateId(errors, manifest.corpusId, "corpusId");
  if (typeof manifest.language !== "string" || !/^[a-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(manifest.language)) add(errors, "language", "INVALID_LANGUAGE", "manifest language is invalid");
  validatePositiveVersion(errors, manifest.corpusVersion, "corpusVersion");
  validatePositiveVersion(errors, manifest.partitionPolicyVersion, "partitionPolicyVersion");
  if (typeof manifest.createdAt !== "string" || !UTC_ISO.test(manifest.createdAt)) add(errors, "createdAt", "INVALID_TIMESTAMP", "createdAt must be canonical UTC ISO time");
  if (!PRACTICE_CORPUS_STATUSES.includes(manifest.status)) add(errors, "status", "INVALID_STATUS", "corpus status is not canonical");
  if (!Array.isArray(manifest.sourceIds) || manifest.sourceIds.length > PRACTICE_CORPUS_LIMITS.manifestSources) add(errors, "sourceIds", "INVALID_ARRAY", "sourceIds must be a bounded array");
  else {
    const unique = new Set();
    manifest.sourceIds.forEach((id, index) => {
      validateId(errors, id, `sourceIds[${index}]`);
      if (unique.has(id)) add(errors, `sourceIds[${index}]`, "DUPLICATE_ID", "sourceIds must be unique");
      unique.add(id);
    });
  }
  validatePartitionCounts(errors, manifest.partitionCounts, "partitionCounts");
  if (!isPlainObject(manifest.familyCounts) || !Number.isInteger(manifest.familyCounts.total) || manifest.familyCounts.total < 0) add(errors, "familyCounts", "INVALID_COUNTS", "familyCounts.total is invalid");
  else validatePartitionCounts(errors, manifest.familyCounts.byPartition, "familyCounts.byPartition");
  if (!isPlainObject(manifest.contentCounts) || !Number.isInteger(manifest.contentCounts.total) || manifest.contentCounts.total < 0) add(errors, "contentCounts", "INVALID_COUNTS", "contentCounts.total is invalid");
  else validatePartitionCounts(errors, manifest.contentCounts.byPartition, "contentCounts.byPartition");
  if (!Array.isArray(manifest.familyAssignments) || manifest.familyAssignments.length > PRACTICE_CORPUS_LIMITS.manifestFamilies) add(errors, "familyAssignments", "INVALID_ARRAY", "familyAssignments must be a bounded array");
  else {
    const families = new Set();
    manifest.familyAssignments.forEach((assignment, index) => {
      const path = `familyAssignments[${index}]`;
      if (!isPlainObject(assignment)) return add(errors, path, "INVALID_ASSIGNMENT", "family assignment must be an object");
      validateId(errors, assignment.familyId, `${path}.familyId`);
      if (!PRACTICE_CORPUS_PARTITIONS.includes(assignment.partition)) add(errors, `${path}.partition`, "INVALID_PARTITION", "family assignment partition is invalid");
      if (!["locked", "deterministic"].includes(assignment.assignment)) add(errors, `${path}.assignment`, "INVALID_ENUM", "assignment source must be locked or deterministic");
      if (families.has(assignment.familyId)) add(errors, `${path}.familyId`, "DUPLICATE_ID", "familyAssignments must be unique");
      families.add(assignment.familyId);
    });
  }
  validateSha(errors, manifest.buildChecksum, "buildChecksum");
  const safe = validatePracticeCorpusJsonSafe(manifest, { path: "manifest", maxBytes: 2 * 1024 * 1024 });
  errors.push(...safe.errors);
  return result(errors);
}

export function validatePracticeCorpusPartitionArtifact(artifact, { hashText = null } = {}) {
  const errors = [];
  if (!isPlainObject(artifact)) return result([{ path: "artifact", code: "INVALID_TYPE", message: "partition artifact must be an object" }]);
  validatePositiveVersion(errors, artifact.artifactVersion, "artifactVersion", PRACTICE_CORPUS_ARTIFACT_VERSION);
  validatePositiveVersion(errors, artifact.corpusSchemaVersion, "corpusSchemaVersion", PRACTICE_CORPUS_SCHEMA_VERSION);
  validateId(errors, artifact.corpusId, "corpusId");
  if (typeof artifact.language !== "string" || !/^[a-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(artifact.language)) add(errors, "language", "INVALID_LANGUAGE", "artifact language is invalid");
  validatePositiveVersion(errors, artifact.corpusVersion, "corpusVersion");
  validatePositiveVersion(errors, artifact.partitionPolicyVersion, "partitionPolicyVersion");
  if (!PRACTICE_CORPUS_PARTITIONS.includes(artifact.partition)) add(errors, "partition", "INVALID_PARTITION", "artifact partition is invalid");
  if (!Array.isArray(artifact.items)) add(errors, "items", "INVALID_ARRAY", "artifact items must be an array");
  else {
    const ids = new Set();
    artifact.items.forEach((item, index) => {
      const validation = validatePracticeCorpusContentRecord(item, { hashText });
      errors.push(...validation.errors.map((entry) => ({ ...entry, path: `items[${index}].${entry.path}` })));
      if (item?.corpusVersion !== artifact.corpusVersion) add(errors, `items[${index}].corpusVersion`, "VERSION_MISMATCH", "item corpusVersion must match artifact corpusVersion");
      if (item?.language !== artifact.language) add(errors, `items[${index}].language`, "LANGUAGE_MISMATCH", "item language must match artifact language");
      if (item?.partition !== artifact.partition) add(errors, `items[${index}].partition`, "PARTITION_MISMATCH", "item partition must match artifact partition");
      if (item?.reviewStatus !== "approved") add(errors, `items[${index}].reviewStatus`, "UNAPPROVED_RUNTIME_CONTENT", "generated runtime artifacts may contain approved content only");
      if (ids.has(item?.contentId)) add(errors, `items[${index}].contentId`, "DUPLICATE_ID", "contentId is duplicated within artifact");
      ids.add(item?.contentId);
    });
  }
  return result(errors);
}

export function assertPracticeCorpusValidation(validation, label = "Practice corpus value") {
  if (!validation?.valid) {
    const error = new TypeError(`${label} failed validation`);
    error.code = "PRACTICE_CORPUS_VALIDATION_FAILED";
    error.details = validation?.errors ?? [];
    throw error;
  }
  return true;
}
