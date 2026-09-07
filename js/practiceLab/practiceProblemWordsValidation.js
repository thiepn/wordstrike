import {
  PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION,
  PRACTICE_PROBLEM_WORDS_PHASE_CUES,
  PRACTICE_PROBLEM_WORDS_PHASE_IDS,
  PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS,
  PRACTICE_PROBLEM_WORDS_POLICY_VERSION,
  PRACTICE_PROBLEM_WORDS_TARGET_SOURCES,
  PRACTICE_PROBLEM_WORDS_VERSION,
} from "./practiceProblemWordsConstants.js";

export function validatePracticeProblemWordsPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return Object.freeze({ valid: false, errors: Object.freeze(["plan-required"]) });
  if (plan.version !== PRACTICE_PROBLEM_WORDS_VERSION) errors.push("version");
  if (plan.generatorVersion !== PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION) errors.push("generator-version");
  if (plan.policyVersion !== PRACTICE_PROBLEM_WORDS_POLICY_VERSION) errors.push("policy-version");
  if (plan.partition !== "training" || plan.evidenceRole !== "training" || plan.contentPurpose !== "training") errors.push("training-role");
  if (plan.target?.entityType !== "word" || typeof plan.target?.entityKey !== "string" || !plan.target.entityKey) errors.push("target");
  if (!PRACTICE_PROBLEM_WORDS_TARGET_SOURCES.includes(plan.targetSource)) errors.push("target-source");
  if (plan.targetOpportunityBudget !== PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS.total) errors.push("budget");
  if (plan.resumable !== false || plan.correctionBehavior !== "allow" || plan.completionMode !== "content") errors.push("session-policy");
  if (plan.abilityChannel !== null || plan.performanceMeasurementKind !== null || plan.retentionMeasurementKind !== null || plan.evaluationMeasurementKind !== null || plan.assessmentBinding !== null) errors.push("measurement-privilege");
  const phases = Array.isArray(plan.phases) ? plan.phases : [];
  if (phases.length !== PRACTICE_PROBLEM_WORDS_PHASE_IDS.length) errors.push("phase-count");
  let total = 0;
  PRACTICE_PROBLEM_WORDS_PHASE_IDS.forEach((id, index) => {
    const phase = phases[index];
    if (!phase || phase.id !== id || phase.ordinal !== index + 1) { errors.push(`phase-${id}`); return; }
    if (phase.cue !== PRACTICE_PROBLEM_WORDS_PHASE_CUES[id]) errors.push(`cue-${id}`);
    if (phase.opportunityQuota !== PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS[id]) errors.push(`quota-${id}`);
    const actual = (phase.units ?? []).reduce((sum, unit) => sum + Number(unit?.targetOpportunityCount || 0), 0);
    if (actual !== PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS[id]) errors.push(`unit-quota-${id}`);
    total += actual;
  });
  if (total !== PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS.total) errors.push("total-quota");
  if (!plan.contextBinding?.contextId || !plan.contextBinding?.fingerprint) errors.push("context-binding");
  if (!plan.corpusBinding?.corpusId || !Number.isInteger(Number(plan.corpusBinding?.corpusVersion))) errors.push("corpus-binding");
  if (typeof plan.planHash !== "string" || !plan.planHash) errors.push("plan-hash");
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
