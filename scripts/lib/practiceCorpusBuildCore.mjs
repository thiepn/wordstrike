import {
  PRACTICE_CORPUS_ARTIFACT_VERSION,
  PRACTICE_CORPUS_DEFAULT_PARTITION_POLICY,
  PRACTICE_CORPUS_NEAR_DUPLICATE_POLICY,
  PRACTICE_CORPUS_PARTITIONS,
  PRACTICE_CORPUS_PARTITION_POLICY_VERSION,
  PRACTICE_CORPUS_SCHEMA_VERSION,
} from "../../js/practiceLab/practiceCorpusConstants.js";
import {
  assertPracticeCorpusValidation,
  normalizePracticeCorpusText,
  validatePracticeCorpusContentRecord,
  validatePracticeCorpusManifest,
  validatePracticeCorpusPartitionArtifact,
  validatePracticeCorpusSourceRegistry,
} from "../../js/practiceLab/practiceCorpusValidation.js";
import {
  assertPracticeFamilyIsolation,
  resolvePracticeFamilyPartition,
  validatePracticeCorpusPartitionPolicy,
} from "../../js/practiceLab/practiceCorpusPartition.js";
import { createPracticeSourceIndex, getPracticeSourceUsageEligibility } from "../../js/practiceLab/practiceCorpusProvenance.js";

function buildError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

export function stablePracticeCorpusStringify(value) {
  const canonicalize = (entry) => {
    if (Array.isArray(entry)) return entry.map(canonicalize);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, canonicalize(entry[key])]));
    }
    return entry;
  };
  return JSON.stringify(canonicalize(value));
}

function assertAuthoringDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw buildError("PRACTICE_CORPUS_INVALID_AUTHORING", "Practice corpus authoring input must be an object");
  if (document.schemaVersion !== PRACTICE_CORPUS_SCHEMA_VERSION) throw buildError("PRACTICE_CORPUS_INVALID_AUTHORING", `Authoring schemaVersion must equal ${PRACTICE_CORPUS_SCHEMA_VERSION}`);
  if (typeof document.corpusId !== "string" || !document.corpusId) throw buildError("PRACTICE_CORPUS_INVALID_AUTHORING", "Authoring corpusId is required");
  if (typeof document.language !== "string" || !document.language) throw buildError("PRACTICE_CORPUS_INVALID_AUTHORING", "Authoring language is required");
  if (!Number.isInteger(document.corpusVersion) || document.corpusVersion < 1) throw buildError("PRACTICE_CORPUS_INVALID_AUTHORING", "Authoring corpusVersion must be positive");
  if (document.partitionPolicyVersion !== PRACTICE_CORPUS_PARTITION_POLICY_VERSION) throw buildError("PRACTICE_CORPUS_INVALID_AUTHORING", "Authoring partition policy version is unsupported");
  if (!["foundation", "review", "ready", "retired"].includes(document.status)) throw buildError("PRACTICE_CORPUS_INVALID_AUTHORING", "Authoring corpus status is invalid");
  if (typeof document.createdAt !== "string") throw buildError("PRACTICE_CORPUS_INVALID_AUTHORING", "Authoring createdAt is required");
  if (!Array.isArray(document.families)) throw buildError("PRACTICE_CORPUS_INVALID_AUTHORING", "Authoring families must be an array");
}

function tokenSet(text) {
  return new Set((text.toLocaleLowerCase("en").match(/[\p{L}\p{M}\p{N}]+/gu) ?? []));
}

function characterShingles(text, size) {
  const comparable = text.toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();
  const points = [...comparable];
  if (points.length <= size) return new Set([comparable]);
  const shingles = new Set();
  for (let index = 0; index <= points.length - size; index += 1) shingles.add(points.slice(index, index + size).join(""));
  return shingles;
}

function jaccard(left, right) {
  if (!left.size && !right.size) return 1;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

export function getPracticeCorpusNearDuplicateScore(leftText, rightText, policy = PRACTICE_CORPUS_NEAR_DUPLICATE_POLICY) {
  const tokenScore = jaccard(tokenSet(leftText), tokenSet(rightText));
  const characterScore = jaccard(
    characterShingles(leftText, policy.characterShingleSize),
    characterShingles(rightText, policy.characterShingleSize),
  );
  return Math.max(tokenScore, characterScore);
}

export function auditPracticeCorpusDuplicates(items, policy = PRACTICE_CORPUS_NEAR_DUPLICATE_POLICY) {
  const exact = [];
  const hard = [];
  const warnings = [];
  const byText = new Map();
  for (const item of items) {
    const previous = byText.get(item.text);
    if (previous && previous.contentId !== item.contentId) exact.push({ leftId: previous.contentId, rightId: item.contentId, leftPartition: previous.partition, rightPartition: item.partition });
    else byText.set(item.text, item);
  }
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const left = items[leftIndex];
      const right = items[rightIndex];
      if (left.familyId === right.familyId || left.text === right.text || left.partition === right.partition) continue;
      const score = getPracticeCorpusNearDuplicateScore(left.text, right.text, policy);
      const record = { leftId: left.contentId, rightId: right.contentId, leftPartition: left.partition, rightPartition: right.partition, score: Number(score.toFixed(4)) };
      if (score >= policy.hardThreshold) hard.push(record);
      else if (score >= policy.warningThreshold) warnings.push(record);
    }
  }
  return Object.freeze({ exact: Object.freeze(exact), hard: Object.freeze(hard), warnings: Object.freeze(warnings) });
}

