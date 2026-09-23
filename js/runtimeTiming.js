export const GAMEPLAY_MAX_FRAME_DELTA_MS = 100;

export function clampGameplayFrameDelta(
  timestamp,
  previousTimestamp,
  maxDeltaMs = GAMEPLAY_MAX_FRAME_DELTA_MS,
) {
  if (!Number.isFinite(timestamp) || !Number.isFinite(previousTimestamp)) return 0;
  const safeMaximum = Number.isFinite(maxDeltaMs)
    ? Math.max(0, maxDeltaMs)
    : GAMEPLAY_MAX_FRAME_DELTA_MS;
  return Math.min(safeMaximum, Math.max(0, timestamp - previousTimestamp));
}
