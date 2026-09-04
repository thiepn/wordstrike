import { segmentPracticeGraphemes } from "./practiceTextSegmentation.js";
import {
  PRACTICE_ERROR_CONTENT_CLASSES,
  PRACTICE_ERROR_POLICY_V1,
  PRACTICE_ERROR_STRUCTURAL_CLASSES,
  PRACTICE_ERROR_SUMMARY_CONFIDENCE,
  validatePracticeErrorPolicy,
} from "./practiceErrorPolicy.js";
import {
  enrichPracticeErrorEpisodesWithLatency,
  summarizePracticeRecoverySamples,
} from "./practiceRecoveryAnalyzer.js";

const LETTER = /^[\p{L}\p{M}]+$/u;
const NUMBER = /^\p{N}+$/u;
const PUNCTUATION = /^\p{P}+$/u;
const SYMBOL = /^\p{S}+$/u;
const WHITESPACE = /^\s+$/u;

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const contentCountKey = (value) => value === "whitespace-boundary" ? "whitespaceBoundary" : value;

function toGraphemes(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  return [...segmentPracticeGraphemes(String(value ?? ""))];
}

function safeLower(value) {
  try { return String(value).normalize("NFC").toLocaleLowerCase(); }
  catch { return String(value).normalize("NFC").toLowerCase(); }
}

function isCapitalizationPair(expected, observed) {
  return expected !== observed
    && LETTER.test(expected)
    && LETTER.test(observed)
    && safeLower(expected) === safeLower(observed);
}

function primitiveContentClass(grapheme) {
  if (typeof grapheme !== "string" || !grapheme.length) return "unknown";
  if (WHITESPACE.test(grapheme)) return "whitespace-boundary";
  if (NUMBER.test(grapheme)) return "numeric";
  if (PUNCTUATION.test(grapheme)) return "punctuation";
  if (SYMBOL.test(grapheme)) return "symbol";
  if (LETTER.test(grapheme)) return "letter";
  return "unknown";
}

export function classifyPracticeErrorContent({ expected = [], observed = [], alignment = null } = {}) {
  const expectedValues = toGraphemes(expected);
  const observedValues = toGraphemes(observed);
  const edits = Array.isArray(alignment?.operations)
    ? alignment.operations.filter((entry) => entry.type !== "match")
    : [];
  if (edits.length && edits.every((entry) => entry.type === "substitution" && isCapitalizationPair(entry.expected, entry.observed))) {
    return "capitalization";
  }
  const classes = new Set();
  if (edits.length) {
    for (const edit of edits) {
      const values = [];
      if (Array.isArray(edit.expected)) values.push(...edit.expected);
      else if (edit.expected != null) values.push(edit.expected);
      if (Array.isArray(edit.observed)) values.push(...edit.observed);
      else if (edit.observed != null) values.push(edit.observed);
      for (const value of values) classes.add(primitiveContentClass(value));
    }
  } else {
    const max = Math.max(expectedValues.length, observedValues.length);
    for (let index = 0; index < max; index += 1) {
      if (expectedValues[index] === observedValues[index]) continue;
      if (isCapitalizationPair(expectedValues[index], observedValues[index])) classes.add("capitalization");
      else {
        classes.add(primitiveContentClass(expectedValues[index]));
        classes.add(primitiveContentClass(observedValues[index]));
      }
    }
  }
  classes.delete("unknown");
  if (!classes.size) return "unknown";
  if (classes.size === 1) return [...classes][0];
  return "mixed";
}

