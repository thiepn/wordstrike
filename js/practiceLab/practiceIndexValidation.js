import { PRACTICE_CORPUS_PARTITIONS } from "./practiceCorpusConstants.js";
import {
  PRACTICE_INDEX_ARTIFACT_TYPES,
  PRACTICE_INDEX_CONTEXT_CLASSES,
  PRACTICE_INDEX_ERROR_CODES,
  PRACTICE_INDEX_GENERATOR_VERSION,
  PRACTICE_INDEX_MANIFEST_VERSION,
  PRACTICE_INDEX_REVERSE_PARTITIONS,
  PRACTICE_INDEX_SCHEMA_VERSION,
  PRACTICE_INDEX_SHARD_POLICY,
  PRACTICE_INDEX_SHARD_POLICY_VERSION,
  PRACTICE_INDEX_TARGET_TYPES,
  PRACTICE_TEXT_SEGMENTATION_VERSION,
  PRACTICE_TOKENIZATION_VERSION,
} from "./practiceIndexConstants.js";
import { derivePracticeIndexShardId } from "./practiceIndexSharding.js";
import { validatePracticeEntityKey } from "./practiceValidation.js";

const SHA256 = /^sha256-[a-f0-9]{64}$/;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function result(errors) { return { valid: errors.length === 0, errors }; }
function add(errors, path, code, message) { errors.push({ path, code, message }); }
function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function boundedString(value, max = 300) { return typeof value === "string" && value.length > 0 && value.length <= max; }
function finiteNonNegativeInteger(value) { return Number.isInteger(value) && value >= 0; }
function sortedUniqueNumbers(values) {
  return Array.isArray(values) && values.every(Number.isInteger)
    && values.every((value, index) => index === 0 || value > values[index - 1]);
}
function validatePlainJson(value, errors, path = "value", depth = 0, seen = new Set()) {
  if (depth > 10) return add(errors, path, "MAX_DEPTH", "index value exceeds maximum depth");
  if (value == null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value)) add(errors, path, "NON_FINITE", "index value must be finite"); return; }
  if (typeof value !== "object") return add(errors, path, "UNSERIALIZABLE", "index value is not JSON-safe");
  if (seen.has(value)) return add(errors, path, "CYCLIC", "index value contains a cycle");
  if (!Array.isArray(value) && !isPlainObject(value)) return add(errors, path, "NON_PLAIN_OBJECT", "index value must use plain objects");
  seen.add(value);
  Object.entries(value).forEach(([key, child]) => {
    if (UNSAFE_KEYS.has(key)) add(errors, `${path}.${key}`, "UNSAFE_KEY", "index value contains a prototype-sensitive key");
    else validatePlainJson(child, errors, `${path}.${key}`, depth + 1, seen);
  });
  seen.delete(value);
}

function validateIdentity(errors, value) {
  if (value.indexSchemaVersion !== PRACTICE_INDEX_SCHEMA_VERSION) add(errors, "indexSchemaVersion", "UNSUPPORTED_VERSION", "unsupported Practice index schema version");
  if (value.indexGeneratorVersion !== PRACTICE_INDEX_GENERATOR_VERSION) add(errors, "indexGeneratorVersion", "UNSUPPORTED_VERSION", "unsupported Practice index generator version");
  if (!boundedString(value.corpusId, 160)) add(errors, "corpusId", "INVALID_ID", "corpusId is invalid");
  if (!Number.isInteger(value.corpusVersion) || value.corpusVersion < 1) add(errors, "corpusVersion", "INVALID_VERSION", "corpusVersion must be positive");
  if (!SHA256.test(value.corpusChecksum || "")) add(errors, "corpusChecksum", "INVALID_CHECKSUM", "corpusChecksum must be SHA-256");
  if (typeof value.language !== "string" || !/^[a-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value.language)) add(errors, "language", "INVALID_LANGUAGE", "index language is invalid");
}

