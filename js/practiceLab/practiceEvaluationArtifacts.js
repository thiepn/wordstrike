import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_BENCHMARK_FORM_VERSION,
  PRACTICE_BENCHMARK_MATCH_POLICY_V1,
  PRACTICE_BENCHMARK_SUITE_SCHEMA_VERSION,
  PRACTICE_BENCHMARK_MATCH_POLICY_VERSION,
  PRACTICE_EVALUATION_PROTOCOL_V1,
  PRACTICE_TRANSFER_POOL_SCHEMA_VERSION,
  PRACTICE_TRANSFER_POOL_POLICY_V1,
  PRACTICE_TRANSFER_SELECTION_POLICY_VERSION,
  PRACTICE_TRANSFER_UNIT_VERSION,
} from "./practiceEvaluationConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const natural = new Set(["sentence", "passage"]);
const stable = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function selectNatural(corpus, partition) {
  if (!corpus || corpus.partition !== partition) return [];
  return [...(corpus.items ?? [])]
    .filter((item) => item.partition === partition && item.reviewStatus === "approved" && natural.has(item.contentType) && typeof item.text === "string")
    .sort((a, b) => a.familyId.localeCompare(b.familyId) || a.contentId.localeCompare(b.contentId));
}

function joinMetrics(items, separator) {
  const text = items.map((item) => item.text).join(separator);
  return {
    text,
    graphemeCount: [...text].length,
    wordCount: text.trim() ? text.trim().split(/\s+/u).length : 0,
  };
}

function contentHashes(items) {
  return Object.fromEntries(items.map((item) => [item.contentId, item.contentHash]));
}

function formHash({ version, ids, hashes, separator, protocolVersion }) {
  return hashPracticeContent(`${version}|${ids.join("|")}|${ids.map((id) => hashes[id]).join("|")}|${separator}|${protocolVersion}`);
}

function compose(items, { targetCount, minimumGraphemes, maximumGraphemes, minimumWords = 0, separator }) {
  const results = [];
  let current = [];
  for (const item of items) {
    if (results.length >= targetCount) break;
    const candidate = [...current, item];
    const metrics = joinMetrics(candidate, separator);
    if (metrics.graphemeCount > maximumGraphemes && current.length) {
      const currentMetrics = joinMetrics(current, separator);
      if (currentMetrics.graphemeCount >= minimumGraphemes && currentMetrics.wordCount >= minimumWords) results.push({ items: current, ...currentMetrics });
      current = [item];
    } else {
      current = candidate;
    }
    const ready = joinMetrics(current, separator);
    if (ready.graphemeCount >= minimumGraphemes && ready.wordCount >= minimumWords) {
      results.push({ items: current, ...ready });
      current = [];
    }
  }
  if (results.length < targetCount && current.length) {
    const metrics = joinMetrics(current, separator);
    if (metrics.graphemeCount >= minimumGraphemes && metrics.wordCount >= minimumWords && metrics.graphemeCount <= maximumGraphemes) results.push({ items: current, ...metrics });
  }
  return results.slice(0, targetCount);
}

function defaultScoreFromSingleItem(group, typabilityByContentId) {
  if (group.items.length !== 1) return null;
  const item = typabilityByContentId.get(group.items[0].contentId);
  return item ? { features: item.features, textDifficulty: item.textDifficulty } : null;
}

function rmsDistance(vectors, index, names) {
  const available = names.filter((name) => vectors.every((vector) => Number.isFinite(vector?.[name])));
  if (!available.length) return null;
  const centroid = Object.fromEntries(available.map((name) => [name, vectors.reduce((sum, vector) => sum + vector[name], 0) / vectors.length]));
  const squared = available.reduce((sum, name) => sum + (vectors[index][name] - centroid[name]) ** 2, 0) / available.length;
  return Math.sqrt(squared);
}

