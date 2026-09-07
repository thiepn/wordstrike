import { analyzePracticeText } from "./practiceTextAnalysis.js";
import { extractPracticeTextDifficultyFeatures } from "./practiceTextDifficultyFeatures.js";
import { resolvePracticeTypabilityRuntime } from "./practiceTypabilityRuntime.js";
import { scorePracticeTextTypability } from "./practiceTypabilityModel.js";
import { classifyPracticeKeyboardGeometry } from "./practiceKeyboardGeometry.js";
import { createPracticeContentPlan, createPracticeSegmenter } from "./practiceSessionContract.js";
import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_PROBLEM_WORDS_ERRORS,
  PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION,
  PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS,
} from "./practiceProblemWordsConstants.js";
import { PRACTICE_PROBLEM_WORDS_POLICY_V1 } from "./practiceProblemWordsPolicy.js";
import { selectPracticeProblemWordsExactQuota, practiceProblemWordsCandidateOrderKey } from "./practiceProblemWordsComposer.js";
import { selectPracticeProblemWordsProbePair } from "./practiceProblemWordsProbeMatch.js";
import { buildPracticeProblemWordsPlan, createPracticeProblemWordsContentPlanMetadata } from "./practiceProblemWordsPlan.js";
import { createPracticeProblemWordsError, normalizePracticeProblemWordTarget, validateProblemWordTarget } from "./practiceProblemWordsTargets.js";

const UNIT_SEPARATOR = " ";
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const approvedTraining = (item) => item?.partition === "training" && item?.reviewStatus === "approved" && typeof item?.text === "string" && item?.contentId && item?.contentHash && item?.familyId;
const alphaWord = (value) => typeof value === "string" && /^[a-z]{2,24}$/u.test(value.normalize("NFC").toLowerCase());
const distinct = (values) => [...new Set(values.filter(Boolean))];

function scoreText(text, language) {
  const analysis = analyzePracticeText({ text, language });
  const features = extractPracticeTextDifficultyFeatures({ text, language, analysis });
  const runtime = resolvePracticeTypabilityRuntime({ language });
  const score = runtime?.reference ? scorePracticeTextTypability({ features, reference: runtime.reference, language }) : null;
  return { difficultyFeatures: features, typabilityScore: Number.isFinite(score?.difficultyIndex) ? score.difficultyIndex : null, typabilityPercentile: Number.isFinite(score?.relativeDifficultyPercentile) ? score.relativeDifficultyPercentile : null };
}

async function loadAnnotation(index, cache, content) {
  if (cache.has(content.contentId)) return cache.get(content.contentId);
  const promise = index.getContentAnnotations({ partition: "training", contentId: content.contentId, purpose: "training", content });
  cache.set(content.contentId, promise);
  try { return await promise; } catch (error) { cache.delete(content.contentId); throw error; }
}

function surfaceForWord(content, word, segment) { return segment(content.text).slice(word.startIndex, word.endIndex).join(""); }
function wordOrder(annotation) { return [...(annotation?.words ?? [])].sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex); }
function launchSignature({ words, index, content, segment, target }) {
  if (index <= 0) return "text-start|word-start|unknown|letter";
  const previous = words[index - 1];
  const previousSurface = surfaceForWord(content, previous, segment).normalize("NFC").toLowerCase();
  const previousLast = Array.from(previousSurface).at(-1) ?? null;
  const currentFirst = Array.from(target)[0] ?? null;
  const geometry = previousLast && currentFirst ? classifyPracticeKeyboardGeometry({ layout: content.keyboardLayout ?? null, previousExpected: previousLast, currentExpected: currentFirst }) : null;
  const bucket = previousSurface.length <= 3 ? "short" : previousSurface.length <= 7 ? "medium" : "long";
  return `after-word:${bucket}|word-start|${geometry?.known ? geometry.geometryClass : "unknown"}|letter`;
}

