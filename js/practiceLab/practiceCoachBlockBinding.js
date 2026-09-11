import { PRACTICE_COACH_PLANNER_VERSION } from "./practiceCoachConstants.js";

const trusted = new WeakMap();

function freezeBinding(binding) {
  return Object.freeze({
    coachPlanId: binding.coachPlanId,
    blockId: binding.blockId,
    blockOrdinal: binding.blockOrdinal,
    plannerVersion: binding.plannerVersion,
    planHash: binding.planHash,
  });
}

export function validatePracticeCoachBlockBinding(binding) {
  const errors = [];
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) return { valid: false, errors: [{ path: "coachBinding", code: "TYPE", message: "coachBinding must be an object" }] };
  if (typeof binding.coachPlanId !== "string" || !binding.coachPlanId.startsWith("practice-coach_") || binding.coachPlanId.length > 1500) errors.push({ path: "coachPlanId", code: "IDENTITY", message: "coachPlanId is invalid" });
  if (typeof binding.blockId !== "string" || !binding.blockId || binding.blockId.length > 80) errors.push({ path: "blockId", code: "IDENTITY", message: "blockId is invalid" });
  if (!Number.isInteger(binding.blockOrdinal) || binding.blockOrdinal < 1 || binding.blockOrdinal > 4) errors.push({ path: "blockOrdinal", code: "RANGE", message: "blockOrdinal must be 1..4" });
  if (![1, PRACTICE_COACH_PLANNER_VERSION].includes(binding.plannerVersion)) errors.push({ path: "plannerVersion", code: "VERSION", message: "Coach planner version is unsupported" });
  if (typeof binding.planHash !== "string" || !/^fnv1a32-[0-9a-f]{8}$/.test(binding.planHash)) errors.push({ path: "planHash", code: "HASH", message: "Coach plan hash is invalid" });
  const allowed = new Set(["coachPlanId", "blockId", "blockOrdinal", "plannerVersion", "planHash"]);
  for (const key of Object.keys(binding)) if (!allowed.has(key)) errors.push({ path: key, code: "UNEXPECTED", message: "coachBinding contains an unexpected field" });
  return { valid: errors.length === 0, errors };
}

export function createPracticeCoachBlockBinding(plan, block) {
  const binding = freezeBinding({
    coachPlanId: plan?.coachPlanId,
    blockId: block?.blockId,
    blockOrdinal: block?.ordinal,
    plannerVersion: plan?.plannerVersion,
    planHash: plan?.planHash,
  });
  const validation = validatePracticeCoachBlockBinding(binding);
  if (!validation.valid) {
    const error = new TypeError("Invalid Practice Coach block binding");
    error.details = validation.errors;
    throw error;
  }
  return binding;
}

export function trustPracticeCoachContentPlan(contentPlan, binding) {
  if (!contentPlan || typeof contentPlan !== "object") throw new TypeError("Coach trust requires a content plan object");
  const validation = validatePracticeCoachBlockBinding(binding);
  if (!validation.valid) throw new TypeError("Coach binding failed validation");
  trusted.set(contentPlan, freezeBinding(binding));
  return contentPlan;
}

export function getPracticeTrustedCoachBinding(contentPlan) {
  return contentPlan && typeof contentPlan === "object" ? trusted.get(contentPlan) ?? null : null;
}