function validateContentRef(errors, ref, path) {
  if (!isPlainObject(ref)) return add(errors, path, "INVALID_REF", "content reference must be an object");
  if (!boundedString(ref.contentId, 180)) add(errors, `${path}.contentId`, "INVALID_ID", "contentId is invalid");
  if (!boundedString(ref.familyId, 180)) add(errors, `${path}.familyId`, "INVALID_ID", "familyId is invalid");
  if (!finiteNonNegativeInteger(ref.count) || ref.count < 1) add(errors, `${path}.count`, "INVALID_COUNT", "reference count must be positive");
  if (!sortedUniqueNumbers(ref.positions) || ref.positions.some((value) => value < 0)) add(errors, `${path}.positions`, "INVALID_POSITIONS", "positions must be sorted unique non-negative integers");
  if (Array.isArray(ref.positions) && finiteNonNegativeInteger(ref.count) && ref.count !== ref.positions.length) add(errors, `${path}.count`, "COUNT_MISMATCH", "reference count must equal position count");
}

function validateTargetEntry(errors, entry, path) {
  if (!isPlainObject(entry)) return add(errors, path, "INVALID_ENTRY", "target entry must be an object");
  if (!PRACTICE_INDEX_TARGET_TYPES.includes(entry.entityType) || entry.entityType === "word") add(errors, `${path}.entityType`, "INVALID_TARGET", "target shard entry must be key, bigram, or trigram");
  const entityValidation = validatePracticeEntityKey(entry.entityType, entry.entityKey);
  if (!entityValidation.valid) add(errors, `${path}.entityKey`, "INVALID_TARGET", "target entry is not representable by current Practice entity rules");
  if (!finiteNonNegativeInteger(entry.corpusOccurrenceCount)) add(errors, `${path}.corpusOccurrenceCount`, "INVALID_COUNT", "occurrence count is invalid");
  if (!finiteNonNegativeInteger(entry.contentCoverageCount) || !finiteNonNegativeInteger(entry.familyCoverageCount) || !finiteNonNegativeInteger(entry.wordCoverageCount)) add(errors, path, "INVALID_COUNT", "coverage counts must be non-negative integers");
  if (!Array.isArray(entry.wordKeys) || entry.wordKeys.some((value) => !validatePracticeEntityKey("word", value).valid)) add(errors, `${path}.wordKeys`, "INVALID_WORD_REFS", "wordKeys are invalid");
  if (!Array.isArray(entry.contents)) add(errors, `${path}.contents`, "INVALID_REFS", "contents must be an array");
  else {
    const ids = new Set();
    let occurrenceCount = 0;
    const families = new Set();
    entry.contents.forEach((ref, index) => {
      validateContentRef(errors, ref, `${path}.contents[${index}]`);
      if (ids.has(ref?.contentId)) add(errors, `${path}.contents[${index}].contentId`, "DUPLICATE_REF", "content references must be unique");
      ids.add(ref?.contentId);
      if (ref?.familyId) families.add(ref.familyId);
      if (finiteNonNegativeInteger(ref?.count)) occurrenceCount += ref.count;
    });
    if (entry.contentCoverageCount !== ids.size) add(errors, `${path}.contentCoverageCount`, "COUNT_MISMATCH", "content coverage count does not match unique references");
    if (entry.familyCoverageCount !== families.size) add(errors, `${path}.familyCoverageCount`, "COUNT_MISMATCH", "family coverage count does not match references");
    if (entry.corpusOccurrenceCount !== occurrenceCount) add(errors, `${path}.corpusOccurrenceCount`, "COUNT_MISMATCH", "occurrence count does not match references");
    if (entry.wordCoverageCount !== new Set(entry.wordKeys ?? []).size) add(errors, `${path}.wordCoverageCount`, "COUNT_MISMATCH", "word coverage count does not match wordKeys");
  }
}

