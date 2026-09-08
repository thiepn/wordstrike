import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_REAL_TEXT_GENERATOR_VERSION,
  PRACTICE_REAL_TEXT_POOL_ID,
  PRACTICE_REAL_TEXT_POOL_SCHEMA_VERSION,
  PRACTICE_REAL_TEXT_POOL_STATUSES,
  PRACTICE_REAL_TEXT_POOL_VERSION,
  PRACTICE_REAL_TEXT_SEPARATOR,
} from "./practiceRealTextConstants.js";
import { PRACTICE_REAL_TEXT_POLICY_V1 } from "./practiceRealTextPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => { out[key] = canonical(value[key]); return out; }, {});
  return value;
};
const checksum = (value) => hashPracticeContent(JSON.stringify(canonical(value)));
const ratio = (count, denominator) => denominator > 0 ? count / denominator : 0;

function buildUnit(item, indexRecord, typabilityRecord) {
  const difficulty = typabilityRecord.textDifficulty;
  const features = typabilityRecord.features;
  const body = {
    unitId: `realtext-${item.contentId}`.replace(/[^a-z0-9._-]/gi, "-"),
    unitVersion: 1,
    familyIds: [item.familyId],
    orderedContentIds: [item.contentId],
    contentHashes: { [item.contentId]: item.contentHash },
    graphemeCount: indexRecord.graphemeCount,
    wordCount: indexRecord.wordCount,
    difficultyIndex: difficulty.difficultyIndex,
    relativeDifficultyPercentile: difficulty.relativeDifficultyPercentile,
    availableModelWeight: difficulty.availableModelWeight,
    digitRatio: ratio(features.digitRatio != null ? features.digitRatio * features.nonWhitespaceGraphemeCount : indexRecord.digitCount, features.nonWhitespaceGraphemeCount || indexRecord.graphemeCount),
    symbolRatio: features.symbolRatio ?? 0,
    separator: PRACTICE_REAL_TEXT_SEPARATOR,
  };
  return freezeDeep({ ...body, unitHash: checksum(body) });
}

