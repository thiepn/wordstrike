import test from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_RESEARCH_BLOCK_PERMUTATIONS,
  PRACTICE_RESEARCH_FOCUSED_MAPPING,
  PRACTICE_RESEARCH_POLICY,
  PRACTICE_RESEARCH_PROBE_CONTRACT,
  PRACTICE_RESEARCH_PROBE_QUOTAS,
  PRACTICE_RESEARCH_STUDY_ID,
} from "../js/practiceLab/practiceResearchConstants.js";
import { practiceResearchStudyRegistry, computePracticeResearchStudyHash } from "../js/practiceLab/practiceResearchStudyRegistry.js";
import { generatePracticeResearchSeed, derivePracticeResearchArm, derivePracticeResearchBlockPermutation, PRACTICE_RESEARCH_RANDOMIZATION_ACCEPT_LIMIT } from "../js/practiceLab/practiceResearchRandomization.js";
import { selectPracticeResearchTarget, evaluatePracticeResearchTargetEligibility, createPracticeResearchAssignmentRecord } from "../js/practiceLab/practiceResearchAssignment.js";
import { createPracticeResearchEnrollment } from "../js/practiceLab/practiceResearchEnrollment.js";
import { createPracticeResearchProbePlan, computePracticeResearchOutcome, normalizePracticeResearchProbeResult } from "../js/practiceLab/practiceResearchProbe.js";
import { auditPracticeResearchContamination } from "../js/practiceLab/practiceResearchContamination.js";
import { recomputePracticeResearchAnalysis } from "../js/practiceLab/practiceResearchAnalysis.js";
import { computeExactPracticeResearchRandomizationInference } from "../js/practiceLab/practiceResearchRandomizationInference.js";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS, PRACTICE_STORE_DEFINITIONS } from "../js/practiceLab/practiceConstants.js";

const cryptoImpl = globalThis.crypto;
const baseCandidate = (overrides={}) => ({ entityType:"key",statId:"stat:k",entityKey:"k",weaknessStatus:"confirmed",hierarchyStatus:"independent",stableAnchor:false,saturationStatus:"possible",learningHeadroom:10,bossTargetUtility:70,bossContentReady:true,focusedContentReady:true,canonicalTreatment:"weak-keys",retentionReviewState:"inactive",coachConflict:false,lastDirectPractisedAt:null,lastResearchAssignedAt:null,...overrides });

test("PL38 storage/version envelope is DB12 + sessionSummary14 + three sidecar stores",()=>{
  assert.equal(PRACTICE_DATABASE_VERSION,12);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary,14);
  assert.equal(PRACTICE_RECORD_VERSIONS.researchEnrollment,1);
  assert.equal(PRACTICE_RECORD_VERSIONS.researchAssignment,1);
  assert.equal(PRACTICE_RECORD_VERSIONS.researchAnalysisState,1);
  for (const name of ["researchEnrollments","researchAssignments","researchAnalysisStates"]) assert.ok(PRACTICE_STORE_DEFINITIONS[name]);
  assert.ok(PRACTICE_STORE_DEFINITIONS.sessionSummaries.indexes.some((index)=>index.name==="researchAssignmentId"));
});

test("PL38 initial study is static, local two-arm design with fixed primary outcome",async()=>{
  const study=await practiceResearchStudyRegistry.getBound(PRACTICE_RESEARCH_STUDY_ID,1,cryptoImpl);
  assert.equal(study.title,"Boss vs Focused Practice");
  assert.equal(study.design,"two-arm-randomized");
  assert.equal(study.maximumAssignments,24);
  assert.equal(study.maximumEnrollmentDays,90);
  assert.equal(study.primaryOutcome.outcomeId,"ResearchQualityDelta");
  assert.deepEqual(PRACTICE_RESEARCH_FOCUSED_MAPPING,{key:"weak-keys",bigram:"combination-repair",trigram:"combination-repair",word:"problem-words"});
  assert.equal(await computePracticeResearchStudyHash(study,cryptoImpl),study.studyHash);
});

test("PL38 seed uses 128-bit Web Crypto and six unbiased valid block permutations",async()=>{
  const seed=generatePracticeResearchSeed(cryptoImpl);
  assert.match(seed,/^[0-9a-f]{32}$/);
  assert.equal(PRACTICE_RESEARCH_BLOCK_PERMUTATIONS.length,6);
  assert.equal(PRACTICE_RESEARCH_RANDOMIZATION_ACCEPT_LIMIT,4294967292);
  for (const permutation of PRACTICE_RESEARCH_BLOCK_PERMUTATIONS) {
    assert.equal(permutation.length,4);
    assert.equal(permutation.filter((arm)=>arm==="focused-practice").length,2);
    assert.equal(permutation.filter((arm)=>arm==="weakness-boss").length,2);
  }
  const args={randomizationSeed:seed,studyId:PRACTICE_RESEARCH_STUDY_ID,studyVersion:1,contextId:"context",stratum:"key",blockIndex:0,cryptoImpl};
  assert.deepEqual(await derivePracticeResearchBlockPermutation(args),await derivePracticeResearchBlockPermutation(args));
});

