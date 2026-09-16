import { analyzePracticeText } from "./practiceTextAnalysis.js";
import { createPracticeContentPlan, createPracticeSegmenter } from "./practiceSessionContract.js";
import { hashPracticeContent } from "./practiceIds.js";
import { buildPracticeWeakKeysContentPlan, buildPracticeWeakKeysTrainingPlan } from "./practiceWeakKeysGenerator.js";
import { buildPracticeCombinationRepairContentPlan, buildPracticeCombinationRepairTrainingPlan } from "./practiceCombinationRepairGenerator.js";
import { buildPracticeProblemWordsContentPlan, buildPracticeProblemWordsTrainingPlan } from "./practiceProblemWordsGenerator.js";
import { buildPracticeWeaknessBossPlan, createPracticeWeaknessBossContentMetadata } from "./practiceWeaknessBossPlan.js";
import { trustPracticeWeaknessBossContentPlan } from "./practiceWeaknessBossTrust.js";
import {
  PRACTICE_WEAKNESS_BOSS_ERRORS,
  PRACTICE_WEAKNESS_BOSS_GENERATOR_VERSION,
  PRACTICE_WEAKNESS_BOSS_PHASES,
  PRACTICE_WEAKNESS_BOSS_QUOTAS,
} from "./practiceWeaknessBossConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const approvedTraining = (item) => item?.partition === "training"
  && item?.reviewStatus === "approved"
  && typeof item?.text === "string"
  && item?.contentId
  && item?.contentHash
  && item?.familyId;
const unique = (values) => [...new Set((values ?? []).filter(Boolean))];

function bossError(code, message, details = null) {
  const error = new Error(message);
  error.name = "PracticeWeaknessBossError";
  error.code = code;
  error.details = details;
  return error;
}

function sourceMetadata(contentPlan, entityType) {
  if (entityType === "key") return { metadata: contentPlan?.metadata?.weakKeys, openingId: "entry-probe", finalId: "exit-probe" };
  if (entityType === "word") return { metadata: contentPlan?.metadata?.problemWords, openingId: "entry-probe", finalId: "exit-probe" };
  return { metadata: contentPlan?.metadata?.combinationRepair, openingId: "entry-probe", finalId: "exit-probe" };
}

function unitSourceIds(unit = {}) {
  const metadata = unit.metadata?.weakKeys ?? unit.metadata?.combinationRepair ?? unit.metadata?.problemWords ?? {};
  return {
    contentIds: unique([metadata.sourceContentId, ...(metadata.sourceContentIds ?? [])]),
    familyIds: unique([metadata.sourceFamilyId, ...(metadata.sourceFamilyIds ?? [])]),
  };
}

function materialForRange(contentPlan, range, segment) {
  const graphemes = segment(contentPlan.text);
  const text = graphemes.slice(range.startIndex, range.endIndex).join("");
  const overlapping = (contentPlan.units ?? []).filter((unit) => unit.startIndex < range.endIndex && unit.endIndex > range.startIndex);
  const contentIds = unique(overlapping.flatMap((unit) => unitSourceIds(unit).contentIds));
  const familyIds = unique(overlapping.flatMap((unit) => unitSourceIds(unit).familyIds));
  return freezeDeep({
    text,
    contentIds,
    contentHashes: [],
    familyIds,
    materialHash: hashPracticeContent(text),
  });
}

function normalizedLower(value, language = "en") {
  try { return String(value).normalize("NFC").toLocaleLowerCase(language || undefined); }
  catch { return String(value).normalize("NFC").toLowerCase(); }
}

function targetPositions(text, entityType, entityKey, segment, language = "en") {
  if (entityType === "word") {
    const analysis = analyzePracticeText({ text, language });
    return (analysis.words ?? [])
      .filter((word) => word.lexicalKey === entityKey && normalizedLower(word.surfaceText, language) === entityKey)
      .map((word) => word.endIndex - 1);
  }
  const haystack = segment(normalizedLower(text, language));
  const needle = segment(entityKey);
  const positions = [];
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((value, offset) => haystack[index + offset] === value)) positions.push(index + needle.length - 1);
  }
  return positions;
}