async function naturalCandidates({ targetIndex, summary, contentItems, target, context, language, policy, cache, segment }) {
  const byId = new Map((contentItems ?? []).filter(approvedTraining).map((item) => [item.contentId, item]));
  const out = [];
  for (const ref of (summary?.contents ?? []).slice(0, policy.content.maxTargetCandidates)) {
    const content = byId.get(ref?.contentId); if (!content || content.familyId !== ref.familyId) continue;
    const annotation = await loadAnnotation(targetIndex, cache, content);
    const words = wordOrder(annotation);
    const matches = [];
    words.forEach((word, index) => {
      if (word.lexicalKey !== target.entityKey) return;
      const surface = surfaceForWord(content, word, segment).normalize("NFC");
      if (surface !== target.entityKey) return;
      matches.push({ word, index, surface });
    });
    const indexedCount = Number(ref?.count ?? ref?.positions?.length ?? matches.length);
    if (indexedCount !== (annotation.words ?? []).filter((word) => word.lexicalKey === target.entityKey).length) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.CONTENT_HASH_MISMATCH, "Problem Words word annotation no longer matches the training reverse index", { contentId: content.contentId });
    if (matches.length !== 1) continue;
    const match = matches[0];
    const beforeWords = match.index;
    const afterWords = words.length - match.index - 1;
    const signature = launchSignature({ words, index: match.index, content: { ...content, keyboardLayout: context?.keyboardLayout }, segment, target: target.entityKey });
    const difficulty = scoreText(content.text, language);
    out.push(freezeDeep({
      candidateId: `natural:${content.contentId}`,
      kind: "natural",
      compositionMode: "natural-text-bundle",
      partition: "training",
      contentId: content.contentId,
      contentHash: content.contentHash,
      familyId: content.familyId,
      targetOpportunityCount: 1,
      targetWordLocalRanges: [{ startIndex: match.word.startIndex, endIndex: match.word.endIndex }],
      beforeTargetWordCount: beforeWords,
      afterTargetWordCount: afterWords,
      launchSignatures: [signature],
      lexicalKeys: words.map((word) => word.lexicalKey).filter(Boolean),
      ...difficulty,
    }));
  }
  return Object.freeze(out);
}

function neutralLexicalPool(candidates, annotationsByContent, contentById, target, segment, options) {
  const byKey = new Map();
  for (const candidate of candidates) {
    const annotation = annotationsByContent.get(candidate.contentId);
    const content = contentById.get(candidate.contentId);
    if (!annotation || !content) continue;
    for (const word of annotation.words ?? []) {
      const key = String(word.lexicalKey ?? "").normalize("NFC").toLowerCase();
      const surface = surfaceForWord(content, word, segment).normalize("NFC").toLowerCase();
      if (key === target || surface !== key || !alphaWord(key) || byKey.has(key)) continue;
      byKey.set(key, freezeDeep({
        candidateId: `neutral:${key}:${content.contentId}`,
        lexicalKey: key,
        wordKey: key,
        sourceContentId: content.contentId,
        sourceContentHash: content.contentHash,
        sourceFamilyId: content.familyId,
        targetOpportunityCount: 0,
      }));
    }
  }
  return Object.freeze([...byKey.values()].sort((a, b) => practiceProblemWordsCandidateOrderKey(a, options).localeCompare(practiceProblemWordsCandidateOrderKey(b, options)) || a.lexicalKey.localeCompare(b.lexicalKey)));
}

function makeGeneratedUnit({ words, target, source, id, compositionMode, language, context }) {
  const text = words.join(" ");
  const analysis = analyzePracticeText({ text, language });
  const targetWords = (analysis.words ?? []).filter((word) => word.lexicalKey === target && word.surfaceText === target);
  if (targetWords.length > 2) throw new TypeError("Problem Words generated unit exceeded its target cap");
  const targetOpportunityCount = targetWords.length;
  const launchSignatures = targetWords.map((word) => {
    const ordered = analysis.words ?? [];
    const index = ordered.findIndex((entry) => entry.startIndex === word.startIndex && entry.endIndex === word.endIndex);
    const previous = index > 0 ? ordered[index - 1] : null;
    const previousKey = previous?.lexicalKey ?? null;
    const previousLast = previousKey ? Array.from(previousKey).at(-1) : null;
    const currentFirst = Array.from(target)[0];
    const geometry = previousLast ? classifyPracticeKeyboardGeometry({ layout: context?.keyboardLayout, previousExpected: previousLast, currentExpected: currentFirst }) : null;
    const bucket = !previousKey ? "none" : previousKey.length <= 3 ? "short" : previousKey.length <= 7 ? "medium" : "long";
    return `${previousKey ? "after-word" : "text-start"}:${bucket}|word-start|${geometry?.known ? geometry.geometryClass : "unknown"}|letter`;
  });
  return freezeDeep({
    candidateId: `generated:${id}`,
    generatedUnitId: `pw-${hashPracticeContent(id)}`,
    kind: "generated-word-sequence",
    compositionMode,
    partition: "training",
    wordKeys: Object.freeze([...words]),
    lexicalKeys: Object.freeze([...words]),
    sourceContentIds: Object.freeze(distinct([source?.contentId])),
    sourceFamilyIds: Object.freeze(distinct([source?.familyId])),
    targetOpportunityCount,
    targetWordLocalRanges: Object.freeze(targetWords.map((word) => Object.freeze({ startIndex: word.startIndex, endIndex: word.endIndex }))),
    launchSignatures: Object.freeze(launchSignatures),
    ...scoreText(text, language),
  });
}

