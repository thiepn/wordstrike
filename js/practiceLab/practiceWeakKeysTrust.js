import { PRACTICE_WEAK_KEYS_EXPERIMENT_ID } from "./practiceWeakKeysConstants.js";
import { validatePracticeWeakKeysPlan } from "./practiceWeakKeysValidation.js";

const trustedPlans = new WeakMap();
const sameBinding = (left, right) => left?.corpusId === right?.corpusId
  && Number(left?.corpusVersion) === Number(right?.corpusVersion)
  && Number(left?.indexVersion) === Number(right?.indexVersion)
  && (left?.manifestHash ?? null) === (right?.manifestHash ?? null);
const sameContextBinding = (left, right) => left?.contextId === right?.contextId
  && left?.fingerprint === right?.fingerprint
  && left?.dataLocale === right?.dataLocale
  && left?.keyboardLayout === right?.keyboardLayout
  && left?.inputMethod === right?.inputMethod
  && (left?.hardwareProfileId ?? null) === (right?.hardwareProfileId ?? null);

function validateContentBinding(contentPlan, plan) {
  const validation = validatePracticeWeakKeysPlan(plan);
  if (!validation.valid) return { valid: false, reason: "invalid-plan", details: validation.errors };
  if (!contentPlan || typeof contentPlan !== "object") return { valid: false, reason: "invalid-content-plan" };
  if (contentPlan.completion?.mode !== "content") return { valid: false, reason: "invalid-completion" };
  if (contentPlan.metadata?.partition !== "training") return { valid: false, reason: "invalid-partition" };
  if (contentPlan.metadata?.weakKeys?.planHash !== plan.planHash) return { valid: false, reason: "plan-hash-mismatch" };
  if (contentPlan.metadata?.weakKeys?.resumable !== false) return { valid: false, reason: "resumable-content" };
  if (contentPlan.metadata?.weakKeys?.completionMode !== "content") return { valid: false, reason: "completion-mode-mismatch" };
  if (!sameBinding(contentPlan.metadata?.corpusBinding, plan.corpusBinding)) return { valid: false, reason: "corpus-binding-mismatch" };
  if (!sameContextBinding(contentPlan.metadata?.weakKeys?.contextBinding, plan.contextBinding)) return { valid: false, reason: "context-binding-mismatch" };
  const targets = contentPlan.targetEntities ?? [];
  if (targets.length !== 1 || targets[0]?.entityType !== "key" || targets[0]?.entityKey !== plan.target.entityKey || targets[0]?.directTarget !== true) return { valid: false, reason: "target-mismatch" };
  return { valid: true };
}

export function assertPracticeWeakKeysSessionContext(plan, context) {
  if (!sameContextBinding(plan?.contextBinding, context)) {
    const error = new Error("Weak Keys active Practice context changed after the immutable plan was built");
    error.code = "PRACTICE_WEAK_KEYS_CONTEXT_MISMATCH";
    error.details = {
      plannedContextId: plan?.contextBinding?.contextId ?? null,
      activeContextId: context?.contextId ?? null,
      plannedFingerprint: plan?.contextBinding?.fingerprint ?? null,
      activeFingerprint: context?.fingerprint ?? null,
    };
    throw error;
  }
  return true;
}

export function trustPracticeWeakKeysContentPlan(contentPlan, plan) {
  const validation = validateContentBinding(contentPlan, plan);
  if (!validation.valid) {
    const error = new TypeError(`Weak Keys trusted binding rejected: ${validation.reason}`);
    error.code = "PRACTICE_WEAK_KEYS_TRUST_REJECTED";
    error.details = validation.details ?? null;
    throw error;
  }
  const existing = trustedPlans.get(contentPlan);
  if (existing) {
    if (existing.planHash !== plan.planHash) throw new TypeError("Weak Keys content cannot be rebound to another plan");
    return existing;
  }
  const binding = Object.freeze({
    experimentId: PRACTICE_WEAK_KEYS_EXPERIMENT_ID,
    planHash: plan.planHash,
    sessionId: plan.sessionId,
    target: Object.freeze({ ...plan.target }),
    contextBinding: Object.freeze({ ...plan.contextBinding }),
    corpusBinding: Object.freeze({ ...plan.corpusBinding }),
    partition: "training",
    evidenceRole: "training",
  });
  trustedPlans.set(contentPlan, binding);
  return binding;
}

export function getPracticeTrustedWeakKeysBinding(contentPlan) {
  return contentPlan && typeof contentPlan === "object" ? trustedPlans.get(contentPlan) ?? null : null;
}
