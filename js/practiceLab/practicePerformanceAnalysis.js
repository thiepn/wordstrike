import {
  PRACTICE_PERFORMANCE_ANALYSIS_VERSION,
  PRACTICE_PERFORMANCE_MEASUREMENT_KINDS,
} from "./practicePerformanceConstants.js";
import { buildPracticeStateProbe } from "./practiceStateProbe.js";
import { analyzePracticeWarmup } from "./practiceWarmupModel.js";
import { buildPracticeFrontierObservationBatch } from "./practiceControlFrontier.js";
import { createDefaultPracticePerformanceState, mergePracticePerformanceStateDelta } from "./practicePerformanceState.js";
import { validatePracticeFrontierBatch, validatePracticePerformanceStateDelta, validatePracticeStateObservation, validatePracticeWarmupObservation } from "./practicePerformanceValidation.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function base(measurementKind = null) {
  return {
    version: PRACTICE_PERFORMANCE_ANALYSIS_VERSION,
    status: measurementKind == null ? "not-requested" : "not-eligible",
    reasons: [],
    measurementKind,
    stateProbe: null,
    warmup: null,
    frontier: null,
    sessionSummary: null,
    performanceStateDelta: null,
  };
}

function compactStateSummary({ status, referenceChannel, diagnostic, warmupObservation, warmupModel }) {
  return freezeDeep({
    analysisVersion: PRACTICE_PERFORMANCE_ANALYSIS_VERSION,
    measurementKind: "state-probe",
    status,
    referenceChannel,
    paceState: diagnostic?.paceState ?? "uncertain",
    controlQuality: diagnostic?.controlQuality ?? "unknown",
    readinessBand: diagnostic?.readinessBand ?? "unknown",
    relativeStateDelta: diagnostic?.relativeStateDelta ?? null,
    stateZ: diagnostic?.stateZ ?? null,
    measurementConfidence: diagnostic?.measurementConfidence ?? "none",
    warmupObserved: warmupModel?.status === "observed",
    warmupGainRelative: warmupObservation?.warmupGainRelative ?? null,
  });
}

function compactFrontierSummary(status, model, validPointCount = 0) {
  return freezeDeep({
    analysisVersion: PRACTICE_PERFORMANCE_ANALYSIS_VERSION,
    measurementKind: "control-frontier",
    status,
    validPointCount,
    observedSpeedRangeWpm: model?.observedSpeedRangeWpm ?? null,
    frontierStatus: model?.status ?? "unmeasured",
    frontierWpm: model?.frontierWpm ?? null,
    frontierLowerWpm: model?.frontierLowerWpm ?? null,
    frontierUpperWpm: model?.frontierUpperWpm ?? null,
    frontierConfidence: model?.confidence ?? "none",
  });
}