function benchmarkMatch(forms, policy) {
  if (!forms.length) return { valid: false, blockers: ["no-valid-forms"], forms: [] };
  const lengths = forms.map((form) => form.graphemeCount);
  const medianLength = median(lengths);
  const difficulties = forms.map((form) => form.typability?.textDifficulty?.difficultyIndex).filter(Number.isFinite);
  const percentiles = forms.map((form) => form.typability?.textDifficulty?.relativeDifficultyPercentile).filter(Number.isFinite);
  const standardized = forms.map((form) => form.typability?.textDifficulty?.standardizedFeatures ?? {});
  const report = forms.map((form, index) => {
    const rms = rmsDistance(standardized, index, policy.coreFeatureNames);
    const weight = form.typability?.textDifficulty?.availableModelWeight ?? 0;
    const lengthDeviation = medianLength ? Math.abs(form.graphemeCount - medianLength) / medianLength : 0;
    const coreDeviation = policy.coreFeatureNames
      .filter((name) => Number.isFinite(standardized[index]?.[name]))
      .map((name) => {
        const values = standardized.map((vector) => vector?.[name]).filter(Number.isFinite);
        return Math.abs(standardized[index][name] - median(values));
      });
    const maximumCoreDeviation = coreDeviation.length ? Math.max(...coreDeviation) : null;
    const valid = weight >= policy.minimumAvailableModelWeight
      && Number.isFinite(rms) && rms <= policy.maximumWeightedRmsDistance
      && lengthDeviation <= policy.maximumLengthDeviationFraction
      && (maximumCoreDeviation == null || maximumCoreDeviation <= policy.maximumCoreFeatureCentroidDistance);
    return { formId: form.formId, availableModelWeight: weight, weightedRmsDistance: rms, lengthDeviationFraction: lengthDeviation, maximumCoreFeatureDeviation: maximumCoreDeviation, valid };
  });
  const blockers = [];
  if (difficulties.length !== forms.length) blockers.push("missing-difficulty-index");
  else if (Math.max(...difficulties) - Math.min(...difficulties) > policy.maximumDifficultySpread) blockers.push("difficulty-spread");
  if (percentiles.length !== forms.length) blockers.push("missing-relative-percentile");
  else if (Math.max(...percentiles) - Math.min(...percentiles) > policy.maximumPercentileSpread) blockers.push("percentile-spread");
  if (report.some((entry) => !entry.valid)) blockers.push("form-match-threshold");
  return { valid: blockers.length === 0, blockers, forms: report };
}

export function buildPracticeBenchmarkSuiteArtifact({
  corpus,
  typabilityArtifact,
  scoreComposite = null,
  suiteId = "WS-BENCH-EN-1",
  suiteVersion = 1,
  policy = PRACTICE_BENCHMARK_MATCH_POLICY_V1,
  bindings = {},
} = {}) {
  const candidates = selectNatural(corpus, "benchmark");
  const groups = compose(candidates, {
    targetCount: policy.targetFormCount,
    minimumGraphemes: policy.minimumGraphemes,
    maximumGraphemes: policy.maximumGraphemes,
    minimumWords: policy.minimumWords,
    separator: policy.separator,
  });
  const typabilityByContentId = new Map((typabilityArtifact?.items ?? []).map((entry) => [entry.contentId, entry]));
  const protocol = PRACTICE_EVALUATION_PROTOCOL_V1.benchmark;
  const forms = groups.map((group, index) => {
    const ids = group.items.map((item) => item.contentId);
    const hashes = contentHashes(group.items);
    const typability = typeof scoreComposite === "function"
      ? scoreComposite(group.text, group.items)
      : defaultScoreFromSingleItem(group, typabilityByContentId);
    return {
      formId: `${suiteId}-F${String(index + 1).padStart(2, "0")}`,
      formVersion: PRACTICE_BENCHMARK_FORM_VERSION,
      orderedContentIds: ids,
      familyIds: group.items.map((item) => item.familyId),
      contentHashes: hashes,
      separator: policy.separator,
      graphemeCount: group.graphemeCount,
      wordCount: group.wordCount,
      formHash: formHash({ version: PRACTICE_BENCHMARK_FORM_VERSION, ids, hashes, separator: policy.separator, protocolVersion: protocol.protocolVersion }),
      typability,
      measurementProtocol: protocol,
      calibration: null,
    };
  });
  const matchReport = benchmarkMatch(forms, policy);
  const releaseBlockers = [];
  if (forms.length < policy.minimumReadyFormCount) releaseBlockers.push(`minimum-ready-form-count:${forms.length}/${policy.minimumReadyFormCount}`);
  if (candidates.length === 0) releaseBlockers.push("no-approved-natural-benchmark-content");
  if (candidates.some((item) => [...item.text].length < policy.minimumGraphemes) && forms.length < policy.minimumReadyFormCount) releaseBlockers.push("insufficient-protected-form-length");
  if (!matchReport.valid && forms.length) releaseBlockers.push(...matchReport.blockers);
  if ((typabilityArtifact?.items ?? []).some((item) => Number(item?.textDifficulty?.availableModelWeight ?? 0) < policy.minimumAvailableModelWeight)) releaseBlockers.push("typability-coverage-below-0.90");
  const artifact = {
    suiteId,
    suiteSchemaVersion: PRACTICE_BENCHMARK_SUITE_SCHEMA_VERSION,
    suiteVersion,
    language: corpus?.language ?? "en",
    abilityChannel: "cold-natural-text",
    status: releaseBlockers.length ? "draft" : "ready",
    comparabilityClass: "engineering-matched",
    measurementProtocol: protocol,
    corpusBinding: bindings.corpusBinding ?? null,
    indexBinding: bindings.indexBinding ?? null,
    typabilityBinding: bindings.typabilityBinding ?? null,
    matchPolicyVersion: PRACTICE_BENCHMARK_MATCH_POLICY_VERSION,
    forms,
    matchReport: { ...matchReport, releaseBlockers: [...new Set(releaseBlockers)] },
    calibration: null,
  };
  artifact.checksum = hashPracticeContent(stable(artifact));
  return freezeDeep(artifact);
}

