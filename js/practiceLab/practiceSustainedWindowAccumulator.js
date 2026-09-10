import { PRACTICE_LATENCY_POLICY_V1, derivePracticeLatencyTransitionCandidate } from "./practiceLatencyClassifier.js";
import { practiceMedian, practiceRobustScale } from "./practiceRobustStats.js";
import { PRACTICE_SUSTAINED_MAX_WINDOWS, PRACTICE_SUSTAINED_WINDOW_VERSION } from "./practiceSustainedWindowConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const INSERTIONS = new Set(["character", "space"]);
const CORRECTIONS = new Set(["backspace", "word-delete"]);

function makeWindow(index, startMs, windowMs) {
  return {
    windowId: `window-${String(index + 1).padStart(2, "0")}`,
    ordinal: index + 1,
    startMs,
    endMs: startMs + windowMs,
    acceptedForwardInsertions: 0,
    firstPassOpportunityCount: 0,
    firstPassCorrectCount: 0,
    timingEligibleCount: 0,
    disfluentCount: 0,
    closedCorrectionIntervals: 0,
    correctionCostMs: 0,
    errorEpisodeCount: 0,
    expectedTextStartIndex: null,
    expectedTextEndIndex: null,
  };
}

function adaptiveThreshold(values, policy) {
  if (values.length < policy.minimumCalibrationSamples) return null;
  const median = practiceMedian(values, { min: 0, max: policy.hardInterruptionMs });
  const robustScale = practiceRobustScale(values, { min: 0, max: policy.hardInterruptionMs });
  if (!Number.isFinite(median) || !Number.isFinite(robustScale)) return null;
  const raw = Math.max(policy.minimumAdaptiveThresholdMs, policy.medianMultiplier * median, median + policy.robustSigmaMultiplier * robustScale);
  return Math.min(policy.maximumAdaptiveThresholdMs, Math.max(policy.minimumAdaptiveThresholdMs, raw));
}

export function createPracticeSustainedWindowAccumulator({ analysisStartMs = 0, windowMs = 30_000, maximumWindows = PRACTICE_SUSTAINED_MAX_WINDOWS, latencyPolicy = PRACTICE_LATENCY_POLICY_V1 } = {}) {
  if (!Number.isFinite(analysisStartMs) || analysisStartMs < 0 || !Number.isFinite(windowMs) || windowMs <= 0 || !Number.isInteger(maximumWindows) || maximumWindows < 1 || maximumWindows > PRACTICE_SUSTAINED_MAX_WINDOWS) throw new TypeError("Invalid sustained-window configuration");
  const windows = Array.from({ length: maximumWindows }, (_, index) => makeWindow(index, analysisStartMs + index * windowMs, windowMs));
  const calibrationLatencies = [];
  let latencyThresholdMs = null;
  let priorInsertion = null;
  let correctionSincePrior = false;
  let finalized = false;

  const windowIndexAt = (at) => {
    if (!Number.isFinite(at) || at < analysisStartMs) return -1;
    const index = Math.floor((at - analysisStartMs) / windowMs);
    return index >= 0 && index < windows.length ? index : -1;
  };
  const windowForPosition = (position) => windows.find((window) => Number.isInteger(window.expectedTextStartIndex) && Number.isInteger(window.expectedTextEndIndex) && position >= window.expectedTextStartIndex && position < window.expectedTextEndIndex) ?? null;

  const api = {
    recordProcessedInput(event) {
      if (finalized || !event || !Number.isFinite(event.relativeActiveTimestampMs)) return false;
      if (CORRECTIONS.has(event.type)) { correctionSincePrior = true; return true; }
      if (!INSERTIONS.has(event.type)) return false;
      const at = event.relativeActiveTimestampMs;
      const index = windowIndexAt(at);
      const current = index >= 0 ? windows[index] : null;
      if (current) {
        current.acceptedForwardInsertions += 1;
        if (event.isFirstAttempt === true) {
          current.firstPassOpportunityCount += 1;
          if (event.correctness === "correct") current.firstPassCorrectCount += 1;
          if (Number.isInteger(event.textPosition)) {
            current.expectedTextStartIndex = current.expectedTextStartIndex == null ? event.textPosition : Math.min(current.expectedTextStartIndex, event.textPosition);
            current.expectedTextEndIndex = current.expectedTextEndIndex == null ? event.textPosition + 1 : Math.max(current.expectedTextEndIndex, event.textPosition + 1);
          }
        }
      }
      const candidate = derivePracticeLatencyTransitionCandidate({ event, priorInsertion, correctionSincePrior, policy: latencyPolicy });
      if (candidate.baselineEligible && calibrationLatencies.length < 256) {
        calibrationLatencies.push(candidate.latency);
        latencyThresholdMs = adaptiveThreshold(calibrationLatencies, latencyPolicy);
      }
      if (current && latencyThresholdMs != null && candidate.baselineEligible && priorInsertion) {
        const priorIndex = windowIndexAt(priorInsertion.relativeActiveTimestampMs);
        if (priorIndex === index) {
          current.timingEligibleCount += 1;
          if (candidate.latency > latencyThresholdMs) current.disfluentCount += 1;
        }
      }
      priorInsertion = event;
      correctionSincePrior = false;
      return true;
    },
    recordClosedErrorEpisode(episode) {
      if (finalized || !episode || !Number.isInteger(episode.startPosition)) return false;
      const startWindow = windowForPosition(episode.startPosition);
      if (!startWindow) return false;
      startWindow.errorEpisodeCount += 1;
      if (episode.corrected && Number.isFinite(episode.repairCompleteActiveMs) && Number.isFinite(episode.correctionToRepairMs)) {
        const repairWindow = windows[windowIndexAt(episode.repairCompleteActiveMs)] ?? null;
        if (repairWindow === startWindow) {
          startWindow.closedCorrectionIntervals += 1;
          startWindow.correctionCostMs += Math.max(0, episode.correctionToRepairMs);
        }
      }
      return true;
    },
    finalize(finalActiveDurationMs = 0) {
      finalized = true;
      return api.getSnapshot(finalActiveDurationMs);
    },
    getSnapshot(finalActiveDurationMs = 0) {
      const bounded = windows.map((window) => {
        const activeEnd = Math.min(window.endMs, Math.max(window.startMs, finalActiveDurationMs));
        const durationMs = Math.max(0, activeEnd - window.startMs);
        return freezeDeep({ ...window, durationMs, windowActiveMs: durationMs });
      });
      return freezeDeep({ version: PRACTICE_SUSTAINED_WINDOW_VERSION, analysisStartMs, windowMs, latencyThresholdMs, windows: bounded });
    },
  };
  return freezeDeep(api);
}
