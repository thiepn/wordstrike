import { PRACTICE_COMBINATION_REPAIR_EXPERIMENT_ID } from "./practiceCombinationRepairConstants.js";
import { validatePracticeCombinationRepairPlan } from "./practiceCombinationRepairValidation.js";

const trustedPlans = new WeakMap();

const sameBinding = (left, right) => left?.corpusId === right?.corpusId
  && Number(left?.corpusVersion) === Number(right?.corpusVersion)
  && Number(left?.indexVersion) === Number(right?.indexVersion)
  && (left?.manifestHash ?? null) === (right?.manifestHash ?? null);

function validateContentBinding(contentPlan, plan) {
  const planValidation = validatePracticeCombinationRepairPlan(plan);
  if (!planValidation.valid) return { valid: false, reason: "invalid-plan", details: planValidation.errors };
  if (!contentPlan || typeof contentPlan !== "object") return { valid: false, reason: "invalid-content-plan" };
  if (contentPlan.completion?.mode !== "content") return { valid: false, reason: "invalid-completion" };
  if (contentPlan.metadata?.partition !== "training") return { valid: false, reason: "invalid-partition" };
  if (contentPlan.metadata?.combinationRepair?.planHash !== plan.planHash) return { valid: false, reason: "plan-hash-mismatch" };
  if (contentPlan.metadata?.combinationRepair?.resumable !== false) return { valid: false, reason: "resumable-content" };
  if (contentPlan.metadata?.combinationRepair?.completionMode !== "content") return { valid: false, reason: "completion-mode-mismatch" };
  if (!sameBinding(contentPlan.metadata?.corpusBinding, plan.corpusBinding)) return { valid: false, reason: "corpus-binding-mismatch" };
  const targets = contentPlan.targetEntities ?? [];
  if (targets.length !== 1) return { valid: false, reason: "target-count" };
  const target = targets[0];
  if (target.entityType !== plan.target.entityType || target.entityKey !== plan.target.entityKey || target.directTarget !== true) return { valid: false, reason: "target-mismatch" };
  return { valid: true };
}

export function trustPracticeCombinationRepairContentPlan(contentPlan, plan) {
  const validation = validateContentBinding(contentPlan, plan);
  if (!validation.valid) {
    const error = new TypeError(`Combination Repair trusted binding rejected: ${validation.reason}`);
    error.code = "PRACTICE_COMBINATION_REPAIR_TRUST_REJECTED";
    error.details = validation.details ?? null;
    throw error;
  }
  const existing = trustedPlans.get(contentPlan);
  if (existing) {
    if (existing.planHash !== plan.planHash) throw new TypeError("Combination Repair content cannot be rebound to a different plan");
    return existing;
  }
  const binding = Object.freeze({
    experimentId: PRACTICE_COMBINATION_REPAIR_EXPERIMENT_ID,
    planHash: plan.planHash,
    target: Object.freeze({ ...plan.target }),
    corpusBinding: Object.freeze({ ...plan.corpusBinding }),
    partition: "training",
    evidenceRole: "training",
  });
  trustedPlans.set(contentPlan, binding);
  return binding;
}

export function getPracticeTrustedCombinationRepairBinding(contentPlan) {
  return contentPlan && typeof contentPlan === "object" ? trustedPlans.get(contentPlan) ?? null : null;
}

export function isPracticeTrustedCombinationRepairContentPlan(contentPlan) {
  return getPracticeTrustedCombinationRepairBinding(contentPlan) !== null;
}