export function buildPracticeTransferPoolArtifact({
  corpus,
  typabilityArtifact,
  scoreComposite = null,
  poolId = "WS-TRANSFER-EN-1",
  poolVersion = 1,
  policy = PRACTICE_TRANSFER_POOL_POLICY_V1,
  bindings = {},
} = {}) {
  const candidates = selectNatural(corpus, "transfer");
  const groups = compose(candidates, {
    targetCount: policy.targetUnitCount,
    minimumGraphemes: policy.minimumGraphemes,
    maximumGraphemes: policy.maximumGraphemes,
    minimumWords: 0,
    separator: policy.separator,
  });
  const typabilityByContentId = new Map((typabilityArtifact?.items ?? []).map((entry) => [entry.contentId, entry]));
  const protocol = PRACTICE_EVALUATION_PROTOCOL_V1["cold-transfer"];
  const units = groups.map((group, index) => {
    const ids = group.items.map((item) => item.contentId);
    const hashes = contentHashes(group.items);
    const typability = typeof scoreComposite === "function" ? scoreComposite(group.text, group.items) : defaultScoreFromSingleItem(group, typabilityByContentId);
    const percentile = typability?.textDifficulty?.relativeDifficultyPercentile;
    return {
      unitId: `${poolId}-U${String(index + 1).padStart(2, "0")}`,
      unitVersion: PRACTICE_TRANSFER_UNIT_VERSION,
      language: corpus?.language ?? "en",
      orderedContentIds: ids,
      familyIds: group.items.map((item) => item.familyId),
      contentHashes: hashes,
      separator: policy.separator,
      graphemeCount: group.graphemeCount,
      unitHash: formHash({ version: PRACTICE_TRANSFER_UNIT_VERSION, ids, hashes, separator: policy.separator, protocolVersion: protocol.protocolVersion }),
      typability,
      measurementProtocol: protocol,
      withinCoreDifficultyRange: Number.isFinite(percentile) && percentile >= policy.allowedPercentileMinimum && percentile <= policy.allowedPercentileMaximum,
    };
  });
  const releaseBlockers = [];
  if (units.length < policy.minimumReadyUnitCount) releaseBlockers.push(`minimum-ready-unit-count:${units.length}/${policy.minimumReadyUnitCount}`);
  if (!candidates.length) releaseBlockers.push("no-approved-natural-transfer-content");
  if (candidates.some((item) => [...item.text].length < policy.minimumGraphemes) && units.length < policy.minimumReadyUnitCount) releaseBlockers.push("insufficient-protected-unit-length");
  if (units.some((unit) => !unit.withinCoreDifficultyRange)) releaseBlockers.push("transfer-percentile-outside-20-80");
  const artifact = {
    poolId,
    poolSchemaVersion: PRACTICE_TRANSFER_POOL_SCHEMA_VERSION,
    poolVersion,
    language: corpus?.language ?? "en",
    status: releaseBlockers.length ? "draft" : "ready",
    selectionPolicyVersion: PRACTICE_TRANSFER_SELECTION_POLICY_VERSION,
    measurementProtocol: protocol,
    corpusBinding: bindings.corpusBinding ?? null,
    indexBinding: bindings.indexBinding ?? null,
    typabilityBinding: bindings.typabilityBinding ?? null,
    separator: policy.separator,
    units,
    releaseReport: { releaseBlockers: [...new Set(releaseBlockers)] },
  };
  artifact.checksum = hashPracticeContent(stable(artifact));
  return freezeDeep(artifact);
}
