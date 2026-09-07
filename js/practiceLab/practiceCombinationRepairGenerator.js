import {
  PRACTICE_COMBINATION_REPAIR_ERRORS,
  PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS,
  PRACTICE_COMBINATION_REPAIR_PHASES,
} from "./practiceCombinationRepairConstants.js";
import { PRACTICE_COMBINATION_REPAIR_POLICY_V1 } from "./practiceCombinationRepairPolicy.js";
import {
  buildPracticeCombinationRepairPlan,
  createPracticeCombinationRepairContentPlanMetadata,
} from "./practiceCombinationRepairPlan.js";
import { selectPracticeCombinationRepairProbePair } from "./practiceCombinationRepairProbeMatch.js";
import {
  createPracticeCombinationRepairError,
  normalizePracticeCombinationRepairTarget,
} from "./practiceCombinationRepairValidation.js";
import {
  createPracticeContentPlan,
  createPracticeSegmenter,
} from "./practiceSessionContract.js";

const MIN_TARGET_WORDS = 3;
const MAX_PROBE_FAMILY_WIDTH = 3;
const UNIT_SEPARATOR = " ";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const finiteRatio = (numerator, denominator) => Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
  ? numerator / denominator
  : null;

function derivedDifficultyFeatures(item = {}) {
  return {
    meanWordLength: finiteRatio(item.graphemeCount, item.wordCount),
    p90WordLength: null,
    uppercaseRatio: finiteRatio(item.uppercaseCount, item.graphemeCount),
    punctuationRatio: finiteRatio(item.punctuationCount, item.graphemeCount),
    digitRatio: finiteRatio(item.digitCount, item.graphemeCount),
    symbolRatio: null,
    lexicalRarityScore: null,
    bigramRarityScore: null,
  };
}

function candidateFromReference(ref, content, cap) {
  if (!ref || !content || content.partition !== "training") return null;
  const count = Number(ref.count);
  if (!Number.isInteger(count) || count < 1 || count > cap) return null;
  if (ref.contentId !== content.contentId || ref.familyId !== content.familyId) return null;
  return Object.freeze({
    contentId: content.contentId,
    contentHash: content.contentHash,
    familyId: content.familyId,
    partition: "training",
    targetOpportunityCount: count,
    typabilityScore: Number.isFinite(content.metadata?.typabilityScore)
      ? Number(content.metadata.typabilityScore)
      : null,
    difficultyFeatures: Object.freeze(derivedDifficultyFeatures(content)),
  });
}

function sortedCandidates(refs, contentById, cap) {
  return Object.freeze((refs || [])
    .map((ref) => candidateFromReference(ref, contentById.get(ref.contentId), cap))
    .filter(Boolean)
    .sort((a, b) => a.familyId.localeCompare(b.familyId)
      || a.contentId.localeCompare(b.contentId)
      || a.targetOpportunityCount - b.targetOpportunityCount));
}

function selectUnitsToQuota(candidates, quota, { familyIds = null, offset = 0 } = {}) {
  const allowed = familyIds ? new Set(familyIds) : null;
  const pool = candidates.filter((candidate) => !allowed || allowed.has(candidate.familyId));
  if (!pool.length || !Number.isInteger(quota) || quota < 1) return null;
  const memo = new Set();

  const visit = (remaining, step) => {
    if (remaining === 0) return [];
    const key = `${remaining}|${step % pool.length}`;
    if (memo.has(key)) return null;
    memo.add(key);
    for (let cursor = 0; cursor < pool.length; cursor += 1) {
      const index = (offset + step + cursor) % pool.length;
      const candidate = pool[index];
      if (candidate.targetOpportunityCount > remaining) continue;
      const tail = visit(remaining - candidate.targetOpportunityCount, step + cursor + 1);
      if (tail) return [candidate, ...tail];
    }
    return null;
  };

  return visit(quota, 0);
}

