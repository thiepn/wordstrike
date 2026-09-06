import { hashPracticeContent } from "./practiceIds.js";
import { validatePracticeEvaluationBinding } from "./practiceEvaluationValidation.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export async function loadPracticeEvaluationContent({
  plan,
  loadContentItems,
} = {}) {
  const binding = plan?.binding;
  const bindingValidation = validatePracticeEvaluationBinding(binding);
  if (!bindingValidation.valid) {
    const error = new Error("Claimed Practice evaluation binding is required before protected content can load");
    error.code = "PRACTICE_EVALUATION_BINDING_REQUIRED";
    throw error;
  }
  if (typeof loadContentItems !== "function") throw new TypeError("Practice evaluation loader requires an explicit protected-content loader");
  const expectedPartition = binding.kind === "benchmark" ? "benchmark" : "transfer";
  if (plan?.contentDescriptor?.partition !== expectedPartition) {
    const error = new Error("Practice evaluation content partition mismatch");
    error.code = "PRACTICE_CORPUS_PARTITION_MISMATCH";
    throw error;
  }
  const ids = plan.contentDescriptor.orderedContentIds ?? [];
  const items = await loadContentItems({ partition: expectedPartition, contentIds: [...ids] });
  if (!Array.isArray(items) || items.length !== ids.length) throw new Error("Practice evaluation content loader returned incomplete content");
  const byId = new Map(items.map((item) => [item.contentId, item]));
  const ordered = ids.map((id) => byId.get(id));
  for (const item of ordered) {
    if (!item || item.partition !== expectedPartition) {
      const error = new Error("Practice evaluation content came from the wrong partition");
      error.code = "PRACTICE_CORPUS_PARTITION_MISMATCH";
      throw error;
    }
    const expectedHash = plan.contentDescriptor.contentHashes?.[item.contentId];
    if (expectedHash && item.contentHash !== expectedHash) {
      const error = new Error("Practice evaluation constituent content hash mismatch");
      error.code = "PRACTICE_EVALUATION_CONTENT_HASH_MISMATCH";
      throw error;
    }
  }
  const separator = String(plan.contentDescriptor.separator ?? "\n\n");
  const text = ordered.map((item) => item.text).join(separator);
  const contentId = `practice-content_evaluation-${binding.kind}-${binding.kind === "benchmark" ? binding.formId : binding.unitId}`.replace(/[^a-z0-9._-]/gi, "-");
  return freezeDeep({
    contentId,
    contentGeneratorVersion: 1,
    text,
    targetEntities: [],
    completion: { mode: "duration", value: plan.measurementProtocol.durationMs },
    metadata: {
      sourceType: "protected-evaluation",
      partition: expectedPartition,
      evaluationKind: binding.kind,
      evaluationContentBindingHash: binding.contentBindingHash,
      evaluationReservationId: binding.reservationId,
      evaluationSourceIds: ids,
      rawCompositeContentHash: hashPracticeContent(text),
    },
  });
}