async function buildCanonicalProbeSource({ sessionId, context, targetIndex, contentItems, corpusBinding, target }) {
  if (target.entityType === "key") {
    const sourcePlan = await buildPracticeWeakKeysTrainingPlan({
      sessionId: `${sessionId}:probe-source`, context, targetIndex, contentItems, corpusBinding,
      entityKey: target.entityKey, targetSource: "manual", language: context?.dataLocale ?? "en",
    });
    return { sourcePlan, sourceContentPlan: buildPracticeWeakKeysContentPlan({ plan: sourcePlan, contentItems }) };
  }
  if (["bigram", "trigram"].includes(target.entityType)) {
    const sourcePlan = await buildPracticeCombinationRepairTrainingPlan({
      targetIndex, contentItems, corpusBinding, entityType: target.entityType, entityKey: target.entityKey,
      targetSource: "manual", language: context?.dataLocale ?? "en",
    });
    return { sourcePlan, sourceContentPlan: buildPracticeCombinationRepairContentPlan({ plan: sourcePlan, contentItems }) };
  }
  if (target.entityType === "word") {
    const sourcePlan = await buildPracticeProblemWordsTrainingPlan({
      sessionId: `${sessionId}:probe-source`, context, targetIndex, contentItems, corpusBinding,
      entityKey: target.entityKey, targetSource: "manual", language: context?.dataLocale ?? "en",
    });
    return { sourcePlan, sourceContentPlan: buildPracticeProblemWordsContentPlan({ plan: sourcePlan, contentItems }) };
  }
  throw bossError(PRACTICE_WEAKNESS_BOSS_ERRORS.TARGET_UNSUPPORTED, "Weakness Boss target type is unsupported");
}

function extractCanonicalProbes(sourceContentPlan, entityType, quotas, segment, language, entityKey) {
  const source = sourceMetadata(sourceContentPlan, entityType);
  const ranges = source.metadata?.phaseRanges ?? [];
  const openingRange = ranges.find((range) => range?.id === source.openingId);
  const finalRange = ranges.find((range) => range?.id === source.finalId);
  if (!openingRange || !finalRange) throw bossError(PRACTICE_WEAKNESS_BOSS_ERRORS.PROBE_UNAVAILABLE, "Weakness Boss source protocol did not expose matched probe ranges");
  const opening = materialForRange(sourceContentPlan, openingRange, segment);
  const final = materialForRange(sourceContentPlan, finalRange, segment);
  const openingPositions = targetPositions(opening.text, entityType, entityKey, segment, language);
  const finalPositions = targetPositions(final.text, entityType, entityKey, segment, language);
  if (openingPositions.length !== quotas["opening-probe"] || finalPositions.length !== quotas["final-probe"]) {
    throw bossError(PRACTICE_WEAKNESS_BOSS_ERRORS.PROBE_UNAVAILABLE, "Weakness Boss canonical probe opportunity count changed", { opening: openingPositions.length, final: finalPositions.length });
  }
  if (opening.materialHash === final.materialHash) throw bossError(PRACTICE_WEAKNESS_BOSS_ERRORS.PROBE_UNAVAILABLE, "Weakness Boss opening and final probes must be disjoint");
  return { opening, final };
}

async function loadTargetRefs(targetIndex, target) {
  if (target.entityType === "word") {
    const summary = await targetIndex.getWordSummary({ partition: "training", lexicalKey: target.entityKey, purpose: "training" });
    return summary?.contents ?? [];
  }
  return targetIndex.getTargetContentRefs({ partition: "training", entityType: target.entityType, entityKey: target.entityKey, purpose: "training" });
}

function maxPerUnit(entityType) {
  if (entityType === "word") return 1;
  if (entityType === "key") return 4;
  return 3;
}

function verifiedCandidates(refs, contentItems, target, segment, language) {
  const byId = new Map((contentItems ?? []).filter(approvedTraining).map((item) => [item.contentId, item]));
  const cap = maxPerUnit(target.entityType);
  return (refs ?? []).map((ref) => {
    const content = byId.get(ref?.contentId);
    if (!content || content.familyId !== ref.familyId) return null;
    const indexedCount = Number(ref.count ?? ref.positions?.length ?? 0);
    const positions = targetPositions(content.text, target.entityType, target.entityKey, segment, language);
    if (!Number.isInteger(indexedCount) || indexedCount < 1 || indexedCount > cap || positions.length !== indexedCount) return null;
    return freezeDeep({
      contentId: content.contentId,
      contentHash: content.contentHash,
      familyId: content.familyId,
      text: content.text,
      targetOpportunityCount: indexedCount,
    });
  }).filter(Boolean).sort((a, b) => a.familyId.localeCompare(b.familyId) || a.contentId.localeCompare(b.contentId));
}