function neutralSlice(pool, start, count) {
  if (!pool.length) return [];
  const out = [];
  for (let index = 0; index < count; index += 1) out.push(pool[(start + index) % pool.length].lexicalKey);
  return out;
}

function generatedTargetUnits({ count, target, neutralPool, sourceCandidates, sessionId, language, context, salt, wordsBefore = 2, wordsAfter = 2 }) {
  if (neutralPool.length < Math.max(4, wordsBefore + wordsAfter)) return Object.freeze([]);
  const out = [];
  for (let index = 0; index < count; index += 1) {
    const source = sourceCandidates[index % sourceCandidates.length];
    const before = neutralSlice(neutralPool, index * (wordsBefore + wordsAfter + 1), wordsBefore);
    const after = neutralSlice(neutralPool, index * (wordsBefore + wordsAfter + 1) + wordsBefore, wordsAfter);
    out.push(makeGeneratedUnit({ words: [...before, target, ...after], target, source, id: `${sessionId}|${salt}|${index}|${source?.candidateId ?? "none"}`, compositionMode: salt.includes("probe") ? "generated-word-sequence" : "generated-word-sequence", language, context }));
  }
  return Object.freeze(out);
}

function bundleCandidates(candidates, { sessionId, entityKey, salt, requireBuffers = false } = {}) {
  const source = candidates.filter((candidate) => !requireBuffers || (candidate.beforeTargetWordCount >= 3 && candidate.afterTargetWordCount >= 2));
  const order = [...source].sort((a, b) => practiceProblemWordsCandidateOrderKey(a, { sessionId, entityKey, salt }).localeCompare(practiceProblemWordsCandidateOrderKey(b, { sessionId, entityKey, salt })) || a.candidateId.localeCompare(b.candidateId));
  const bundles = [];
  const seen = new Set();
  for (let offset = 0; offset < Math.min(24, order.length); offset += 1) {
    const units = []; const families = new Set();
    for (let step = 0; step < order.length && units.length < 3; step += 1) {
      const candidate = order[(offset + step) % order.length];
      if (families.has(candidate.familyId)) continue;
      families.add(candidate.familyId); units.push(candidate);
    }
    if (units.length !== 3) continue;
    const key = units.map((unit) => unit.candidateId).sort().join("|"); if (seen.has(key)) continue; seen.add(key);
    bundles.push(freezeDeep({ probeId: `${salt}:${hashPracticeContent(key)}`, compositionMode: "natural-text-bundle", units: Object.freeze(units) }));
  }
  return Object.freeze(bundles);
}

function generatedProbeBundles({ candidates, target, neutralPool, sessionId, language, context, salt }) {
  const families = [];
  const seen = new Set();
  for (const candidate of candidates) if (!seen.has(candidate.familyId)) { seen.add(candidate.familyId); families.push(candidate); }
  const ordered = families.sort((a, b) => practiceProblemWordsCandidateOrderKey(a, { sessionId, entityKey: target, salt }).localeCompare(practiceProblemWordsCandidateOrderKey(b, { sessionId, entityKey: target, salt })));
  const bundles = [];
  for (let offset = 0; offset < Math.min(12, ordered.length); offset += 1) {
    const sources = []; const used = new Set();
    for (let step = 0; step < ordered.length && sources.length < 3; step += 1) {
      const source = ordered[(offset + step) % ordered.length]; if (used.has(source.familyId)) continue; used.add(source.familyId); sources.push(source);
    }
    if (sources.length !== 3) continue;
    const units = generatedTargetUnits({ count: 3, target, neutralPool, sourceCandidates: sources, sessionId, language, context, salt: `${salt}-probe`, wordsBefore: 3, wordsAfter: 3 });
    if (units.length === 3 && units.every((unit) => unit.targetOpportunityCount === 1)) bundles.push(freezeDeep({ probeId: `${salt}:${offset}`, compositionMode: "generated-word-sequence", units }));
  }
  return Object.freeze(bundles);
}

