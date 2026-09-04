import {
  PRACTICE_CORPUS_PARTITIONS,
} from "../../js/practiceLab/practiceCorpusConstants.js";
import {
  assertPracticeCorpusValidation,
  validatePracticeCorpusManifest,
  validatePracticeCorpusPartitionArtifact,
} from "../../js/practiceLab/practiceCorpusValidation.js";
import {
  PRACTICE_INDEX_GENERATOR_VERSION,
  PRACTICE_INDEX_LIMITS,
  PRACTICE_INDEX_MANIFEST_VERSION,
  PRACTICE_INDEX_REVERSE_PARTITIONS,
  PRACTICE_INDEX_SCHEMA_VERSION,
  PRACTICE_INDEX_SHARD_POLICY,
  PRACTICE_INDEX_SHARD_POLICY_VERSION,
  PRACTICE_TEXT_SEGMENTATION_VERSION,
  PRACTICE_TOKENIZATION_VERSION,
} from "../../js/practiceLab/practiceIndexConstants.js";
import {
  assemblePracticePartitionIndexes,
  shardPracticeIndexEntries,
} from "../../js/practiceLab/practiceIndexAssembler.js";
import {
  formatPracticeIndexShardId,
} from "../../js/practiceLab/practiceIndexSharding.js";
import {
  analyzePracticeText,
  verifyPracticeContentAnnotations,
} from "../../js/practiceLab/practiceTextAnalysis.js";
import {
  assertPracticeIndexArtifact,
  validatePracticeIndexArtifact,
  validatePracticeIndexManifest,
} from "../../js/practiceLab/practiceIndexValidation.js";

const compareText = (a, b) => String(a).localeCompare(String(b), "en", { sensitivity: "variant" });

function buildError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

export function stablePracticeIndexStringify(value) {
  const canonicalize = (entry) => {
    if (Array.isArray(entry)) return entry.map(canonicalize);
    if (entry && typeof entry === "object") return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, canonicalize(entry[key])]));
    return entry;
  };
  return JSON.stringify(canonicalize(value));
}

function validateCorpusInput({ corpusManifest, partitionArtifacts, hashText }) {
  const manifestValidation = validatePracticeCorpusManifest(corpusManifest);
  assertPracticeCorpusValidation(manifestValidation, "PL7 source corpus manifest");
  if (typeof hashText !== "function") throw buildError("PRACTICE_INDEX_HASHER_REQUIRED", "PL7 index build requires SHA-256 hasher");
  if (!partitionArtifacts || typeof partitionArtifacts !== "object") throw buildError("PRACTICE_INDEX_CORPUS_MISSING", "PL7 requires PL6 partition artifacts");
  let totalItems = 0;
  const seenContent = new Set();
  const seenFamilies = new Map();
  for (const partition of PRACTICE_CORPUS_PARTITIONS) {
    const artifact = partitionArtifacts[partition];
    const validation = validatePracticeCorpusPartitionArtifact(artifact, { hashText });
    assertPracticeCorpusValidation(validation, `PL7 source ${partition} corpus artifact`);
    if (artifact.corpusId !== corpusManifest.corpusId || artifact.corpusVersion !== corpusManifest.corpusVersion || artifact.language !== corpusManifest.language || artifact.partition !== partition) throw buildError("CORPUS_MISMATCH", `PL6 ${partition} artifact does not match corpus manifest`);
    totalItems += artifact.items.length;
    for (const item of artifact.items) {
      if (seenContent.has(item.contentId)) throw buildError("PRACTICE_INDEX_DUPLICATE_CONTENT", `Duplicate PL6 contentId while indexing: ${item.contentId}`);
      seenContent.add(item.contentId);
      const existingPartition = seenFamilies.get(item.familyId);
      if (existingPartition && existingPartition !== partition) throw buildError("PRACTICE_INDEX_FAMILY_PARTITION_CONFLICT", `PL6 family ${item.familyId} spans partitions while indexing`);
      seenFamilies.set(item.familyId, partition);
    }
    if (corpusManifest.partitionCounts?.[partition] !== artifact.items.length) throw buildError("CORPUS_MISMATCH", `PL6 manifest partition count differs for ${partition}`);
  }
  if (corpusManifest.contentCounts?.total !== totalItems) throw buildError("CORPUS_MISMATCH", "PL6 manifest total content count differs from partition artifacts");
}

