import { alignPracticeErrorSequences } from "./practiceErrorAlignment.js";
import { classifyPracticeErrorContent } from "./practiceErrorAnalyzer.js";
import {
  PRACTICE_ERROR_CONTENT_CLASSES,
  PRACTICE_ERROR_POLICY_V1,
  PRACTICE_ERROR_STRUCTURAL_CLASSES,
  PRACTICE_ERROR_TRACKER_VERSION,
  validatePracticeErrorPolicy,
} from "./practiceErrorPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const finiteNonNegative = (value) => Number.isFinite(value) && value >= 0;
const contentCountKey = (value) => value === "whitespace-boundary" ? "whitespaceBoundary" : value;

function fixedStructuralCounts(seed = {}) {
  return Object.fromEntries(PRACTICE_ERROR_STRUCTURAL_CLASSES.map((key) => [key, Number(seed[key] || 0)]));
}

function fixedContentCounts(seed = {}) {
  return Object.fromEntries(PRACTICE_ERROR_CONTENT_CLASSES.map((key) => {
    const countKey = contentCountKey(key);
    return [countKey, Number(seed[countKey] || 0)];
  }));
}

function emptyRecoverySamples(seed = {}) {
  const copy = (key) => Array.isArray(seed[key]) ? seed[key].filter(finiteNonNegative) : [];
  return {
    correctionInitiationMs: copy("correctionInitiationMs"),
    correctionDistanceChars: copy("correctionDistanceChars"),
    correctionToRepairMs: copy("correctionToRepairMs"),
    errorToRepairMs: copy("errorToRepairMs"),
    repairToResumeMs: copy("repairToResumeMs"),
    resumeToFluentMs: copy("resumeToFluentMs"),
  };
}

function boundedPush(values, value, cap) {
  if (!finiteNonNegative(value)) return;
  values.push(value);
  if (values.length > cap) values.splice(0, values.length - cap);
}

function lowerConfidence(value) {
  if (value === "high") return "medium";
  if (value === "medium") return "low";
  return value;
}

function createEpisode(event, episodeId) {
  return {
    episodeId,
    episodeStartEventIndex: event.eventIndex,
    errorStartPosition: event.cursorBefore,
    errorStartActiveMs: event.relativeActiveTimestampMs,
    startTimingSegmentId: event.timingSegmentId,
    lastTimingSegmentId: event.timingSegmentId,
    eventCount: 1,
    bounded: false,
    crossedTimingBoundary: false,
    correctionAttempted: false,
    firstCorrectionActiveMs: null,
    firstCorrectionEventIndex: null,
    lastCorrectionActiveMs: null,
    acceptedInsertionsAfterErrorBeforeCorrection: 0,
    correctionActionCount: 0,
    charactersRemoved: 0,
    incorrectCharactersRemoved: 0,
    correctCharactersRemoved: 0,
    independentErroneousInsertions: 1,
    postCorrectionErroneousInsertions: 0,
    repairTargetCursor: event.cursorAfter,
    repairCompleteActiveMs: null,
    repairCompleteEventIndex: null,
    resumeEventIndex: null,
    repairToResumeMs: null,
    generationExpected: [event.expected],
    generationObserved: [event.entered],
  };
}

function appendEpisodeEvent(episode, event, policy) {
  episode.eventCount += 1;
  if (episode.eventCount > policy.maximumEpisodeEvents) episode.bounded = true;
  if (Number.isInteger(event.timingSegmentId) && Number.isInteger(episode.lastTimingSegmentId) && event.timingSegmentId !== episode.lastTimingSegmentId) {
    episode.crossedTimingBoundary = true;
  }
  if (Number.isInteger(event.timingSegmentId)) episode.lastTimingSegmentId = event.timingSegmentId;
}