export function buildPracticePerformanceAnalysis({
  session,
  experiment,
  foundationAnalysis,
  contentPlan,
  evidenceRole,
  referenceAbilityState = null,
  existingPerformanceState = null,
  eventTrace = [],
  traceMetadata = {},
  frontierMeasurement = null,
  frontierMeasurementError = null,
} = {}) {
  const measurementKind = experiment?.performanceMeasurementKind ?? null;
  if (measurementKind == null) return freezeDeep(base(null));
  if (!PRACTICE_PERFORMANCE_MEASUREMENT_KINDS.includes(measurementKind)) throw new TypeError("Unsupported Practice performance measurement kind");
  const currentState = existingPerformanceState ?? createDefaultPracticePerformanceState({ profileId: session.profileId, contextId: session.contextId, now: () => new Date(session.completedAtUtc) });

  if (measurementKind === "state-probe") {
    const stateProbe = buildPracticeStateProbe({ session, experiment, foundationAnalysis, contentPlan, evidenceRole, referenceAbilityState });
    if (stateProbe.status !== "measured") {
      return freezeDeep({
        ...base(measurementKind),
        status: stateProbe.status,
        reasons: stateProbe.reasons,
        stateProbe: stateProbe.diagnostic,
        sessionSummary: compactStateSummary({ status: stateProbe.status, referenceChannel: experiment.performanceReferenceChannel, diagnostic: stateProbe.diagnostic, warmupObservation: null, warmupModel: null }),
      });
    }
    const stateValidation = validatePracticeStateObservation(stateProbe.observation);
    if (!stateValidation.valid) throw new TypeError(`State probe observation failed validation: ${stateValidation.errors[0]?.message}`);
    const warmupResult = analyzePracticeWarmup({
      events: eventTrace,
      traceMetadata,
      latencyAnalysis: foundationAnalysis?.latency,
      session,
      referenceChannel: experiment.performanceReferenceChannel,
    });
    const warmupObservation = warmupResult.observation ?? null;
    if (warmupObservation) {
      const validation = validatePracticeWarmupObservation(warmupObservation);
      if (!validation.valid) throw new TypeError(`Warm-up observation failed validation: ${validation.errors[0]?.message}`);
    }
    const performanceStateDelta = freezeDeep({
      type: "state-probe",
      sessionId: session.sessionId,
      profileId: session.profileId,
      contextId: session.contextId,
      currentStateObservation: stateProbe.observation,
      warmupObservation,
    });
    const deltaValidation = validatePracticePerformanceStateDelta(performanceStateDelta);
    if (!deltaValidation.valid) throw new TypeError(`Performance state delta failed validation: ${deltaValidation.errors[0]?.message}`);
    const projected = mergePracticePerformanceStateDelta(currentState, performanceStateDelta);
    const warmupModel = projected.warmupModels?.[experiment.performanceReferenceChannel] ?? null;
    return freezeDeep({
      ...base(measurementKind),
      status: "measured",
      stateProbe: stateProbe.diagnostic,
      warmup: freezeDeep({ status: warmupObservation ? "measured" : "not-eligible", reason: warmupResult.reason, observation: warmupObservation, model: warmupModel }),
      sessionSummary: compactStateSummary({ status: "measured", referenceChannel: experiment.performanceReferenceChannel, diagnostic: stateProbe.diagnostic, warmupObservation, warmupModel }),
      performanceStateDelta,
    });
  }

  if (frontierMeasurementError) {
    return freezeDeep({
      ...base(measurementKind),
      status: "measurement-failed",
      reasons: ["callback-failed"],
      sessionSummary: compactFrontierSummary("measurement-failed", currentState.controlFrontier, 0),
    });
  }
  const reasons = [];
  if (session.status !== "completed") reasons.push("wrong-session-status");
  if (session.completionReason === "manual-stop") reasons.push("manual-stop");
  if ((contentPlan?.targetEntities?.length ?? 0) !== 0) reasons.push("targeted-content");
  if (session.configuration?.correctionBehavior !== "allow") reasons.push("correction-policy");
  if (!["diagnostic", "benchmark", "training"].includes(evidenceRole)) reasons.push("role-not-allowed");
  if (reasons.length) return freezeDeep({ ...base(measurementKind), status: "not-eligible", reasons, sessionSummary: compactFrontierSummary("not-eligible", currentState.controlFrontier, 0) });
  let batch;
  try {
    batch = buildPracticeFrontierObservationBatch({ measurement: frontierMeasurement, session, foundationAnalysis, evidenceRole });
  } catch {
    return freezeDeep({ ...base(measurementKind), status: "measurement-failed", reasons: ["invalid-measurement"], sessionSummary: compactFrontierSummary("measurement-failed", currentState.controlFrontier, 0) });
  }
  const batchValidation = validatePracticeFrontierBatch(batch);
  if (!batchValidation.valid) throw new TypeError(`Frontier batch failed canonical validation: ${batchValidation.errors[0]?.message}`);
  const validPointCount = batch.points.filter((point) => point.valid).length;
  if (!validPointCount) return freezeDeep({ ...base(measurementKind), status: "not-eligible", reasons: ["insufficient-frontier-points"], frontier: freezeDeep({ batch, model: currentState.controlFrontier }), sessionSummary: compactFrontierSummary("not-eligible", currentState.controlFrontier, 0) });
  const performanceStateDelta = freezeDeep({ type: "frontier", sessionId: session.sessionId, profileId: session.profileId, contextId: session.contextId, frontierObservationBatch: batch });
  const deltaValidation = validatePracticePerformanceStateDelta(performanceStateDelta);
  if (!deltaValidation.valid) throw new TypeError(`Frontier performance delta failed validation: ${deltaValidation.errors[0]?.message}`);
  const projected = mergePracticePerformanceStateDelta(currentState, performanceStateDelta);
  return freezeDeep({
    ...base(measurementKind),
    status: "measured",
    frontier: freezeDeep({ batch, model: projected.controlFrontier }),
    sessionSummary: compactFrontierSummary("measured", projected.controlFrontier, validPointCount),
    performanceStateDelta,
  });
}
