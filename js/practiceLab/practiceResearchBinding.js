import { PRACTICE_RESEARCH_PHASES, PRACTICE_RESEARCH_RANDOMIZATION_VERSION } from "./practiceResearchConstants.js";

const encoder = new TextEncoder();
const text = (value) => typeof value === "string" && value.length > 0;
const trusted = new WeakMap();

function freezeBinding(binding) {
  return Object.freeze({
    studyId: binding.studyId,
    studyVersion: binding.studyVersion,
    researchEnrollmentId: binding.researchEnrollmentId,
    researchAssignmentId: binding.researchAssignmentId,
    armId: binding.armId,
    phase: binding.phase,
    assignmentHash: binding.assignmentHash,
  });
}

function canonicalAssignmentPayload(assignment) {
  return JSON.stringify({
    studyId: assignment.studyId,
    studyVersion: assignment.studyVersion,
    researchEnrollmentId: assignment.researchEnrollmentId,
    researchAssignmentId: assignment.researchAssignmentId,
    target: assignment.target,
    assignedArm: assignment.assignedArm,
    assignmentIndex: assignment.assignmentIndex,
    randomizationVersion: PRACTICE_RESEARCH_RANDOMIZATION_VERSION,
  });
}

function hex(bytes) { return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(""); }

export async function computePracticeResearchAssignmentHash(assignment, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle?.digest) throw new Error("Web Crypto SHA-256 is required for Practice Research bindings");
  const digest = await cryptoImpl.subtle.digest("SHA-256", encoder.encode(canonicalAssignmentPayload(assignment)));
  return `sha256:${hex(new Uint8Array(digest))}`;
}

export function validatePracticeResearchBinding(binding) {
  const errors = [];
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) return { valid: false, errors: ["binding-required"] };
  for (const key of ["studyId", "researchEnrollmentId", "researchAssignmentId", "armId", "assignmentHash"]) if (!text(binding[key])) errors.push(`${key}-required`);
  if (!Number.isInteger(binding.studyVersion) || binding.studyVersion < 1) errors.push("studyVersion-invalid");
  if (!PRACTICE_RESEARCH_PHASES.includes(binding.phase)) errors.push("phase-invalid");
  return { valid: errors.length === 0, errors };
}

export async function createPracticeResearchBinding(assignment, phase, cryptoImpl = globalThis.crypto) {
  if (!PRACTICE_RESEARCH_PHASES.includes(phase)) throw new TypeError("Unsupported Practice Research phase");
  return freezeBinding({
    studyId: assignment.studyId,
    studyVersion: assignment.studyVersion,
    researchEnrollmentId: assignment.researchEnrollmentId,
    researchAssignmentId: assignment.researchAssignmentId,
    armId: assignment.assignedArm,
    phase,
    assignmentHash: await computePracticeResearchAssignmentHash(assignment, cryptoImpl),
  });
}

export function trustPracticeResearchContentPlan(contentPlan, binding) {
  if (!contentPlan || typeof contentPlan !== "object") throw new TypeError("Practice Research trust requires a content plan object");
  const validation = validatePracticeResearchBinding(binding);
  if (!validation.valid) throw new TypeError(`Invalid Practice Research binding: ${validation.errors.join(", ")}`);
  trusted.set(contentPlan, freezeBinding(binding));
  return contentPlan;
}

export function getPracticeTrustedResearchBinding(contentPlan) {
  return contentPlan && typeof contentPlan === "object" ? trusted.get(contentPlan) ?? null : null;
}

export async function assertPracticeResearchBindingMatches(binding, assignment, { phase = null, armId = null, statId = null, cryptoImpl = globalThis.crypto } = {}) {
  const validation = validatePracticeResearchBinding(binding);
  if (!validation.valid) throw new TypeError(`Invalid Practice Research binding: ${validation.errors.join(", ")}`);
  if (binding.researchAssignmentId !== assignment.researchAssignmentId || binding.researchEnrollmentId !== assignment.researchEnrollmentId || binding.studyId !== assignment.studyId || binding.studyVersion !== assignment.studyVersion) throw new TypeError("Practice Research binding does not match assignment identity");
  if (binding.armId !== assignment.assignedArm || (armId && armId !== assignment.assignedArm)) throw new TypeError("Practice Research binding arm mismatch");
  if (phase && binding.phase !== phase) throw new TypeError("Practice Research binding phase mismatch");
  if (statId && statId !== assignment.target?.statId) throw new TypeError("Practice Research binding target mismatch");
  const expected = await computePracticeResearchAssignmentHash(assignment, cryptoImpl);
  if (binding.assignmentHash !== expected) throw new TypeError("Practice Research assignment hash mismatch");
  return true;
}