function classifyEpisode(episode, policy) {
  let alignment = alignPracticeErrorSequences({
    expected: episode.generationExpected,
    observed: episode.generationObserved,
    policy,
  });
  if (episode.bounded) alignment = {
    ...alignment,
    classification: "unknown",
    confidence: "unresolved",
    bounded: true,
    ambiguous: true,
  };
  let editClass = alignment.classification;
  let confidence = alignment.confidence;
  if (
    episode.postCorrectionErroneousInsertions > 0
    && editClass !== "transposition"
    && ["substitution", "insertion", "omission"].includes(editClass)
  ) {
    editClass = "compound";
    confidence = "low";
  }
  if (episode.crossedTimingBoundary) confidence = lowerConfidence(confidence);
  const contentClass = classifyPracticeErrorContent({
    expected: episode.generationExpected,
    observed: episode.generationObserved,
    alignment,
  });
  const cascade = episode.independentErroneousInsertions > 1
    && ["compound", "unknown"].includes(editClass)
    && editClass !== "transposition"
    && alignment.isDoubling !== true;
  return { alignment, editClass, contentClass, confidence, cascade };
}

function finalizeEpisode(episode, outcome, policy) {
  const classified = classifyEpisode(episode, policy);
  const correctionInitiationMs = finiteNonNegative(episode.firstCorrectionActiveMs) && finiteNonNegative(episode.errorStartActiveMs)
    ? Math.max(0, episode.firstCorrectionActiveMs - episode.errorStartActiveMs)
    : null;
  const correctionToRepairMs = outcome === "corrected" && finiteNonNegative(episode.repairCompleteActiveMs) && finiteNonNegative(episode.firstCorrectionActiveMs)
    ? Math.max(0, episode.repairCompleteActiveMs - episode.firstCorrectionActiveMs)
    : null;
  const errorToRepairMs = outcome === "corrected" && finiteNonNegative(episode.repairCompleteActiveMs) && finiteNonNegative(episode.errorStartActiveMs)
    ? Math.max(0, episode.repairCompleteActiveMs - episode.errorStartActiveMs)
    : null;
  const retypingDurationMs = outcome === "corrected" && finiteNonNegative(episode.repairCompleteActiveMs) && finiteNonNegative(episode.lastCorrectionActiveMs)
    ? Math.max(0, episode.repairCompleteActiveMs - episode.lastCorrectionActiveMs)
    : null;
  return {
    episodeId: episode.episodeId,
    editClass: classified.editClass,
    contentClass: classified.contentClass,
    confidence: classified.confidence,
    startPosition: episode.errorStartPosition,
    outcome,
    corrected: outcome === "corrected",
    correctionAttempted: episode.correctionAttempted,
    crossedTimingBoundary: episode.crossedTimingBoundary,
    bounded: episode.bounded,
    isDoubling: classified.alignment.isDoubling === true,
    cascade: classified.cascade,
    correctionActionCount: episode.correctionActionCount,
    charactersRemoved: episode.charactersRemoved,
    incorrectCharactersRemoved: episode.incorrectCharactersRemoved,
    correctCharactersRemoved: episode.correctCharactersRemoved,
    correctionInitiationMs,
    correctionDistanceChars: episode.firstCorrectionActiveMs == null ? null : episode.acceptedInsertionsAfterErrorBeforeCorrection,
    correctionToRepairMs,
    errorToRepairMs,
    retypingDurationMs,
    repairToResumeMs: outcome === "corrected" ? episode.repairToResumeMs : null,
    resumeToFluentMs: null,
    repairCompleteActiveMs: outcome === "corrected" ? episode.repairCompleteActiveMs : null,
    repairCompleteEventIndex: outcome === "corrected" ? episode.repairCompleteEventIndex : null,
    resumeEventIndex: outcome === "corrected" ? episode.resumeEventIndex : null,
    independentErroneousInsertions: episode.independentErroneousInsertions,
  };
}

