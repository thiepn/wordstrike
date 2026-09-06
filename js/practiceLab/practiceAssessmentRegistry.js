import { PRACTICE_ASSESSMENT_EXPERIMENT_IDS, PRACTICE_ASSESSMENT_PROTOCOL_VERSION } from "./practiceAssessmentConstants.js";
import { validatePracticeExperimentDescriptor } from "./practiceSessionContract.js";

const bindings = new WeakMap();
const descriptor = (id, title, { evaluationMeasurementKind = null, abilityChannel = null } = {}) => Object.freeze({
  id,
  version: 1,
  sessionSchemaVersion: 1,
  title,
  category: "assessment",
  defaultCorrectionBehavior: "allow",
  supportedCompletionModes: Object.freeze(["duration"]),
  resumable: false,
  abilityChannel,
  performanceMeasurementKind: null,
  performanceReferenceChannel: null,
  retentionMeasurementKind: null,
  evaluationMeasurementKind,
  internalAssessmentOnly: true,
});

export const PRACTICE_ASSESSMENT_CHILD_DESCRIPTORS = Object.freeze({
  benchmark: descriptor(PRACTICE_ASSESSMENT_EXPERIMENT_IDS.benchmark, "Full Assessment — Natural Text", { evaluationMeasurementKind: "benchmark", abilityChannel: "cold-natural-text" }),
  diagnostic: descriptor(PRACTICE_ASSESSMENT_EXPERIMENT_IDS.diagnostic, "Full Assessment — Diagnostic"),
  coldTransfer: descriptor(PRACTICE_ASSESSMENT_EXPERIMENT_IDS.coldTransfer, "Full Assessment — Cold Transfer", { evaluationMeasurementKind: "cold-transfer" }),
});

for (const value of Object.values(PRACTICE_ASSESSMENT_CHILD_DESCRIPTORS)) {
  const validation = validatePracticeExperimentDescriptor(value);
  if (!validation.valid) throw new TypeError(`Invalid internal assessment descriptor: ${value.id}`);
}

export function registerPracticeTrustedAssessmentBinding(contentPlan, binding) {
  if (!contentPlan || typeof contentPlan !== "object") throw new TypeError("Assessment binding requires a content plan object");
  if (binding == null) { bindings.delete(contentPlan); return contentPlan; }
  if (!binding || typeof binding !== "object" || binding.protocolVersion !== PRACTICE_ASSESSMENT_PROTOCOL_VERSION) throw new TypeError("Assessment binding is invalid");
  bindings.set(contentPlan, Object.freeze({ ...binding }));
  return contentPlan;
}

export function getPracticeTrustedAssessmentBinding(contentPlan) {
  return contentPlan && typeof contentPlan === "object" ? bindings.get(contentPlan) ?? null : null;
}

export function getPracticeAssessmentChildDescriptorForBlock(blockKind) {
  if (blockKind === "benchmark") return PRACTICE_ASSESSMENT_CHILD_DESCRIPTORS.benchmark;
  if (blockKind === "diagnostic") return PRACTICE_ASSESSMENT_CHILD_DESCRIPTORS.diagnostic;
  if (blockKind === "cold-transfer") return PRACTICE_ASSESSMENT_CHILD_DESCRIPTORS.coldTransfer;
  return null;
}
