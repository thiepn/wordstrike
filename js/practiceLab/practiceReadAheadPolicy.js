import {
  PRACTICE_READ_AHEAD_BASELINE_MS,
  PRACTICE_READ_AHEAD_DEFAULT_DURATION_MS,
  PRACTICE_READ_AHEAD_DURATIONS_MS,
  PRACTICE_READ_AHEAD_INTEGRATION_MS,
  PRACTICE_READ_AHEAD_MIN_BLOCK_DURATION_RATIO,
  PRACTICE_READ_AHEAD_MIN_BLOCK_OPPORTUNITIES,
  PRACTICE_READ_AHEAD_MIN_BASELINE_OPPORTUNITIES,
  PRACTICE_READ_AHEAD_POLICY_VERSION,
} from "./practiceReadAheadConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export const PRACTICE_READ_AHEAD_POLICY_V1 = freezeDeep({
  version: PRACTICE_READ_AHEAD_POLICY_VERSION,
  defaultDurationMs: PRACTICE_READ_AHEAD_DEFAULT_DURATION_MS,
  durations: {
    180000: { durationMs: 180_000, baselineMs: 30_000, constrainedBlockCount: 6, constrainedBlockMs: 20_000, integrationMs: 30_000, minimumValidBlocksPerCondition: 2 },
    360000: { durationMs: 360_000, baselineMs: 30_000, constrainedBlockCount: 12, constrainedBlockMs: 25_000, integrationMs: 30_000, minimumValidBlocksPerCondition: 3 },
    600000: { durationMs: 600_000, baselineMs: 30_000, constrainedBlockCount: 18, constrainedBlockMs: 30_000, integrationMs: 30_000, minimumValidBlocksPerCondition: 4 },
  },
  validity: {
    minimumDurationRatio: PRACTICE_READ_AHEAD_MIN_BLOCK_DURATION_RATIO,
    minimumFirstPassOpportunities: PRACTICE_READ_AHEAD_MIN_BLOCK_OPPORTUNITIES,
    minimumBaselineFirstPassOpportunities: PRACTICE_READ_AHEAD_MIN_BASELINE_OPPORTUNITIES,
  },
});

export function getPracticeReadAheadProtocol(durationMs = PRACTICE_READ_AHEAD_DEFAULT_DURATION_MS, policy = PRACTICE_READ_AHEAD_POLICY_V1) {
  if (!PRACTICE_READ_AHEAD_DURATIONS_MS.includes(durationMs)) throw new TypeError("Unsupported Read-Ahead duration");
  const protocol = policy.durations[durationMs];
  const total = protocol.baselineMs + protocol.constrainedBlockCount * protocol.constrainedBlockMs + protocol.integrationMs;
  if (protocol.baselineMs !== PRACTICE_READ_AHEAD_BASELINE_MS || protocol.integrationMs !== PRACTICE_READ_AHEAD_INTEGRATION_MS || total !== durationMs) throw new TypeError("Read-Ahead protocol is internally inconsistent");
  return protocol;
}