function createInitialState({ seed = null, aggregateScope = "complete-session", initialIncorrectCount = 0 } = {}) {
  if (seed && seed.trackerVersion !== PRACTICE_ERROR_TRACKER_VERSION) throw new TypeError("Unsupported Practice error tracker snapshot version");
  return {
    trackerVersion: PRACTICE_ERROR_TRACKER_VERSION,
    aggregateScope: seed?.aggregateScope ?? aggregateScope,
    nextEpisodeId: Number.isInteger(seed?.nextEpisodeId) ? seed.nextEpisodeId : 1,
    activeIncorrectCount: Number.isInteger(seed?.activeIncorrectCount) ? Math.max(0, seed.activeIncorrectCount) : Math.max(0, initialIncorrectCount),
    suppressUntilRecovered: Boolean(seed?.suppressUntilRecovered || (!seed && initialIncorrectCount > 0)),
    currentCursor: Number.isInteger(seed?.currentCursor) ? Math.max(0, seed.currentCursor) : 0,
    acceptedInsertions: Number(seed?.acceptedInsertions || 0),
    errorEpisodeCount: Number(seed?.errorEpisodeCount || 0),
    correctedEpisodeCount: Number(seed?.correctedEpisodeCount || 0),
    uncorrectedEpisodeCount: Number(seed?.uncorrectedEpisodeCount || 0),
    structuralCounts: fixedStructuralCounts(seed?.structuralCounts),
    contentCounts: fixedContentCounts(seed?.contentCounts),
    doublingEpisodeCount: Number(seed?.doublingEpisodeCount || 0),
    cascadeEpisodeCount: Number(seed?.cascadeEpisodeCount || 0),
    correctionAttemptCount: Number(seed?.correctionAttemptCount || 0),
    nonErrorCorrectionActionCount: Number(seed?.nonErrorCorrectionActionCount || 0),
    ignoredCorrectionActionCount: Number(seed?.ignoredCorrectionActionCount || 0),
    disabledCorrectionAttemptCount: Number(seed?.disabledCorrectionAttemptCount || 0),
    charactersRemoved: Number(seed?.charactersRemoved || 0),
    incorrectCharactersRemoved: Number(seed?.incorrectCharactersRemoved || 0),
    correctCharactersRemoved: Number(seed?.correctCharactersRemoved || 0),
    activeEpisodeTruncatedCount: Number(seed?.activeEpisodeTruncatedCount || 0),
    recoverySamples: emptyRecoverySamples(seed?.recoverySamples),
    recentEpisodes: Array.isArray(seed?.recentEpisodes) ? clone(seed.recentEpisodes) : [],
    activeEpisode: seed?.activeEpisode ? clone(seed.activeEpisode) : null,
  };
}

function applyEpisodeAggregate(state, episode, policy) {
  state.errorEpisodeCount += 1;
  if (episode.outcome === "corrected") state.correctedEpisodeCount += 1;
  else state.uncorrectedEpisodeCount += 1;
  state.structuralCounts[episode.editClass] += 1;
  state.contentCounts[contentCountKey(episode.contentClass)] += 1;
  if (episode.isDoubling) state.doublingEpisodeCount += 1;
  if (episode.cascade) state.cascadeEpisodeCount += 1;
  state.charactersRemoved += episode.charactersRemoved;
  state.incorrectCharactersRemoved += episode.incorrectCharactersRemoved;
  state.correctCharactersRemoved += episode.correctCharactersRemoved;
  boundedPush(state.recoverySamples.correctionInitiationMs, episode.correctionInitiationMs, policy.recoverySampleCap);
  boundedPush(state.recoverySamples.correctionDistanceChars, episode.correctionDistanceChars, policy.recoverySampleCap);
  boundedPush(state.recoverySamples.correctionToRepairMs, episode.correctionToRepairMs, policy.recoverySampleCap);
  boundedPush(state.recoverySamples.errorToRepairMs, episode.errorToRepairMs, policy.recoverySampleCap);
  boundedPush(state.recoverySamples.repairToResumeMs, episode.repairToResumeMs, policy.recoverySampleCap);
  state.recentEpisodes.push(episode);
  if (state.recentEpisodes.length > policy.recentEpisodeSamples) state.recentEpisodes.splice(0, state.recentEpisodes.length - policy.recentEpisodeSamples);
}

