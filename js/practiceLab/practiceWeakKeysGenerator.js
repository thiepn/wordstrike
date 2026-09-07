import { analyzePracticeText } from "./practiceTextAnalysis.js";
import { extractPracticeTextDifficultyFeatures } from "./practiceTextDifficultyFeatures.js";
import { resolvePracticeTypabilityRuntime } from "./practiceTypabilityRuntime.js";
import { scorePracticeTextTypability } from "./practiceTypabilityModel.js";
import { classifyPracticeKeyboardGeometry } from "./practiceKeyboardGeometry.js";
import { createPracticeContentPlan, createPracticeSegmenter } from "./practiceSessionContract.js";
import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_WEAK_KEYS_ERRORS,
  PRACTICE_WEAK_KEYS_GENERATOR_VERSION,
  PRACTICE_WEAK_KEYS_PHASE_QUOTAS,
} from "./practiceWeakKeysConstants.js";
import { PRACTICE_WEAK_KEYS_POLICY_V1 } from "./practiceWeakKeysPolicy.js";
import { selectPracticeWeakKeysExactQuota } from "./practiceWeakKeysComposer.js";
import { selectPracticeWeakKeysProbePair } from "./practiceWeakKeysProbeMatch.js";
import {
  buildPracticeWeakKeysPlan,
  createPracticeWeakKeysContentPlanMetadata,
} from "./practiceWeakKeysPlan.js";
import {
  createPracticeWeakKeysError,
  normalizePracticeWeakKeyTarget,
  validateWeakKeyTarget,
} from "./practiceWeakKeysTargets.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const POSITION_KEYS = Object.freeze(["word-start", "word-middle", "word-end", "single-character-word", "non-word", "unknown"]);
const GEOMETRY_KEYS = Object.freeze(["same-key", "same-side-near", "same-side-far", "cross-side", "unknown"]);
const UNIT_SEPARATOR = " ";

function emptyCounts(keys) { return Object.fromEntries(keys.map((key) => [key, 0])); }
function increment(counts, key, allowed) { counts[allowed.includes(key) ? key : "unknown"] += 1; }
function boundedUnique(values, max = 64) { return [...new Set(values.filter((value) => typeof value === "string" && value))].sort().slice(0, max); }
function approvedTraining(item) { return item?.partition === "training" && item?.reviewStatus === "approved" && typeof item?.text === "string" && item.contentId && item.contentHash && item.familyId; }
function exactKey(value, key) { return typeof value === "string" && value.normalize("NFC") === key; }

function wordPositionClass(annotation, occurrence) {
  if (!Number.isInteger(occurrence?.wordOrdinal)) return "non-word";
  const word = annotation.words?.find((entry) => entry.wordOrdinal === occurrence.wordOrdinal);
  if (!word) return "unknown";
  const length = word.endIndex - word.startIndex;
  if (length === 1) return "single-character-word";
  if (occurrence.startIndex === word.startIndex) return "word-start";
  if (occurrence.startIndex === word.endIndex - 1) return "word-end";
  if (occurrence.startIndex > word.startIndex && occurrence.startIndex < word.endIndex - 1) return "word-middle";
  return "unknown";
}

function contextMetadata(annotation, targetKey, context, { range = null } = {}) {
  const positions = new Map((annotation.keyOccurrences ?? []).map((entry) => [entry.startIndex, entry]));
  const targetOccurrences = (annotation.keyOccurrences ?? []).filter((occurrence) => {
    if (!exactKey(occurrence.target, targetKey)) return false;
    if (!range) return true;
    return occurrence.startIndex >= range.startIndex && occurrence.startIndex < range.endIndex;
  });
  const positionCounts = emptyCounts(POSITION_KEYS);
  const geometryCounts = emptyCounts(GEOMETRY_KEYS);
  const preceding = [];
  const following = [];
  let beginningOfTextCount = 0;
  let endOfTextCount = 0;
  for (const occurrence of targetOccurrences) {
    increment(positionCounts, wordPositionClass(annotation, occurrence), POSITION_KEYS);
    const previous = positions.get(occurrence.startIndex - 1)?.target ?? null;
    const next = positions.get(occurrence.startIndex + 1)?.target ?? null;
    if (previous == null) beginningOfTextCount += 1;
    else preceding.push(previous);
    if (next == null) endOfTextCount += 1;
    else following.push(next);
    const geometry = previous == null ? null : classifyPracticeKeyboardGeometry({
      layout: context?.keyboardLayout,
      previousExpected: previous,
      currentExpected: targetKey,
    });
    increment(geometryCounts, geometry?.known ? geometry.geometryClass : "unknown", GEOMETRY_KEYS);
  }
  return {
    targetOccurrences,
    positionCounts,
    geometryCounts,
    positionClasses: Object.keys(positionCounts).filter((key) => key !== "unknown" && positionCounts[key] > 0),
    geometryClasses: Object.keys(geometryCounts).filter((key) => key !== "unknown" && geometryCounts[key] > 0),
    precedingGraphemes: boundedUnique(preceding),
    followingGraphemes: boundedUnique(following),
    precedingContextCount: new Set(preceding).size,
    followingContextCount: new Set(following).size,
    beginningOfTextCount,
    endOfTextCount,
  };
}

