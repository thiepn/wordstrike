import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeResearchRepository } from "./practiceResearchRepository.js";
import { practiceResearchStudyRegistry } from "./practiceResearchStudyRegistry.js";
import { createPracticeResearchEnrollment, updatePracticeResearchEnrollmentStatus, isPracticeResearchEnrollmentOpen } from "./practiceResearchEnrollment.js";
import { createPracticeResearchAssignmentRecord, advancePracticeResearchEnrollmentForAssignment, selectPracticeResearchTarget } from "./practiceResearchAssignment.js";
import { normalizePracticeResearchProbeResult, computePracticeResearchOutcome } from "./practiceResearchProbe.js";
import { auditPracticeResearchContamination, isPracticeResearchPrimaryContaminationEligible } from "./practiceResearchContamination.js";
import { recomputePracticeResearchAnalysis } from "./practiceResearchAnalysis.js";
import { assertPracticeResearchBindingMatches } from "./practiceResearchBinding.js";
import { PRACTICE_RESEARCH_POLICY, PRACTICE_RESEARCH_PROBE_CONTRACT, PRACTICE_RESEARCH_STUDY_ID, PRACTICE_RESEARCH_STUDY_VERSION } from "./practiceResearchConstants.js";

const iso = (value) => new Date(value instanceof Date ? value.getTime() : value).toISOString();
const dayKey = (value) => { const d=new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

function assignmentTerminal(record) { return ["followup-complete","expired","abandoned","technical-invalid","closed"].includes(record?.status); }

export function createPracticeResearchService({ dataStore = null, repository = null, studyRegistry = practiceResearchStudyRegistry, now = () => new Date(), cryptoImpl = globalThis.crypto, targetProvider = null, contaminationProvider = null } = {}) {
  const ownedStore = repository ? null : (dataStore ?? createPracticeIndexedDbStore());
  const repo = repository ?? createPracticeResearchRepository({ dataStore: ownedStore, now });
  const time = () => { const value=typeof now==="function"?now():now; return value instanceof Date?value:new Date(value); };
  const boundedStudy = () => studyRegistry.getBound(PRACTICE_RESEARCH_STUDY_ID, PRACTICE_RESEARCH_STUDY_VERSION, cryptoImpl);

  async function enroll({ profileId, contextId, consented } = {}) {
    const study = await boundedStudy();
    const existing=(await repo.listEnrollments(profileId,{contextId,studyId:study.studyId})).find((item)=>item.studyVersion===study.studyVersion);
    if (existing) return existing;
    const enrollment=createPracticeResearchEnrollment({profileId,contextId,study,consented,now:time(),cryptoImpl});
    return repo.saveEnrollment(enrollment);
  }

  async function createAssignment(researchEnrollmentId, { candidates = null } = {}) {
    let enrollment=await repo.getEnrollment(researchEnrollmentId);
    if (!enrollment) throw new TypeError("Practice Research enrollment not found");
    const study=await boundedStudy();
    if (study.studyHash!==enrollment.studyHash) { const error=new Error("Practice Research study definition changed without version change"); error.code="PRACTICE_RESEARCH_STUDY_HASH_MISMATCH"; throw error; }
    const at=time();
    if (!isPracticeResearchEnrollmentOpen(enrollment,at)) throw new TypeError("Practice Research enrollment is not open for a new assignment");
    const existingActive=(await repo.listAssignments(researchEnrollmentId)).find((item)=>!assignmentTerminal(item));
    if (existingActive) return existingActive;
    const source=candidates ?? await targetProvider?.({enrollment,study,now:at});
    const target=selectPracticeResearchTarget(source??[],{now:at});
    if (!target) { const error=new Error("No target currently satisfies the randomized-study intersection eligibility"); error.code="PRACTICE_RESEARCH_NO_ELIGIBLE_TARGET"; throw error; }
    const assignment=await createPracticeResearchAssignmentRecord({enrollment,study,target,now:at,cryptoImpl});
    const updatedEnrollment=advancePracticeResearchEnrollmentForAssignment(enrollment,assignment);
    const persisted=await repo.persistNewAssignment({enrollment,assignment,updatedEnrollment});
    return persisted.assignment;
  }

  async function beginBaseline(assignmentId, sessionId = null) {
    if (sessionId) return repo.reserveProbeSession(assignmentId,"baseline",sessionId);
    const record=await repo.getAssignment(assignmentId);
    if (!record || record.status!=="assigned") return record;
    return repo.saveAssignment(Object.freeze({...record,status:"baseline-active",updatedAt:iso(time())}));
  }

  async function beginFollowup(assignmentId, sessionId) {
    const record=await refreshAssignment(assignmentId);
    if (!record || record.status!=="followup-ready") throw new TypeError("Practice Research follow-up is not ready");
    return repo.reserveProbeSession(assignmentId,"followup",sessionId);
  }

  async function recordBaseline(assignmentId, result) {
    const record=await repo.getAssignment(assignmentId);
    if (!record) throw new TypeError("Practice Research baseline assignment not found");
    if (record.baseline?.status==="valid" && !["assigned","baseline-active"].includes(record.status)) return record;
    if (!["assigned","baseline-active"].includes(record.status)) throw new TypeError("Practice Research baseline is not expected");
    const baseline=normalizePracticeResearchProbeResult(result);
    if (baseline.status!=="valid") return repo.saveAssignment(Object.freeze({...record,baseline,status:"technical-invalid",analysisEligibility:"missing-baseline",closedAt:iso(time()),updatedAt:iso(time())}));
    return repo.saveAssignment(Object.freeze({...record,baseline,status:"baseline-complete",updatedAt:iso(time())}));
  }

  async function revealTreatment(assignmentId) {
    const record=await repo.getAssignment(assignmentId);
    if (!record || record.baseline?.status!=="valid") throw new TypeError("Allocation remains concealed until a valid common baseline completes");
    if (record.status==="baseline-complete") return repo.saveAssignment(Object.freeze({...record,status:"treatment-revealed",updatedAt:iso(time())}));
    return record;
  }

  async function declineTreatment(assignmentId) {
    const record=await repo.getAssignment(assignmentId);
    if (!record || !["baseline-complete","treatment-revealed"].includes(record.status)) throw new TypeError("Practice Research assignment cannot be declined in this state");
    return repo.saveAssignment(Object.freeze({...record,status:"abandoned",abandonReason:"declined-after-reveal",analysisEligibility:"treatment-incomplete",closedAt:iso(time()),updatedAt:iso(time())}));
  }

  async function startTreatment(assignmentId, sessionId = null) {
    if (!sessionId) throw new TypeError("Assigned Practice treatment requires a canonical sessionId");
    return repo.reserveTreatmentSession(assignmentId,sessionId);
  }

  async function completeTreatment(assignmentId, sessionId = null) {
    const record=await repo.getAssignment(assignmentId);
    if (!record) throw new TypeError("Assigned Practice treatment not found");
    if (["followup-waiting","followup-ready","followup-complete","expired"].includes(record.status) && (!sessionId || record.treatment?.sessionId===sessionId)) return record;
    if (record.status!=="treatment-active") throw new TypeError("Assigned Practice treatment is not active");
    if (sessionId && record.treatment?.sessionId && sessionId!==record.treatment.sessionId) { const error=new Error("Practice Research treatment session mismatch"); error.code="PRACTICE_RESEARCH_SESSION_CONFLICT"; throw error; }
    const completedAt=time();
    return repo.saveAssignment(Object.freeze({...record,status:"followup-waiting",treatment:Object.freeze({...record.treatment,status:"complete",sessionId:sessionId??record.treatment.sessionId,completedAt:iso(completedAt)}),followupWindow:Object.freeze({notBefore:iso(completedAt.getTime()+PRACTICE_RESEARCH_POLICY.minimumFollowupMs),expiresAt:iso(completedAt.getTime()+PRACTICE_RESEARCH_POLICY.maximumFollowupMs),differentLocalDay:true}),analysisEligibility:"followup-missing",updatedAt:iso(completedAt)}));
  }

  function getFollowupState(record, at=time()) {
    const completed=Date.parse(record?.treatment?.completedAt??"");
    if (!Number.isFinite(completed)) return "unavailable";
    const nowMs=at.getTime();
    if (nowMs>completed+PRACTICE_RESEARCH_POLICY.maximumFollowupMs) return "expired";
    if (nowMs<completed+PRACTICE_RESEARCH_POLICY.minimumFollowupMs || dayKey(nowMs)===dayKey(completed)) return "waiting";
    return "ready";
  }

  async function refreshAssignment(assignmentId) {
    const record=await repo.getAssignment(assignmentId);
    if (!record || !["followup-waiting","followup-ready"].includes(record.status)) return record;
    const state=getFollowupState(record);
    if (state==="waiting") return record;
    if (state==="ready"&&record.status!=="followup-ready") return repo.saveAssignment(Object.freeze({...record,status:"followup-ready",updatedAt:iso(time())}));
    if (state==="expired") return repo.saveAssignment(Object.freeze({...record,status:"expired",analysisEligibility:"followup-expired",primaryFollowup:Object.freeze({status:"expired"}),closedAt:iso(time()),updatedAt:iso(time())}));
    return record;
  }

  async function recordFollowup(assignmentId, result, { contaminationEvents = null } = {}) {
    const existing=await repo.getAssignment(assignmentId);
    if (existing?.status==="followup-complete") return existing;
    let record=await refreshAssignment(assignmentId);
    if (!record || record.status!=="followup-ready") throw new TypeError("Practice Research follow-up is outside its precommitted ready window");
    const followup=normalizePracticeResearchProbeResult(result);
    const events=contaminationEvents ?? await contaminationProvider?.({assignment:record,from:record.treatment.completedAt,to:followup.completedAt??iso(time())}) ?? [];
    const contamination=auditPracticeResearchContamination(record,events);
    const outcome=computePracticeResearchOutcome(record.baseline,followup);
    const valid=followup.status==="valid"&&outcome&&isPracticeResearchPrimaryContaminationEligible(contamination);
    record=Object.freeze({...record,status:"followup-complete",primaryFollowup:Object.freeze({...followup,outcome}),secondaryOutcomes:outcome,contamination,analysisEligibility:valid?"eligible":(followup.status!=="valid"?"followup-missing":"contaminated"),closedAt:iso(time()),updatedAt:iso(time())});
    await repo.saveAssignment(record);
    await recompute(record.researchEnrollmentId);
    return record;
  }

  async function boundCompletedSession(record, phase, sessionId, expectedExperimentId) {
    if (!sessionId) return null;
    const sessions=await repo.listAssignmentSessions(record.researchAssignmentId);
    const candidates=sessions.filter((summary)=>summary?.sessionId===sessionId&&summary?.status==="completed"&&summary?.experimentId===expectedExperimentId);
    for (const summary of candidates) {
      try {
        await assertPracticeResearchBindingMatches(summary.researchBinding,record,{phase,statId:record.target?.statId,cryptoImpl});
        return summary;
      } catch {}
    }
    return null;
  }

  async function reconcileAssignment(assignmentId) {
    let record=await repo.getAssignment(assignmentId);
    if (!record || assignmentTerminal(record)) return record;
    if (record.status==="baseline-active" && record.baselineSessionId) {
      const summary=await boundCompletedSession(record,"baseline",record.baselineSessionId,PRACTICE_RESEARCH_PROBE_CONTRACT.experimentId);
      if (summary) {
        record=await recordBaseline(assignmentId,{...(summary.beforeMetrics??{}),completedAt:summary.completedAtUtc??iso(time())});
        if (record?.baseline?.status==="valid") record=await revealTreatment(assignmentId);
      }
      return record;
    }
    if (record.status==="treatment-active" && record.treatment?.sessionId) {
      const summary=await boundCompletedSession(record,"treatment",record.treatment.sessionId,record.treatment.experimentId);
      if (summary) record=await completeTreatment(assignmentId,summary.sessionId);
      return record;
    }
    if (record.status==="followup-ready" && record.followupSessionId) {
      const summary=await boundCompletedSession(record,"followup",record.followupSessionId,PRACTICE_RESEARCH_PROBE_CONTRACT.experimentId);
      if (summary) record=await recordFollowup(assignmentId,{...(summary.beforeMetrics??{}),completedAt:summary.completedAtUtc??iso(time())});
      return record;
    }
    return record;
  }

  async function recompute(researchEnrollmentId) {
    const enrollment=await repo.getEnrollment(researchEnrollmentId);
    if (!enrollment) return null;
    const assignments=await repo.listAssignments(researchEnrollmentId);
    const analysis=recomputePracticeResearchAnalysis({enrollment,assignments,now:time()});
    await repo.saveAnalysisState(analysis);
    return analysis;
  }

  async function setEnrollmentStatus(researchEnrollmentId,status) {
    const enrollment=await repo.getEnrollment(researchEnrollmentId);
    if (!enrollment) return null;
    const updated=updatePracticeResearchEnrollmentStatus(enrollment,status,time());
    await repo.saveEnrollment(updated);
    await recompute(researchEnrollmentId);
    return updated;
  }

  async function snapshot(researchEnrollmentId) {
    const enrollment=await repo.getEnrollment(researchEnrollmentId);
    if (!enrollment) return null;
    let assignments=await repo.listAssignments(researchEnrollmentId);
    let active=assignments.find((item)=>!assignmentTerminal(item))??null;
    if (active) {
      await reconcileAssignment(active.researchAssignmentId);
      await refreshAssignment(active.researchAssignmentId);
      await reconcileAssignment(active.researchAssignmentId);
      assignments=await repo.listAssignments(researchEnrollmentId);
      active=assignments.find((item)=>!assignmentTerminal(item))??null;
    }
    const analysis=await repo.getAnalysisState(researchEnrollmentId)??await recompute(researchEnrollmentId);
    return Object.freeze({enrollment,assignments:Object.freeze(assignments),activeAssignment:active,analysis});
  }

  return Object.freeze({enroll,createAssignment,beginBaseline,beginFollowup,recordBaseline,revealTreatment,declineTreatment,startTreatment,completeTreatment,getFollowupState,refreshAssignment,recordFollowup,reconcileAssignment,recompute,setEnrollmentStatus,snapshot,deleteResearchRecords:(id)=>repo.deleteEnrollmentResearch(id),close(){ownedStore?.close?.();}});
}