function disjointPool(pool, probePair) {
  const usedFamilies = new Set([...probePair.entry.units, ...probePair.exit.units].flatMap((unit) => [unit.familyId, ...(unit.sourceFamilyIds ?? [])]).filter(Boolean));
  const usedContents = new Set([...probePair.entry.units, ...probePair.exit.units].flatMap((unit) => [unit.contentId, ...(unit.sourceContentIds ?? [])]).filter(Boolean));
  return pool.filter((unit) => !usedFamilies.has(unit.familyId) && !usedContents.has(unit.contentId));
}

async function composePhases({ sessionId, context, targetIndex, contentItems, target, language, policy }) {
  const summary = await targetIndex.getWordSummary({ partition: "training", lexicalKey: target.entityKey, purpose: "training" });
  if (!summary?.contents?.length) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.WORD_NOT_IN_TRAINING_CORPUS, "Problem word is absent from the approved training index");
  const segment = createPracticeSegmenter(); const cache = new Map();
  const natural = await naturalCandidates({ targetIndex, summary, contentItems, target, context, language, policy, cache, segment });
  if (natural.length < 4) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_WORD_CONTEXTS, "Problem Words needs more independent target-bearing training contexts");
  const contentById = new Map((contentItems ?? []).filter(approvedTraining).map((item) => [item.contentId, item]));
  const annotationMap = new Map(); for (const candidate of natural) annotationMap.set(candidate.contentId, await loadAnnotation(targetIndex, cache, contentById.get(candidate.contentId)));
  const neutralPool = neutralLexicalPool(natural, annotationMap, contentById, target.entityKey, segment, { sessionId, entityKey: target.entityKey, generatorVersion: PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION, policyVersion: policy.version, salt: "neutral" });
  if (neutralPool.length < 6) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_NEUTRAL_CONTENT, "Problem Words requires varied approved neutral lexical material");

  const naturalEntries = bundleCandidates(natural, { sessionId, entityKey: target.entityKey, salt: "entry", requireBuffers: true });
  let probePair = selectPracticeProblemWordsProbePair({
    entryCandidates: naturalEntries,
    exitCandidateBuilder(entry) {
      const families = new Set(entry.units.map((unit) => unit.familyId)); const contents = new Set(entry.units.map((unit) => unit.contentId));
      return bundleCandidates(natural.filter((unit) => !families.has(unit.familyId) && !contents.has(unit.contentId)), { sessionId, entityKey: target.entityKey, salt: `exit:${entry.probeId}`, requireBuffers: true });
    },
    policy,
  });
  if (!probePair) {
    const generatedEntries = generatedProbeBundles({ candidates: natural, target: target.entityKey, neutralPool, sessionId, language, context, salt: "entry-generated" });
    probePair = selectPracticeProblemWordsProbePair({
      entryCandidates: generatedEntries,
      exitCandidateBuilder(entry) {
        const families = new Set(entry.units.flatMap((unit) => unit.sourceFamilyIds ?? [])); const contents = new Set(entry.units.flatMap((unit) => unit.sourceContentIds ?? []));
        const complement = natural.filter((unit) => !families.has(unit.familyId) && !contents.has(unit.contentId));
        return generatedProbeBundles({ candidates: complement, target: target.entityKey, neutralPool, sessionId, language, context, salt: `exit-generated:${entry.probeId}` });
      },
      policy,
    });
  }
  if (!probePair) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_PROBE_MATCH, "Problem Words cannot construct a responsible matched Baseline/Check pair");

  const trainingNatural = disjointPool(natural, probePair);
  const contextSelection = selectPracticeProblemWordsExactQuota(trainingNatural.length ? trainingNatural : natural, PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS.context, { sessionId, entityKey: target.entityKey, salt: "context" });
  if (!contextSelection) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_WORD_CONTEXTS, "Problem Words Context cannot satisfy its exact target quota");
  const contextFamilies = new Set(contextSelection.units.map((unit) => unit.familyId)).size;
  const availableFamilies = new Set(natural.map((unit) => unit.familyId)).size;
  if (availableFamilies >= policy.content.minimumContextFamilyCount && contextFamilies < policy.content.minimumContextFamilyCount) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_TARGET_FAMILIES, "Problem Words Context lacks sufficient family diversity");

  const focusUnits = generatedTargetUnits({ count: 4, target: target.entityKey, neutralPool, sourceCandidates: trainingNatural.length ? trainingNatural : natural, sessionId, language, context, salt: "focus", wordsBefore: 2, wordsAfter: 2 });
  if (focusUnits.length !== 4 || focusUnits.some((unit) => unit.targetOpportunityCount !== 1)) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_WORD_CONTEXTS, "Problem Words Focus cannot satisfy its exact target quota");

  const mixTargetSelection = selectPracticeProblemWordsExactQuota(trainingNatural.length ? trainingNatural : natural, PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS.interleave, { sessionId, entityKey: target.entityKey, salt: "mix-target" });
  if (!mixTargetSelection) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_WORD_CONTEXTS, "Problem Words Mix cannot satisfy its exact target quota");
  if (neutralPool.length < policy.content.preferredMixNeutralWordCount) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_NEUTRAL_CONTENT, "Problem Words Mix requires at least 12 target-free neutral words");
  const neutralUnits = [0, 1].map((index) => makeGeneratedUnit({ words: neutralSlice(neutralPool, index * 6, 6), target: target.entityKey, source: null, id: `${sessionId}|mix-neutral|${index}`, compositionMode: "generated-word-sequence", language, context }));
  if (neutralUnits.some((unit) => unit.targetOpportunityCount !== 0)) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_NEUTRAL_CONTENT, "Problem Words neutral Mix material contains the target lexical word");
  const interleave = []; mixTargetSelection.units.forEach((unit, index) => { interleave.push(unit); interleave.push(neutralUnits[index]); });

  const launchCount = new Set([...focusUnits, ...contextSelection.units, ...mixTargetSelection.units].flatMap((unit) => unit.launchSignatures ?? []).filter((value) => value && value !== "unknown")).size;
  return freezeDeep({
    phaseUnits: { "entry-probe": probePair.entry.units, focus: focusUnits, context: contextSelection.units, interleave, "exit-probe": probePair.exit.units },
    contextCoveragePlan: {
      launchContextCount: launchCount,
      targetBearingFamilyCount: new Set([...focusUnits, ...contextSelection.units, ...mixTargetSelection.units].flatMap((unit) => [unit.familyId, ...(unit.sourceFamilyIds ?? [])]).filter(Boolean)).size,
      neutralWordCount: new Set(neutralUnits.flatMap((unit) => unit.wordKeys ?? [])).size,
      probeMatchCoverage: probePair.match.launchContextProfileCoverage,
      probeMatch: probePair.match,
    },
    probeMatch: probePair.match,
  });
}

