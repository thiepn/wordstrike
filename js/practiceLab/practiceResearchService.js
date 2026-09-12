import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeResearchRepository } from "./practiceResearchRepository.js";
import { practiceResearchStudyRegistry } from "./practiceResearchStudyRegistry.js";
import { createPracticeResearchEnrollment, updatePracticeResearchEnrollmentStatus, isPracticeResearchEnrollmentOpen } from "./practiceResearchEnrollment.js";
import { createPracticeResearchAssignmentRecord, advancePracticeResearchEnrollmentForAssignment, selectPracticeResearchTarget } from "./practiceResearchAssignment.js";
import { normalizePracticeResearchProbeResult, computePracticeResearchOutcome } from "./practiceResearchProbe.js";
import { auditPracticeResearchContamination, isPracticeResearchPrimaryContaminationEligible } from "./practiceResearchContamination.js";
import { recomputePracticeResearchAnalysis } from "./practiceResearchAnalysis.js";
import { PRACTICE_RESEARCH_POLICY, PRACTICE_RESEARCH_STUDY_ID, PRACTICE_RESEARCH_STUDY_VERSION } from "./practiceResearchConstants.js";

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

  async function beginBaseline(assignmentId) {
    const record=await repo.getAssignment(assignmentId);
    if (!record || record.status!=="assigned") return record;
    return repo.saveAssignment(Object.freeze({...record,status:"baseline-active",updatedAt:iso(time())}));
  }

  async function recordBaseline(assignmentId, result) {
    const record=await repo.getAssignment(assignmentId);
    if (!record || !["assigned","baseline-active"].includes(record.status)) throw new TypeError("Practice Research baseline is not expected");
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
    const record=await repo.getAssignment(assignmentId);
    if (!record || record.status!=="treatment-revealed") throw new TypeError("Assigned Practice treatment is not ready");
    return repo.saveAssignment(Object.freeze({...record,status:"treatment-active",treatment:Object.freeze({...record.treatment,status:"active",sessionId,exposureStartedAt:iso(time())}),updatedAt:iso(time())}));
  }

  async function completeTreatment(assignmentId, sessionId = null) {
    const record=await repo.getAssignment(assignmentId);
    if (!record || record.status!=="treatment-active") throw new TypeError("Assigned Practice treatment is not active");
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
    const assignments=await repo.listAssignments(researchEnrollmentId);
    const active=assignments.find((item)=>!assignmentTerminal(item))??null;
    if (active) await refreshAssignment(active.researchAssignmentId);
    const analysis=await repo.getAnalysisState(researchEnrollmentId)??await recompute(researchEnrollmentId);
    return Object.freeze({enrollment,assignments:Object.freeze(assignments),activeAssignment:active,analysis});
  }

  return Object.freeze({enroll,createAssignment,beginBaseline,recordBaseline,revealTreatment,declineTreatment,startTreatment,completeTreatment,getFollowupState,refreshAssignment,recordFollowup,recompute,setEnrollmentStatus,snapshot,deleteResearchRecords:(id)=>repo.deleteEnrollmentResearch(id),close(){ownedStore?.close?.();}});
}