function familyWindows(familyIds) {
  const windows = [];
  const seen = new Set();
  for (let width = 1; width <= Math.min(MAX_PROBE_FAMILY_WIDTH, familyIds.length); width += 1) {
    for (let start = 0; start < familyIds.length; start += 1) {
      const values = [];
      for (let index = 0; index < width; index += 1) values.push(familyIds[(start + index) % familyIds.length]);
      const unique = [...new Set(values)].sort();
      const key = unique.join("|");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      windows.push(unique);
    }
  }
  return windows;
}

function buildProbeCandidates(candidates, quota, prefix) {
  const familyIds = [...new Set(candidates.map((candidate) => candidate.familyId))].sort();
  const probes = [];
  for (const [windowIndex, familyIdsForProbe] of familyWindows(familyIds).entries()) {
    for (let offset = 0; offset < Math.min(candidates.length, 3); offset += 1) {
      const units = selectUnitsToQuota(candidates, quota, { familyIds: familyIdsForProbe, offset });
      if (!units) continue;
      probes.push(Object.freeze({
        probeId: `${prefix}-${String(windowIndex + 1).padStart(2, "0")}-${offset + 1}`,
        units: Object.freeze(units),
      }));
    }
  }
  return Object.freeze(probes);
}

function countTargetOccurrences(text, entityKey, language) {
  let normalized;
  try { normalized = String(text).normalize("NFC").toLocaleLowerCase(language || undefined); }
  catch { normalized = String(text).normalize("NFC").toLowerCase(); }
  const haystack = Array.from(normalized);
  const needle = Array.from(entityKey);
  let count = 0;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((value, offset) => haystack[index + offset] === value)) count += 1;
  }
  return count;
}

function generatorError(code, message, details = null) {
  return createPracticeCombinationRepairError(code, message, details);
}

async function loadTargetRefs({ targetIndex, target }) {
  return Promise.all([
    targetIndex.getTargetContentRefs({
      partition: "training",
      entityType: target.entityType,
      entityKey: target.entityKey,
      purpose: "training",
    }),
    targetIndex.getTargetWordRefs({
      partition: "training",
      entityType: target.entityType,
      entityKey: target.entityKey,
      purpose: "training",
    }),
  ]);
}

export async function inspectPracticeCombinationRepairAvailability({
  targetIndex,
  contentItems = [],
  entityType,
  entityKey,
  language = "en",
  policy = PRACTICE_COMBINATION_REPAIR_POLICY_V1,
} = {}) {
  const target = normalizePracticeCombinationRepairTarget({ entityType, entityKey, language });
  if (!target) return freezeDeep({
    status: "unsupported",
    target: null,
    reasons: [PRACTICE_COMBINATION_REPAIR_ERRORS.UNSUPPORTED_COMBINATION_TARGET],
  });
  if (!targetIndex || typeof targetIndex.getTargetContentRefs !== "function" || typeof targetIndex.getTargetWordRefs !== "function") {
    return freezeDeep({ status: "unavailable", target, reasons: [PRACTICE_COMBINATION_REPAIR_ERRORS.TARGET_INDEX_NOT_FOUND] });
  }

  let refs;
  let words;
  try {
    [refs, words] = await loadTargetRefs({ targetIndex, target });
  } catch (error) {
    return freezeDeep({
      status: "unavailable",
      target,
      reasons: [error?.code || PRACTICE_COMBINATION_REPAIR_ERRORS.TARGET_INDEX_NOT_FOUND],
    });
  }

  if ((words?.length ?? 0) < MIN_TARGET_WORDS) {
    return freezeDeep({
      status: "limited-content",
      target,
      reasons: [PRACTICE_COMBINATION_REPAIR_ERRORS.INSUFFICIENT_TARGET_WORDS],
      targetWordCount: words?.length ?? 0,
      targetContentCount: refs?.length ?? 0,
    });
  }

  const contentById = new Map((contentItems || [])
    .filter((item) => item?.partition === "training")
    .map((item) => [item.contentId, item]));
  const probeCandidates = sortedCandidates(refs, contentById, policy.content.maxTargetOpportunitiesPerUnit);
  const targetCandidates = sortedCandidates(refs, contentById, policy.content.acquireMaxTargetOpportunitiesPerUnit);
  if (!probeCandidates.length || !targetCandidates.length) {
    return freezeDeep({
      status: "limited-content",
      target,
      reasons: [PRACTICE_COMBINATION_REPAIR_ERRORS.INSUFFICIENT_TARGET_CONTENT],
      targetWordCount: words.length,
      targetContentCount: refs?.length ?? 0,
    });
  }

  const quota = policy.quotas[target.entityType]["entry-probe"];
  const probes = buildProbeCandidates(probeCandidates, quota, "probe");
  const matched = selectPracticeCombinationRepairProbePair({ entryCandidates: probes, exitCandidates: probes, policy });
  if (!matched) {
    return freezeDeep({
      status: "limited-content",
      target,
      reasons: [PRACTICE_COMBINATION_REPAIR_ERRORS.INSUFFICIENT_PROBE_MATCH],
      targetWordCount: words.length,
      targetContentCount: refs?.length ?? 0,
      familyCount: new Set(probeCandidates.map((candidate) => candidate.familyId)).size,
    });
  }

  return freezeDeep({
    status: "ready",
    target,
    reasons: [],
    targetWordCount: words.length,
    targetContentCount: refs?.length ?? 0,
    familyCount: new Set(targetCandidates.map((candidate) => candidate.familyId)).size,
  });
}