function scoreText(text, language) {
  const analysis = analyzePracticeText({ text, language });
  const features = extractPracticeTextDifficultyFeatures({ text, language, analysis });
  const runtime = resolvePracticeTypabilityRuntime({ language });
  const score = runtime?.reference ? scorePracticeTextTypability({ features, reference: runtime.reference, language }) : null;
  return {
    difficultyFeatures: features,
    typabilityScore: Number.isFinite(score?.difficultyIndex) ? score.difficultyIndex : null,
    typabilityPercentile: Number.isFinite(score?.relativeDifficultyPercentile) ? score.relativeDifficultyPercentile : null,
  };
}

async function loadAnnotation(targetIndex, annotationCache, content) {
  if (annotationCache.has(content.contentId)) return annotationCache.get(content.contentId);
  const promise = targetIndex.getContentAnnotations({
    partition: "training",
    contentId: content.contentId,
    purpose: "training",
    content,
  });
  annotationCache.set(content.contentId, promise);
  try { return await promise; }
  catch (error) { annotationCache.delete(content.contentId); throw error; }
}

async function buildNaturalTargetCandidates({ targetIndex, refs, contentItems, targetKey, context, language, policy, annotationCache }) {
  const byId = new Map((contentItems ?? []).filter(approvedTraining).map((item) => [item.contentId, item]));
  const candidates = [];
  for (const ref of (refs ?? []).slice(0, policy.content.maxTargetCandidates)) {
    const content = byId.get(ref?.contentId);
    if (!content || content.familyId !== ref.familyId) continue;
    const annotation = await loadAnnotation(targetIndex, annotationCache, content);
    const metadata = contextMetadata(annotation, targetKey, context);
    if (metadata.targetOccurrences.length !== Number(ref.count)) {
      throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.CONTENT_HASH_MISMATCH, "Weak Keys target annotation no longer matches its reverse index", { contentId: content.contentId, indexed: ref.count, annotated: metadata.targetOccurrences.length });
    }
    if (metadata.targetOccurrences.length < 1 || metadata.targetOccurrences.length > policy.content.ordinaryTargetUnitOpportunityCap) continue;
    const lexicalKeys = boundedUnique(metadata.targetOccurrences.map((occurrence) => annotation.words?.find((word) => word.wordOrdinal === occurrence.wordOrdinal)?.lexicalKey).filter(Boolean), 32);
    const difficulty = scoreText(content.text, language);
    candidates.push(freezeDeep({
      candidateId: `natural:${content.contentId}`,
      kind: "natural",
      compositionMode: "natural-text-bundle",
      partition: "training",
      contentId: content.contentId,
      contentHash: content.contentHash,
      familyId: content.familyId,
      targetOpportunityCount: metadata.targetOccurrences.length,
      lexicalKeys,
      ...metadata,
      ...difficulty,
    }));
  }
  return Object.freeze(candidates);
}