function selectExactQuota(candidates, quota, { salt = "phase", forbiddenFamilies = new Set() } = {}) {
  const preferred = candidates.filter((candidate) => !forbiddenFamilies.has(candidate.familyId));
  const pools = preferred.length ? [preferred, candidates] : [candidates];
  for (const pool of pools) {
    if (!pool.length) continue;
    const ordered = [...pool].sort((a, b) => hashPracticeContent(`${salt}|${a.contentId}`).localeCompare(hashPracticeContent(`${salt}|${b.contentId}`)) || a.contentId.localeCompare(b.contentId));
    const memo = new Set();
    const visit = (remaining, cursor, depth) => {
      if (remaining === 0) return [];
      if (depth > quota + 8) return null;
      const key = `${remaining}|${cursor % ordered.length}`;
      if (memo.has(key)) return null;
      memo.add(key);
      for (let offset = 0; offset < ordered.length; offset += 1) {
        const candidate = ordered[(cursor + offset) % ordered.length];
        if (candidate.targetOpportunityCount > remaining) continue;
        const tail = visit(remaining - candidate.targetOpportunityCount, cursor + offset + 1, depth + 1);
        if (tail) return [candidate, ...tail];
      }
      return null;
    };
    const selected = visit(quota, 0, 0);
    if (selected) return selected;
  }
  return null;
}

function neutralCandidates(contentItems, target, segment, language, excludedFamilies) {
  return (contentItems ?? []).filter(approvedTraining).filter((item) => !excludedFamilies.has(item.familyId))
    .filter((item) => targetPositions(item.text, target.entityType, target.entityKey, segment, language).length === 0)
    .sort((a, b) => a.familyId.localeCompare(b.familyId) || a.contentId.localeCompare(b.contentId)).slice(0, 64);
}

function phaseMaterialFromUnits(units) {
  return freezeDeep({
    contentIds: unique(units.map((unit) => unit.contentId)),
    contentHashes: unique(units.map((unit) => unit.contentHash)),
    familyIds: unique(units.map((unit) => unit.familyId)),
    materialHash: hashPracticeContent(units.map((unit) => `${unit.contentId}:${unit.contentHash}:${unit.targetOpportunityCount}`).join("|")),
  });
}

function materializeBossContent({ plan, probes, battleUnits, neutral, segment, language }) {
  const pieces = [];
  const units = [];
  const phaseRanges = [];
  let cursor = 0;
  const append = (text, phase, source, targetCount) => {
    if (pieces.length) { pieces.push(" "); cursor += segment(" ").length; }
    const startIndex = cursor;
    pieces.push(text);
    cursor += segment(text).length;
    const local = targetPositions(text, plan.target.entityType, plan.target.entityKey, segment, language);
    if (local.length !== targetCount) throw bossError(PRACTICE_WEAKNESS_BOSS_ERRORS.CONTENT_UNAVAILABLE, "Weakness Boss target opportunity count changed while materializing content", { phaseId: phase.id, expected: targetCount, actual: local.length });
    const absolute = local.map((position) => startIndex + position);
    units.push({
      unitId: `wb-${phase.ordinal}-${units.length + 1}`,
      type: "segment",
      startIndex,
      endIndex: cursor,
      text,
      metadata: { weaknessBoss: { phaseId: phase.id, phaseOrdinal: phase.ordinal, cue: phase.cue, targetOpportunityCount: targetCount, targetPositions: absolute, sourceContentId: source?.contentId ?? null, sourceFamilyIds: source?.familyIds ?? (source?.familyId ? [source.familyId] : []) } },
    });
    return absolute;
  };

  for (const phase of plan.phases) {
    const startIndex = cursor;
    const positions = [];
    const contentIds = [];
    const familyIds = [];
    if (phase.id === "opening-probe" || phase.id === "final-probe") {
      const probe = phase.id === "opening-probe" ? probes.opening : probes.final;
      positions.push(...append(probe.text, phase, { familyIds: probe.familyIds }, phase.opportunityQuota));
      contentIds.push(...probe.contentIds);
      familyIds.push(...probe.familyIds);
    } else {
      const selected = battleUnits[phase.id] ?? [];
      selected.forEach((entry, index) => {
        positions.push(...append(entry.text, phase, entry, entry.targetOpportunityCount));
        contentIds.push(entry.contentId);
        familyIds.push(entry.familyId);
        if (phase.id === "final-form" && neutral.length) {
          const neutralEntry = neutral[index % neutral.length];
          append(neutralEntry.text, phase, neutralEntry, 0);
          contentIds.push(neutralEntry.contentId);
          familyIds.push(neutralEntry.familyId);
        }
      });
    }
    if (positions.length !== phase.opportunityQuota) throw bossError(PRACTICE_WEAKNESS_BOSS_ERRORS.CONTENT_UNAVAILABLE, `Weakness Boss ${phase.id} does not satisfy its exact quota`);
    phaseRanges.push(freezeDeep({
      id: phase.id,
      ordinal: phase.ordinal,
      label: phase.label,
      cue: phase.cue,
      evidenceEligible: true,
      acquisitionDoseEligible: phase.acquisitionDoseEligible,
      hpAllocation: phase.hpAllocation,
      startIndex,
      endIndex: cursor,
      opportunityQuota: phase.opportunityQuota,
      targetPositions: positions,
      contentIds: unique(contentIds).slice(0, 32),
      familyIds: unique(familyIds).slice(0, 16),
    }));
  }
  const metadata = createPracticeWeaknessBossContentMetadata(plan, phaseRanges);
  const contentPlan = createPracticeContentPlan({
    contentId: `practice-content_weakness-boss-${plan.planHash}`,
    contentGeneratorVersion: PRACTICE_WEAKNESS_BOSS_GENERATOR_VERSION,
    text: pieces.join(""),
    units,
    targetEntities: metadata.targetEntities,
    completion: { mode: "content", value: null },
    metadata,
  });
  trustPracticeWeaknessBossContentPlan(contentPlan, plan);
  return contentPlan;
}