export function reconstructPracticeTypingAttempts(events = []) {
  if (!Array.isArray(events)) throw new TypeError("Practice attempt reconstruction requires an event array");
  const stack = [];
  const removedAttempts = [];
  const errors = [];
  let degraded = false;
  let inferredCursor = 0;
  for (const event of events) {
    if (!["character", "space", "backspace", "word-delete"].includes(event?.type)) continue;
    if (event.type === "character" || event.type === "space") {
      const cursorBefore = Number.isInteger(event.cursorBefore) ? event.cursorBefore : Number.isInteger(event.textPosition) ? event.textPosition : inferredCursor;
      const cursorAfter = Number.isInteger(event.cursorAfter) ? event.cursorAfter : cursorBefore + 1;
      if (!Number.isInteger(event.cursorBefore) || !Number.isInteger(event.cursorAfter)) degraded = true;
      if (cursorBefore !== inferredCursor || cursorAfter !== cursorBefore + 1 || event.textPosition !== cursorBefore) {
        errors.push({ eventIndex: event.eventIndex ?? null, code: "INSERTION_CURSOR_MISMATCH" });
        return freezeDeep({ valid: false, degraded: true, errors, stack: [], removedAttempts: [] });
      }
      stack.push({
        eventIndex: event.eventIndex ?? null,
        position: cursorBefore,
        expected: event.expected ?? null,
        entered: event.entered ?? null,
        correctness: event.correctness ?? null,
      });
      inferredCursor = cursorAfter;
      continue;
    }

    const cursorBefore = Number.isInteger(event.cursorBefore) ? event.cursorBefore : inferredCursor;
    const cursorAfter = Number.isInteger(event.cursorAfter)
      ? event.cursorAfter
      : Number.isInteger(event.removedCount) ? Math.max(0, cursorBefore - event.removedCount) : cursorBefore;
    if (!Number.isInteger(event.cursorBefore) || !Number.isInteger(event.cursorAfter)) degraded = true;
    if (cursorBefore !== inferredCursor || cursorAfter > cursorBefore || cursorAfter < 0) {
      errors.push({ eventIndex: event.eventIndex ?? null, code: "CORRECTION_CURSOR_MISMATCH" });
      return freezeDeep({ valid: false, degraded: true, errors, stack: [], removedAttempts: [] });
    }
    const removeCount = cursorBefore - cursorAfter;
    if (removeCount > stack.length) {
      errors.push({ eventIndex: event.eventIndex ?? null, code: "CORRECTION_RANGE_UNDERFLOW" });
      return freezeDeep({ valid: false, degraded: true, errors, stack: [], removedAttempts: [] });
    }
    const removed = removeCount ? stack.splice(stack.length - removeCount, removeCount) : [];
    removedAttempts.push(...removed.map((entry) => ({ ...entry, removedByEventIndex: event.eventIndex ?? null })));
    inferredCursor = cursorAfter;
  }
  return freezeDeep({ valid: true, degraded, errors: [], stack, removedAttempts });
}

function copyFixedCounts(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, Number.isInteger(source?.[key]) && source[key] >= 0 ? source[key] : 0]));
}

function structuralCountsFrom(snapshot) {
  return copyFixedCounts(snapshot?.structuralCounts, PRACTICE_ERROR_STRUCTURAL_CLASSES);
}

function contentCountsFrom(snapshot) {
  const keys = PRACTICE_ERROR_CONTENT_CLASSES.map(contentCountKey);
  return copyFixedCounts(snapshot?.contentCounts, keys);
}

function downgradeConfidence(value) {
  const index = PRACTICE_ERROR_SUMMARY_CONFIDENCE.indexOf(value);
  return index <= 1 ? PRACTICE_ERROR_SUMMARY_CONFIDENCE[Math.max(0, index)] : PRACTICE_ERROR_SUMMARY_CONFIDENCE[index - 1];
}

function classificationConfidence({ episodeCount, unknownCount, boundedCount, aggregateScope, traceTruncated }) {
  let value = "none";
  if (episodeCount > 0) value = "low";
  if (episodeCount >= 5) value = "medium";
  if (episodeCount >= 20) value = "high";
  if (episodeCount && unknownCount / episodeCount > 0.25) value = downgradeConfidence(value);
  if (boundedCount > 0) value = downgradeConfidence(value);
  if (aggregateScope !== "complete-session") value = downgradeConfidence(value);
  if (traceTruncated && value === "high") value = "medium";
  return value;
}

function mergedSamples(snapshot, enriched) {
  const source = snapshot?.recoverySamples || {};
  return {
    correctionInitiationMs: [...(source.correctionInitiationMs || [])],
    correctionDistanceChars: [...(source.correctionDistanceChars || [])],
    correctionToRepairMs: [...(source.correctionToRepairMs || [])],
    errorToRepairMs: [...(source.errorToRepairMs || [])],
    repairToResumeMs: [...(source.repairToResumeMs || [])],
    resumeToFluentMs: [...(source.resumeToFluentMs || []), ...(enriched.resumeToFluentSamples || [])],
  };
}

