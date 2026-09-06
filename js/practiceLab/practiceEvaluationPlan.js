import { PRACTICE_EVALUATION_PROTOCOL_V1 } from "./practiceEvaluationConstants.js";
import { validatePracticeEvaluationBinding } from "./practiceEvaluationValidation.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function buildPracticeEvaluationPlan({ binding, artifact, historyStatus = "complete" } = {}) {
  const validation = validatePracticeEvaluationBinding(binding);
  if (!validation.valid) throw new TypeError("Practice evaluation plan requires valid claimed binding");
  const protocol = PRACTICE_EVALUATION_PROTOCOL_V1[binding.kind];
  if (!protocol) throw new TypeError("Practice evaluation protocol is unsupported");
  const selected = binding.kind === "benchmark"
    ? artifact?.forms?.find((entry) => entry.formId === binding.formId)
    : artifact?.units?.find((entry) => entry.unitId === binding.unitId);
  if (!selected) throw new TypeError("Practice evaluation binding is stale for supplied artifact");
  const expectedHash = binding.kind === "benchmark" ? selected.formHash : selected.unitHash;
  if (expectedHash !== binding.contentBindingHash) throw new TypeError("Practice evaluation binding hash is stale");
  return freezeDeep({
    frameworkVersion: binding.frameworkVersion,
    kind: binding.kind,
    binding,
    historyStatus,
    measurementProtocol: protocol,
    contentDescriptor: {
      partition: binding.kind === "benchmark" ? "benchmark" : "transfer",
      orderedContentIds: [...selected.orderedContentIds],
      contentHashes: { ...(selected.contentHashes ?? {}) },
      separator: selected.separator ?? artifact.separator ?? "\n\n",
      contentBindingHash: expectedHash,
    },
    feedbackPolicy: protocol.feedback,
    integrityPolicy: {
      targetEntitiesRequiredEmpty: true,
      resumable: false,
      appendAllowed: false,
      pauseAllowed: false,
      correctionBehavior: "allow",
      completionReason: "time-complete",
    },
  });
}
