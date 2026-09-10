import { PRACTICE_CONSISTENCY_GUIDE_VERSION } from "./practiceConsistencyConstants.js";
import { PRACTICE_CONSISTENCY_POLICY_V1 } from "./practiceConsistencyPolicy.js";

const freeze = (value) => Object.freeze(value);
const insertion = (event) => event?.type === "character" || event?.type === "space";

export function createPracticeConsistencyGuide({ policy = PRACTICE_CONSISTENCY_POLICY_V1 } = {}) {
  let accepted = 0;
  let firstPass = 0;
  let firstPassCorrect = 0;
  let anchorGrossWpm = null;
  let calibrationClosed = false;
  let guideAvailable = false;
  const rolling = [];

  const closeCalibration = () => {
    if (calibrationClosed) return;
    calibrationClosed = true;
    const accuracy = firstPass > 0 ? firstPassCorrect / firstPass : 0;
    if (accepted >= policy.calibrationMinimumForwardInsertions && accuracy >= policy.calibrationMinimumFirstPassAccuracy) {
      anchorGrossWpm = (accepted / 5) / (policy.calibrationDurationMs / 60_000);
      guideAvailable = Number.isFinite(anchorGrossWpm) && anchorGrossWpm > 0;
    }
  };

  const prune = (nowMs) => {
    const cutoff = nowMs - policy.guideWindowMs;
    while (rolling.length && rolling[0] < cutoff) rolling.shift();
  };

  return freeze({
    recordProcessedInput(event) {
      if (!insertion(event) || event?.accepted === false || !Number.isFinite(event?.relativeActiveTimestampMs)) return false;
      const at = event.relativeActiveTimestampMs;
      if (at < policy.calibrationDurationMs) {
        accepted += 1;
        if (event.isFirstAttempt === true) {
          firstPass += 1;
          if (event.correctness === "correct") firstPassCorrect += 1;
        }
        return true;
      }
      closeCalibration();
      rolling.push(at);
      prune(at);
      return true;
    },
    getSnapshot(activeMs = 0) {
      if (activeMs >= policy.calibrationDurationMs) closeCalibration();
      if (!calibrationClosed) return freeze({ version: PRACTICE_CONSISTENCY_GUIDE_VERSION, status: "collecting", calibration: true, available: false, anchorGrossWpm: null, rollingCount: 0, rollingGrossWpm: null });
      if (!guideAvailable) return freeze({ version: PRACTICE_CONSISTENCY_GUIDE_VERSION, status: "unavailable", calibration: false, available: false, anchorGrossWpm: null, rollingCount: 0, rollingGrossWpm: null });
      prune(activeMs);
      if (rolling.length < policy.guideMinimumForwardInsertions) return freeze({ version: PRACTICE_CONSISTENCY_GUIDE_VERSION, status: "collecting", calibration: false, available: true, anchorGrossWpm, rollingCount: rolling.length, rollingGrossWpm: null });
      const rollingGrossWpm = (rolling.length / 5) / (policy.guideWindowMs / 60_000);
      const ratio = rollingGrossWpm / anchorGrossWpm;
      const status = ratio < policy.guideLowerRatio ? "slower" : ratio > policy.guideUpperRatio ? "faster" : "steady";
      return freeze({ version: PRACTICE_CONSISTENCY_GUIDE_VERSION, status, calibration: false, available: true, anchorGrossWpm, rollingCount: rolling.length, rollingGrossWpm });
    },
    getCalibration() {
      closeCalibration();
      const accuracy = firstPass > 0 ? firstPassCorrect / firstPass : null;
      return freeze({ available: guideAvailable, anchorGrossWpm, acceptedForwardInsertions: accepted, firstPassOpportunityCount: firstPass, firstPassCorrectCount: firstPassCorrect, firstPassAccuracy: accuracy });
    },
  });
}