function generatedWordContext(word, targetKey, context, targetRelativePositions) {
  const graphemes = Array.from(word);
  const positionCounts = emptyCounts(POSITION_KEYS);
  const geometryCounts = emptyCounts(GEOMETRY_KEYS);
  const preceding = [];
  const following = [];
  for (const index of targetRelativePositions) {
    const length = graphemes.length;
    const positionClass = length === 1 ? "single-character-word" : index === 0 ? "word-start" : index === length - 1 ? "word-end" : "word-middle";
    increment(positionCounts, positionClass, POSITION_KEYS);
    const previous = index > 0 ? graphemes[index - 1] : " ";
    const next = index + 1 < length ? graphemes[index + 1] : " ";
    preceding.push(previous);
    following.push(next);
    const geometry = classifyPracticeKeyboardGeometry({ layout: context?.keyboardLayout, previousExpected: previous, currentExpected: targetKey });
    increment(geometryCounts, geometry.known ? geometry.geometryClass : "unknown", GEOMETRY_KEYS);
  }
  return {
    positionCounts,
    geometryCounts,
    positionClasses: Object.keys(positionCounts).filter((key) => key !== "unknown" && positionCounts[key] > 0),
    geometryClasses: Object.keys(geometryCounts).filter((key) => key !== "unknown" && geometryCounts[key] > 0),
    precedingGraphemes: boundedUnique(preceding),
    followingGraphemes: boundedUnique(following),
    precedingContextCount: new Set(preceding).size,
    followingContextCount: new Set(following).size,
  };
}

async function buildTargetWordCandidates({ targetIndex, wordKeys, contentItems, targetKey, context, language, policy, annotationCache }) {
  const byId = new Map((contentItems ?? []).filter(approvedTraining).map((item) => [item.contentId, item]));
  const candidates = [];
  for (const lexicalKey of (wordKeys ?? []).slice(0, policy.content.maxTargetCandidates)) {
    const summary = await targetIndex.getWordSummary({ partition: "training", lexicalKey, purpose: "training" });
    if (!summary?.lexicalKey || !Array.isArray(summary.contents)) continue;
    for (const ref of summary.contents.slice(0, 4)) {
      if (candidates.length >= policy.content.maxTargetCandidates) break;
      const content = byId.get(ref.contentId);
      if (!content || content.familyId !== ref.familyId) continue;
      const annotation = await loadAnnotation(targetIndex, annotationCache, content);
      const word = annotation.words?.find((entry) => entry.lexicalKey === summary.lexicalKey && entry.startIndex === ref.positions?.[0])
        ?? annotation.words?.find((entry) => entry.lexicalKey === summary.lexicalKey);
      if (!word) continue;
      const targetPositions = (annotation.keyOccurrences ?? [])
        .filter((occurrence) => exactKey(occurrence.target, targetKey) && occurrence.startIndex >= word.startIndex && occurrence.startIndex < word.endIndex)
        .map((occurrence) => occurrence.startIndex - word.startIndex);
      if (!targetPositions.length || targetPositions.length > policy.content.focusMaxTargetOpportunitiesPerLexicalItem) continue;
      const normalizedWord = summary.lexicalKey.normalize("NFC").toLowerCase();
      if (Array.from(normalizedWord).length < 2) continue;
      const metadata = generatedWordContext(normalizedWord, targetKey, context, targetPositions);
      const difficulty = scoreText(normalizedWord, language);
      candidates.push(freezeDeep({
        candidateId: `word:${normalizedWord}:${content.contentId}`,
        wordKey: normalizedWord,
        lexicalKey: normalizedWord,
        lexicalKeys: [normalizedWord],
        sourceContentIds: [content.contentId],
        sourceContentHashes: [content.contentHash],
        sourceFamilyIds: [content.familyId],
        targetOpportunityCount: targetPositions.length,
        wordLength: Array.from(normalizedWord).length,
        targetRelativePositions: targetPositions,
        ...metadata,
        ...difficulty,
      }));
    }
  }
  return Object.freeze(candidates);
}

function cloneGeneratedWordCandidate(word, cycle, compositionMode, salt) {
  const generatedUnitId = `wk-${hashPracticeContent(`${salt}|${cycle}|${word.candidateId}`)}`;
  return freezeDeep({
    ...word,
    candidateId: `${generatedUnitId}:${cycle}`,
    generatedUnitId,
    kind: "generated-word-sequence",
    compositionMode,
    partition: "training",
    wordKeys: [word.wordKey],
  });
}

