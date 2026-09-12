import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { PRACTICE_RESEARCH_ANALYSIS_VERSION, PRACTICE_RESEARCH_ARMS, PRACTICE_RESEARCH_POLICY } from "./practiceResearchConstants.js";
import { computeExactPracticeResearchRandomizationInference } from "./practiceResearchRandomizationInference.js";

const finite = Number.isFinite;
const response = (assignment) => Number(assignment?.primaryFollowup?.outcome?.responseValue ?? assignment?.outcome?.responseValue);
const eligible = (assignment) => assignment?.analysisEligibility === "eligible" && finite(response(assignment));
const median = (values) => { if (!values.length) return null; const sorted = values.slice().sort((a,b)=>a-b); const i=Math.floor(sorted.length/2); return sorted.length%2 ? sorted[i] : (sorted[i-1]+sorted[i])/2; };
const mean = (values) => values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null;
const mad = (values) => { const m=median(values); return m==null ? null : median(values.map((value)=>Math.abs(value-m))); };

function armSummary(assignments, arm) {
  const records = assignments.filter((item) => item.assignedArm === arm && eligible(item));
  const values = records.map(response);
  return Object.freeze({
    count: values.length,
    meanResponse: mean(values),
    medianResponse: median(values),
    MADResponse: mad(values),
    positiveCount: values.filter((value) => value >= PRACTICE_RESEARCH_POLICY.practicalEffectPoints).length,
    negativeCount: values.filter((value) => value <= -PRACTICE_RESEARCH_POLICY.practicalEffectPoints).length,
    deadbandCount: values.filter((value) => Math.abs(value) < PRACTICE_RESEARCH_POLICY.practicalEffectPoints).length,
  });
}

function funnel(assignments, arm) {
  const records = assignments.filter((item) => item.assignedArm === arm);
  const hasBaseline = (item) => item.baseline?.status === "valid";
  const started = (item) => Boolean(item.treatment?.exposureStartedAt) || ["treatment-active","followup-waiting","followup-ready","followup-complete","closed"].includes(item.status);
  const completedTreatment = (item) => Boolean(item.treatment?.completedAt);
  const completedFollowup = (item) => item.primaryFollowup?.status === "valid" || item.primaryFollowup?.outcome?.responseUnit === "quality-points";
  return Object.freeze({ assigned: records.length, baselineValid: records.filter(hasBaseline).length, treatmentStarted: records.filter(started).length, treatmentCompleted: records.filter(completedTreatment).length, followupCompleted: records.filter(completedFollowup).length, analysisEligible: records.filter(eligible).length });
}

function rate(numerator, denominator) { return denominator ? numerator / denominator : 0; }
function baselineQuality(item) { return Number(item.baseline?.quality); }

function entityBreakdown(assignments, arm) {
  const result = {};
  for (const type of ["key","bigram","trigram","word"]) {
    const records = assignments.filter((item)=>item.assignedArm===arm && item.target?.entityType===type && eligible(item));
    const values = records.map(response);
    result[type] = Object.freeze({ count: values.length, meanResponse: mean(values), medianResponse: median(values) });
  }
  return Object.freeze(result);
}

