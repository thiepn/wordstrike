import { PRACTICE_PACE_GUIDE_VERSION } from "./practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freeze = (value) => Object.freeze(value);
export function buildPracticePaceBand({ sustainableWpm, controlledStageWpms = [], policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  if (!Number.isFinite(sustainableWpm) || sustainableWpm <= 0) return freeze({ version: PRACTICE_PACE_GUIDE_VERSION, status: "unavailable", recommendedPracticePaceWpm: null, recommendedPracticeBandWpm: null });
  const observed = controlledStageWpms.filter((value) => Number.isFinite(value) && value > 0 && value <= sustainableWpm);
  const minimum = observed.length ? Math.min(...observed) : sustainableWpm;
  const maximum = observed.length ? Math.max(...observed) : sustainableWpm;
  const low = Math.max(minimum, sustainableWpm * policy.practiceBandLowRatio);
  const high = Math.min(maximum, sustainableWpm * policy.practiceBandHighRatio);
  return freeze({ version: PRACTICE_PACE_GUIDE_VERSION, status: "available", recommendedPracticePaceWpm: sustainableWpm, recommendedPracticeBandWpm: [low, high] });
}

// Compatibility helper. This is protocol math only and is not shown as live chase feedback.
export function getPracticePaceGuide({ targetWpm, elapsedMs, acceptedForwardCharacters } = {}) {
  if (!Number.isFinite(targetWpm) || targetWpm <= 0 || !Number.isFinite(elapsedMs) || elapsedMs < 0 || !Number.isInteger(acceptedForwardCharacters) || acceptedForwardCharacters < 0) throw new TypeError("Invalid Pace guide inputs");
  const targetCharactersPerSecond = targetWpm * 5 / 60;
  return freeze({ version: PRACTICE_PACE_GUIDE_VERSION, targetCharactersPerSecond, expectedProgress: targetCharactersPerSecond * elapsedMs / 1000 });
}