function generatedTargetPool(words, quota, { compositionMode, salt }) {
  if (!words.length) return Object.freeze([]);
  const cycleDose = words.reduce((sum, word) => sum + word.targetOpportunityCount, 0);
  const cycles = Math.min(12, Math.max(2, Math.ceil(quota / Math.max(1, cycleDose)) + 2));
  const result = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) for (const word of words) result.push(cloneGeneratedWordCandidate(word, cycle, compositionMode, salt));
  return Object.freeze(result);
}

function aggregateUnitCounts(units, field, keys) {
  const result = emptyCounts(keys);
  for (const unit of units ?? []) for (const key of keys) result[key] += Number(unit?.[field]?.[key] || 0);
  return result;
}

function aggregateProbe(units, probeId, compositionMode) {
  return freezeDeep({ probeId, compositionMode, units: Object.freeze(units) });
}

function buildProbeBundles(candidates, { sessionId, entityKey, policy, compositionMode, salt, requiredDistinctLexical = 0 }) {
  const bundles = [];
  const seen = new Set();
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const selection = selectPracticeWeakKeysExactQuota(candidates, policy.probes.targetOpportunityCount, {
      sessionId,
      entityKey,
      generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION,
      policyVersion: policy.version,
      salt: `${salt}:${attempt}`,
    });
    if (!selection) continue;
    const identity = selection.units.map((unit) => unit.candidateId).sort().join("|");
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (requiredDistinctLexical > 0 && selection.metrics.distinctLexicalCount < requiredDistinctLexical) continue;
    bundles.push(aggregateProbe(selection.units, `${salt}-${attempt + 1}`, compositionMode));
  }
  return Object.freeze(bundles);
}

async function buildNeutralMaterial({ targetIndex, contentItems, targetKey, language, policy, annotationCache }) {
  const natural = [];
  const wordsByIdentity = new Map();
  for (const content of (contentItems ?? []).filter(approvedTraining).slice(0, policy.content.maxNeutralCandidates)) {
    const annotation = await loadAnnotation(targetIndex, annotationCache, content);
    const targetOccurrences = (annotation.keyOccurrences ?? []).filter((occurrence) => exactKey(occurrence.target, targetKey));
    if (!targetOccurrences.length) {
      const difficulty = scoreText(content.text, language);
      natural.push(freezeDeep({
        candidateId: `neutral-natural:${content.contentId}`,
        kind: "natural",
        compositionMode: "natural-neutral",
        partition: "training",
        contentId: content.contentId,
        contentHash: content.contentHash,
        familyId: content.familyId,
        targetOpportunityCount: 0,
        lexicalKeys: boundedUnique((annotation.words ?? []).map((word) => word.lexicalKey), 32),
        positionCounts: emptyCounts(POSITION_KEYS),
        geometryCounts: emptyCounts(GEOMETRY_KEYS),
        precedingContextCount: 0,
        followingContextCount: 0,
        ...difficulty,
      }));
    }
    for (const word of annotation.words ?? []) {
      const containsTarget = (annotation.keyOccurrences ?? []).some((occurrence) => exactKey(occurrence.target, targetKey) && occurrence.startIndex >= word.startIndex && occurrence.startIndex < word.endIndex);
      if (containsTarget || !word.lexicalKey || Array.from(word.lexicalKey).length < 2) continue;
      const identity = `${word.lexicalKey}|${content.contentId}`;
      if (!wordsByIdentity.has(identity)) wordsByIdentity.set(identity, freezeDeep({
        wordKey: word.lexicalKey,
        sourceContentId: content.contentId,
        sourceContentHash: content.contentHash,
        sourceFamilyId: content.familyId,
      }));
    }
  }
  return freezeDeep({ natural: natural.slice(0, policy.content.maxNeutralCandidates), words: [...wordsByIdentity.values()].slice(0, policy.content.maxNeutralCandidates) });
}