export function validatePracticeRealTextPool(pool, { policy = PRACTICE_REAL_TEXT_POLICY_V1 } = {}) {
  const reasons = [];
  if (!pool || typeof pool !== "object") return { valid: false, reasons: ["pool-missing"] };
  if (pool.poolId !== PRACTICE_REAL_TEXT_POOL_ID || pool.poolSchemaVersion !== PRACTICE_REAL_TEXT_POOL_SCHEMA_VERSION || pool.poolVersion !== PRACTICE_REAL_TEXT_POOL_VERSION) reasons.push("pool-identity");
  if (!PRACTICE_REAL_TEXT_POOL_STATUSES.includes(pool.status)) reasons.push("pool-status");
  if (pool.language !== policy.language) reasons.push("pool-language");
  if (!Array.isArray(pool.units)) reasons.push("pool-units");
  const families = new Set();
  for (const unit of pool.units ?? []) {
    if (!unit?.unitId || !Number.isInteger(unit.graphemeCount) || !Number.isInteger(unit.wordCount)) reasons.push("unit-shape");
    if (unit.graphemeCount < policy.pool.minimumUnitGraphemes || unit.graphemeCount > policy.pool.maximumUnitGraphemes || unit.wordCount < policy.pool.minimumUnitWords) reasons.push("unit-size");
    if (unit.availableModelWeight < policy.pool.minimumTypabilityWeight) reasons.push("unit-typability");
    if (unit.relativeDifficultyPercentile < policy.pool.minimumDifficultyPercentile || unit.relativeDifficultyPercentile > policy.pool.maximumDifficultyPercentile) reasons.push("unit-difficulty");
    if (unit.digitRatio > policy.pool.maximumDigitRatio || unit.symbolRatio > policy.pool.maximumSymbolRatio) reasons.push("unit-composition");
    if (!Array.isArray(unit.familyIds) || new Set(unit.familyIds).size !== unit.familyIds.length) reasons.push("unit-family-duplicate");
    for (const familyId of unit.familyIds ?? []) {
      if (families.has(familyId)) reasons.push("pool-family-duplicate");
      families.add(familyId);
    }
    const { unitHash, ...body } = unit;
    if (unitHash !== checksum(body)) reasons.push("unit-hash");
  }
  if (pool.status === "ready" && (pool.units?.length ?? 0) < policy.pool.minimumReadyUnitCount) reasons.push("ready-count");
  const { checksum: poolChecksum, ...poolBody } = pool;
  if (poolChecksum !== checksum(poolBody)) reasons.push("pool-checksum");
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function buildPracticeRealTextPool({
  trainingCorpus,
  corpusManifest,
  indexContent,
  indexManifest,
  typabilityArtifact,
  typabilityManifest,
  sourceRegistry,
  policy = PRACTICE_REAL_TEXT_POLICY_V1,
} = {}) {
  const blockers = [];
  const language = policy.language;
  if (trainingCorpus?.partition !== "training" || trainingCorpus?.language !== language) blockers.push("training-corpus-unavailable");
  if (trainingCorpus?.corpusId !== corpusManifest?.corpusId || trainingCorpus?.corpusVersion !== corpusManifest?.corpusVersion) blockers.push("corpus-version-mismatch");
  if (indexContent?.partition !== "training" || indexContent?.corpusChecksum !== corpusManifest?.buildChecksum) blockers.push("index-binding-mismatch");
  if (typabilityArtifact?.partition !== "training" || typabilityArtifact?.corpusChecksum !== corpusManifest?.buildChecksum) blockers.push("typability-binding-mismatch");
  if (typabilityManifest?.corpusChecksum !== corpusManifest?.buildChecksum || typabilityManifest?.indexChecksum !== indexManifest?.indexChecksum) blockers.push("typability-manifest-mismatch");

  const sources = new Map((sourceRegistry?.sources ?? []).map((entry) => [entry.sourceId, entry]));
  const indexed = new Map((indexContent?.items ?? []).map((entry) => [entry.contentId, entry]));
  const typed = new Map((typabilityArtifact?.items ?? []).map((entry) => [entry.contentId, entry]));
  const units = [];
  const seenFamilies = new Set();
  for (const item of [...(trainingCorpus?.items ?? [])].sort((a, b) => a.contentId.localeCompare(b.contentId))) {
    if (units.length >= policy.pool.targetUnitCount) break;
    const source = sources.get(item.sourceId);
    const indexRecord = indexed.get(item.contentId);
    const typabilityRecord = typed.get(item.contentId);
    if (item.partition !== "training" || item.language !== language) continue;
    if (!policy.pool.eligibleContentTypes.includes(item.contentType)) continue;
    if (item.reviewStatus !== "approved" || source?.usageApproval !== "practice-display-approved") continue;
    if (!indexRecord || indexRecord.partition !== "training" || indexRecord.contentHash !== item.contentHash || indexRecord.familyId !== item.familyId) continue;
    if (!typabilityRecord || typabilityRecord.partition !== "training" || typabilityRecord.contentHash !== item.contentHash) continue;
    if (seenFamilies.has(item.familyId)) continue;
    const difficulty = typabilityRecord.textDifficulty;
    const features = typabilityRecord.features;
    if (!difficulty || difficulty.availableModelWeight < policy.pool.minimumTypabilityWeight) continue;
    if (difficulty.relativeDifficultyPercentile < policy.pool.minimumDifficultyPercentile || difficulty.relativeDifficultyPercentile > policy.pool.maximumDifficultyPercentile) continue;
    if (indexRecord.graphemeCount < policy.pool.minimumUnitGraphemes || indexRecord.graphemeCount > policy.pool.maximumUnitGraphemes || indexRecord.wordCount < policy.pool.minimumUnitWords) continue;
    if ((features?.digitRatio ?? 0) > policy.pool.maximumDigitRatio || (features?.symbolRatio ?? 0) > policy.pool.maximumSymbolRatio) continue;
    const unit = buildUnit(item, indexRecord, typabilityRecord);
    units.push(unit);
    seenFamilies.add(item.familyId);
  }

  if (units.length < policy.pool.minimumReadyUnitCount) blockers.push(`minimum-ready-unit-count:${units.length}/${policy.pool.minimumReadyUnitCount}`);
  const status = blockers.length ? "draft" : "ready";
  const body = {
    poolId: PRACTICE_REAL_TEXT_POOL_ID,
    poolSchemaVersion: PRACTICE_REAL_TEXT_POOL_SCHEMA_VERSION,
    poolVersion: PRACTICE_REAL_TEXT_POOL_VERSION,
    generatorVersion: PRACTICE_REAL_TEXT_GENERATOR_VERSION,
    language,
    status,
    separator: PRACTICE_REAL_TEXT_SEPARATOR,
    corpusBinding: {
      corpusId: corpusManifest?.corpusId ?? null,
      corpusVersion: corpusManifest?.corpusVersion ?? null,
      corpusChecksum: corpusManifest?.buildChecksum ?? null,
    },
    indexBinding: {
      indexSchemaVersion: indexManifest?.indexSchemaVersion ?? null,
      indexChecksum: indexManifest?.indexChecksum ?? null,
    },
    typabilityBinding: {
      modelVersion: typabilityManifest?.modelVersion ?? null,
      featureVersion: typabilityManifest?.featureVersion ?? null,
      referenceVersion: typabilityManifest?.referenceVersion ?? null,
      referenceChecksum: typabilityManifest?.referenceChecksum ?? null,
      trainingArtifactChecksum: typabilityManifest?.artifactChecksums?.find((entry) => entry.path === "training.json")?.sha256 ?? null,
    },
    units,
    releaseReport: { releaseBlockers: blockers },
  };
  return freezeDeep({ ...body, checksum: checksum(body) });
}
