import { PRACTICE_LIMITS, PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import {
  PRACTICE_RESEARCH_ANALYSIS_ELIGIBILITY,
  PRACTICE_RESEARCH_ANALYSIS_STATUSES,
  PRACTICE_RESEARCH_ASSIGNMENT_STATUSES,
  PRACTICE_RESEARCH_CONTAMINATION_LEVELS,
  PRACTICE_RESEARCH_ENROLLMENT_STATUSES,
  PRACTICE_RESEARCH_ENTITY_TYPES,
} from "./practiceResearchConstants.js";

const encoder = new TextEncoder();
const FORBIDDEN = new Set(["sourceText","passageText","typedText","typedBuffer","eventTrace","rawEvents","wrongStrings","physicalTelemetry","customText","contentPlan"]);
const text = (value, max=600) => typeof value === "string" && value.length > 0 && value.length <= max;
const iso = (value) => value == null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
function forbidden(value, path="record", errors=[], depth=0) {
  if (!value || typeof value !== "object" || depth > 8) return errors;
  if (Array.isArray(value)) { value.forEach((item,index)=>forbidden(item,`${path}[${index}]`,errors,depth+1)); return errors; }
  for (const [key,item] of Object.entries(value)) {
    if (FORBIDDEN.has(key)) errors.push(`${path}.${key}:forbidden`);
    else forbidden(item,`${path}.${key}`,errors,depth+1);
  }
  return errors;
}

export function validatePracticeResearchEnrollment(record) {
  const errors=[];
  if (!record || typeof record !== "object") return { valid:false, errors:["record-required"] };
  for (const key of ["researchEnrollmentId","profileId","contextId","studyId","studyHash","randomizationSeed"]) if (!text(record[key])) errors.push(`${key}-required`);
  if (record.recordVersion !== PRACTICE_RECORD_VERSIONS.researchEnrollment) errors.push("recordVersion-invalid");
  if (!PRACTICE_RESEARCH_ENROLLMENT_STATUSES.includes(record.status)) errors.push("status-invalid");
  if (!Number.isInteger(record.studyVersion) || record.studyVersion < 1) errors.push("studyVersion-invalid");
  if (!/^[0-9a-f]{32,}$/i.test(record.randomizationSeed ?? "")) errors.push("seed-invalid");
  if (!iso(record.consentedAt) || !iso(record.enrolledAt) || !iso(record.enrollmentExpiresAt) || !iso(record.updatedAt)) errors.push("time-invalid");
  forbidden(record,"record",errors);
  return { valid:errors.length===0, errors };
}

export function validatePracticeResearchAssignment(record) {
  const errors=[];
  if (!record || typeof record !== "object") return { valid:false, errors:["record-required"] };
  for (const key of ["researchAssignmentId","researchEnrollmentId","profileId","contextId","studyId","studyHash","assignedArm","stratum"]) if (!text(record[key])) errors.push(`${key}-required`);
  if (record.recordVersion !== PRACTICE_RECORD_VERSIONS.researchAssignment) errors.push("recordVersion-invalid");
  if (!PRACTICE_RESEARCH_ASSIGNMENT_STATUSES.includes(record.status)) errors.push("status-invalid");
  if (!PRACTICE_RESEARCH_ENTITY_TYPES.includes(record.stratum) || record.target?.entityType !== record.stratum || !text(record.target?.statId) || !text(record.target?.entityKey)) errors.push("target-invalid");
  if (!Number.isInteger(record.assignmentIndex) || record.assignmentIndex < 0 || !Number.isInteger(record.blockIndex) || ![0,1,2,3].includes(record.blockPosition)) errors.push("randomization-position-invalid");
  if (!PRACTICE_RESEARCH_CONTAMINATION_LEVELS.includes(record.contamination?.level ?? "none")) errors.push("contamination-invalid");
  if (!PRACTICE_RESEARCH_ANALYSIS_ELIGIBILITY.includes(record.analysisEligibility)) errors.push("analysisEligibility-invalid");
  if (!iso(record.createdAt) || !iso(record.updatedAt) || !iso(record.closedAt)) errors.push("time-invalid");
  if (encoder.encode(JSON.stringify(record)).byteLength > PRACTICE_LIMITS.researchAssignmentBytes) errors.push("byte-limit");
  forbidden(record,"record",errors);
  return { valid:errors.length===0, errors };
}

export function validatePracticeResearchAnalysisState(record) {
  const errors=[];
  if (!record || typeof record !== "object") return { valid:false, errors:["record-required"] };
  for (const key of ["researchAnalysisStateId","researchEnrollmentId","profileId","contextId","studyId","studyHash"]) if (!text(record[key])) errors.push(`${key}-required`);
  if (record.recordVersion !== PRACTICE_RECORD_VERSIONS.researchAnalysisState) errors.push("recordVersion-invalid");
  if (!PRACTICE_RESEARCH_ANALYSIS_STATUSES.includes(record.analysisStatus)) errors.push("analysisStatus-invalid");
  if (!iso(record.updatedAt)) errors.push("updatedAt-invalid");
  forbidden(record,"record",errors);
  return { valid:errors.length===0, errors };
}