export function analyzePracticeErrors({
  events = [],
  traceMetadata = {},
  trackerSnapshot,
  latencyAnalysis,
  policy = PRACTICE_ERROR_POLICY_V1,
} = {}) {
  validatePracticeErrorPolicy(policy);
  if (!trackerSnapshot || typeof trackerSnapshot !== "object") throw new TypeError("Practice error analysis requires a tracker snapshot");
  const reconstruction = reconstructPracticeTypingAttempts(events);
  const traceTruncated = Boolean(traceMetadata?.truncated || (traceMetadata?.totalEventCount ?? events.length) > (traceMetadata?.retainedEventCount ?? events.length));
  const traceScope = traceTruncated ? "retained-window" : "complete-session";
  const enriched = enrichPracticeErrorEpisodesWithLatency({
    episodes: trackerSnapshot.recentEpisodes || [],
    events,
    latencyAnalysis,
    policy,
  });
  const recovery = summarizePracticeRecoverySamples(mergedSamples(trackerSnapshot, enriched));
  const structuralCounts = structuralCountsFrom(trackerSnapshot);
  const contentCounts = contentCountsFrom(trackerSnapshot);
  const errorEpisodeCount = Number(trackerSnapshot.errorEpisodeCount || 0);
  const correctedEpisodeCount = Number(trackerSnapshot.correctedEpisodeCount || 0);
  const uncorrectedEpisodeCount = Number(trackerSnapshot.uncorrectedEpisodeCount || 0);
  const charactersRemoved = Number(trackerSnapshot.charactersRemoved || 0);
  const correctCharactersRemoved = Number(trackerSnapshot.correctCharactersRemoved || 0);
  const acceptedInsertions = Number(trackerSnapshot.acceptedInsertions || 0);
  const aggregateScope = trackerSnapshot.aggregateScope || "retained-window";
  const coverage = {
    aggregateScope,
    traceScope,
    retainedEventCount: Number.isInteger(traceMetadata?.retainedEventCount) ? traceMetadata.retainedEventCount : events.length,
    totalEventCount: Number.isInteger(traceMetadata?.totalEventCount) ? traceMetadata.totalEventCount : events.length,
    traceTruncated,
    activeEpisodeTruncatedCount: Number(trackerSnapshot.activeEpisodeTruncatedCount || 0),
  };
  const summary = {
    analysisVersion: policy.analysisVersion,
    errorAnalyzerVersion: policy.errorAnalyzerVersion,
    alignmentPolicyVersion: policy.alignmentPolicyVersion,
    recoveryPolicyVersion: policy.recoveryPolicyVersion,
    coverage,
    errorEpisodeCount,
    correctedEpisodeCount,
    uncorrectedEpisodeCount,
    structuralCounts,
    contentCounts,
    doublingEpisodeCount: Number(trackerSnapshot.doublingEpisodeCount || 0),
    cascadeEpisodeCount: Number(trackerSnapshot.cascadeEpisodeCount || 0),
    correctionAttemptCount: Number(trackerSnapshot.correctionAttemptCount || 0),
    nonErrorCorrectionActionCount: Number(trackerSnapshot.nonErrorCorrectionActionCount || 0),
    ignoredCorrectionActionCount: Number(trackerSnapshot.ignoredCorrectionActionCount || 0),
    disabledCorrectionAttemptCount: Number(trackerSnapshot.disabledCorrectionAttemptCount || 0),
    charactersRemoved,
    incorrectCharactersRemoved: Number(trackerSnapshot.incorrectCharactersRemoved || 0),
    correctCharactersRemoved,
    overDeletionRate: charactersRemoved > 0 ? correctCharactersRemoved / charactersRemoved : null,
    ...recovery,
    correctedEpisodeRate: errorEpisodeCount > 0 ? correctedEpisodeCount / errorEpisodeCount : null,
    episodesPer1000Insertions: acceptedInsertions > 0 ? 1000 * errorEpisodeCount / acceptedInsertions : null,
    classificationConfidence: classificationConfidence({
      episodeCount: errorEpisodeCount,
      unknownCount: structuralCounts.unknown,
      boundedCount: coverage.activeEpisodeTruncatedCount,
      aggregateScope,
      traceTruncated,
    }),
  };
  return freezeDeep({
    analysisVersion: policy.analysisVersion,
    sessionSummary: summary,
    recentEpisodes: enriched.episodes,
    diagnostics: {
      reconstructionValid: reconstruction.valid,
      reconstructionDegraded: reconstruction.degraded,
      reconstructionErrorCount: reconstruction.errors.length,
      recentEpisodeCount: enriched.episodes.length,
      traceScope,
      aggregateScope,
    },
  });
}
