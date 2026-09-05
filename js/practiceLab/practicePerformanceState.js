import { PRACTICE_ABILITY_CHANNELS } from "./practiceAbilityConstants.js";
import { createPracticePerformanceStateId } from "./practiceIds.js";
import {
  PRACTICE_BURST_RESERVE_STATUSES,
  PRACTICE_PERFORMANCE_STATE_MODEL_VERSION,
  PRACTICE_PERFORMANCE_STATE_POLICY_VERSION,
} from "./practicePerformanceConstants.js";
import { PRACTICE_FRONTIER_POLICY_V1, PRACTICE_STATE_PROBE_POLICY_V1, PRACTICE_WARMUP_POLICY_V1 } from "./practicePerformancePolicy.js";
import { buildPracticeControlFrontier } from "./practiceControlFrontier.js";
import { buildPracticeWarmupModel } from "./practiceWarmupModel.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clone = (value) => JSON.parse(JSON.stringify(value));

export function createDefaultPracticePerformanceState({ profileId, contextId, now = () => new Date() } = {}) {
  const stampValue = typeof now === "function" ? now() : now;
  const timestamp = (stampValue instanceof Date ? stampValue : new Date(stampValue)).toISOString();
  return freezeDeep({
    performanceStateId: createPracticePerformanceStateId(profileId, contextId),
    profileId,
    contextId,
    recordVersion: 1,
    modelVersion: PRACTICE_PERFORMANCE_STATE_MODEL_VERSION,
    policyVersion: PRACTICE_PERFORMANCE_STATE_POLICY_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    currentStates: {},
    warmupModels: {},
    controlFrontier: buildPracticeControlFrontier([], PRACTICE_FRONTIER_POLICY_V1),
    warmupEvidence: {},
    frontierEvidence: [],
  });
}

function mergeStateProbe(state, delta) {
  const current = delta.currentStateObservation ?? null;
  const warmup = delta.warmupObservation ?? null;
  const channel = current?.referenceChannel ?? warmup?.referenceChannel ?? null;
  if (!PRACTICE_ABILITY_CHANNELS.includes(channel)) throw new TypeError("State-probe performance delta requires a canonical channel");
  const existing = state.currentStates?.[channel] ?? null;
  if (current && existing && Date.parse(current.measuredAt) <= Date.parse(existing.measuredAt)) return state;
  const currentStates = { ...state.currentStates };
  if (current) currentStates[channel] = clone(current);
  const warmupEvidence = { ...state.warmupEvidence };
  const warmupModels = { ...state.warmupModels };
  if (warmup) {
    const prior = Array.isArray(warmupEvidence[channel]) ? warmupEvidence[channel] : [];
    if (!prior.some((item) => item.sessionId === warmup.sessionId)) {
      const next = [...prior, clone(warmup)]
        .sort((a, b) => a.completedAtUtc.localeCompare(b.completedAtUtc) || a.sessionId.localeCompare(b.sessionId))
        .slice(-PRACTICE_WARMUP_POLICY_V1.maximumObservationsPerChannel);
      warmupEvidence[channel] = next;
      warmupModels[channel] = buildPracticeWarmupModel(next, PRACTICE_WARMUP_POLICY_V1);
    }
  }
  const updatedAt = current?.measuredAt ?? warmup?.completedAtUtc ?? state.updatedAt;
  return freezeDeep({ ...state, updatedAt, currentStates, warmupEvidence, warmupModels });
}

function mergeFrontier(state, delta) {
  const batch = delta.frontierObservationBatch;
  if (!batch || batch.channel !== PRACTICE_FRONTIER_POLICY_V1.channel) throw new TypeError("Frontier performance delta requires a controlled-speed batch");
  const existingKeys = new Set((state.frontierEvidence ?? []).map((point) => `${point.sessionId}\u0000${point.stageId}`));
  const additions = (batch.points ?? []).filter((point) => point.valid === true && !existingKeys.has(`${point.sessionId}\u0000${point.stageId}`));
  const frontierEvidence = [...(state.frontierEvidence ?? []).map(clone), ...additions.map(clone)]
    .sort((a, b) => a.completedAtUtc.localeCompare(b.completedAtUtc) || a.sessionId.localeCompare(b.sessionId) || a.stageOrdinal - b.stageOrdinal)
    .slice(-PRACTICE_FRONTIER_POLICY_V1.maximumPersistedPoints);
  if (!additions.length) return state;
  const controlFrontier = buildPracticeControlFrontier(frontierEvidence, PRACTICE_FRONTIER_POLICY_V1);
  const updatedAt = frontierEvidence.at(-1)?.completedAtUtc ?? state.updatedAt;
  return freezeDeep({ ...state, updatedAt, frontierEvidence, controlFrontier });
}

export function mergePracticePerformanceStateDelta(state, delta) {
  if (!state || !delta) throw new TypeError("Practice performance merge requires state and delta");
  if (state.profileId !== delta.profileId || state.contextId !== delta.contextId) throw new TypeError("Practice performance delta identity does not match state");
  if (delta.type === "state-probe") return mergeStateProbe(state, delta);
  if (delta.type === "frontier") return mergeFrontier(state, delta);
  throw new TypeError("Unknown Practice performance delta type");
}

export function getCurrentPerformanceStateFromRecord(state, channel, now = () => new Date()) {
  if (!PRACTICE_ABILITY_CHANNELS.includes(channel)) throw new TypeError("Current performance state requires a canonical ability channel");
  const observation = state?.currentStates?.[channel] ?? null;
  if (!observation) return freezeDeep({ status: "unavailable", channel, currentState: null, readinessBand: "unknown" });
  const value = typeof now === "function" ? now() : now;
  const nowMs = (value instanceof Date ? value : new Date(value)).getTime();
  if (!Number.isFinite(nowMs)) throw new TypeError("Current performance state query time is invalid");
  if (nowMs > Date.parse(observation.validUntil)) return freezeDeep({ status: "stale", channel, currentState: null, readinessBand: "unknown", measuredAt: observation.measuredAt, validUntil: observation.validUntil });
  return freezeDeep({ status: "current", channel, currentState: clone(observation), readinessBand: observation.readinessBand, measuredAt: observation.measuredAt, validUntil: observation.validUntil });
}

export function derivePracticeBurstReserve({ burstAbilityState = null, controlFrontier = null } = {}) {
  const burstWpm = burstAbilityState?.estimate?.estimateWpm;
  const frontierWpm = controlFrontier?.frontierWpm;
  if (!Number.isFinite(burstWpm) || burstWpm <= 0 || !Number.isFinite(frontierWpm) || frontierWpm <= 0 || !["bracketed", "lower-bound"].includes(controlFrontier?.status)) {
    return freezeDeep({ status: "unavailable", burstWpm: Number.isFinite(burstWpm) ? burstWpm : null, frontierWpm: Number.isFinite(frontierWpm) ? frontierWpm : null, reserveWpm: null, reserveRatio: null });
  }
  const reserveWpm = burstWpm - frontierWpm;
  const reserveRatio = burstWpm / frontierWpm - 1;
  const status = reserveWpm < 0 ? "inconsistent" : "available";
  if (!PRACTICE_BURST_RESERVE_STATUSES.includes(status)) throw new TypeError("Invalid Practice burst reserve status");
  return freezeDeep({ status, burstWpm, frontierWpm, reserveWpm, reserveRatio });
}