function generatedNeutralUnits(neutralWords, count, { sessionId, entityKey }) {
  if (!neutralWords.length || count < 1) return Object.freeze([]);
  const ordered = [...neutralWords].sort((a, b) => hashPracticeContent(`${sessionId}|${entityKey}|neutral|${a.wordKey}|${a.sourceContentId}`).localeCompare(hashPracticeContent(`${sessionId}|${entityKey}|neutral|${b.wordKey}|${b.sourceContentId}`)));
  const units = [];
  const width = Math.min(3, Math.max(1, ordered.length));
  for (let index = 0; index < count; index += 1) {
    const selected = Array.from({ length: width }, (_, offset) => ordered[(index * width + offset) % ordered.length]);
    const wordKeys = selected.map((entry) => entry.wordKey);
    const generatedUnitId = `wk-neutral-${hashPracticeContent(`${sessionId}|${entityKey}|${index}|${wordKeys.join("|")}`)}`;
    units.push(freezeDeep({
      candidateId: generatedUnitId,
      generatedUnitId,
      kind: "generated-word-sequence",
      compositionMode: "generated-neutral-word-sequence",
      partition: "training",
      wordKeys,
      lexicalKeys: boundedUnique(wordKeys),
      sourceContentIds: boundedUnique(selected.map((entry) => entry.sourceContentId)),
      sourceContentHashes: boundedUnique(selected.map((entry) => entry.sourceContentHash)),
      sourceFamilyIds: boundedUnique(selected.map((entry) => entry.sourceFamilyId)),
      targetOpportunityCount: 0,
      positionCounts: emptyCounts(POSITION_KEYS),
      geometryCounts: emptyCounts(GEOMETRY_KEYS),
      precedingContextCount: 0,
      followingContextCount: 0,
      typabilityScore: null,
      typabilityPercentile: null,
      difficultyFeatures: {},
    }));
  }
  return Object.freeze(units);
}

function aggregateCoverage(units, neutralUnits) {
  const positions = aggregateUnitCounts(units, "positionCounts", POSITION_KEYS);
  const geometry = aggregateUnitCounts(units, "geometryCounts", GEOMETRY_KEYS);
  const preceding = new Set((units ?? []).flatMap((unit) => unit.precedingGraphemes ?? []));
  const following = new Set((units ?? []).flatMap((unit) => unit.followingGraphemes ?? []));
  const positionClassCount = ["word-start", "word-middle", "word-end", "single-character-word"].filter((key) => positions[key] > 0).length;
  const geometryClassCount = ["same-key", "same-side-near", "same-side-far", "cross-side"].filter((key) => geometry[key] > 0).length;
  return freezeDeep({
    positionCoverage: { counts: positions, classCount: positionClassCount },
    precedingContextCount: preceding.size,
    followingContextCount: following.size,
    geometryCoverage: { status: geometryClassCount ? "available" : "unavailable", counts: geometry, classCount: geometryClassCount },
    neutralUnitCount: neutralUnits.length,
    neutralLexicalCount: new Set(neutralUnits.flatMap((unit) => unit.lexicalKeys ?? unit.wordKeys ?? [])).size,
  });
}