function identity(corpusManifest, partition, indexType) {
  return {
    indexSchemaVersion: PRACTICE_INDEX_SCHEMA_VERSION,
    indexGeneratorVersion: PRACTICE_INDEX_GENERATOR_VERSION,
    corpusId: corpusManifest.corpusId,
    corpusVersion: corpusManifest.corpusVersion,
    corpusChecksum: corpusManifest.buildChecksum,
    language: corpusManifest.language,
    partition,
    indexType,
  };
}

function shardIdentity(corpusManifest, partition, indexType, shardId) {
  return {
    ...identity(corpusManifest, partition, indexType),
    shardPolicyVersion: PRACTICE_INDEX_SHARD_POLICY_VERSION,
    shardCount: PRACTICE_INDEX_SHARD_POLICY.shardCount,
    shardId,
  };
}

function contentPath(partition) { return `${partition}/content.json`; }
function annotationPath(partition, shardId) { return `${partition}/annotations/annotation-${formatPracticeIndexShardId(shardId)}.json`; }
function targetPath(partition, shardId) { return `${partition}/targets/target-${formatPracticeIndexShardId(shardId)}.json`; }
function wordPath(partition, shardId) { return `${partition}/words/word-${formatPracticeIndexShardId(shardId)}.json`; }

function buildPartitionArtifacts({ corpusManifest, partition, assembled }) {
  const files = new Map();
  files.set(contentPath(partition), {
    ...identity(corpusManifest, partition, "content"),
    items: assembled.content,
  });

  const annotationShards = shardPracticeIndexEntries({
    entries: assembled.annotations,
    indexType: "annotations",
    entryKey: (record) => ({ entityType: "content", entityKey: record.contentId }),
  });
  for (const [shardId, records] of annotationShards) files.set(annotationPath(partition, shardId), {
    ...shardIdentity(corpusManifest, partition, "annotations", shardId),
    segmentationVersion: PRACTICE_TEXT_SEGMENTATION_VERSION,
    tokenizationVersion: PRACTICE_TOKENIZATION_VERSION,
    records,
  });

  const targetShards = new Map();
  const wordShards = new Map();
  if (PRACTICE_INDEX_REVERSE_PARTITIONS.includes(partition)) {
    const groupedTargets = shardPracticeIndexEntries({
      entries: assembled.targetEntries,
      indexType: "targets",
      entryKey: (entry) => ({ entityType: entry.entityType, entityKey: entry.entityKey }),
    });
    for (const [shardId, entries] of groupedTargets) {
      targetShards.set(shardId, entries);
      files.set(targetPath(partition, shardId), { ...shardIdentity(corpusManifest, partition, "targets", shardId), entries });
    }
    const groupedWords = shardPracticeIndexEntries({
      entries: assembled.wordEntries,
      indexType: "words",
      entryKey: (entry) => ({ entityType: "word", entityKey: entry.lexicalKey }),
    });
    for (const [shardId, entries] of groupedWords) {
      wordShards.set(shardId, entries);
      files.set(wordPath(partition, shardId), { ...shardIdentity(corpusManifest, partition, "words", shardId), entries });
    }
  }

  return {
    files,
    shardMetadata: {
      annotationShards: [...annotationShards.keys()],
      targetShards: [...targetShards.keys()],
      wordShards: [...wordShards.keys()],
    },
  };
}

function validateExhaustively({ corpusManifest, partitionArtifacts, assembledByPartition, files }) {
  for (const [path, artifact] of files) {
    const validation = validatePracticeIndexArtifact(artifact);
    assertPracticeIndexArtifact(validation, `Generated PL7 artifact ${path}`);
  }

  for (const partition of PRACTICE_CORPUS_PARTITIONS) {
    const sourceItems = new Map(partitionArtifacts[partition].items.map((item) => [item.contentId, item]));
    const assembled = assembledByPartition[partition];
    if (assembled.annotations.length !== sourceItems.size || assembled.content.length !== sourceItems.size) throw buildError("PRACTICE_INDEX_ANNOTATION_COUNT_MISMATCH", `Every ${partition} content item must be annotated exactly once`);
    for (const annotation of assembled.annotations) {
      const content = sourceItems.get(annotation.contentId);
      if (!content) throw buildError("PRACTICE_INDEX_CONTENT_NOT_FOUND", `Annotation references missing ${partition} content ${annotation.contentId}`);
      if (annotation.contentHash !== content.contentHash) throw buildError("CORPUS_MISMATCH", `Annotation content hash is stale for ${annotation.contentId}`);
      verifyPracticeContentAnnotations({ annotation, text: content.text, contentHash: content.contentHash });
    }
    if (!PRACTICE_INDEX_REVERSE_PARTITIONS.includes(partition) && (assembled.targetEntries.length || assembled.wordEntries.length)) throw buildError("PROTECTED_REVERSE_LOOKUP", `Protected partition ${partition} emitted reverse target data`);
    for (const entry of [...assembled.targetEntries, ...assembled.wordEntries]) {
      for (const ref of entry.contents) {
        const content = sourceItems.get(ref.contentId);
        if (!content || content.partition !== partition || content.familyId !== ref.familyId) throw buildError("PRACTICE_INDEX_REFERENCE_INVALID", `Reverse reference ${ref.contentId} escapes ${partition}`);
      }
    }
  }
}

