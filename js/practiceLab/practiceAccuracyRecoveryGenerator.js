import { createPracticeContentPlan, createPracticeSegmenter } from "./practiceSessionContract.js";
import { analyzePracticeText } from "./practiceTextAnalysis.js";
import { hashPracticeContent } from "./practiceIds.js";
import { buildPracticeWeakKeysTrainingPlan, buildPracticeWeakKeysContentPlan } from "./practiceWeakKeysGenerator.js";
import { buildPracticeCombinationRepairTrainingPlan, buildPracticeCombinationRepairContentPlan } from "./practiceCombinationRepairGenerator.js";
import { buildPracticeProblemWordsTrainingPlan, buildPracticeProblemWordsContentPlan } from "./practiceProblemWordsGenerator.js";
import { normalizePracticeAccuracyRecoveryTarget, validatePracticeAccuracyRecoveryTarget, createPracticeAccuracyRecoveryError } from "./practiceAccuracyRecoveryTargets.js";
import { buildPracticeAccuracyRecoveryPlan, createPracticeAccuracyRecoveryContentMetadata } from "./practiceAccuracyRecoveryPlan.js";
import { PRACTICE_ACCURACY_RECOVERY_ERRORS, PRACTICE_ACCURACY_RECOVERY_PHASE_QUOTAS } from "./practiceAccuracyRecoveryConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const approvedTraining = (item) => item?.partition === "training" && item?.reviewStatus === "approved" && typeof item?.text === "string" && item?.contentId && item?.contentHash && item?.familyId;
const PHASE_MAP = Object.freeze({
  key: Object.freeze({ "entry-probe": "baseline", focus: "control", context: "repair", interleave: "mix", "exit-probe": "check" }),
  bigram: Object.freeze({ "entry-probe": "baseline", acquire: "control", integrate: "repair", interleave: "mix", "exit-probe": "check" }),
  trigram: Object.freeze({ "entry-probe": "baseline", acquire: "control", integrate: "repair", interleave: "mix", "exit-probe": "check" }),
  word: Object.freeze({ "entry-probe": "baseline", focus: "control", context: "repair", interleave: "mix", "exit-probe": "check" }),
});
const META_KEY = Object.freeze({ key: "weakKeys", bigram: "combinationRepair", trigram: "combinationRepair", word: "problemWords" });

function basePhaseId(unit, entityType) { return unit?.metadata?.[META_KEY[entityType]]?.phaseId ?? null; }
function targetOccurrences(text, target, language = "en") {
  const analysis = analyzePracticeText({ text, language });
  if (target.entityType === "word") return (analysis.words ?? []).filter((word) => word.lexicalKey === target.entityKey && word.surfaceText === target.entityKey).map((word) => ({ startIndex: word.startIndex, endIndex: word.endIndex }));
  const field = target.entityType === "key" ? "keyOccurrences" : target.entityType === "bigram" ? "bigramOccurrences" : "trigramOccurrences";
  return (analysis[field] ?? []).filter((entry) => entry.target === target.entityKey).map((entry) => ({ startIndex: entry.startIndex, endIndex: entry.endIndex }));
}
function deterministicOrder(units, sessionId, salt) {
  return [...units].sort((a, b) => hashPracticeContent(`${sessionId}|${salt}|${a.unitId}|${a.text}`).localeCompare(hashPracticeContent(`${sessionId}|${salt}|${b.unitId}|${b.text}`)) || a.unitId.localeCompare(b.unitId));
}

async function neutralCombinationWords({ targetIndex, contentItems, target, maxWords = 64 }) {
  const field = target.entityType === "bigram" ? "bigramOccurrences" : "trigramOccurrences";
  const result = new Map();
  for (const content of (contentItems ?? []).filter(approvedTraining).slice(0, 128)) {
    let annotation;
    try { annotation = await targetIndex.getContentAnnotations({ partition: "training", contentId: content.contentId, purpose: "training", content }); }
    catch { continue; }
    for (const word of annotation?.words ?? []) {
      const key = String(word.lexicalKey ?? "").normalize("NFC").toLowerCase();
      if (!/^[a-z]{2,24}$/.test(key) || String(word.surfaceText ?? "").toLowerCase() !== key || result.has(key)) continue;
      const hasTarget = (annotation[field] ?? []).some((occurrence) => occurrence.target === target.entityKey && occurrence.wordOrdinal === word.wordOrdinal);
      if (hasTarget) continue;
      result.set(key, Object.freeze({ key, contentId: content.contentId, contentHash: content.contentHash, familyId: content.familyId }));
      if (result.size >= maxWords) return Object.freeze([...result.values()]);
    }
  }
  return Object.freeze([...result.values()]);
}