function validateWordEntry(errors, entry, path) {
  if (!isPlainObject(entry)) return add(errors, path, "INVALID_ENTRY", "word entry must be an object");
  if (entry.entityType !== "word" || entry.entityKey !== entry.lexicalKey || !validatePracticeEntityKey("word", entry.lexicalKey).valid) add(errors, path, "INVALID_WORD", "word entry identity is invalid");
  if (!Array.isArray(entry.surfaceForms) || entry.surfaceForms.some((form) => !isPlainObject(form) || !boundedString(form.surfaceText, 256) || !Number.isInteger(form.corpusOccurrenceCount) || form.corpusOccurrenceCount < 1)) add(errors, `${path}.surfaceForms`, "INVALID_SURFACE_FORMS", "word surface forms are invalid");
  else if (entry.surfaceForms.reduce((sum, form) => sum + form.corpusOccurrenceCount, 0) !== entry.corpusOccurrenceCount) add(errors, `${path}.surfaceForms`, "COUNT_MISMATCH", "surface-form counts must sum to corpusOccurrenceCount");
  if (!Array.isArray(entry.contents)) add(errors, `${path}.contents`, "INVALID_REFS", "word contents must be an array");
  else {
    const ids = new Set();
    const families = new Set();
    let count = 0;
    entry.contents.forEach((ref, index) => {
      validateContentRef(errors, ref, `${path}.contents[${index}]`);
      if (ids.has(ref?.contentId)) add(errors, `${path}.contents[${index}].contentId`, "DUPLICATE_REF", "word content references must be unique");
      ids.add(ref?.contentId);
      if (ref?.familyId) families.add(ref.familyId);
      if (finiteNonNegativeInteger(ref?.count)) count += ref.count;
    });
    if (entry.contentCoverageCount !== ids.size || entry.familyCoverageCount !== families.size || entry.corpusOccurrenceCount !== count) add(errors, path, "COUNT_MISMATCH", "word coverage counts do not match references");
  }
}

function validateOccurrence(errors, occurrence, path, expectedLength = null) {
  if (!isPlainObject(occurrence)) return add(errors, path, "INVALID_OCCURRENCE", "occurrence must be an object");
  if (typeof occurrence.target !== "string" || !occurrence.target) add(errors, `${path}.target`, "INVALID_TARGET", "occurrence target is invalid");
  if (!Number.isInteger(occurrence.startIndex) || !Number.isInteger(occurrence.endIndex) || occurrence.startIndex < 0 || occurrence.endIndex <= occurrence.startIndex) add(errors, path, "INVALID_RANGE", "occurrence range is invalid");
  if (expectedLength != null && occurrence.endIndex - occurrence.startIndex !== expectedLength) add(errors, path, "INVALID_RANGE", "occurrence range length is invalid");
  if (!PRACTICE_INDEX_CONTEXT_CLASSES.includes(occurrence.contextClass)) add(errors, `${path}.contextClass`, "INVALID_CONTEXT", "occurrence context class is invalid");
  if (occurrence.wordOrdinal != null && (!Number.isInteger(occurrence.wordOrdinal) || occurrence.wordOrdinal < 0)) add(errors, `${path}.wordOrdinal`, "INVALID_WORD_ORDINAL", "wordOrdinal must be null or non-negative integer");
}

function validateAnnotationRecord(errors, record, path) {
  if (!isPlainObject(record)) return add(errors, path, "INVALID_RECORD", "annotation record must be an object");
  for (const key of ["contentId", "familyId", "sourceId", "corpusId", "language", "partition", "contentHash"]) if (typeof record[key] !== "string" || !record[key]) add(errors, `${path}.${key}`, "REQUIRED", `${key} is required`);
  if (!SHA256.test(record.contentHash || "")) add(errors, `${path}.contentHash`, "INVALID_CHECKSUM", "contentHash must be SHA-256");
  if (record.segmentationVersion !== PRACTICE_TEXT_SEGMENTATION_VERSION || record.tokenizationVersion !== PRACTICE_TOKENIZATION_VERSION) add(errors, path, "INDEX_VERSION_MISMATCH", "annotation segmentation/tokenization version is unsupported");
  if (!finiteNonNegativeInteger(record.graphemeCount) || !finiteNonNegativeInteger(record.wordCount)) add(errors, path, "INVALID_COUNT", "annotation counts are invalid");
  if (!Array.isArray(record.words) || record.words.length !== record.wordCount) add(errors, `${path}.words`, "COUNT_MISMATCH", "wordCount does not match words");
  else record.words.forEach((word, index) => {
    if (!isPlainObject(word) || typeof word.surfaceText !== "string" || typeof word.lexicalKey !== "string" || !Number.isInteger(word.wordOrdinal) || word.wordOrdinal !== index || !Number.isInteger(word.startIndex) || !Number.isInteger(word.endIndex) || word.startIndex < 0 || word.endIndex <= word.startIndex || word.endIndex > record.graphemeCount) add(errors, `${path}.words[${index}]`, "INVALID_WORD_RANGE", "word annotation is invalid");
  });
  for (const [field, length] of [["keyOccurrences", 1], ["bigramOccurrences", 2], ["trigramOccurrences", 3]]) {
    if (!Array.isArray(record[field])) add(errors, `${path}.${field}`, "INVALID_OCCURRENCES", `${field} must be an array`);
    else record[field].forEach((occurrence, index) => {
      validateOccurrence(errors, occurrence, `${path}.${field}[${index}]`, length);
      if (occurrence?.endIndex > record.graphemeCount) add(errors, `${path}.${field}[${index}]`, "INVALID_RANGE", "occurrence exceeds content range");
    });
  }
}