export async function buildPracticeCombinationRepairTrainingPlan({
  targetIndex,
  contentItems = [],
  corpusBinding,
  entityType,
  entityKey,
  targetSource = "manual",
  language = "en",
  policy = PRACTICE_COMBINATION_REPAIR_POLICY_V1,
} = {}) {
  const target = normalizePracticeCombinationRepairTarget({ entityType, entityKey, language });
  if (!target) throw generatorError(
    PRACTICE_COMBINATION_REPAIR_ERRORS.UNSUPPORTED_COMBINATION_TARGET,
    "Combination Repair requires one lowercase bigram or trigram target",
  );
  if (!targetIndex) throw generatorError(
    PRACTICE_COMBINATION_REPAIR_ERRORS.TARGET_INDEX_NOT_FOUND,
    "Combination Repair target index is unavailable",
  );

  const availability = await inspectPracticeCombinationRepairAvailability({
    targetIndex,
    contentItems,
    entityType,
    entityKey,
    language,
    policy,
  });
  if (availability.status !== "ready") {
    const code = availability.reasons[0] || PRACTICE_COMBINATION_REPAIR_ERRORS.INSUFFICIENT_TARGET_CONTENT;
    throw generatorError(code, `Combination Repair cannot build a safe ${target.entityType} plan for ${target.entityKey}`, availability);
  }

  const [refs] = await loadTargetRefs({ targetIndex, target });
  const contentById = new Map((contentItems || [])
    .filter((item) => item?.partition === "training")
    .map((item) => [item.contentId, item]));
  const probeCandidates = sortedCandidates(refs, contentById, policy.content.maxTargetOpportunitiesPerUnit);
  const acquireCandidates = sortedCandidates(refs, contentById, policy.content.acquireMaxTargetOpportunitiesPerUnit);
  const probeQuota = policy.quotas[target.entityType]["entry-probe"];
  const probeOptions = buildProbeCandidates(probeCandidates, probeQuota, "probe");
  const matched = selectPracticeCombinationRepairProbePair({ entryCandidates: probeOptions, exitCandidates: probeOptions, policy });
  if (!matched) throw generatorError(
    PRACTICE_COMBINATION_REPAIR_ERRORS.INSUFFICIENT_PROBE_MATCH,
    "Combination Repair could not create family-disjoint matched probes",
  );

  const phaseUnits = {
    "entry-probe": matched.entry.units,
    acquire: selectUnitsToQuota(acquireCandidates, policy.quotas[target.entityType].acquire, { offset: 0 }),
    integrate: selectUnitsToQuota(probeCandidates, policy.quotas[target.entityType].integrate, { offset: 1 }),
    interleave: selectUnitsToQuota(probeCandidates, policy.quotas[target.entityType].interleave, { offset: 2 }),
    "exit-probe": matched.exit.units,
  };

  for (const phase of PRACTICE_COMBINATION_REPAIR_PHASES) {
    if (!phaseUnits[phase.id]) throw generatorError(
      PRACTICE_COMBINATION_REPAIR_ERRORS.INSUFFICIENT_TARGET_CONTENT,
      `Combination Repair cannot satisfy the ${phase.id} opportunity quota`,
      { phaseId: phase.id, quota: PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS[target.entityType][phase.id] },
    );
  }

  return buildPracticeCombinationRepairPlan({
    language,
    entityType: target.entityType,
    entityKey: target.entityKey,
    targetSource,
    corpusBinding,
    phaseUnits,
    policy,
  });
}