async function buildBase({ sessionId, context, targetIndex, contentItems, corpusBinding, target, targetSource }) {
  if (target.entityType === "key") {
    const plan = await buildPracticeWeakKeysTrainingPlan({ sessionId, context, targetIndex, contentItems, corpusBinding, entityKey: target.entityKey, targetSource, language: "en" });
    return { kind: "weak-keys", plan, contentPlan: buildPracticeWeakKeysContentPlan({ plan, contentItems }) };
  }
  if (target.entityType === "bigram" || target.entityType === "trigram") {
    const plan = await buildPracticeCombinationRepairTrainingPlan({ targetIndex, contentItems, corpusBinding, entityType: target.entityType, entityKey: target.entityKey, targetSource, language: "en" });
    return { kind: "combination-repair", plan, contentPlan: buildPracticeCombinationRepairContentPlan({ plan, contentItems }) };
  }
  const plan = await buildPracticeProblemWordsTrainingPlan({ sessionId, context, targetIndex, contentItems, corpusBinding, entityKey: target.entityKey, targetSource, language: "en" });
  return { kind: "problem-words", plan, contentPlan: buildPracticeProblemWordsContentPlan({ plan, contentItems }) };
}

function neutralUnits(words, count, { sessionId, target }) {
  if (!count) return [];
  if (words.length < 6) throw createPracticeAccuracyRecoveryError(PRACTICE_ACCURACY_RECOVERY_ERRORS.INSUFFICIENT_NEUTRAL_CONTENT, "Accuracy & Recovery Mix requires genuine target-free lexical material");
  return Array.from({ length: count }, (_, index) => {
    const selected = Array.from({ length: Math.min(4, words.length) }, (_x, offset) => words[(index * 4 + offset) % words.length]);
    const text = selected.map((entry) => entry.key).join(" ");
    if (targetOccurrences(text, target).length !== 0) throw createPracticeAccuracyRecoveryError(PRACTICE_ACCURACY_RECOVERY_ERRORS.INSUFFICIENT_NEUTRAL_CONTENT, "Neutral generated material unexpectedly contains the selected target");
    return Object.freeze({ unitId: `ar-neutral-${index + 1}-${hashPracticeContent(`${sessionId}|${target.entityKey}|${text}`)}`, text, sourceFamilyIds: Object.freeze([...new Set(selected.map((entry) => entry.familyId))]), sourceContentIds: Object.freeze([...new Set(selected.map((entry) => entry.contentId))]) });
  });
}

function recomposeContent({ baseContentPlan, plan, target, sessionId, neutral = [] }) {
  const segment = createPracticeSegmenter();
  const phaseMap = PHASE_MAP[target.entityType];
  const groups = new Map(["baseline", "control", "repair", "mix", "check"].map((id) => [id, []]));
  for (const unit of baseContentPlan.units ?? []) {
    const mapped = phaseMap[basePhaseId(unit, target.entityType)]; if (mapped) groups.get(mapped).push({ kind: "target-or-base-neutral", unit });
  }
  if (target.entityType === "bigram" || target.entityType === "trigram") {
    for (const phase of ["control", "repair", "mix"]) groups.set(phase, deterministicOrder(groups.get(phase).map((entry) => entry.unit), sessionId, phase).map((unit) => ({ kind: "target-or-base-neutral", unit })));
    const targetMix = groups.get("mix");
    const mixed = [];
    targetMix.forEach((entry, index) => { mixed.push(entry); mixed.push({ kind: "neutral", unit: neutral[index % neutral.length] }); });
    groups.set("mix", mixed);
  }
  const pieces = []; const units = []; const phaseRanges = []; let cursor = 0;
  for (const phase of plan.phases) {
    const startIndex = cursor; const targetRanges = [];
    for (const [unitIndex, entry] of groups.get(phase.id).entries()) {
      const source = entry.unit; const text = source.text;
      if (pieces.length) { pieces.push(" "); cursor += 1; }
      const unitStart = cursor;
      const localTargets = targetOccurrences(text, target, plan.language);
      const absolute = localTargets.map((range) => Object.freeze({ startIndex: unitStart + range.startIndex, endIndex: unitStart + range.endIndex }));
      targetRanges.push(...absolute); pieces.push(text); cursor += segment(text).length;
      units.push({ unitId: `ar-${phase.ordinal}-${unitIndex + 1}`, type: "segment", startIndex: unitStart, endIndex: cursor, text, metadata: { accuracyRecovery: { phaseId: phase.id, phaseOrdinal: phase.ordinal, cue: phase.cue, targetOpportunityCount: localTargets.length, targetRanges: absolute, sourceKind: entry.kind, sourceUnitId: source.unitId ?? null, sourceContentId: source.metadata?.[META_KEY[target.entityType]]?.sourceContentId ?? null, sourceFamilyIds: source.sourceFamilyIds ?? source.metadata?.[META_KEY[target.entityType]]?.sourceFamilyIds ?? [] } } });
    }
    if (targetRanges.length !== phase.opportunityQuota) throw createPracticeAccuracyRecoveryError(PRACTICE_ACCURACY_RECOVERY_ERRORS.CONTENT_HASH_MISMATCH, `Accuracy & Recovery ${phase.id} target count does not match its exact quota`, { expected: phase.opportunityQuota, actual: targetRanges.length });
    phaseRanges.push(Object.freeze({ id: phase.id, ordinal: phase.ordinal, label: phase.label, cue: phase.cue, startIndex, endIndex: cursor, opportunityQuota: phase.opportunityQuota, targetRanges: Object.freeze(targetRanges) }));
  }
  const metadata = createPracticeAccuracyRecoveryContentMetadata(plan, Object.freeze(phaseRanges));
  return createPracticeContentPlan({ contentId: `practice-content_accuracy-recovery-${plan.planHash}`, contentGeneratorVersion: plan.generatorVersion, text: pieces.join(""), units, targetEntities: [{ entityType: target.entityType, entityKey: target.entityKey, directTarget: true }], completion: { mode: "content", value: null }, metadata }, { segmenter: segment });
}