export function validatePracticeIndexManifest(manifest) {
  const errors = [];
  if (!isPlainObject(manifest)) return result([{ path: "manifest", code: "INVALID_TYPE", message: "index manifest must be an object" }]);
  if (manifest.indexManifestVersion !== PRACTICE_INDEX_MANIFEST_VERSION) add(errors, "indexManifestVersion", "UNSUPPORTED_VERSION", "unsupported index manifest version");
  validateIdentity(errors, manifest);
  if (manifest.segmentationVersion !== PRACTICE_TEXT_SEGMENTATION_VERSION || manifest.tokenizationVersion !== PRACTICE_TOKENIZATION_VERSION || manifest.shardPolicyVersion !== PRACTICE_INDEX_SHARD_POLICY_VERSION || manifest.shardCount !== PRACTICE_INDEX_SHARD_POLICY.shardCount) add(errors, "versions", "INDEX_VERSION_MISMATCH", "index segmentation/tokenization/shard contract is unsupported");
  if (!isPlainObject(manifest.generatedPartitions)) add(errors, "generatedPartitions", "INVALID_PARTITIONS", "generatedPartitions is required");
  else for (const partition of PRACTICE_CORPUS_PARTITIONS) {
    const value = manifest.generatedPartitions[partition];
    if (!isPlainObject(value)) { add(errors, `generatedPartitions.${partition}`, "MISSING_PARTITION", "partition metadata is missing"); continue; }
    const shouldReverse = PRACTICE_INDEX_REVERSE_PARTITIONS.includes(partition);
    if (value.reverseTargetSelection !== shouldReverse) add(errors, `generatedPartitions.${partition}.reverseTargetSelection`, "PARTITION_POLICY_MISMATCH", "reverse selection flag violates protected partition policy");
    for (const field of ["annotationShards", "targetShards", "wordShards"]) if (!Array.isArray(value[field]) || value[field].some((id) => !Number.isInteger(id) || id < 0 || id >= PRACTICE_INDEX_SHARD_POLICY.shardCount)) add(errors, `generatedPartitions.${partition}.${field}`, "INVALID_SHARDS", "partition shard list is invalid");
    if (!shouldReverse && ((value.targetShards?.length ?? 0) || (value.wordShards?.length ?? 0))) add(errors, `generatedPartitions.${partition}`, "PROTECTED_REVERSE_LOOKUP", "protected partition may not declare target/word reverse shards");
  }
  if (!Array.isArray(manifest.artifactChecksums)) add(errors, "artifactChecksums", "INVALID_ARTIFACTS", "artifact checksum inventory is required");
  else {
    const paths = new Set();
    manifest.artifactChecksums.forEach((artifact, index) => {
      if (!isPlainObject(artifact) || !boundedString(artifact.path, 400) || !SHA256.test(artifact.sha256 || "") || !finiteNonNegativeInteger(artifact.bytes) || !PRACTICE_INDEX_ARTIFACT_TYPES.includes(artifact.indexType) || !PRACTICE_CORPUS_PARTITIONS.includes(artifact.partition)) add(errors, `artifactChecksums[${index}]`, "INVALID_ARTIFACT", "artifact checksum entry is invalid");
      if (paths.has(artifact?.path)) add(errors, `artifactChecksums[${index}].path`, "DUPLICATE_ARTIFACT", "artifact paths must be unique");
      paths.add(artifact?.path);
    });
  }
  if (!SHA256.test(manifest.indexChecksum || "")) add(errors, "indexChecksum", "INVALID_CHECKSUM", "indexChecksum must be SHA-256");
  validatePlainJson(manifest, errors, "manifest");
  return result(errors);
}