export function buildPracticeCombinationRepairContentPlan({
  plan,
  contentItems = [],
  segmenter = null,
} = {}) {
  if (!plan?.target || plan.partition !== "training") throw new TypeError("Combination Repair content requires a frozen training plan");
  const byId = new Map((contentItems || [])
    .filter((item) => item?.partition === "training")
    .map((item) => [item.contentId, item]));
  const segment = createPracticeSegmenter(segmenter);
  const pieces = [];
  const units = [];
  const phaseRanges = [];
  let cursor = 0;

  for (const phase of plan.phases) {
    let phaseStart = null;
    for (const [unitIndex, unit] of phase.units.entries()) {
      const content = byId.get(unit.contentId);
      if (!content || content.contentHash !== unit.contentHash || content.familyId !== unit.familyId) {
        throw generatorError(
          PRACTICE_COMBINATION_REPAIR_ERRORS.CONTENT_HASH_MISMATCH,
          `Combination Repair source content no longer matches ${unit.contentId}`,
        );
      }
      const actualCount = countTargetOccurrences(content.text, plan.target.entityKey, plan.language);
      if (actualCount !== unit.targetOpportunityCount) {
        throw generatorError(
          PRACTICE_COMBINATION_REPAIR_ERRORS.CONTENT_HASH_MISMATCH,
          `Combination Repair target count changed for ${unit.contentId}`,
          { expected: unit.targetOpportunityCount, actual: actualCount },
        );
      }
      if (pieces.length) {
        pieces.push(UNIT_SEPARATOR);
        cursor += segment(UNIT_SEPARATOR).length;
      }
      phaseStart ??= cursor;
      const startIndex = cursor;
      const graphemes = segment(content.text);
      pieces.push(content.text);
      cursor += graphemes.length;
      units.push({
        unitId: `cr-${phase.ordinal}-${unitIndex + 1}`,
        type: "segment",
        startIndex,
        endIndex: cursor,
        text: content.text,
        metadata: {
          combinationRepair: {
            phaseId: phase.id,
            phaseOrdinal: phase.ordinal,
            cue: phase.cue,
            targetOpportunityCount: unit.targetOpportunityCount,
            sourceContentId: unit.contentId,
            sourceFamilyId: unit.familyId,
          },
        },
      });
    }
    phaseRanges.push({
      id: phase.id,
      ordinal: phase.ordinal,
      label: phase.label,
      cue: phase.cue,
      startIndex: phaseStart ?? cursor,
      endIndex: cursor,
      opportunityQuota: phase.opportunityQuota,
    });
  }

  const metadata = createPracticeCombinationRepairContentPlanMetadata(plan);
  return createPracticeContentPlan({
    contentId: `practice-content_combination-repair-${String(plan.planHash).replace(/[^a-z0-9._-]/gi, "-")}`,
    contentGeneratorVersion: plan.generatorVersion,
    text: pieces.join(""),
    units,
    targetEntities: metadata.targetEntities,
    completion: { mode: "content", value: null },
    metadata: {
      ...metadata,
      language: plan.language,
      combinationRepair: {
        ...metadata.combinationRepair,
        target: { ...plan.target },
        phaseRanges,
      },
    },
  }, { segmenter });
}