export async function inspectPracticeProblemWordsAvailability({ sessionId = "problem-words-availability", context, targetIndex, contentItems = [], entityKey, language = context?.dataLocale ?? "en", policy = PRACTICE_PROBLEM_WORDS_POLICY_V1 } = {}) {
  const basic = await validateProblemWordTarget({ context, entityKey, indexProvider: targetIndex, language, policy });
  if (basic.status !== "ready") return basic;
  const target = normalizePracticeProblemWordTarget({ entityKey, language, policy });
  try {
    const composed = await composePhases({ sessionId, context, targetIndex, contentItems, target, language: "en", policy });
    return freezeDeep({ ...basic, eligible: true, status: "ready", naturalContextEvidence: { ...basic.naturalContextEvidence, launchContextCount: composed.contextCoveragePlan.launchContextCount }, reasons: [] });
  } catch (error) {
    const limited = [PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_WORD_CONTEXTS, PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_TARGET_FAMILIES, PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_NEUTRAL_CONTENT, PRACTICE_PROBLEM_WORDS_ERRORS.INSUFFICIENT_PROBE_MATCH].includes(error?.code);
    return freezeDeep({ ...basic, eligible: false, status: limited ? "limited-content" : "unavailable", reasons: [error?.code || PRACTICE_PROBLEM_WORDS_ERRORS.TRAINING_CORPUS_NOT_READY] });
  }
}