async function composeWeakKeysPhases({ sessionId, context, target, targetIndex, contentItems, language, policy }) {
  const annotationCache = new Map();
  const [targetRefs, targetWordKeys] = await Promise.all([
    targetIndex.getTargetContentRefs({ partition: "training", entityType: "key", entityKey: target.entityKey, purpose: "training" }),
    targetIndex.getTargetWordRefs({ partition: "training", entityType: "key", entityKey: target.entityKey, purpose: "training" }),
  ]);
  if ((targetWordKeys?.length ?? 0) < policy.content.hardMinimumTargetWords) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_WORDS, "Weak Keys requires more approved target-containing words", { targetWordCount: targetWordKeys?.length ?? 0 });
  const naturalCandidates = await buildNaturalTargetCandidates({ targetIndex, refs: targetRefs, contentItems, targetKey: target.entityKey, context, language, policy, annotationCache });
  const wordCandidates = await buildTargetWordCandidates({ targetIndex, wordKeys: targetWordKeys, contentItems, targetKey: target.entityKey, context, language, policy, annotationCache });
  if (wordCandidates.length < policy.content.hardMinimumTargetWords) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_WORDS, "Weak Keys could not validate enough target-containing words", { usableWordCount: wordCandidates.length });
  if (!naturalCandidates.length && !wordCandidates.length) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_CONTENT, "Weak Keys has no approved indexed target content");

  const generatedProbePool = generatedTargetPool(wordCandidates, 8, { compositionMode: "generated-word-sequence", salt: "probe" });
  const naturalProbeBundles = buildProbeBundles(naturalCandidates, { sessionId, entityKey: target.entityKey, policy, compositionMode: "natural-text-bundle", salt: "natural-probe" });
  const availableDistinctWords = new Set(wordCandidates.map((entry) => entry.wordKey)).size;
  const generatedProbeBundles = buildProbeBundles(generatedProbePool, {
    sessionId,
    entityKey: target.entityKey,
    policy,
    compositionMode: "generated-word-sequence",
    salt: "generated-probe",
    requiredDistinctLexical: availableDistinctWords >= policy.probes.preferredGeneratedDistinctLexicalItems ? policy.probes.preferredGeneratedDistinctLexicalItems : 0,
  });
  const probePair = selectPracticeWeakKeysProbePair({ entryCandidates: naturalProbeBundles, exitCandidates: naturalProbeBundles, policy })
    ?? selectPracticeWeakKeysProbePair({ entryCandidates: generatedProbeBundles, exitCandidates: generatedProbeBundles, policy });
  if (!probePair) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_PROBE_MATCH, "Weak Keys could not construct responsible family-disjoint matched Baseline/Check probes");

  const probeFamilies = new Set([...probePair.entry.units, ...probePair.exit.units].flatMap((unit) => unit.familyId ? [unit.familyId] : unit.sourceFamilyIds ?? []));
  const probeContents = new Set([...probePair.entry.units, ...probePair.exit.units].flatMap((unit) => unit.contentId ? [unit.contentId] : unit.sourceContentIds ?? []));

  const focusAll = generatedTargetPool(wordCandidates, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.focus, { compositionMode: "generated-word-sequence", salt: "focus" });
  const preferredFocus = focusAll.filter((unit) => unit.wordLength >= policy.content.focusPreferredWordLengthMin && unit.wordLength <= policy.content.focusPreferredWordLengthMax);
  const focusOptions = preferredFocus.length >= policy.content.hardMinimumTargetWords ? preferredFocus : focusAll;
  const focus = selectPracticeWeakKeysExactQuota(focusOptions, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.focus, {
    sessionId, entityKey: target.entityKey, generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION, policyVersion: policy.version, salt: "focus",
    preferredTypabilityRange: [policy.content.focusPreferredTypabilityPercentileMin, policy.content.focusPreferredTypabilityPercentileMax],
  });
  if (!focus || focus.metrics.distinctLexicalCount < policy.content.hardMinimumTargetWords) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_WORDS, "Weak Keys Focus phase cannot satisfy lexical diversity and exact dose");

  const generatedContext = generatedTargetPool(wordCandidates, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.context, { compositionMode: "generated-word-sequence", salt: "context" });
  const contextPreferred = [...naturalCandidates.filter((unit) => !probeFamilies.has(unit.familyId) && !probeContents.has(unit.contentId)), ...generatedContext.filter((unit) => !(unit.sourceFamilyIds ?? []).some((id) => probeFamilies.has(id)) && !(unit.sourceContentIds ?? []).some((id) => probeContents.has(id)))];
  const contextPool = contextPreferred.length ? contextPreferred : [...naturalCandidates, ...generatedContext];
  const contextSelection = selectPracticeWeakKeysExactQuota(contextPool, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.context, {
    sessionId, entityKey: target.entityKey, generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION, policyVersion: policy.version, salt: "context",
  });
  if (!contextSelection) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_CONTENT, "Weak Keys Context phase cannot satisfy its exact target quota");
  const supportPositionClasses = new Set([...naturalCandidates, ...generatedContext].flatMap((unit) => unit.positionClasses ?? [])).size;
  if (supportPositionClasses >= policy.content.minimumContextPositionClassesWhenAvailable && contextSelection.metrics.positionClassCount < policy.content.minimumContextPositionClassesWhenAvailable) {
    throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_POSITION_VARIETY, "Weak Keys Context phase could not preserve available word-position diversity");
  }

  const mixTargetPool = generatedTargetPool(wordCandidates, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.interleave, { compositionMode: "generated-word-sequence", salt: "mix-target" });
  const mixTarget = selectPracticeWeakKeysExactQuota(mixTargetPool, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.interleave, {
    sessionId, entityKey: target.entityKey, generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION, policyVersion: policy.version, salt: "mix-target",
  });
  if (!mixTarget) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_CONTENT, "Weak Keys Mix phase cannot satisfy its exact target quota");

  const neutralMaterial = await buildNeutralMaterial({ targetIndex, contentItems, targetKey: target.entityKey, language, policy, annotationCache });
  const requiredNeutralUnits = Math.max(1, Math.ceil(mixTarget.units.length * policy.content.neutralTargetBearingRatio));
  const neutralUnits = neutralMaterial.natural.length >= requiredNeutralUnits
    ? neutralMaterial.natural.slice(0, requiredNeutralUnits)
    : generatedNeutralUnits(neutralMaterial.words, requiredNeutralUnits, { sessionId, entityKey: target.entityKey });
  if (neutralUnits.length < requiredNeutralUnits) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_NEUTRAL_CONTENT, "Weak Keys Mix requires genuine target-free training material");
  const neutralLexicalAvailable = new Set(neutralMaterial.words.map((entry) => entry.wordKey)).size;
  const neutralLexicalUsed = new Set(neutralUnits.flatMap((unit) => unit.lexicalKeys ?? unit.wordKeys ?? [])).size;
  if (neutralLexicalAvailable >= policy.content.preferredDistinctNeutralWords && neutralLexicalUsed < policy.content.preferredDistinctNeutralWords) {
    throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_NEUTRAL_CONTENT, "Weak Keys neutral fallback did not preserve available lexical diversity");
  }

  const interleaved = [];
  for (let index = 0; index < mixTarget.units.length; index += 1) {
    interleaved.push(mixTarget.units[index]);
    interleaved.push(neutralUnits[index % neutralUnits.length]);
  }
  const targetTrainingUnits = [...focus.units, ...contextSelection.units, ...mixTarget.units];
  const coverage = aggregateCoverage(targetTrainingUnits, neutralUnits);
  return freezeDeep({
    phaseUnits: {
      "entry-probe": probePair.entry.units,
      focus: focus.units,
      context: contextSelection.units,
      interleave: interleaved,
      "exit-probe": probePair.exit.units,
    },
    contextCoveragePlan: {
      ...coverage,
      probeMatch: probePair.match,
      probeCompositionMode: probePair.match.compositionMode,
      targetWordCount: availableDistinctWords,
      targetContentCount: naturalCandidates.length,
    },
  });
}