export async function buildPracticeWeaknessBossEncounter({
  sessionId,
  context,
  targetIndex,
  contentItems = [],
  corpusBinding,
  target,
  targetSource = "recommended",
  language = context?.dataLocale ?? "en",
} = {}) {
  if (!target?.statId || !PRACTICE_WEAKNESS_BOSS_QUOTAS[target?.entityType]) throw bossError(PRACTICE_WEAKNESS_BOSS_ERRORS.TARGET_UNSUPPORTED, "Weakness Boss requires one selected PL12 candidate");
  const segment = createPracticeSegmenter();
  const quotas = PRACTICE_WEAKNESS_BOSS_QUOTAS[target.entityType];
  const { sourceContentPlan } = await buildCanonicalProbeSource({ sessionId, context, targetIndex, contentItems, corpusBinding, target });
  const probes = extractCanonicalProbes(sourceContentPlan, target.entityType, quotas, segment, language, target.entityKey);
  const refs = await loadTargetRefs(targetIndex, target);
  const candidates = verifiedCandidates(refs, contentItems, target, segment, language);
  if (!candidates.length) throw bossError(PRACTICE_WEAKNESS_BOSS_ERRORS.CONTENT_UNAVAILABLE, "Weakness Boss has no approved target-bearing training content");
  const probeFamilies = new Set([...probes.opening.familyIds, ...probes.final.familyIds]);
  const battleUnits = {};
  for (const phaseId of ["break-guard", "pressure", "final-form"]) {
    const selected = selectExactQuota(candidates, quotas[phaseId], { salt: `${sessionId}|${target.statId}|${phaseId}`, forbiddenFamilies: probeFamilies });
    if (!selected) throw bossError(PRACTICE_WEAKNESS_BOSS_ERRORS.CONTENT_UNAVAILABLE, `Weakness Boss cannot satisfy ${phaseId} target quota`, { phaseId, quota: quotas[phaseId] });
    battleUnits[phaseId] = selected;
  }
  const usedFamilies = new Set([...probeFamilies, ...Object.values(battleUnits).flat().map((entry) => entry.familyId)]);
  const neutral = neutralCandidates(contentItems, target, segment, language, usedFamilies);
  if (!neutral.length) {
    const fallbackNeutral = neutralCandidates(contentItems, target, segment, language, new Set());
    neutral.push(...fallbackNeutral.slice(0, 16));
  }
  if (!neutral.length) throw bossError(PRACTICE_WEAKNESS_BOSS_ERRORS.CONTENT_UNAVAILABLE, "Weakness Boss Final Form requires target-free interleaving material");
  const phaseMaterial = {
    "opening-probe": { ...probes.opening, text: undefined },
    "break-guard": phaseMaterialFromUnits(battleUnits["break-guard"]),
    pressure: phaseMaterialFromUnits(battleUnits.pressure),
    "final-form": phaseMaterialFromUnits(battleUnits["final-form"]),
    "final-probe": { ...probes.final, text: undefined },
  };
  const plan = buildPracticeWeaknessBossPlan({ sessionId, context, corpusBinding, target, targetSource, bossTheme: target.bossTheme, phaseMaterial });
  const contentPlan = materializeBossContent({ plan, probes, battleUnits, neutral, segment, language });
  return freezeDeep({ plan, contentPlan });
}

export async function inspectPracticeWeaknessBossContentReadiness(input = {}) {
  try {
    const encounter = await buildPracticeWeaknessBossEncounter(input);
    return freezeDeep({ ready: true, status: "ready", planHash: encounter.plan.planHash, errorCode: null });
  } catch (error) {
    return freezeDeep({ ready: false, status: "unavailable", planHash: null, errorCode: error?.code ?? PRACTICE_WEAKNESS_BOSS_ERRORS.CONTENT_UNAVAILABLE });
  }
}