export function buildPracticeIndexesFromCorpus({ corpusManifest, partitionArtifacts, hashText, requiredCoverageTargets = [] } = {}) {
  validateCorpusInput({ corpusManifest, partitionArtifacts, hashText });
  if (!Array.isArray(requiredCoverageTargets) || requiredCoverageTargets.length > PRACTICE_INDEX_LIMITS.requiredCoverageTargets) throw buildError("PRACTICE_INDEX_REQUIRED_TARGETS_INVALID", "requiredCoverageTargets must be a bounded array");
  const assembledByPartition = {};
  const files = new Map();
  const generatedPartitions = {};
  const counts = {};
  const coverageWarnings = [];
  let totalWordsExtracted = 0;
  let totalInvalidTargets = 0;
  let totalInvalidWords = 0;

  for (const partition of PRACTICE_CORPUS_PARTITIONS) {
    const source = partitionArtifacts[partition];
    const records = source.items.map((content) => ({ content, analysis: analyzePracticeText({ text: content.text, language: content.language }) }));
    const assembled = assemblePracticePartitionIndexes({ corpusId: corpusManifest.corpusId, partition, records });
    assembledByPartition[partition] = assembled;
    totalWordsExtracted += assembled.coverage.wordOccurrences;
    totalInvalidTargets += assembled.diagnostics.invalidTargetKeyCount;
    totalInvalidWords += assembled.diagnostics.invalidWordKeyCount;
    coverageWarnings.push(...assembled.diagnostics.coverageWarnings);
    const generated = buildPartitionArtifacts({ corpusManifest, partition, assembled });
    for (const [path, value] of generated.files) files.set(path, value);
    generatedPartitions[partition] = {
      reverseTargetSelection: PRACTICE_INDEX_REVERSE_PARTITIONS.includes(partition),
      contentCount: assembled.coverage.contentItems,
      annotationShards: generated.shardMetadata.annotationShards,
      targetShards: generated.shardMetadata.targetShards,
      wordShards: generated.shardMetadata.wordShards,
    };
    counts[partition] = {
      ...assembled.coverage,
      reverse: assembled.reverseCoverage,
      invalidTargetKeyCount: assembled.diagnostics.invalidTargetKeyCount,
      invalidWordKeyCount: assembled.diagnostics.invalidWordKeyCount,
    };
  }

  for (const required of requiredCoverageTargets) {
    if (!required || !PRACTICE_INDEX_REVERSE_PARTITIONS.includes(required.partition) || !["key", "bigram", "trigram", "word"].includes(required.entityType) || typeof required.entityKey !== "string") throw buildError("PRACTICE_INDEX_REQUIRED_TARGETS_INVALID", "required coverage target is invalid");
    const assembled = assembledByPartition[required.partition];
    const entries = required.entityType === "word" ? assembled.wordEntries : assembled.targetEntries;
    const entry = entries.find((candidate) => (required.entityType === "word" ? candidate.lexicalKey : candidate.entityKey) === required.entityKey && candidate.entityType === required.entityType);
    if (!entry || entry.contentCoverageCount < (required.minimumContentCoverage ?? 1) || entry.familyCoverageCount < (required.minimumFamilyCoverage ?? 1)) coverageWarnings.push({ type: "required-target-gap", ...required });
  }

  validateExhaustively({ corpusManifest, partitionArtifacts, assembledByPartition, files });

  return {
    files,
    manifestBase: {
      indexManifestVersion: PRACTICE_INDEX_MANIFEST_VERSION,
      indexSchemaVersion: PRACTICE_INDEX_SCHEMA_VERSION,
      indexGeneratorVersion: PRACTICE_INDEX_GENERATOR_VERSION,
      corpusId: corpusManifest.corpusId,
      corpusVersion: corpusManifest.corpusVersion,
      corpusChecksum: corpusManifest.buildChecksum,
      language: corpusManifest.language,
      segmentationVersion: PRACTICE_TEXT_SEGMENTATION_VERSION,
      tokenizationVersion: PRACTICE_TOKENIZATION_VERSION,
      shardPolicyVersion: PRACTICE_INDEX_SHARD_POLICY_VERSION,
      shardCount: PRACTICE_INDEX_SHARD_POLICY.shardCount,
      generatedPartitions,
      counts,
      coverageWarnings: coverageWarnings
        .sort((a, b) => compareText(a.partition, b.partition) || compareText(a.entityType, b.entityType) || compareText(a.entityKey, b.entityKey))
        .slice(0, PRACTICE_INDEX_LIMITS.coverageWarnings),
      diagnostics: {
        contentAnalyzed: Object.values(counts).reduce((sum, entry) => sum + entry.contentItems, 0),
        wordsExtracted: totalWordsExtracted,
        invalidTargetKeyCount: totalInvalidTargets,
        invalidWordKeyCount: totalInvalidWords,
      },
    },
    assembledByPartition,
  };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function finalizePracticeIndexManifest({ manifestBase, artifactTexts, hashText } = {}) {
  if (!manifestBase || !(artifactTexts instanceof Map) || typeof hashText !== "function") throw buildError("PRACTICE_INDEX_MANIFEST_INPUT_INVALID", "Index manifest finalization requires manifestBase, artifactTexts, and hashText");
  const artifactChecksums = [];
  const byPartition = Object.fromEntries(PRACTICE_CORPUS_PARTITIONS.map((partition) => [partition, 0]));
  const byIndexType = { content: 0, annotations: 0, targets: 0, words: 0 };
  for (const [path, value] of [...artifactTexts.entries()].sort(([a], [b]) => compareText(a, b))) {
    const bytes = new TextEncoder().encode(value.text).byteLength;
    if (value.indexType !== "content" && bytes > PRACTICE_INDEX_LIMITS.maxShardBytes) throw buildError("PRACTICE_INDEX_SHARD_TOO_LARGE", `Generated shard exceeds ${PRACTICE_INDEX_LIMITS.maxShardBytes} bytes: ${path}`, { bytes });
    if (value.indexType === "content" && bytes > PRACTICE_INDEX_LIMITS.maxContentIndexBytes) throw buildError("PRACTICE_INDEX_CONTENT_TOO_LARGE", `Generated content index exceeds its size guard: ${path}`, { bytes });
    byPartition[value.partition] += bytes;
    byIndexType[value.indexType] += bytes;
    artifactChecksums.push({ path, sha256: hashText(value.text), bytes, partition: value.partition, indexType: value.indexType, shardId: value.shardId ?? null });
  }
  const sizes = artifactChecksums.map((entry) => entry.bytes);
  const sizeSummary = {
    totalGeneratedBytes: sizes.reduce((sum, value) => sum + value, 0),
    largestArtifactBytes: Math.max(0, ...sizes),
    medianArtifactBytes: median(sizes),
    byPartition,
    byIndexType,
  };
  const checksumInventory = {
    indexSchemaVersion: manifestBase.indexSchemaVersion,
    indexGeneratorVersion: manifestBase.indexGeneratorVersion,
    corpusId: manifestBase.corpusId,
    corpusVersion: manifestBase.corpusVersion,
    corpusChecksum: manifestBase.corpusChecksum,
    language: manifestBase.language,
    segmentationVersion: manifestBase.segmentationVersion,
    tokenizationVersion: manifestBase.tokenizationVersion,
    shardPolicyVersion: manifestBase.shardPolicyVersion,
    shardCount: manifestBase.shardCount,
    generatedPartitions: manifestBase.generatedPartitions,
    counts: manifestBase.counts,
    artifacts: artifactChecksums.map(({ path, sha256, bytes, partition, indexType, shardId }) => ({ path, sha256, bytes, partition, indexType, shardId })),
  };
  const manifest = {
    ...manifestBase,
    artifactChecksums,
    sizeSummary,
    indexChecksum: hashText(stablePracticeIndexStringify(checksumInventory)),
  };
  const validation = validatePracticeIndexManifest(manifest);
  if (!validation.valid) throw buildError("PRACTICE_INDEX_MANIFEST_INVALID", "Generated Practice index manifest failed validation", validation.errors);
  return manifest;
}