export async function inspectPracticeWeakKeysAvailability({
  sessionId = "weak-keys-availability",
  context,
  targetIndex,
  contentItems = [],
  entityKey,
  language = context?.dataLocale ?? "en",
  policy = PRACTICE_WEAK_KEYS_POLICY_V1,
} = {}) {
  const basic = await validateWeakKeyTarget({ context, entityKey, indexProvider: targetIndex, language, policy });
  if (basic.status !== "ready") return basic;
  const target = normalizePracticeWeakKeyTarget({ entityKey, language });
  try {
    const composed = await composeWeakKeysPhases({ sessionId, context, target, targetIndex, contentItems, language: "en", policy });
    return freezeDeep({ ...basic, eligible: true, status: "ready", contextCoverage: composed.contextCoveragePlan, reasons: [] });
  } catch (error) {
    const limited = [
      PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_WORDS,
      PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_CONTENT,
      PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_POSITION_VARIETY,
      PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_NEUTRAL_CONTENT,
      PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_PROBE_MATCH,
    ].includes(error?.code);
    return freezeDeep({ ...basic, eligible: false, status: limited ? "limited-content" : "unavailable", contextCoverage: null, reasons: [error?.code || PRACTICE_WEAK_KEYS_ERRORS.TRAINING_CORPUS_NOT_READY] });
  }
}

export async function buildPracticeWeakKeysTrainingPlan({
  sessionId,
  context,
  targetIndex,
  contentItems = [],
  corpusBinding,
  entityKey,
  targetSource = "manual",
  language = context?.dataLocale ?? "en",
  policy = PRACTICE_WEAK_KEYS_POLICY_V1,
} = {}) {
  const target = normalizePracticeWeakKeyTarget({ entityKey, language });
  if (!target) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.UNSUPPORTED_KEY_TARGET, "Weak Keys trains one English letter at a time");
  if (!targetIndex) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.KEY_INDEX_NOT_FOUND, "Weak Keys target index is unavailable");
  const composed = await composeWeakKeysPhases({ sessionId, context, target, targetIndex, contentItems, language: "en", policy });
  return buildPracticeWeakKeysPlan({
    sessionId,
    context,
    language: "en",
    entityKey: target.entityKey,
    targetSource,
    corpusBinding,
    phaseUnits: composed.phaseUnits,
    contextCoveragePlan: composed.contextCoveragePlan,
    policy,
  });
}