export function recomputePracticeResearchAnalysis({ enrollment, assignments = [], now = Date.now() } = {}) {
  const ordered = assignments.slice().sort((a,b)=>a.researchAssignmentId.localeCompare(b.researchAssignmentId));
  const armA = armSummary(ordered, PRACTICE_RESEARCH_ARMS.FOCUSED);
  const armB = armSummary(ordered, PRACTICE_RESEARCH_ARMS.BOSS);
  const funnelA = funnel(ordered, PRACTICE_RESEARCH_ARMS.FOCUSED);
  const funnelB = funnel(ordered, PRACTICE_RESEARCH_ARMS.BOSS);
  const completionA = rate(funnelA.analysisEligible, funnelA.assigned);
  const completionB = rate(funnelB.analysisEligible, funnelB.assigned);
  const attritionDifferencePp = 100 * (completionB - completionA);
  const totalAssigned = funnelA.assigned + funnelB.assigned;
  const attritionConcern = totalAssigned >= 8 && Math.abs(attritionDifferencePp) >= PRACTICE_RESEARCH_POLICY.attritionConcernPp;

  const technicalA = ordered.filter((item)=>item.assignedArm===PRACTICE_RESEARCH_ARMS.FOCUSED && item.analysisEligibility === "technical-invalid").length;
  const technicalB = ordered.filter((item)=>item.assignedArm===PRACTICE_RESEARCH_ARMS.BOSS && item.analysisEligibility === "technical-invalid").length;
  const technicalInvalidRateA = rate(technicalA, funnelA.assigned);
  const technicalInvalidRateB = rate(technicalB, funnelB.assigned);
  const technicalExclusionConcern = totalAssigned >= 8 && Math.abs(100 * (technicalInvalidRateB - technicalInvalidRateA)) >= PRACTICE_RESEARCH_POLICY.attritionConcernPp;

  const baselinesA = ordered.filter((item)=>item.assignedArm===PRACTICE_RESEARCH_ARMS.FOCUSED && item.baseline?.status === "valid" && finite(baselineQuality(item))).map(baselineQuality);
  const baselinesB = ordered.filter((item)=>item.assignedArm===PRACTICE_RESEARCH_ARMS.BOSS && item.baseline?.status === "valid" && finite(baselineQuality(item))).map(baselineQuality);
  const baselineMeanA = mean(baselinesA), baselineMeanB = mean(baselinesB);
  const baselineDifference = baselineMeanA == null || baselineMeanB == null ? null : baselineMeanB - baselineMeanA;
  const baselineImbalance = baselinesA.length >= 4 && baselinesB.length >= 4 && Math.abs(baselineDifference) >= PRACTICE_RESEARCH_POLICY.baselineImbalancePoints;

  const effect = armA.meanResponse == null || armB.meanResponse == null ? null : armB.meanResponse - armA.meanResponse;
  const robustEffect = armA.medianResponse == null || armB.medianResponse == null ? null : armB.medianResponse - armA.medianResponse;
  const inference = computeExactPracticeResearchRandomizationInference(ordered);
  const eligibleTotal = armA.count + armB.count;
  const minimallyPopulated = eligibleTotal >= PRACTICE_RESEARCH_POLICY.minimumAnalysisTotal && armA.count >= PRACTICE_RESEARCH_POLICY.minimumAnalysisPerArm && armB.count >= PRACTICE_RESEARCH_POLICY.minimumAnalysisPerArm;
  const stronglyPopulated = eligibleTotal >= PRACTICE_RESEARCH_POLICY.strongAnalysisTotal && armA.count >= PRACTICE_RESEARCH_POLICY.strongAnalysisPerArm && armB.count >= PRACTICE_RESEARCH_POLICY.strongAnalysisPerArm && inference.completeBlockCount >= PRACTICE_RESEARCH_POLICY.minimumCompleteBlocks;
  let analysisStatus = "insufficient";
  if (minimallyPopulated) {
    analysisStatus = "inconclusive";
    if (stronglyPopulated && !attritionConcern && !technicalExclusionConcern) {
      if (Math.abs(effect) >= PRACTICE_RESEARCH_POLICY.practicalEffectPoints && inference.pValue != null && inference.pValue <= PRACTICE_RESEARCH_POLICY.exploratoryRandomizationP) analysisStatus = "randomized-signal";
      else if (Math.abs(effect) < PRACTICE_RESEARCH_POLICY.practicalEffectPoints && inference.pValue != null && inference.pValue > PRACTICE_RESEARCH_POLICY.exploratoryRandomizationP) analysisStatus = "little-observed-difference";
    }
  }
  if (["withdrawn","expired"].includes(enrollment?.status)) analysisStatus = "inconclusive";
  const updatedAt = new Date(now instanceof Date ? now.getTime() : now).toISOString();
  return Object.freeze({
    researchAnalysisStateId: `research-analysis:${enrollment.researchEnrollmentId}`,
    researchEnrollmentId: enrollment.researchEnrollmentId,
    profileId: enrollment.profileId,
    contextId: enrollment.contextId,
    recordVersion: PRACTICE_RECORD_VERSIONS.researchAnalysisState,
    studyId: enrollment.studyId,
    studyVersion: enrollment.studyVersion,
    studyHash: enrollment.studyHash,
    analysisVersion: PRACTICE_RESEARCH_ANALYSIS_VERSION,
    assignmentCounts: Object.freeze({ total: ordered.length, eligible: eligibleTotal }),
    armA: Object.freeze({ ...armA, funnel: funnelA, entityTypes: entityBreakdown(ordered, PRACTICE_RESEARCH_ARMS.FOCUSED) }),
    armB: Object.freeze({ ...armB, funnel: funnelB, entityTypes: entityBreakdown(ordered, PRACTICE_RESEARCH_ARMS.BOSS) }),
    baselineBalance: Object.freeze({ meanA: baselineMeanA, meanB: baselineMeanB, medianA: median(baselinesA), medianB: median(baselinesB), difference: baselineDifference, baselineImbalance }),
    attrition: Object.freeze({ completionRateA: completionA, completionRateB: completionB, attritionDifferencePp, attritionConcern, technicalInvalidRateA, technicalInvalidRateB, technicalExclusionConcern }),
    primaryEffect: effect,
    robustEffect,
    completeBlocks: inference.completeBlockCount,
    randomizationInference: inference,
    analysisStatus,
    concerns: Object.freeze({ attritionConcern, technicalExclusionConcern, baselineImbalance }),
    updatedAt,
  });
}