function emptyCounts() {
  return Object.fromEntries(PRACTICE_CORPUS_PARTITIONS.map((partition) => [partition, 0]));
}

function validateCountIntegrity(manifest, artifacts) {
  const itemCounts = emptyCounts();
  const familySets = Object.fromEntries(PRACTICE_CORPUS_PARTITIONS.map((partition) => [partition, new Set()]));
  let totalItems = 0;
  for (const partition of PRACTICE_CORPUS_PARTITIONS) {
    const artifact = artifacts[partition];
    itemCounts[partition] = artifact.items.length;
    totalItems += artifact.items.length;
    artifact.items.forEach((item) => familySets[partition].add(item.familyId));
  }
  const familyCounts = Object.fromEntries(PRACTICE_CORPUS_PARTITIONS.map((partition) => [partition, familySets[partition].size]));
  const totalFamilies = Object.values(familySets).reduce((sum, set) => sum + set.size, 0);
  if (JSON.stringify(itemCounts) !== JSON.stringify(manifest.contentCounts.byPartition)
    || JSON.stringify(itemCounts) !== JSON.stringify(manifest.partitionCounts)
    || totalItems !== manifest.contentCounts.total
    || JSON.stringify(familyCounts) !== JSON.stringify(manifest.familyCounts.byPartition)
    || totalFamilies !== manifest.familyCounts.total) {
    throw buildError("PRACTICE_CORPUS_MANIFEST_COUNT_MISMATCH", "Practice corpus manifest counts do not match emitted partition artifacts");
  }
}

export function createPracticeCorpusInventory({ manifestBase, sourceIndex, familyAssignments, items, partitionPolicy }) {
  const sourceIds = [...new Set(items.map((item) => item.sourceId))].sort();
  const sources = sourceIds.map((sourceId) => {
    const source = sourceIndex.get(sourceId);
    return {
      sourceId,
      sourceType: source.sourceType,
      usageApproval: source.usageApproval,
      sourceChecksum: source.sourceChecksum,
      license: source.license,
    };
  });
  return {
    corpusId: manifestBase.corpusId,
    language: manifestBase.language,
    corpusVersion: manifestBase.corpusVersion,
    corpusSchemaVersion: PRACTICE_CORPUS_SCHEMA_VERSION,
    partitionPolicyVersion: manifestBase.partitionPolicyVersion,
    partitionPolicySalt: partitionPolicy.salt,
    sources,
    familyAssignments: familyAssignments.map(({ familyId, partition, assignment }) => ({ familyId, partition, assignment })),
    content: items.map(({ contentId, familyId, sourceId, partition, contentHash }) => ({ contentId, familyId, sourceId, partition, contentHash })),
  };
}

