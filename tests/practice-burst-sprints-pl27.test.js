import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PRACTICE_BURST_ESTIMATOR_VERSION,
  PRACTICE_BURST_LEGACY_V1,
  PRACTICE_BURST_MIN_ELIGIBLE_SPRINTS,
  PRACTICE_BURST_PREVIEW_DURATION_MS,
  PRACTICE_BURST_RECOVERY_COUNT,
  PRACTICE_BURST_RECOVERY_DURATION_MS,
  PRACTICE_BURST_SPRINT_COUNT,
  PRACTICE_BURST_SPRINT_DURATION_MS,
  PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS,
  PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS,
  PRACTICE_BURST_TOTAL_PROTOCOL_INACTIVE_DURATION_MS,
  PRACTICE_BURST_WARMUP_DURATION_MS,
  PRACTICE_BURST_SPRINTS_POLICY_V1,
  validatePracticeBurstSprintsPolicy,
} from "../js/practiceLab/practiceBurstSprintsConstants.js";
import { createPracticeBurstSprintsPlan } from "../js/practiceLab/practiceBurstSprintsPlan.js";
import { createPracticeBurstSprintsAccumulator } from "../js/practiceLab/practiceBurstSprintsAccumulator.js";
import { buildPracticeBurstAbilityMeasurement, calculatePracticeBurstSessionSigma, selectPracticeBurstEstimatorSprints } from "../js/practiceLab/practiceBurstSprintsMeasurement.js";
import { createPracticeBurstSprintsExperiment } from "../js/practiceLab/practiceBurstSprintsExperiment.js";
import { resolvePracticeTreatmentIdentity } from "../js/practiceLab/practiceTreatmentRegistry.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";

const form = { formId:"burst-en-01", formFamilyId:"WS-BURST-EN-1", formOrdinal:1, language:"en" };
const makePlan = () => createPracticeBurstSprintsPlan({ sessionId:"practice-session_pl27-12345678", profileId:"practice-profile_pl27-12345678", contextId:"practice-context_pl27-12345678", form });
const sprint = (ordinal, wpm, accuracy=90, eligible=true) => ({ sprintId:`sprint-${ordinal}`, sprintOrdinal:ordinal, durationMs:10_000, acceptedInsertions:60, firstPassOpportunityCount:60, correctFirstPassAttempts:Math.round(60*accuracy/100), incorrectFirstPassAttempts:60-Math.round(60*accuracy/100), grossForwardWpm:wpm+8, rawWpm:wpm+8, burstEffectiveWpm:wpm, correctedWpm:wpm, firstPassAccuracy:accuracy, strictAccuracy:accuracy, correctionOverheadRate:.01, carryoverOpenError:false, visibilityCorrupted:false, protocolCorrupted:false, contentExhausted:false, completed:true, eligible });
const completeResult = () => ({ status:"complete", interrupted:false, eligibleSprintCount:6, completedSprintCount:6, sprints:[sprint(1,100),sprint(2,140),sprint(3,130),sprint(4,120),sprint(5,150),sprint(6,80)] });
const sigmas = Object.fromEntries(Array.from({length:6},(_,i)=>[`sprint-${i+1}`, .12]));

test("PL27 canonical protocol signature is exact and legacy 15s recovery is non-launchable", () => {
  assert.equal(validatePracticeBurstSprintsPolicy(), true);
  assert.equal(PRACTICE_BURST_WARMUP_DURATION_MS, 30_000);
  assert.equal(PRACTICE_BURST_SPRINT_COUNT, 6);
  assert.equal(PRACTICE_BURST_SPRINT_DURATION_MS, 10_000);
  assert.equal(PRACTICE_BURST_PREVIEW_DURATION_MS, 2_000);
  assert.equal(PRACTICE_BURST_RECOVERY_COUNT, 5);
  assert.equal(PRACTICE_BURST_RECOVERY_DURATION_MS, 18_000);
  assert.equal(PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS, 90_000);
  assert.equal(PRACTICE_BURST_TOTAL_PROTOCOL_INACTIVE_DURATION_MS, 102_000);
  assert.equal(PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS, 192_000);
  assert.equal(PRACTICE_BURST_MIN_ELIGIBLE_SPRINTS, 4);
  assert.equal(PRACTICE_BURST_LEGACY_V1.recoveryMs, 15_000);
  assert.notEqual(PRACTICE_BURST_RECOVERY_DURATION_MS, PRACTICE_BURST_LEGACY_V1.recoveryMs);
});

test("PL27 plan contains warm-up, six previews/sprints and five recoveries with none after sprint 6", () => {
  const plan = makePlan();
  assert.equal(plan.warmupDurationMs, 30_000); assert.equal(plan.sprints.length, 6);
  assert.deepEqual(plan.sprints.map(s=>[s.activeStartMs,s.activeEndMs]), [[30_000,40_000],[40_000,50_000],[50_000,60_000],[60_000,70_000],[70_000,80_000],[80_000,90_000]]);
  assert.equal(plan.sprints.every(s=>s.previewBeforeMs===2_000), true);
  assert.deepEqual(plan.sprints.map(s=>s.recoveryAfterMs), [18_000,18_000,18_000,18_000,18_000,0]);
});