export function assertPracticeIndexCompatibility({ indexManifest, corpusManifest } = {}) {
  const validation = validatePracticeIndexManifest(indexManifest);
  if (!validation.valid) {
    const error = new TypeError("Practice index manifest is invalid or unsupported");
    error.code = PRACTICE_INDEX_ERROR_CODES.INDEX_VERSION_MISMATCH;
    error.details = validation.errors;
    throw error;
  }
  if (!corpusManifest || indexManifest.corpusId !== corpusManifest.corpusId || indexManifest.corpusVersion !== corpusManifest.corpusVersion || indexManifest.corpusChecksum !== corpusManifest.buildChecksum || indexManifest.language !== corpusManifest.language) {
    const error = new TypeError("Practice index manifest does not match the selected PL6 corpus");
    error.code = PRACTICE_INDEX_ERROR_CODES.CORPUS_MISMATCH;
    error.details = { indexCorpusId: indexManifest.corpusId, corpusId: corpusManifest?.corpusId ?? null, indexCorpusVersion: indexManifest.corpusVersion, corpusVersion: corpusManifest?.corpusVersion ?? null };
    throw error;
  }
  return true;
}

export function validatePracticeIndexArtifact(artifact, { manifest = null, expectedPartition = null, expectedIndexType = null, expectedShardId = null } = {}) {
  const errors = [];
  if (!isPlainObject(artifact)) return result([{ path: "artifact", code: "INVALID_TYPE", message: "index artifact must be an object" }]);
  validateIdentity(errors, artifact);
  if (!PRACTICE_CORPUS_PARTITIONS.includes(artifact.partition)) add(errors, "partition", "INVALID_PARTITION", "artifact partition is invalid");
  if (!PRACTICE_INDEX_ARTIFACT_TYPES.includes(artifact.indexType)) add(errors, "indexType", "INVALID_INDEX_TYPE", "artifact indexType is invalid");
  if (expectedPartition != null && artifact.partition !== expectedPartition) add(errors, "partition", "PARTITION_MISMATCH", "artifact partition does not match requested partition");
  if (expectedIndexType != null && artifact.indexType !== expectedIndexType) add(errors, "indexType", "INDEX_TYPE_MISMATCH", "artifact type does not match requested index type");
  if (manifest && (artifact.corpusId !== manifest.corpusId || artifact.corpusVersion !== manifest.corpusVersion || artifact.corpusChecksum !== manifest.corpusChecksum || artifact.language !== manifest.language)) add(errors, "identity", "CORPUS_MISMATCH", "artifact does not match index manifest corpus identity");

  if (artifact.indexType === "content") {
    if (!Array.isArray(artifact.items)) add(errors, "items", "INVALID_ITEMS", "content index items must be an array");
    else {
      const ids = new Set();
      artifact.items.forEach((item, index) => {
        if (!isPlainObject(item) || !boundedString(item.contentId, 180) || !boundedString(item.familyId, 180) || !SHA256.test(item.contentHash || "") || item.partition !== artifact.partition || item.language !== artifact.language || !finiteNonNegativeInteger(item.graphemeCount) || !finiteNonNegativeInteger(item.wordCount) || !finiteNonNegativeInteger(item.uniqueWordCount)) add(errors, `items[${index}]`, "INVALID_CONTENT_SUMMARY", "content summary is invalid");
        if (ids.has(item?.contentId)) add(errors, `items[${index}].contentId`, "DUPLICATE_ID", "content summary IDs must be unique");
        ids.add(item?.contentId);
      });
    }
  } else {
    if (artifact.shardPolicyVersion !== PRACTICE_INDEX_SHARD_POLICY_VERSION || artifact.shardCount !== PRACTICE_INDEX_SHARD_POLICY.shardCount || !Number.isInteger(artifact.shardId) || artifact.shardId < 0 || artifact.shardId >= PRACTICE_INDEX_SHARD_POLICY.shardCount) add(errors, "shard", "SHARD_INVALID", "artifact shard identity is invalid");
    if (expectedShardId != null && artifact.shardId !== expectedShardId) add(errors, "shardId", "SHARD_INVALID", "artifact shard does not match requested shard");
    if (artifact.indexType === "annotations") {
      if (artifact.segmentationVersion !== PRACTICE_TEXT_SEGMENTATION_VERSION || artifact.tokenizationVersion !== PRACTICE_TOKENIZATION_VERSION) add(errors, "versions", "INDEX_VERSION_MISMATCH", "annotation versions are unsupported");
      if (!Array.isArray(artifact.records)) add(errors, "records", "INVALID_RECORDS", "annotation records must be an array");
      else {
        const ids = new Set();
        artifact.records.forEach((record, index) => {
          validateAnnotationRecord(errors, record, `records[${index}]`);
          if (ids.has(record?.contentId)) add(errors, `records[${index}].contentId`, "DUPLICATE_ID", "annotation records must be unique by contentId");
          ids.add(record?.contentId);
          if (record?.contentId && derivePracticeIndexShardId({ indexType: "annotations", entityType: "content", entityKey: record.contentId }) !== artifact.shardId) add(errors, `records[${index}].contentId`, "SHARD_INVALID", "annotation record is in the wrong shard");
        });
      }
    } else if (artifact.indexType === "targets") {
      if (!PRACTICE_INDEX_REVERSE_PARTITIONS.includes(artifact.partition)) add(errors, "partition", "PROTECTED_REVERSE_LOOKUP", "protected partition cannot contain target reverse shards");
      if (!Array.isArray(artifact.entries)) add(errors, "entries", "INVALID_ENTRIES", "target entries must be an array");
      else {
        const keys = new Set();
        artifact.entries.forEach((entry, index) => {
          validateTargetEntry(errors, entry, `entries[${index}]`);
          const key = `${entry?.entityType}\u0000${entry?.entityKey}`;
          if (keys.has(key)) add(errors, `entries[${index}]`, "DUPLICATE_ENTRY", "target entries must be unique");
          keys.add(key);
          if (entry?.entityType && typeof entry?.entityKey === "string" && derivePracticeIndexShardId({ indexType: "targets", entityType: entry.entityType, entityKey: entry.entityKey }) !== artifact.shardId) add(errors, `entries[${index}]`, "SHARD_INVALID", "target entry is in the wrong shard");
        });
      }
    } else if (artifact.indexType === "words") {
      if (!PRACTICE_INDEX_REVERSE_PARTITIONS.includes(artifact.partition)) add(errors, "partition", "PROTECTED_REVERSE_LOOKUP", "protected partition cannot contain word reverse shards");
      if (!Array.isArray(artifact.entries)) add(errors, "entries", "INVALID_ENTRIES", "word entries must be an array");
      else {
        const keys = new Set();
        artifact.entries.forEach((entry, index) => {
          validateWordEntry(errors, entry, `entries[${index}]`);
          if (keys.has(entry?.lexicalKey)) add(errors, `entries[${index}].lexicalKey`, "DUPLICATE_ENTRY", "word entries must be unique");
          keys.add(entry?.lexicalKey);
          if (typeof entry?.lexicalKey === "string" && derivePracticeIndexShardId({ indexType: "words", entityType: "word", entityKey: entry.lexicalKey }) !== artifact.shardId) add(errors, `entries[${index}]`, "SHARD_INVALID", "word entry is in the wrong shard");
        });
      }
    }
  }
  validatePlainJson(artifact, errors, "artifact");
  return result(errors);
}

export function assertPracticeIndexArtifact(validation, label = "Practice index artifact") {
  if (!validation?.valid) {
    const errors = validation?.errors ?? [];
    const error = new TypeError(`${label} failed validation`);
    if (errors.some((entry) => ["UNSUPPORTED_VERSION", "INDEX_VERSION_MISMATCH"].includes(entry.code))) error.code = PRACTICE_INDEX_ERROR_CODES.INDEX_VERSION_MISMATCH;
    else if (errors.some((entry) => entry.code === "CORPUS_MISMATCH")) error.code = PRACTICE_INDEX_ERROR_CODES.CORPUS_MISMATCH;
    else if (errors.some((entry) => entry.code === "PROTECTED_REVERSE_LOOKUP")) error.code = PRACTICE_INDEX_ERROR_CODES.PROTECTED_REVERSE_LOOKUP;
    else error.code = PRACTICE_INDEX_ERROR_CODES.SHARD_INVALID;
    error.details = errors;
    throw error;
  }
  return true;
}
