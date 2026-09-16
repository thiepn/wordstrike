import { PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID, PRACTICE_WEAKNESS_BOSS_PHASES, PRACTICE_WEAKNESS_BOSS_QUOTAS } from "./practiceWeaknessBossConstants.js";

const trustedPlans = new WeakMap();
const sameContext = (left, right) => left?.contextId === right?.contextId
  && left?.fingerprint === right?.fingerprint
  && left?.dataLocale === right?.dataLocale
  && left?.keyboardLayout === right?.keyboardLayout
  && left?.inputMethod === right?.inputMethod
  && (left?.hardwareProfileId ?? null) === (right?.hardwareProfileId ?? null);

export function assertPracticeWeaknessBossSessionContext(plan, context) {
  if (!sameContext(plan?.contextBinding, context)) {
    const error = new Error("Weakness Boss active Practice context changed after the frozen plan was built");
    error.code = "PRACTICE_WEAKNESS_BOSS_CONTEXT_MISMATCH";
    throw error;
  }
  return true;
}

function validateBinding(contentPlan, plan) {
  if (!contentPlan || !plan?.planHash) return false;
  const metadata = contentPlan.metadata?.weaknessBoss;
  if (!metadata || metadata.planHash !== plan.planHash || metadata.resumable !== false || metadata.completionMode !== "content") return false;
  if (contentPlan.completion?.mode !== "content" || contentPlan.metadata?.partition !== "training") return false;
  if (!sameContext(metadata.contextBinding, plan.contextBinding)) return false;
  const targets = contentPlan.targetEntities ?? [];
  if (targets.length !== 1 || targets[0]?.entityType !== plan.target.entityType || targets[0]?.entityKey !== plan.target.entityKey || targets[0]?.directTarget !== true) return false;
  const quotas = PRACTICE_WEAKNESS_BOSS_QUOTAS[plan.target.entityType];
  const ranges = metadata.phaseRanges ?? [];
  if (ranges.length !== PRACTICE_WEAKNESS_BOSS_PHASES.length) return false;
  return PRACTICE_WEAKNESS_BOSS_PHASES.every((phase, index) => ranges[index]?.id === phase.id && ranges[index]?.opportunityQuota === quotas[phase.id]);
}

export function trustPracticeWeaknessBossContentPlan(contentPlan, plan) {
  if (!validateBinding(contentPlan, plan)) {
    const error = new TypeError("Weakness Boss trusted content binding was rejected");
    error.code = "PRACTICE_WEAKNESS_BOSS_TRUST_REJECTED";
    throw error;
  }
  const existing = trustedPlans.get(contentPlan);
  if (existing) {
    if (existing.planHash !== plan.planHash) throw new TypeError("Weakness Boss content cannot be rebound to another plan");
    return existing;
  }
  const binding = Object.freeze({
    experimentId: PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID,
    planHash: plan.planHash,
    sessionId: plan.sessionId,
    target: Object.freeze({ ...plan.target }),
    contextBinding: Object.freeze({ ...plan.contextBinding }),
    corpusBinding: Object.freeze({ ...plan.corpusBinding }),
    partition: "training",
    evidenceRole: "training",
    acquisitionDosePhaseIds: Object.freeze(["break-guard", "pressure", "final-form"]),
  });
  trustedPlans.set(contentPlan, binding);
  return binding;
}

export function getPracticeTrustedWeaknessBossBinding(contentPlan) {
  return contentPlan && typeof contentPlan === "object" ? trustedPlans.get(contentPlan) ?? null : null;
}
