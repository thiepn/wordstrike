import { PRACTICE_PACE_GUIDE_VERSION, PRACTICE_PACE_GUIDE_STATUSES } from "./practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freeze = (value) => Object.freeze(value);
export function getPracticePaceGuide({
  targetWpm,
  elapsedMs,
  acceptedForwardCharacters,
  policy = PRACTICE_PACE_LADDER_POLICY_V1,
} = {}) {
  if (!Number.isFinite(targetWpm) || targetWpm <= 0) throw new TypeError("Pace guide requires positive targetWpm");
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new TypeError("Pace guide requires non-negative elapsedMs");
  if (!Number.isInteger(acceptedForwardCharacters) || acceptedForwardCharacters < 0) throw new TypeError("Pace guide requires a non-negative forward-character count");
  const targetCharactersPerSecond = targetWpm * 5 / 60;
  const expectedProgress = targetCharactersPerSecond * (elapsedMs / 1000);
  const paceOffsetSeconds = (acceptedForwardCharacters - expectedProgress) / targetCharactersPerSecond;
  const status = paceOffsetSeconds > policy.onPaceToleranceSeconds
    ? "ahead"
    : paceOffsetSeconds < -policy.onPaceToleranceSeconds
      ? "behind"
      : "on-pace";
  if (!PRACTICE_PACE_GUIDE_STATUSES.includes(status)) throw new TypeError("Invalid Pace guide status");
  return freeze({
    version: PRACTICE_PACE_GUIDE_VERSION,
    targetCharactersPerSecond,
    expectedProgress,
    paceOffsetSeconds,
    status,
    toleranceSeconds: policy.onPaceToleranceSeconds,
  });
}
