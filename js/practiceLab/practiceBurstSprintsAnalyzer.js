import { buildPracticeBurstAbilityMeasurement } from "./practiceBurstSprintsMeasurement.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const round = (value, digits = 1) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

export function analyzePracticeBurstSprintsResult({ burstResult, plan, foundationAnalysis = null, measurementOptions = {} } = {}) {
  const measurement = buildPracticeBurstAbilityMeasurement(burstResult, measurementOptions);
  const eligible = (burstResult?.sprints ?? []).filter((sprint) => sprint?.eligible);
  const bestObserved = eligible.length ? Math.max(...eligible.map((sprint) => sprint.burstEffectiveWpm).filter(Number.isFinite)) : null;
  const trainingQuality = freezeDeep({
    artifactVersion: 2,
    kind: "burst-sprints",
    status: burstResult?.status ?? "incomplete",
    validMeasurement: Boolean(measurement),
    bestObservedSprintWpm: round(bestObserved),
    sessionBurstEstimateWpm: round(measurement?.adjustedWpm),
    burstEstimateWpm: round(measurement?.adjustedWpm),
    rawSessionBurstWpm: round(measurement?.wpm),
    burstAccuracy: round(measurement?.accuracy),
    measurementSigmaLog: round(measurement?.measurementSigmaLog, 4),
    sigmaIndividual: round(measurement?.sigmaIndividual, 4),
    sigmaSpread: round(measurement?.sigmaSpread, 4),
    selectedSprintIds: measurement?.selectedSprintIds ?? [],
    selectedSprintWpms: measurement?.selectedSprintWpms?.map((value) => round(value)) ?? [],
    eligibleSprintCount: burstResult?.eligibleSprintCount ?? 0,
    completedSprintCount: burstResult?.completedSprintCount ?? 0,
    currentBurstAbilityWpm: round(foundationAnalysis?.ability?.observation?.adjustedWpm ?? foundationAnalysis?.ability?.sessionSummary?.adjustedWpm),
    currentBurstAbilityStatus: foundationAnalysis?.ability?.status ?? null,
    pl14BurstReserveWpm: round(foundationAnalysis?.performance?.burstReserve?.reserveWpm),
    pl14BurstReserveStatus: foundationAnalysis?.performance?.burstReserve?.status ?? "not-owned-by-pl27",
    sprints: (burstResult?.sprints ?? []).map((sprint) => freezeDeep({ sprintId: sprint.sprintId, sprintOrdinal: sprint.sprintOrdinal, grossForwardWpm: round(sprint.grossForwardWpm), burstEffectiveWpm: round(sprint.burstEffectiveWpm), firstPassAccuracy: round(sprint.firstPassAccuracy), correctionOverheadRate: round(sprint.correctionOverheadRate, 3), acceptedInsertions: sprint.acceptedInsertions, firstPassOpportunityCount: sprint.firstPassOpportunityCount, carryoverOpenError: sprint.carryoverOpenError, completed: sprint.completed, eligible: sprint.eligible })),
    interpretation: measurement ? "Session burst is the median of the three highest valid PL10-adjusted Burst Effective log performances. Best observed sprint is descriptive only." : "No PL13 Burst observation was admitted because fewer than four of six sprints met the canonical measurement-validity floors.",
  });
  return freezeDeep({ trainingQuality, recommendationIds: measurement ? ["burst-control"] : ["burst-repeat-clean"] });
}