export async function buildPracticeProblemWordsTrainingPlan({ sessionId, context, targetIndex, contentItems = [], corpusBinding, entityKey, targetSource = "manual", language = context?.dataLocale ?? "en", policy = PRACTICE_PROBLEM_WORDS_POLICY_V1 } = {}) {
  const target = normalizePracticeProblemWordTarget({ entityKey, language, policy });
  if (!target) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.UNSUPPORTED_WORD_TARGET, "Problem Words trains one lowercase alphabetic English word from 2 to 24 letters");
  if (!targetIndex) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.WORD_INDEX_NOT_FOUND, "Problem Words target index is unavailable");
  const composed = await composePhases({ sessionId, context, targetIndex, contentItems, target, language: "en", policy });
  return buildPracticeProblemWordsPlan({ sessionId, context, language: "en", entityKey: target.entityKey, targetSource, corpusBinding, phaseUnits: composed.phaseUnits, contextCoveragePlan: composed.contextCoveragePlan, probeMatch: composed.probeMatch });
}

function unitText(unit, byId) {
  if (unit.kind === "natural") {
    const content = byId.get(unit.contentId);
    if (!content || content.contentHash !== unit.contentHash || content.familyId !== unit.familyId || !approvedTraining(content)) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.CONTENT_HASH_MISMATCH, `Problem Words source content no longer matches ${unit.contentId}`);
    return content.text;
  }
  return (unit.wordKeys ?? []).join(" ");
}

export function buildPracticeProblemWordsContentPlan({ plan, contentItems = [], segmenter = null } = {}) {
  if (!plan?.target || plan.partition !== "training") throw new TypeError("Problem Words content requires a frozen training plan");
  const byId = new Map((contentItems ?? []).filter(approvedTraining).map((item) => [item.contentId, item]));
  const segment = createPracticeSegmenter(segmenter); const pieces = []; const units = []; const phaseRanges = []; let cursor = 0;
  for (const phase of plan.phases) {
    const phaseStart = cursor; const wordRanges = [];
    for (const [unitIndex, unit] of phase.units.entries()) {
      const text = unitText(unit, byId);
      if (pieces.length) { pieces.push(UNIT_SEPARATOR); cursor += segment(UNIT_SEPARATOR).length; }
      const startIndex = cursor; const analysis = analyzePracticeText({ text, language: plan.language, segmenter });
      const localWords = (analysis.words ?? []).filter((word) => word.lexicalKey === plan.target.entityKey && word.surfaceText === plan.target.entityKey);
      if (localWords.length !== unit.targetOpportunityCount) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.CONTENT_HASH_MISMATCH, "Problem Words lexical target count changed while materializing the immutable plan", { candidateId: unit.candidateId });
      const absoluteRanges = localWords.map((word) => ({ startIndex: startIndex + word.startIndex, endIndex: startIndex + word.endIndex }));
      wordRanges.push(...absoluteRanges); pieces.push(text); cursor += segment(text).length;
      units.push({ unitId: `pw-${phase.ordinal}-${unitIndex + 1}`, type: "segment", startIndex, endIndex: cursor, text, metadata: { problemWords: { phaseId: phase.id, phaseOrdinal: phase.ordinal, cue: phase.cue, targetOpportunityCount: unit.targetOpportunityCount, targetWordRanges: absoluteRanges, sourceKind: unit.kind, sourceContentId: unit.kind === "natural" ? unit.contentId : null, sourceFamilyIds: unit.kind === "natural" ? [unit.familyId] : unit.sourceFamilyIds } } });
    }
    if (wordRanges.length !== phase.opportunityQuota) throw createPracticeProblemWordsError(PRACTICE_PROBLEM_WORDS_ERRORS.CONTENT_HASH_MISMATCH, `Problem Words ${phase.id} target ranges do not match quota`);
    phaseRanges.push({ id: phase.id, ordinal: phase.ordinal, label: phase.label, cue: phase.cue, startIndex: phaseStart, endIndex: cursor, opportunityQuota: phase.opportunityQuota, targetWordRanges: wordRanges });
  }
  const metadata = createPracticeProblemWordsContentPlanMetadata(plan);
  return createPracticeContentPlan({
    contentId: `practice-content_problem-words-${String(plan.planHash).replace(/[^a-z0-9._-]/gi, "-")}`,
    contentGeneratorVersion: plan.generatorVersion,
    text: pieces.join(""),
    units,
    targetEntities: metadata.targetEntities,
    completion: { mode: "content", value: null },
    metadata: { ...metadata, language: plan.language, problemWords: { ...metadata.problemWords, target: { ...plan.target }, phaseRanges } },
  }, { segmenter });
}