export function buildPracticeCorpusFromInputs({
  sourceRegistry,
  authoringDocuments,
  hashText,
  partitionPolicy = PRACTICE_CORPUS_DEFAULT_PARTITION_POLICY,
  nearDuplicatePolicy = PRACTICE_CORPUS_NEAR_DUPLICATE_POLICY,
  mode = "production",
} = {}) {
  if (typeof hashText !== "function") throw buildError("PRACTICE_CORPUS_HASHER_REQUIRED", "Practice corpus build requires an injected SHA-256 text hasher");
  const sourceValidation = validatePracticeCorpusSourceRegistry(sourceRegistry);
  if (!sourceValidation.valid) throw buildError("PRACTICE_CORPUS_INVALID_SOURCE_REGISTRY", "Practice corpus source registry failed validation", sourceValidation.errors);
  const policyValidation = validatePracticeCorpusPartitionPolicy(partitionPolicy);
  if (!policyValidation.valid) throw buildError("PRACTICE_CORPUS_INVALID_PARTITION_POLICY", "Practice corpus partition policy failed validation", policyValidation.errors);
  if (!Array.isArray(authoringDocuments) || !authoringDocuments.length) throw buildError("PRACTICE_CORPUS_NO_AUTHORING", "No Practice corpus authoring documents were supplied");
  authoringDocuments.forEach(assertAuthoringDocument);
  const sortedDocuments = [...authoringDocuments].sort((a, b) => a.corpusId.localeCompare(b.corpusId) || a.language.localeCompare(b.language) || a.corpusVersion - b.corpusVersion);
  const base = sortedDocuments[0];
  for (const document of sortedDocuments.slice(1)) {
    for (const key of ["corpusId", "language", "corpusVersion", "partitionPolicyVersion", "status", "createdAt"]) {
      if (document[key] !== base[key]) throw buildError("PRACTICE_CORPUS_MIXED_RELEASE", `Authoring documents disagree on ${key}`);
    }
  }

  const sourceIndex = createPracticeSourceIndex(sourceRegistry);
  const families = [];
  for (const document of sortedDocuments) families.push(...document.families);
  families.sort((a, b) => String(a.familyId).localeCompare(String(b.familyId)));
  const familyIds = new Set();
  const contentIds = new Set();
  const items = [];
  const familyAssignments = [];

  for (const family of families) {
    if (!family || typeof family !== "object" || Array.isArray(family)) throw buildError("PRACTICE_CORPUS_INVALID_FAMILY", "Practice corpus family must be an object");
    if (typeof family.familyId !== "string" || !family.familyId) throw buildError("PRACTICE_CORPUS_INVALID_FAMILY", "Practice corpus familyId is required");
    if (familyIds.has(family.familyId)) throw buildError("PRACTICE_CORPUS_DUPLICATE_FAMILY", `Duplicate Practice corpus familyId: ${family.familyId}`);
    familyIds.add(family.familyId);
    if (typeof family.sourceId !== "string" || !sourceIndex.has(family.sourceId)) throw buildError("PRACTICE_CORPUS_UNKNOWN_SOURCE", `Unknown Practice corpus source: ${family.sourceId}`);
    const source = sourceIndex.get(family.sourceId);
    const requestedUse = source.usageApproval === "test-only" && mode === "test" ? "test" : "production-display";
    const eligibility = getPracticeSourceUsageEligibility(source, requestedUse, { allowTestFixtures: mode === "test" });
    if (!eligibility.allowed) throw buildError("PRACTICE_CORPUS_SOURCE_NOT_APPROVED", `Source ${family.sourceId} is not approved for ${mode} corpus display`, { sourceId: family.sourceId, usageApproval: source.usageApproval });
    if (!Array.isArray(family.items) || !family.items.length) throw buildError("PRACTICE_CORPUS_EMPTY_FAMILY", `Family ${family.familyId} has no content items`);
    for (const rawItem of family.items) {
      if (rawItem && (Object.hasOwn(rawItem, "partition") || Object.hasOwn(rawItem, "partitionLock"))) throw buildError("PRACTICE_CORPUS_ITEM_PARTITION_OVERRIDE", `Item-level partition overrides are forbidden in family ${family.familyId}`);
    }
    const resolved = resolvePracticeFamilyPartition({ familyId: family.familyId, corpusVersion: base.corpusVersion, partitionLock: family.partitionLock ?? null, policy: partitionPolicy });
    familyAssignments.push({ familyId: family.familyId, partition: resolved.partition, assignment: resolved.assignment });
    const sortedRawItems = [...family.items].sort((a, b) => String(a.contentId).localeCompare(String(b.contentId)));
    for (const rawItem of sortedRawItems) {
      if (!rawItem || typeof rawItem.contentId !== "string" || !rawItem.contentId) throw buildError("PRACTICE_CORPUS_INVALID_CONTENT_ID", `Family ${family.familyId} contains an item without contentId`);
      if (contentIds.has(rawItem.contentId)) throw buildError("PRACTICE_CORPUS_DUPLICATE_CONTENT_ID", `Duplicate Practice corpus contentId: ${rawItem.contentId}`);
      contentIds.add(rawItem.contentId);
      if (rawItem.reviewStatus !== "approved") throw buildError("PRACTICE_CORPUS_UNAPPROVED_CONTENT", `Runtime corpus item ${rawItem.contentId} must be approved, not ${rawItem.reviewStatus ?? "missing"}`);
      let text;
      try { text = normalizePracticeCorpusText(rawItem.text, { contentType: rawItem.contentType }); }
      catch (cause) { throw buildError("PRACTICE_CORPUS_INVALID_TEXT", `Content ${rawItem.contentId} failed text normalization: ${cause.message}`); }
      const item = {
        contentId: rawItem.contentId,
        familyId: family.familyId,
        sourceId: family.sourceId,
        language: base.language,
        corpusVersion: base.corpusVersion,
        partition: resolved.partition,
        contentType: rawItem.contentType,
        text,
        contentHash: hashText(text),
        reviewStatus: rawItem.reviewStatus,
        metadata: rawItem.metadata ?? {},
      };
      const validation = validatePracticeCorpusContentRecord(item, { hashText });
      if (!validation.valid) throw buildError("PRACTICE_CORPUS_INVALID_CONTENT", `Content ${item.contentId} failed validation`, validation.errors);
      items.push(item);
    }
  }

  items.sort((a, b) => a.familyId.localeCompare(b.familyId) || a.contentId.localeCompare(b.contentId));
  familyAssignments.sort((a, b) => a.familyId.localeCompare(b.familyId));
  assertPracticeFamilyIsolation(items);
  const duplicates = auditPracticeCorpusDuplicates(items, nearDuplicatePolicy);
  if (duplicates.exact.length) throw buildError("PRACTICE_CORPUS_EXACT_DUPLICATE", "Practice corpus contains duplicate normalized text", duplicates.exact);
  if (duplicates.hard.length) throw buildError("PRACTICE_CORPUS_NEAR_DUPLICATE_CONFLICT", "Practice corpus contains unresolved hard near-duplicate contamination", duplicates.hard);

  const artifacts = Object.fromEntries(PRACTICE_CORPUS_PARTITIONS.map((partition) => [partition, {
    artifactVersion: PRACTICE_CORPUS_ARTIFACT_VERSION,
    corpusSchemaVersion: PRACTICE_CORPUS_SCHEMA_VERSION,
    corpusId: base.corpusId,
    language: base.language,
    corpusVersion: base.corpusVersion,
    partitionPolicyVersion: base.partitionPolicyVersion,
    partition,
    items: items.filter((item) => item.partition === partition),
  }]));

  for (const artifact of Object.values(artifacts)) {
    const validation = validatePracticeCorpusPartitionArtifact(artifact, { hashText });
    assertPracticeCorpusValidation(validation, `Partition artifact ${artifact.partition}`);
  }

  const familyByPartition = emptyCounts();
  const contentByPartition = emptyCounts();
  for (const assignment of familyAssignments) familyByPartition[assignment.partition] += 1;
  for (const item of items) contentByPartition[item.partition] += 1;
  const sourceIds = [...new Set(items.map((item) => item.sourceId))].sort();
  const manifestBase = {
    manifestVersion: 1,
    corpusSchemaVersion: PRACTICE_CORPUS_SCHEMA_VERSION,
    corpusId: base.corpusId,
    language: base.language,
    corpusVersion: base.corpusVersion,
    partitionPolicyVersion: base.partitionPolicyVersion,
    createdAt: base.createdAt,
    sourceIds,
    partitionCounts: contentByPartition,
    familyCounts: { total: familyAssignments.length, byPartition: familyByPartition },
    contentCounts: { total: items.length, byPartition: contentByPartition },
    familyAssignments,
    status: base.status,
  };
  const inventory = createPracticeCorpusInventory({ manifestBase, sourceIndex, familyAssignments, items, partitionPolicy });
  const buildChecksum = hashText(stablePracticeCorpusStringify(inventory));
  const manifest = { ...manifestBase, buildChecksum };
  assertPracticeCorpusValidation(validatePracticeCorpusManifest(manifest), "Practice corpus manifest");
  validateCountIntegrity(manifest, artifacts);

  return Object.freeze({
    manifest,
    artifacts,
    items,
    inventory,
    diagnostics: Object.freeze({
      sourceCount: sourceIds.length,
      familyCount: familyAssignments.length,
      itemCount: items.length,
      partitionCounts: Object.freeze({ ...contentByPartition }),
      familyPartitionCounts: Object.freeze({ ...familyByPartition }),
      exactDuplicateCount: duplicates.exact.length,
      hardNearDuplicateCount: duplicates.hard.length,
      warnings: duplicates.warnings,
      buildChecksum,
    }),
  });
}

export function validatePracticeCorpusBuildChecksum({ manifest, inventory, hashText } = {}) {
  if (typeof hashText !== "function") throw buildError("PRACTICE_CORPUS_HASHER_REQUIRED", "Build checksum validation requires SHA-256 hasher");
  const expected = hashText(stablePracticeCorpusStringify(inventory));
  if (manifest?.buildChecksum !== expected) throw buildError("PRACTICE_CORPUS_BUILD_CHECKSUM_MISMATCH", "Practice corpus manifest build checksum does not match inventory", { expected, actual: manifest?.buildChecksum ?? null });
  return true;
}