test("PL27 warm-up is excluded from Burst estimator and sprint validity uses canonical floors", () => {
  const acc = createPracticeBurstSprintsAccumulator({ plan:makePlan() });
  const warm = { type:"character", accepted:true, isFirstAttempt:true, correctness:"correct", relativeActiveTimestampMs:10_000 };
  for(let i=0;i<100;i++) acc.recordProcessedInput(warm);
  assert.equal(acc.getSnapshot(10_000).sprints.every(s=>s.acceptedInsertions===0), true);
  const base={ type:"character", accepted:true,isFirstAttempt:true,correctness:"correct" };
  for(let i=0;i<30;i++) acc.recordProcessedInput({...base,relativeActiveTimestampMs:30_001+i});
  const result=acc.finalize({finalActiveDurationMs:90_000});
  assert.equal(result.sprints[0].acceptedInsertions,30); assert.equal(result.sprints[0].firstPassOpportunityCount,30); assert.equal(result.sprints[0].firstPassAccuracy,100);
});

test("PL27 carryover open error excludes the next sprint from ability estimator", () => {
  const acc=createPracticeBurstSprintsAccumulator({plan:makePlan()}); const wrong={type:"character",accepted:true,isFirstAttempt:true,correctness:"incorrect",relativeActiveTimestampMs:39_999}; acc.recordProcessedInput(wrong); acc.markSprintStart(2); const result=acc.finalize({finalActiveDurationMs:90_000}); assert.equal(result.sprints[1].carryoverOpenError,true); assert.equal(result.sprints[1].eligible,false);
});

test("PL27 selects top three adjusted logs, takes their median and applies exact sigma equation", () => {
  const result=completeResult(); const selected=selectPracticeBurstEstimatorSprints(result,{difficultyAdjustmentLog:0});
  assert.deepEqual(selected.map(s=>s.sprintId),["sprint-5","sprint-2","sprint-3"]);
  const sigma=calculatePracticeBurstSessionSigma(selected,sigmas);
  // Independent canonical expectation: top-three Y are ln(150), ln(140), ln(130).
  // Their median is ln(140), so MAD is median(ln(150/140), 0, ln(140/130)) = ln(150/140).
  const expectedMad = Math.log(150 / 140);
  const expectedSpread = Math.max(1.4826 * expectedMad, .03);
  const expected=Math.sqrt(.12**2/2 + expectedSpread**2 + .04**2);
  assert.ok(Math.abs(sigma.sigmaSpread-expectedSpread)<1e-12);
  assert.ok(Math.abs(sigma.measurementSigmaLog-expected)<1e-12);
  const m=buildPracticeBurstAbilityMeasurement(result,{difficultyAdjustmentLog:0,individualSigmas:sigmas}); assert.ok(Math.abs(m.wpm-140)<1e-9); assert.ok(Math.abs(m.adjustedWpm-140)<1e-9); assert.notEqual(m.adjustedWpm,150); assert.equal(m.measurementVersion,PRACTICE_BURST_ESTIMATOR_VERSION);
  const only3={...result,eligibleSprintCount:3,sprints:result.sprints.map((s,i)=>({...s,eligible:i<3}))}; assert.equal(buildPracticeBurstAbilityMeasurement(only3,{individualSigmas:sigmas}),null);
});

test("PL27 descriptor owns exactly one PL13 burst observation path and no PL14/PL16 direct model", () => {
  const d=createPracticeBurstSprintsExperiment(); assert.equal(d.abilityChannel,"burst"); assert.equal(d.performanceMeasurementKind,null); assert.equal(d.performanceReferenceChannel,null); assert.equal(d.retentionMeasurementKind,null); assert.equal(typeof d.buildAbilityMeasurement,"function");
});

test("PL27 browser host encodes protocol-inactive preview/recovery, disabled input and no final recovery", () => {
  const source=fs.readFileSync("js/practiceLab/practiceBurstSprintsSessionHost.js","utf8");
  assert.match(source,/protocol-inactive:burst-/); assert.match(source,/phase === "preview" \|\| phase === "recovery"/); assert.match(source,/input is disabled/i); assert.match(source,/sprintOrdinal < PRACTICE_BURST_SPRINT_COUNT/); assert.match(source,/PRACTICE_BURST_PREVIEW_DURATION_MS/); assert.match(source,/PRACTICE_BURST_RECOVERY_DURATION_MS/);
});

test("PL27 catalog and PL32 treatment identity use canonical v2 and do not pool legacy history", () => {
  const catalog=getPracticeExperiment("burst-sprints"); assert.match(catalog.longDescription,/30-second warm-up/i); assert.match(catalog.description,/preview and recovery/i); assert.doesNotMatch(catalog.longDescription,/15-second/);
  const identity=resolvePracticeTreatmentIdentity({experiment:createPracticeBurstSprintsExperiment(),configuration:{protocolVersion:2,policyVersion:2,estimatorVersion:2},contentPlan:{targetEntities:[],metadata:{}}});
  assert.equal(identity.protocolVariant,"six-sprint-warmup-preview-v2"); assert.notEqual(identity.treatmentFamilyKey,"burst-sprints:six-sprint-v1");
});
