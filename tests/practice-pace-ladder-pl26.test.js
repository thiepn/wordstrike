import test from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_PACE_LADDER_EXPERIMENT_VERSION,
  PRACTICE_PACE_LADDER_LEGACY_V1,
  PRACTICE_PACE_LADDER_MAIN_STAGE_IDS,
  PRACTICE_PACE_LADDER_POLICY_VERSION,
  PRACTICE_PACE_LADDER_PROTOCOL_VERSION,
  PRACTICE_PACE_LADDER_RATIOS,
  PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS,
  PRACTICE_PACE_LADDER_RUNG_DURATION_MS,
  PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
} from "../js/practiceLab/practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1, validatePracticePaceLadderPolicy } from "../js/practiceLab/practicePaceLadderPolicy.js";
import { createPracticePaceLadderPlan, validatePracticePaceLadderPlan } from "../js/practiceLab/practicePaceLadderPlan.js";
import { createPracticePaceStageAccumulator } from "../js/practiceLab/practicePaceStageAccumulator.js";
import { createPracticePaceLadderExperiment } from "../js/practiceLab/practicePaceLadderExperiment.js";
import { mapPaceLadderStagesToPerformancePoints } from "../js/practiceLab/practicePaceLadderMeasurement.js";
import { getPracticePaceGuide } from "../js/practiceLab/practicePaceGuide.js";
import { resolvePracticePaceLadderFrontierAnchor, resolvePracticePaceLadderReferenceAnchor } from "../js/practiceLab/practicePaceLadderAnchor.js";
import { resolvePracticeTreatmentIdentity } from "../js/practiceLab/practiceTreatmentRegistry.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";

const canonicalRatios = [0.75,0.85,0.95,1.05,1.15,1.25,1.10,0.90];
const plan = (anchor = { source:"pl14-frontier", status:"ready", rawAnchorWpm:100, effectiveWpm:100 }) => createPracticePaceLadderPlan({ sessionId:"practice-session_pl26-12345678", profileId:"practice-profile_pl26-12345678", contextId:"practice-context_pl26-12345678", formSetId:"WS-PACE-EN-1", formId:"pace-en-01", formFamilyId:"family", formOrdinal:1, formHash:"sha256-form", anchor });

test("PL26 canonical contract is independent and exact", () => {
  assert.equal(validatePracticePaceLadderPolicy(), true);
  assert.equal(PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS, 30_000);
  assert.equal(PRACTICE_PACE_LADDER_RUNG_DURATION_MS, 20_000);
  assert.deepEqual([...PRACTICE_PACE_LADDER_RATIOS], canonicalRatios);
  assert.equal(PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS, 190_000);
  assert.equal(PRACTICE_PACE_LADDER_POLICY_V1.minimumFrontierStages, 5);
  assert.equal(PRACTICE_PACE_LADDER_POLICY_V1.maximumStages, 9);
  assert.equal(PRACTICE_PACE_LADDER_POLICY_V1.paceBandSeconds, .75);
  assert.equal(PRACTICE_PACE_LADDER_LEGACY_V1.referenceMs, 25_000);
  assert.equal(PRACTICE_PACE_LADDER_LEGACY_V1.validationMs, 40_000);
  assert.notEqual(PRACTICE_PACE_LADDER_PROTOCOL_VERSION, 1);
});

test("PL26 plan is Reference plus eight 20s rungs with no validation", () => {
  const value = plan();
  assert.equal(validatePracticePaceLadderPlan(value), true);
  assert.equal(value.stages.length, 9);
  assert.equal(value.referenceStage.stageId, "reference");
  assert.equal(value.referenceStage.durationMs, 30_000);
  assert.equal(value.rungSchedule.length, 8);
  assert.deepEqual(value.rungSchedule.map((r) => r.ratio), canonicalRatios);
  assert.equal(value.rungSchedule.every((r) => r.durationMs === 20_000), true);
  assert.equal(value.validationStage, null);
  assert.equal(value.stages.some((s) => ["calibration","validation"].includes(s.kind)), false);
  const pending = plan({ source:"in-session-reference", status:"pending", rawAnchorWpm:null, effectiveWpm:null });
  assert.notEqual(value.planHash, pending.planHash);
});

