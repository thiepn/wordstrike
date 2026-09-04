import { practiceMedian } from "./practiceRobustStats.js";
import {
  PRACTICE_ERROR_POLICY_V1,
  validatePracticeErrorPolicy,
} from "./practiceErrorPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

export function summarizePracticeRecoverySamples(samples = {}) {
  const median = (values) => {
    const clean = Array.isArray(values) ? values.filter(finiteNonNegative) : [];
    return clean.length ? practiceMedian(clean) : null;
  };
  return freezeDeep({
    correctionInitiationMedianMs: median(samples.correctionInitiationMs),
    correctionDistanceMedianChars: median(samples.correctionDistanceChars),
    correctionToRepairMedianMs: median(samples.correctionToRepairMs),
    errorToRepairMedianMs: median(samples.errorToRepairMs),
    repairToResumeMedianMs: median(samples.repairToResumeMs),
    resumeToFluentMedianMs: median(samples.resumeToFluentMs),
  });
}

export function enrichPracticeErrorEpisodesWithLatency({
  episodes = [],
  events = [],
  latencyAnalysis = null,
  policy = PRACTICE_ERROR_POLICY_V1,
} = {}) {
  validatePracticeErrorPolicy(policy);
  const eventByIndex = new Map(
    (Array.isArray(events) ? events : [])
      .filter((event) => Number.isInteger(event?.eventIndex))
      .map((event) => [event.eventIndex, event]),
  );
  const transitions = Array.isArray(latencyAnalysis?.classifiedTransitions)
    ? latencyAnalysis.classifiedTransitions
        .filter((entry) => Number.isInteger(entry?.eventIndex))
        .sort((a, b) => a.eventIndex - b.eventIndex)
    : [];

  const enriched = (Array.isArray(episodes) ? episodes : []).map((episode) => {
    let resumeToFluentMs = null;
    let considered = 0;
    if (Number.isInteger(episode?.repairCompleteEventIndex) && finiteNonNegative(episode?.repairCompleteActiveMs)) {
      for (const transition of transitions) {
        if (transition.eventIndex <= episode.repairCompleteEventIndex) continue;
        considered += 1;
        if (considered > policy.resumeFluentLookaheadTransitions) break;
        if (transition.classification !== "fluent") continue;
        const event = eventByIndex.get(transition.eventIndex);
        if (finiteNonNegative(event?.relativeActiveTimestampMs)) {
          resumeToFluentMs = Math.max(0, event.relativeActiveTimestampMs - episode.repairCompleteActiveMs);
        }
        break;
      }
    }
    return {
      ...episode,
      resumeToFluentMs,
    };
  });

  return freezeDeep({
    episodes: enriched,
    resumeToFluentSamples: enriched
      .map((episode) => episode.resumeToFluentMs)
      .filter(finiteNonNegative)
      .slice(-policy.recoverySampleCap),
  });
}