export async function buildPracticeAccuracyRecoveryTrainingPlan({ sessionId, context, targetIndex, contentItems = [], corpusBinding, entityType, entityKey, manualType = null, targetSource = "manual", language = context?.dataLocale ?? "en" } = {}) {
  const target = normalizePracticeAccuracyRecoveryTarget({ entityType, entityKey, manualType, language });
  if (!target) throw createPracticeAccuracyRecoveryError(PRACTICE_ACCURACY_RECOVERY_ERRORS.UNSUPPORTED_ACCURACY_TARGET, "Accuracy & Recovery target is unsupported");
  const availability = await validatePracticeAccuracyRecoveryTarget({ context, entityType: target.entityType, entityKey: target.entityKey, indexProvider: targetIndex, contentItems, language });
  if (availability.status !== "ready") throw createPracticeAccuracyRecoveryError(PRACTICE_ACCURACY_RECOVERY_ERRORS.TARGET_NOT_AVAILABLE, "Accuracy & Recovery target cannot satisfy the approved training protocol", availability);
  const base = await buildBase({ sessionId, context, targetIndex, contentItems, corpusBinding, target, targetSource });
  const baseHash = base.plan?.planHash ?? hashPracticeContent(JSON.stringify(base.plan));
  let neutral = [];
  if (target.entityType === "bigram" || target.entityType === "trigram") {
    const words = await neutralCombinationWords({ targetIndex, contentItems, target });
    const targetMixUnitCount = (base.contentPlan.units ?? []).filter((unit) => phaseMapFor(target.entityType, basePhaseId(unit, target.entityType)) === "mix").length;
    neutral = neutralUnits(words, targetMixUnitCount, { sessionId, target });
  }
  const neutralDescriptor = neutral.length ? { unitCount: neutral.length, lexicalHash: hashPracticeContent(neutral.map((unit) => unit.text).join("|")) } : null;
  const plan = buildPracticeAccuracyRecoveryPlan({ sessionId, context, target, targetSource, corpusBinding, baseIntervention: base.kind, basePlanHash: baseHash, neutralDescriptor });
  const contentPlan = recomposeContent({ baseContentPlan: base.contentPlan, plan, target, sessionId, neutral });
  return freezeDeep({ plan, contentPlan, availability: "ready", basePlan: base.plan });
}

function phaseMapFor(entityType, phaseId) { return PHASE_MAP[entityType]?.[phaseId] ?? null; }

export async function inspectPracticeAccuracyRecoveryAvailability(input = {}) {
  try {
    const result = await buildPracticeAccuracyRecoveryTrainingPlan({ ...input, sessionId: input.sessionId ?? `accuracy-recovery-availability:${input.entityType}:${input.entityKey}` });
    return freezeDeep({ eligible: true, status: "ready", target: result.plan.target, targetOpportunityBudget: result.plan.targetOpportunityBudget, reasons: [] });
  } catch (error) {
    const unsupported = error?.code === PRACTICE_ACCURACY_RECOVERY_ERRORS.UNSUPPORTED_ACCURACY_TARGET;
    const limited = [PRACTICE_ACCURACY_RECOVERY_ERRORS.INSUFFICIENT_TARGET_CONTENT, PRACTICE_ACCURACY_RECOVERY_ERRORS.INSUFFICIENT_NEUTRAL_CONTENT, PRACTICE_ACCURACY_RECOVERY_ERRORS.INSUFFICIENT_PROBE_MATCH, PRACTICE_ACCURACY_RECOVERY_ERRORS.TARGET_NOT_AVAILABLE].includes(error?.code);
    return freezeDeep({ eligible: false, status: unsupported ? "unsupported" : limited ? "limited-content" : "unavailable", target: normalizePracticeAccuracyRecoveryTarget(input), reasons: [error?.code ?? PRACTICE_ACCURACY_RECOVERY_ERRORS.TRAINING_CORPUS_NOT_READY], details: error?.details ?? null });
  }
}