test("PL38 target selection happens before arm and enforces initial-study exclusions",async()=>{
  const chosen=selectPracticeResearchTarget([baseCandidate({statId:"low",bossTargetUtility:40}),baseCandidate({statId:"high",bossTargetUtility:90})]);
  assert.equal(chosen.statId,"high");
  for (const candidate of [
    baseCandidate({saturationStatus:"supported"}),
    baseCandidate({canonicalTreatment:"accuracy-control"}),
    baseCandidate({retentionReviewState:"due"}),
    baseCandidate({coachConflict:true}),
    baseCandidate({lastDirectPractisedAt:new Date().toISOString()}),
    baseCandidate({lastResearchAssignedAt:new Date().toISOString()}),
  ]) assert.equal(evaluatePracticeResearchTargetEligibility(candidate).eligible,false);
  const study=await practiceResearchStudyRegistry.getBound(PRACTICE_RESEARCH_STUDY_ID,1,cryptoImpl);
  const enrollment=createPracticeResearchEnrollment({profileId:"profile",contextId:"context",study,consented:true,cryptoImpl});
  const a=await createPracticeResearchAssignmentRecord({enrollment,study,target:chosen,cryptoImpl});
  const b=await createPracticeResearchAssignmentRecord({enrollment,study,target:{...chosen,bossTargetUtility:90},cryptoImpl});
  assert.equal(a.target.statId,b.target.statId);
  assert.equal(a.assignedArm,b.assignedArm);
});

test("PL38 common probe is diagnostic-only with exact quotas and quality delta",()=>{
  assert.deepEqual(PRACTICE_RESEARCH_PROBE_QUOTAS,{key:12,bigram:8,trigram:6,word:4});
  assert.equal(PRACTICE_RESEARCH_PROBE_CONTRACT.role,"diagnostic");
  assert.equal(PRACTICE_RESEARCH_PROBE_CONTRACT.partition,"diagnostic");
  assert.equal(PRACTICE_RESEARCH_PROBE_CONTRACT.acquisitionDoseEligible,false);
  assert.equal(PRACTICE_RESEARCH_PROBE_CONTRACT.abilityChannel,null);
  assert.equal(PRACTICE_RESEARCH_PROBE_CONTRACT.retentionMeasurementKind,null);
  const plan=createPracticeResearchProbePlan({target:{entityType:"word",statId:"word:x",entityKey:"example"},phase:"baseline"});
  assert.equal(plan.targetOpportunityQuota,4);
  const baseline=normalizePracticeResearchProbeResult({quality:50,qualityCoverage:.8,firstPassAccuracy:.9,normalizedResidualMedianMs:100,disfluencyRate:.1});
  const followup=normalizePracticeResearchProbeResult({quality:57,qualityCoverage:.8,firstPassAccuracy:.94,normalizedResidualMedianMs:80,disfluencyRate:.08});
  const outcome=computePracticeResearchOutcome(baseline,followup);
  assert.equal(outcome.responseValue,7);
  assert.equal(outcome.normalizedResidualDeltaMs,-20);
  assert.ok(Math.abs(outcome.firstPassAccuracyDeltaPp-4)<1e-9);
});

test("PL38 contamination keeps same-target/review material and Custom Text uncertain",()=>{
  const assignment={target:{statId:"target"}};
  assert.equal(auditPracticeResearchContamination(assignment,[{kind:"direct-target-practice",statId:"target"}]).level,"material");
  assert.equal(auditPracticeResearchContamination(assignment,[{kind:"retention-review",statId:"target"}]).level,"material");
  assert.equal(auditPracticeResearchContamination(assignment,[{kind:"custom-text"}]).level,"uncertain");
  assert.equal(auditPracticeResearchContamination(assignment,[{kind:"unrelated-target-practice",statId:"other"}]).level,"background");
});

function outcomeAssignment({id,arm,stratum="key",blockIndex,blockPosition,responseValue,baseline=50,eligible=true}) {
  return {researchAssignmentId:id,assignedArm:arm,stratum,blockIndex,blockPosition,target:{entityType:stratum},baseline:{status:"valid",quality:baseline},treatment:{exposureStartedAt:"2026-01-01T00:00:00.000Z",completedAt:"2026-01-01T01:00:00.000Z"},primaryFollowup:{status:"valid",outcome:{responseValue,responseUnit:"quality-points"}},analysisEligibility:eligible?"eligible":"followup-missing",status:"followup-complete"};
}

test("PL38 exact block inference and analysis are deterministic and preserve attrition",()=>{
  const assignments=[];
  const permutations=PRACTICE_RESEARCH_BLOCK_PERMUTATIONS[0];
  for(let block=0;block<2;block+=1) for(let position=0;position<4;position+=1) assignments.push(outcomeAssignment({id:`${block}-${position}`,arm:permutations[position],blockIndex:block,blockPosition:position,responseValue:permutations[position]==="weakness-boss"?8:1}));
  const inference=computeExactPracticeResearchRandomizationInference(assignments);
  assert.equal(inference.completeBlockCount,2);
  assert.equal(inference.permutationCount,36);
  assert.ok(inference.pValue>0&&inference.pValue<=1);
  const enrollment={researchEnrollmentId:"e",profileId:"p",contextId:"c",studyId:PRACTICE_RESEARCH_STUDY_ID,studyVersion:1,studyHash:"h",status:"active"};
  const analysis=recomputePracticeResearchAnalysis({enrollment,assignments});
  assert.equal(analysis.primaryEffect,7);
  assert.equal(analysis.robustEffect,7);
  assert.equal(analysis.assignmentCounts.eligible,8);
  assert.equal(analysis.randomizationInference.permutationCount,36);
  assert.equal(PRACTICE_RESEARCH_POLICY.minimumCompleteBlocks,2);
});