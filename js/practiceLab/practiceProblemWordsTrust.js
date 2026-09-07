import { PRACTICE_PROBLEM_WORDS_EXPERIMENT_ID } from "./practiceProblemWordsConstants.js";
import { validatePracticeProblemWordsPlan } from "./practiceProblemWordsValidation.js";

const trustedPlans = new WeakMap();
const sameBinding = (a, b) => a?.corpusId === b?.corpusId && Number(a?.corpusVersion) === Number(b?.corpusVersion) && Number(a?.indexVersion) === Number(b?.indexVersion) && (a?.manifestHash ?? null) === (b?.manifestHash ?? null);
const sameContext = (a, b) => a?.contextId === b?.contextId && a?.fingerprint === b?.fingerprint && a?.dataLocale === b?.dataLocale && a?.keyboardLayout === b?.keyboardLayout && a?.inputMethod === b?.inputMethod && (a?.hardwareProfileId ?? null) === (b?.hardwareProfileId ?? null);

export function assertPracticeProblemWordsSessionContext(plan, context) {
  if (!sameContext(plan?.contextBinding, context)) {
    const error = new Error("Problem Words active Practice context changed after the immutable plan was built");
    error.code = "PRACTICE_PROBLEM_WORDS_CONTEXT_MISMATCH";
    throw error;
  }
  return true;
}

export function trustPracticeProblemWordsContentPlan(contentPlan, plan) {
  const validation = validatePracticeProblemWordsPlan(plan);
  if (!validation.valid || !contentPlan || contentPlan.completion?.mode !== "content" || contentPlan.metadata?.partition !== "training" || contentPlan.metadata?.problemWords?.planHash !== plan.planHash || !sameBinding(contentPlan.metadata?.corpusBinding, plan.corpusBinding) || !sameContext(contentPlan.metadata?.problemWords?.contextBinding, plan.contextBinding)) {
    const error = new TypeError("Problem Words trusted content binding rejected"); error.code = "PRACTICE_PROBLEM_WORDS_TRUST_REJECTED"; throw error;
  }
  const targets = contentPlan.targetEntities ?? [];
  if (targets.length !== 1 || targets[0]?.entityType !== "word" || targets[0]?.entityKey !== plan.target.entityKey || targets[0]?.directTarget !== true) throw new TypeError("Problem Words trusted target mismatch");
  const existing = trustedPlans.get(contentPlan);
  if (existing) { if (existing.planHash !== plan.planHash) throw new TypeError("Problem Words content cannot be rebound"); return existing; }
  const binding = Object.freeze({ experimentId: PRACTICE_PROBLEM_WORDS_EXPERIMENT_ID, planHash: plan.planHash, sessionId: plan.sessionId, target: Object.freeze({ ...plan.target }), contextBinding: Object.freeze({ ...plan.contextBinding }), corpusBinding: Object.freeze({ ...plan.corpusBinding }), partition: "training", evidenceRole: "training" });
  trustedPlans.set(contentPlan, binding); return binding;
}
export function getPracticeTrustedProblemWordsBinding(contentPlan) { return contentPlan && typeof contentPlan === "object" ? trustedPlans.get(contentPlan) ?? null : null; }
