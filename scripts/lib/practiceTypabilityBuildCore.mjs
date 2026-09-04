import { hashPracticeContent } from "../../js/practiceLab/practiceIds.js";
import { assertPracticeSourceUsage } from "../../js/practiceLab/practiceCorpusProvenance.js";
import {
  createPracticeReferenceFrequencyProvider,
  createUnavailablePracticeReferenceFrequencyProvider,
} from "../../js/practiceLab/practiceReferenceFrequency.js";
import { extractPracticeTextDifficultyFeatures } from "../../js/practiceLab/practiceTextDifficultyFeatures.js";
import {
  buildPracticeTypabilityReference,
  scorePracticeTextTypability,
} from "../../js/practiceLab/practiceTypabilityModel.js";

export const PRACTICE_TYPABILITY_SCORE_PARTITIONS = Object.freeze([
  "training",
  "transfer",
  "benchmark",
  "diagnostic",
]);

export const PRACTICE_TYPABILITY_FIT_PARTITIONS = Object.freeze(["training"]);
export const PRACTICE_TYPABILITY_PROTECTED_FIT_EXCLUSIONS = Object.freeze([
  "transfer",
  "benchmark",
  "diagnostic",
  "research-holdout",
]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function assertCorpusBinding(corpusManifest, indexManifest) {
  requireObject(corpusManifest, "Practice corpus manifest");
  requireObject(indexManifest, "Practice index manifest");
  if (indexManifest.corpusId !== corpusManifest.corpusId || indexManifest.corpusVersion !== corpusManifest.corpusVersion) throw new Error("PL10 index/corpus identity mismatch");
  if (indexManifest.corpusChecksum !== corpusManifest.buildChecksum) throw new Error("PL10 index/corpus checksum mismatch");
  if (!Number.isInteger(indexManifest.indexSchemaVersion) || indexManifest.indexSchemaVersion < 1) throw new Error("PL10 index schema version is invalid");
  if (typeof indexManifest.indexChecksum !== "string" || !/^sha256-[a-f0-9]{64}$/.test(indexManifest.indexChecksum)) throw new Error("PL10 index checksum is invalid");
}

function assertPartitionArtifact(artifact, partition, corpusManifest) {
  requireObject(artifact, `Practice ${partition} corpus artifact`);
  if (artifact.partition !== partition) throw new Error(`PL10 partition identity mismatch: ${partition}`);
  if (artifact.corpusId !== corpusManifest.corpusId || artifact.corpusVersion !== corpusManifest.corpusVersion) throw new Error(`PL10 partition corpus mismatch: ${partition}`);
  if (!Array.isArray(artifact.items)) throw new Error(`PL10 partition items are invalid: ${partition}`);
}

function createFrequencyProvider({ frequencyReference, sourceRegistry, language }) {
  if (!frequencyReference) return createUnavailablePracticeReferenceFrequencyProvider({ language });
  requireObject(frequencyReference, "Practice frequency reference");
  for (const sourceId of frequencyReference.sourceIds || []) {
    assertPracticeSourceUsage({ sourceId, registry: sourceRegistry, requestedUse: "statistical-reference" });
  }
  return createPracticeReferenceFrequencyProvider(frequencyReference);
}

function scoreItem({ item, partition, reference, frequencyProvider }) {
  const features = extractPracticeTextDifficultyFeatures({
    text: item.text,
    language: item.language,
    frequencyProvider,
  });
  const textDifficulty = scorePracticeTextTypability({
    features,
    reference,
    language: item.language,
  });
  return Object.freeze({
    contentId: item.contentId,
    contentHash: item.contentHash,
    sessionContentHash: hashPracticeContent(item.text),
    partition,
    language: item.language,
    featureVersion: features.featureVersion,
    features,
    textDifficulty,
  });
}

export function buildPracticeTypabilityArtifacts({
  corpusManifest,
  indexManifest,
  partitionArtifacts,
  sourceRegistry,
  frequencyReference = null,
} = {}) {
  assertCorpusBinding(corpusManifest, indexManifest);
  requireObject(sourceRegistry, "Practice source registry");
  requireObject(partitionArtifacts, "Practice partition artifacts");
  for (const partition of [...PRACTICE_TYPABILITY_SCORE_PARTITIONS, "research-holdout"]) {
    assertPartitionArtifact(partitionArtifacts[partition], partition, corpusManifest);
  }

  const training = partitionArtifacts.training.items;
  if (!training.length) throw new Error("PL10 training partition is empty");
  const trainingSourceIds = [...new Set(training.map((item) => item.sourceId))].sort();
  for (const sourceId of trainingSourceIds) {
    assertPracticeSourceUsage({ sourceId, registry: sourceRegistry, requestedUse: "statistical-reference" });
  }

  const frequencyProvider = createFrequencyProvider({
    frequencyReference,
    sourceRegistry,
    language: corpusManifest.language,
  });
  const trainingFeatures = training.map((item) => extractPracticeTextDifficultyFeatures({
    text: item.text,
    language: item.language,
    frequencyProvider,
  }));
  const frequencyMetadata = frequencyProvider.metadata;
  const reference = buildPracticeTypabilityReference({
    trainingFeatures,
    language: corpusManifest.language,
    corpusId: corpusManifest.corpusId,
    corpusVersion: corpusManifest.corpusVersion,
    corpusChecksum: corpusManifest.buildChecksum,
    indexSchemaVersion: indexManifest.indexSchemaVersion,
    indexChecksum: indexManifest.indexChecksum,
    segmentationVersion: indexManifest.segmentationVersion,
    tokenizationVersion: indexManifest.tokenizationVersion,
    sourceIds: trainingSourceIds,
    frequencyReferenceVersion: frequencyMetadata.referenceVersion,
    frequencyReferenceChecksum: frequencyMetadata.checksum,
    frequencySourceIds: frequencyMetadata.sourceIds,
  });

  const scores = {};
  for (const partition of PRACTICE_TYPABILITY_SCORE_PARTITIONS) {
    scores[partition] = Object.freeze(partitionArtifacts[partition].items.map((item) => scoreItem({
      item,
      partition,
      reference,
      frequencyProvider,
    })));
  }

  return Object.freeze({
    reference,
    scores: Object.freeze(scores),
    frequencyMetadata,
    diagnostics: Object.freeze({
      fitPartitions: [...PRACTICE_TYPABILITY_FIT_PARTITIONS],
      protectedFitExclusions: [...PRACTICE_TYPABILITY_PROTECTED_FIT_EXCLUSIONS],
      referenceItemCount: training.length,
      trainingSourceIds,
      scoredItemCount: PRACTICE_TYPABILITY_SCORE_PARTITIONS.reduce((sum, partition) => sum + scores[partition].length, 0),
      researchHoldoutScored: false,
    }),
  });
}