function resolveUnitText(unit, byId) {
  if (unit.kind === "natural") {
    const content = byId.get(unit.contentId);
    if (!content || content.contentHash !== unit.contentHash || content.familyId !== unit.familyId || !approvedTraining(content)) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.CONTENT_HASH_MISMATCH, `Weak Keys source content no longer matches ${unit.contentId}`);
    return content.text;
  }
  return unit.wordKeys.join(" ");
}

function phaseInterleaveOrder(units) {
  return units;
}

export function buildPracticeWeakKeysContentPlan({ plan, contentItems = [], segmenter = null } = {}) {
  if (!plan?.target || plan.partition !== "training") throw new TypeError("Weak Keys content requires a frozen training plan");
  const byId = new Map((contentItems ?? []).filter(approvedTraining).map((item) => [item.contentId, item]));
  const segment = createPracticeSegmenter(segmenter);
  const pieces = [];
  const units = [];
  const phaseRanges = [];
  let cursor = 0;

  for (const phase of plan.phases) {
    const phaseUnits = phase.id === "interleave" ? phaseInterleaveOrder(phase.units) : phase.units;
    const phaseStart = cursor;
    const phaseTargetPositions = [];
    for (const [unitIndex, unit] of phaseUnits.entries()) {
      const text = resolveUnitText(unit, byId);
      if (pieces.length) {
        pieces.push(UNIT_SEPARATOR);
        cursor += segment(UNIT_SEPARATOR).length;
      }
      const startIndex = cursor;
      const graphemes = segment(text);
      const analysis = analyzePracticeText({ text, language: plan.language, segmenter });
      const localTargetPositions = (analysis.keyOccurrences ?? []).filter((occurrence) => occurrence.target === plan.target.entityKey).map((occurrence) => occurrence.startIndex);
      if (localTargetPositions.length !== unit.targetOpportunityCount) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.CONTENT_HASH_MISMATCH, "Weak Keys composed unit target count no longer matches its immutable plan", { candidateId: unit.candidateId, planned: unit.targetOpportunityCount, actual: localTargetPositions.length });
      pieces.push(text);
      cursor += graphemes.length;
      const absoluteTargetPositions = localTargetPositions.map((position) => startIndex + position);
      phaseTargetPositions.push(...absoluteTargetPositions);
      units.push({
        unitId: `wk-${phase.ordinal}-${unitIndex + 1}`,
        type: "segment",
        startIndex,
        endIndex: cursor,
        text,
        metadata: {
          weakKeys: {
            phaseId: phase.id,
            phaseOrdinal: phase.ordinal,
            cue: phase.cue,
            targetOpportunityCount: unit.targetOpportunityCount,
            targetPositions: absoluteTargetPositions,
            sourceKind: unit.kind,
            sourceContentId: unit.kind === "natural" ? unit.contentId : null,
            sourceFamilyIds: unit.kind === "natural" ? [unit.familyId] : unit.sourceFamilyIds,
          },
        },
      });
    }
    if (phaseTargetPositions.length !== phase.opportunityQuota) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.CONTENT_HASH_MISMATCH, `Weak Keys ${phase.id} target positions do not match quota`);
    phaseRanges.push({
      id: phase.id,
      ordinal: phase.ordinal,
      label: phase.label,
      cue: phase.cue,
      startIndex: phaseStart,
      endIndex: cursor,
      opportunityQuota: phase.opportunityQuota,
      targetPositions: phaseTargetPositions,
    });
  }

  const metadata = createPracticeWeakKeysContentPlanMetadata(plan);
  return createPracticeContentPlan({
    contentId: `practice-content_weak-keys-${String(plan.planHash).replace(/[^a-z0-9._-]/gi, "-")}`,
    contentGeneratorVersion: plan.generatorVersion,
    text: pieces.join(""),
    units,
    targetEntities: metadata.targetEntities,
    completion: { mode: "content", value: null },
    metadata: {
      ...metadata,
      language: plan.language,
      weakKeys: {
        ...metadata.weakKeys,
        target: { ...plan.target },
        phaseRanges,
      },
    },
  }, { segmenter });
}