function sanitizedSnapshot(state, policy, { finalizeActive = false } = {}) {
  const copy = clone(state);
  if (finalizeActive && copy.activeEpisode) {
    const outcome = finiteNonNegative(copy.activeEpisode.repairCompleteActiveMs) ? "corrected" : "uncorrected";
    const episode = finalizeEpisode(copy.activeEpisode, outcome, policy);
    applyEpisodeAggregate(copy, episode, policy);
    copy.activeEpisode = null;
  }
  return freezeDeep(copy);
}

export function createPracticeErrorTracker({
  policy = PRACTICE_ERROR_POLICY_V1,
  seed = null,
  aggregateScope = "complete-session",
  initialIncorrectCount = 0,
} = {}) {
  validatePracticeErrorPolicy(policy);
  const state = createInitialState({ seed, aggregateScope, initialIncorrectCount });

  const closeCurrent = (outcome) => {
    if (!state.activeEpisode) return null;
    const episode = finalizeEpisode(state.activeEpisode, outcome, policy);
    applyEpisodeAggregate(state, episode, policy);
    state.activeEpisode = null;
    return episode;
  };

  const consume = (event) => {
    if (!event || typeof event !== "object") throw new TypeError("Practice error tracker requires an event object");
    const insertion = event.type === "character" || event.type === "space";
    const correction = event.type === "backspace" || event.type === "word-delete";
    if (!insertion && !correction) return null;
    if (!Number.isInteger(event.cursorBefore) || !Number.isInteger(event.cursorAfter) || event.cursorBefore < 0 || event.cursorAfter < 0) {
      throw new TypeError("Practice error tracker requires cursorBefore/cursorAfter");
    }
    state.currentCursor = event.cursorAfter;

    if (insertion) {
      state.acceptedInsertions += 1;
      const incorrect = event.correctness === "incorrect" || event.correctness === false;
      if (incorrect) state.activeIncorrectCount += 1;
      if (state.suppressUntilRecovered) {
        if (state.activeIncorrectCount === 0) state.suppressUntilRecovered = false;
        return null;
      }
      if (!state.activeEpisode && incorrect) {
        state.activeEpisode = createEpisode(event, state.nextEpisodeId++);
        return null;
      }
      const episode = state.activeEpisode;
      if (!episode) return null;
      appendEpisodeEvent(episode, event, policy);
      if (episode.bounded && !episode._truncationCounted) {
        episode._truncationCounted = true;
        state.activeEpisodeTruncatedCount += 1;
      }
      if (episode.firstCorrectionActiveMs == null) {
        episode.acceptedInsertionsAfterErrorBeforeCorrection += 1;
        if (episode.generationExpected.length < policy.maximumAlignmentGraphemes) {
          episode.generationExpected.push(event.expected);
          episode.generationObserved.push(event.entered);
        } else {
          episode.bounded = true;
        }
      }
      if (episode.firstCorrectionActiveMs == null || incorrect) {
        episode.repairTargetCursor = Math.max(episode.repairTargetCursor, event.cursorAfter);
      }
      if (incorrect) {
        episode.independentErroneousInsertions += 1;
        if (episode.firstCorrectionActiveMs != null) episode.postCorrectionErroneousInsertions += 1;
        if (episode.repairCompleteActiveMs != null) {
          episode.repairCompleteActiveMs = null;
          episode.repairCompleteEventIndex = null;
          episode.resumeEventIndex = null;
          episode.repairToResumeMs = null;
        }
      }
      if (!incorrect && state.activeIncorrectCount === 0 && event.cursorAfter >= episode.repairTargetCursor) {
        if (episode.repairCompleteActiveMs == null) {
          episode.repairCompleteActiveMs = event.relativeActiveTimestampMs;
          episode.repairCompleteEventIndex = event.eventIndex;
        } else if (event.eventIndex !== episode.repairCompleteEventIndex && event.cursorBefore >= episode.repairTargetCursor) {
          episode.resumeEventIndex = event.eventIndex;
          episode.repairToResumeMs = finiteNonNegative(event.relativeActiveTimestampMs) && finiteNonNegative(episode.repairCompleteActiveMs)
            ? Math.max(0, event.relativeActiveTimestampMs - episode.repairCompleteActiveMs)
            : null;
          return closeCurrent("corrected");
        }
      }
      return null;
    }

    const policyName = event.correctionPolicy ?? "allow";
    state.correctionAttemptCount += 1;
    if (policyName === "ignore") state.ignoredCorrectionActionCount += 1;
    if (policyName === "disabled") state.disabledCorrectionAttemptCount += 1;
    const removedCount = Number.isInteger(event.removedCount) ? Math.max(0, event.removedCount) : Math.max(0, event.cursorBefore - event.cursorAfter);
    const removedIncorrectCount = Number.isInteger(event.removedIncorrectCount) ? Math.max(0, event.removedIncorrectCount) : 0;
    const removedCorrectCount = Number.isInteger(event.removedCorrectCount) ? Math.max(0, event.removedCorrectCount) : Math.max(0, removedCount - removedIncorrectCount);
    state.activeIncorrectCount = Math.max(0, state.activeIncorrectCount - removedIncorrectCount);

    if (state.suppressUntilRecovered) {
      if (state.activeIncorrectCount === 0) state.suppressUntilRecovered = false;
      return null;
    }

    const episode = state.activeEpisode;
    if (!episode) {
      if (removedCount > 0) state.nonErrorCorrectionActionCount += 1;
      return null;
    }
    appendEpisodeEvent(episode, event, policy);
    if (episode.bounded && !episode._truncationCounted) {
      episode._truncationCounted = true;
      state.activeEpisodeTruncatedCount += 1;
    }
    episode.correctionAttempted = true;
    episode.correctionActionCount += 1;
    if (removedCount > 0) {
      episode.charactersRemoved += removedCount;
      episode.incorrectCharactersRemoved += removedIncorrectCount;
      episode.correctCharactersRemoved += removedCorrectCount;
      episode.lastCorrectionActiveMs = event.relativeActiveTimestampMs;
      if (episode.firstCorrectionActiveMs == null) {
        episode.firstCorrectionActiveMs = event.relativeActiveTimestampMs;
        episode.firstCorrectionEventIndex = event.eventIndex;
      }
      if (event.cursorAfter < episode.repairTargetCursor && episode.repairCompleteActiveMs != null) {
        episode.repairCompleteActiveMs = null;
        episode.repairCompleteEventIndex = null;
        episode.resumeEventIndex = null;
        episode.repairToResumeMs = null;
      }
      if (state.activeIncorrectCount === 0 && event.cursorAfter >= episode.repairTargetCursor) {
        episode.repairCompleteActiveMs = event.relativeActiveTimestampMs;
        episode.repairCompleteEventIndex = event.eventIndex;
      }
    }
    return null;
  };

  return Object.freeze({
    consume,
    markTimingBoundary() {
      if (state.activeEpisode) state.activeEpisode.crossedTimingBoundary = true;
    },
    getSnapshot() {
      return sanitizedSnapshot(state, policy);
    },
    finalizeSnapshot() {
      return sanitizedSnapshot(state, policy, { finalizeActive: true });
    },
    checkpointSnapshot({ contentHash = null, cursorIndex = state.currentCursor } = {}) {
      const snapshot = sanitizedSnapshot(state, policy);
      return freezeDeep({
        ...snapshot,
        contentHash,
        cursorAtSnapshot: cursorIndex,
      });
    },
    get activeIncorrectCount() { return state.activeIncorrectCount; },
    get activeEpisode() { return state.activeEpisode ? freezeDeep(clone(state.activeEpisode)) : null; },
  });
}
