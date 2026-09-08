import { PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID, PRACTICE_ACCURACY_RECOVERY_PHASE_QUOTAS } from "./practiceAccuracyRecoveryConstants.js";

const trustedPlans = new WeakMap();
const sameContext = (a, b) => a?.contextId === b?.contextId && a?.fingerprint === b?.fingerprint && a?.dataLocale === b?.dataLocale && a?.keyboardLayout === b?.keyboardLayout && a?.inputMethod === b?.inputMethod && (a?.hardwareProfileId ?? null) === (b?.hardwareProfileId ?? null);
const sameCorpus = (a, b) => a?.corpusId === b?.corpusId && Number(a?.corpusVersion) === Number(b?.corpusVersion) && Number(a?.indexVersion) === Number(b?.indexVersion) && (a?.manifestHash ?? null) === (b?.manifestHash ?? null);

export function assertPracticeAccuracyRecoverySessionContext(plan, context) {
  if (!sameContext(plan?.contextBinding, context)) { const error = new Error("Accuracy & Recovery active Practice context changed after the immutable plan was built"); error.code = "PRACTICE_ACCURACY_RECOVERY_CONTEXT_MISMATCH"; throw error; }
  return true;
}

export function trustPracticeAccuracyRecoveryContentPlan(contentPlan, plan) {
  const metadata = contentPlan?.metadata?.accuracyRecovery;
  const quota = PRACTICE_ACCURACY_RECOVERY_PHASE_QUOTAS[plan?.target?.entityType];
  if (!plan || plan.experimentId !== PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID || plan.partition !== "training" || !quota || plan.targetOpportunityBudget !== quota.total || !contentPlan || contentPlan.completion?.mode !== "content" || contentPlan.metadata?.partition !== "training" || metadata?.planHash !== plan.planHash || !sameCorpus(contentPlan.metadata?.corpusBinding, plan.corpusBinding) || !sameContext(metadata?.contextBinding, plan.contextBinding)) throw new TypeError("Accuracy & Recovery trusted content binding rejected");
  const targets = contentPlan.targetEntities ?? [];
  if (targets.length !== 1 || targets[0]?.entityType !== plan.target.entityType || targets[0]?.entityKey !== plan.target.entityKey || targets[0]?.directTarget !== true) throw new TypeError("Accuracy & Recovery trusted target mismatch");
  const existing = trustedPlans.get(contentPlan); if (existing) { if (existing.planHash !== plan.planHash) throw new TypeError("Accuracy & Recovery content cannot be rebound"); return existing; }
  const binding = Object.freeze({ experimentId: PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID, planHash: plan.planHash, sessionId: plan.sessionId, target: Object.freeze({ ...plan.target }), contextBinding: Object.freeze({ ...plan.contextBinding }), corpusBinding: Object.freeze({ ...plan.corpusBinding }), partition: "training", evidenceRole: "training" });
  trustedPlans.set(contentPlan, binding); return binding;
}
export function getPracticeTrustedAccuracyRecoveryBinding(contentPlan) { return contentPlan && typeof contentPlan === "object" ? trustedPlans.get(contentPlan) ?? null : null; }
