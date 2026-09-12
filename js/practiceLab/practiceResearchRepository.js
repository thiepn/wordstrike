import { PRACTICE_LIMITS } from "./practiceConstants.js";
import { validatePracticeResearchAnalysisState, validatePracticeResearchAssignment, validatePracticeResearchEnrollment } from "./practiceResearchValidation.js";

function assertValid(kind, record, validator) {
  const validation = validator(record);
  if (!validation.valid) { const error = new TypeError(`${kind} failed validation`); error.code = "PRACTICE_RESEARCH_RECORD_INVALID"; error.details = validation.errors; throw error; }
}
const terminalAssignment = (record) => ["followup-complete","expired","abandoned","technical-invalid","closed"].includes(record?.status);

export function createPracticeResearchRepository({ dataStore, now = Date.now } = {}) {
  if (!dataStore) throw new TypeError("Practice Research repository requires the Practice data store");
  const currentMs = () => { const value = typeof now === "function" ? now() : now; return value instanceof Date ? value.getTime() : Number(value); };

  async function getEnrollment(id) { const value=await dataStore.get("researchEnrollments",id); return value && validatePracticeResearchEnrollment(value).valid ? value : null; }
  async function listEnrollments(profileId,{contextId=null,studyId=null}={}) { const values=await dataStore.query("researchEnrollments",contextId?"contextId":"profileId",contextId??profileId); return values.filter((item)=>validatePracticeResearchEnrollment(item).valid&&item.profileId===profileId&&(!contextId||item.contextId===contextId)&&(!studyId||item.studyId===studyId)); }
  async function saveEnrollment(record) { assertValid("Research enrollment",record,validatePracticeResearchEnrollment); await dataStore.put("researchEnrollments",record); return record; }
  async function getAssignment(id) { const value=await dataStore.get("researchAssignments",id); return value&&validatePracticeResearchAssignment(value).valid?value:null; }
  async function listAssignments(researchEnrollmentId) { const values=await dataStore.query("researchAssignments","researchEnrollmentId",researchEnrollmentId); return values.filter((item)=>validatePracticeResearchAssignment(item).valid).sort((a,b)=>a.enrollmentAssignmentIndex-b.enrollmentAssignmentIndex||a.researchAssignmentId.localeCompare(b.researchAssignmentId)); }
  async function saveAssignment(record) { assertValid("Research assignment",record,validatePracticeResearchAssignment); await dataStore.put("researchAssignments",record); return record; }
  async function getAnalysisState(researchEnrollmentId) { const values=await dataStore.query("researchAnalysisStates","researchEnrollmentId",researchEnrollmentId); return values.find((item)=>validatePracticeResearchAnalysisState(item).valid)??null; }
  async function saveAnalysisState(record) { assertValid("Research analysis",record,validatePracticeResearchAnalysisState); await dataStore.put("researchAnalysisStates",record); return record; }

  async function persistNewAssignment({ enrollment, assignment, updatedEnrollment }) {
    assertValid("Research enrollment",updatedEnrollment,validatePracticeResearchEnrollment);
    assertValid("Research assignment",assignment,validatePracticeResearchAssignment);
    return dataStore.runTransaction(["researchEnrollments","researchAssignments"],"readwrite",async(transaction)=>{
      const canonicalEnrollment=await transaction.get("researchEnrollments",enrollment.researchEnrollmentId);
      if (!canonicalEnrollment || canonicalEnrollment.updatedAt!==enrollment.updatedAt || canonicalEnrollment.assignmentsCreated!==enrollment.assignmentsCreated) {
        const existing=await transaction.query("researchAssignments","enrollmentSequence",[enrollment.researchEnrollmentId,assignment.assignmentIndex]);
        if (existing[0]&&validatePracticeResearchAssignment(existing[0]).valid) return {created:false,assignment:existing[0],enrollment:canonicalEnrollment};
        const error=new Error("Practice Research enrollment changed during assignment creation"); error.code="PRACTICE_RESEARCH_ASSIGNMENT_RACE"; throw error;
      }
      const sameSlot=await transaction.query("researchAssignments","enrollmentSequence",[enrollment.researchEnrollmentId,assignment.assignmentIndex]);
      if (sameSlot[0]&&validatePracticeResearchAssignment(sameSlot[0]).valid) return {created:false,assignment:sameSlot[0],enrollment:canonicalEnrollment};
      const day=await transaction.query("researchAssignments","profileContextDay",[assignment.profileId,assignment.contextId,assignment.localDayKey]);
      if (day.some((item)=>validatePracticeResearchAssignment(item).valid)) { const error=new Error("Practice Research daily randomized-assignment limit reached"); error.code="PRACTICE_RESEARCH_DAILY_LIMIT"; throw error; }
      const active=(await transaction.query("researchAssignments","researchEnrollmentId",assignment.researchEnrollmentId)).filter((item)=>validatePracticeResearchAssignment(item).valid&&!terminalAssignment(item));
      if (active.length) return {created:false,assignment:active[0],enrollment:canonicalEnrollment};
      await transaction.put("researchAssignments",assignment);
      await transaction.put("researchEnrollments",updatedEnrollment);
      return {created:true,assignment,enrollment:updatedEnrollment};
    });
  }

  async function deleteEnrollmentResearch(researchEnrollmentId) {
    const enrollment=await getEnrollment(researchEnrollmentId);
    if (!enrollment) return {deleted:false,sessionIds:[]};
    const assignments=await listAssignments(researchEnrollmentId);
    const sessions=await dataStore.query("sessionSummaries","researchAssignmentId",null).catch(()=>[]);
    await dataStore.runTransaction(["researchEnrollments","researchAssignments","researchAnalysisStates"],"readwrite",async(transaction)=>{
      for (const assignment of assignments) await transaction.delete("researchAssignments",assignment.researchAssignmentId);
      const analyses=await transaction.query("researchAnalysisStates","researchEnrollmentId",researchEnrollmentId);
      for (const analysis of analyses) await transaction.delete("researchAnalysisStates",analysis.researchAnalysisStateId);
      await transaction.delete("researchEnrollments",researchEnrollmentId);
    });
    return {deleted:true,assignmentIds:assignments.map((item)=>item.researchAssignmentId),sessionIds:sessions.filter((item)=>item.researchBinding?.researchEnrollmentId===researchEnrollmentId).map((item)=>item.sessionId)};
  }

  async function prune(profileId) {
    const enrollments=await listEnrollments(profileId);
    const activeIds=new Set(enrollments.filter((item)=>["active","paused"].includes(item.status)).map((item)=>item.researchEnrollmentId));
    const assignments=(await dataStore.query("researchAssignments","profileId",profileId)).filter((item)=>validatePracticeResearchAssignment(item).valid);
    const cutoff=currentMs();
    const deleteIds=[];
    for (const item of assignments) {
      if (activeIds.has(item.researchEnrollmentId) || !terminalAssignment(item)) continue;
      const age=cutoff-Date.parse(item.closedAt??item.updatedAt??item.createdAt);
      const days=item.status==="technical-invalid"?PRACTICE_LIMITS.researchTechnicalInvalidDays:PRACTICE_LIMITS.researchCompletedDays;
      if (Number.isFinite(age)&&age>days*86_400_000) deleteIds.push(item.researchAssignmentId);
    }
    for (const id of deleteIds) await dataStore.delete("researchAssignments",id);
    return {deletedAssignmentIds:deleteIds};
  }

  return Object.freeze({getEnrollment,listEnrollments,saveEnrollment,getAssignment,listAssignments,saveAssignment,getAnalysisState,saveAnalysisState,persistNewAssignment,deleteEnrollmentResearch,prune});
}