test("PL26 anchor priority accepts only fresh reliable PL14 frontier and validates Reference floor", () => {
  const now = () => new Date("2026-09-15T00:00:00Z");
  const fresh = resolvePracticePaceLadderFrontierAnchor({ controlFrontier:{ status:"lower-bound", confidence:"medium", frontierWpm:100, updatedAt:"2026-09-01T00:00:00Z" }, difficultyAdjustmentLog:Math.log(1.1), now });
  assert.equal(fresh.source, "pl14-frontier"); assert.ok(Math.abs(fresh.rawAnchorWpm - 100/1.1) < 1e-9);
  const stale = resolvePracticePaceLadderFrontierAnchor({ controlFrontier:{ status:"bracketed", confidence:"high", frontierWpm:100, updatedAt:"2026-06-01T00:00:00Z" }, now });
  assert.equal(stale.source, "in-session-reference"); assert.equal(stale.status, "pending");
  assert.equal(resolvePracticePaceLadderReferenceAnchor({ acceptedForwardInsertions:49, firstPassAccuracy:.99, grossWpm:80, coverage:"complete" }).status, "insufficient-measurement");
  assert.equal(resolvePracticePaceLadderReferenceAnchor({ acceptedForwardInsertions:50, firstPassAccuracy:.699, grossWpm:80, coverage:"complete" }).status, "insufficient-measurement");
  assert.equal(resolvePracticePaceLadderReferenceAnchor({ acceptedForwardInsertions:50, firstPassAccuracy:.70, grossWpm:80, coverage:"complete" }).status, "ready");
});

test("PL26 pace guide uses expected char rate and ±0.75 second band without actual WPM", () => {
  const on = getPracticePaceGuide({ targetWpm:120, elapsedMs:10_000, acceptedForwardCharacters:100 });
  assert.equal(on.targetCharactersPerSecond, 10); assert.equal(on.expectedProgress, 100); assert.equal(on.paceOffsetSeconds, 0); assert.equal(on.status, "on-pace");
  assert.equal(getPracticePaceGuide({ targetWpm:120, elapsedMs:10_000, acceptedForwardCharacters:92 }).status, "behind");
  assert.equal(getPracticePaceGuide({ targetWpm:120, elapsedMs:10_000, acceptedForwardCharacters:108 }).status, "ahead");
  assert.equal(Object.hasOwn(on, "actualWpm"), false);
});

test("PL26 accumulator drops cross-rung latency and bounds nine summaries", () => {
  const acc = createPracticePaceStageAccumulator({ plan: plan() });
  const base = { type:"character", accepted:true, stateChanged:true, correctness:"correct", isFirstAttempt:true };
  acc.recordProcessedInput({ ...base, relativeActiveTimestampMs:49_999, latencyFromPriorInsertionMs:100 });
  acc.recordProcessedInput({ ...base, relativeActiveTimestampMs:50_001, latencyFromPriorInsertionMs:9_999 });
  const result = acc.finalize({ finalActiveDurationMs:190_000 });
  assert.equal(result.boundedDiagnostics.stageCount, 9);
  const rung2 = result.stages.find((s) => s.stageId === "rung-2");
  assert.equal(rung2.pauseP95Ms, null, "first transition inside a new rung must not retain cross-rung latency");
});

test("PL26 frontier merge accepts five-plus valid rungs and uses gross forward pace", () => {
  const stages = PRACTICE_PACE_LADDER_MAIN_STAGE_IDS.map((stageId,index)=>({ stageId, stageOrdinal:index+1, targetWpm:80+index*5, grossWpm:78+index*5, rawWpm:78+index*5, correctedWpm:60, strictAccuracy:98, longPauseRate:.01, unstableErrorRate:.01, correctionOverheadRate:.01, usableSeconds:20, acceptedForwardInsertions:60, valid:index<5, coverage:"complete" }));
  const points = mapPaceLadderStagesToPerformancePoints({ status:"complete", stages });
  assert.equal(points.length, 5); assert.equal(points[0].observedWpm, 78); assert.notEqual(points[0].observedWpm, 60);
  assert.deepEqual(mapPaceLadderStagesToPerformancePoints({ status:"complete", stages: stages.map((s,i)=>({...s,valid:i<4})) }), []);
});

test("PL26 descriptor owns PL14 frontier only and catalog/treatment identity are v2", () => {
  const descriptor = createPracticePaceLadderExperiment();
  assert.equal(descriptor.version, PRACTICE_PACE_LADDER_EXPERIMENT_VERSION); assert.equal(descriptor.abilityChannel, null); assert.equal(descriptor.performanceMeasurementKind, "control-frontier"); assert.equal(descriptor.retentionMeasurementKind, null);
  const catalog = getPracticeExperiment("pace-ladder"); assert.match(catalog.longDescription,/eight controlled pace rungs/i); assert.doesNotMatch(catalog.longDescription,/25-second|five target-blind|40-second validation/i);
  const identity = resolvePracticeTreatmentIdentity({ experiment:descriptor, configuration:{ protocolVersion:PRACTICE_PACE_LADDER_PROTOCOL_VERSION, policyVersion:PRACTICE_PACE_LADDER_POLICY_VERSION }, contentPlan:{ targetEntities:[] } });
  assert.equal(identity.protocolVariant, "pace-ladder-canonical-v2"); assert.notEqual(identity.protocolVariant, "ladder-v1");
});
