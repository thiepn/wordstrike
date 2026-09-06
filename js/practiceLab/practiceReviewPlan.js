import { PRACTICE_REVIEW_PLAN_VERSION } from "./practiceReviewConstants.js";
import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const classRank = { overdue: 0, due: 1, scheduled: 2 };
const identity = (type, key) => `${type}\u0000${key}`;

export function buildPracticeReviewPlan({
  queue,
  maxItems = PRACTICE_REVIEW_POLICY_V1.plan.maxBindings,
  maxCostUnits = PRACTICE_REVIEW_POLICY_V1.plan.maxCostUnits,
  includeNearDue = PRACTICE_REVIEW_POLICY_V1.plan.includeNearDueByDefault,
  policy = PRACTICE_REVIEW_POLICY_V1,
} = {}) {
  if (!queue || typeof queue !== "object") throw new TypeError("Practice review plan requires queue snapshot");
  const itemLimit = Math.min(policy.plan.maxBindings, Math.max(1, Number(maxItems) || policy.plan.maxBindings));
  const costLimit = Math.min(policy.plan.maxCostUnits, Math.max(0.5, Number(maxCostUnits) || policy.plan.maxCostUnits));
  const eligible = (Array.isArray(queue.candidates) ? queue.candidates : [])
    .filter((candidate) => candidate.dueStatus === "overdue" || candidate.dueStatus === "due" || (includeNearDue && candidate.dueStatus === "scheduled"))
    .slice()
    .sort((a, b) => (
      (classRank[a.dueStatus] ?? 9) - (classRank[b.dueStatus] ?? 9)
      || Number(b.reviewValuePerCost || 0) - Number(a.reviewValuePerCost || 0)
      || a.entityType.localeCompare(b.entityType)
      || a.entityKey.localeCompare(b.entityKey)
    ));
  const bindings = [];
  let totalCostUnits = 0;
  const seen = new Set();
  for (const candidate of eligible) {
    if (bindings.length >= itemLimit) break;
    const cost = Number(candidate.costUnits || 1);
    if (totalCostUnits + cost > costLimit + 1e-12) continue;
    const binding = candidate.reviewBinding;
    if (!binding || !Number.isInteger(binding.cycleId) || !binding.referenceAtUtc) continue;
    const key = identity(binding.entityType, binding.entityKey);
    if (seen.has(key)) continue;
    seen.add(key);
    bindings.push({
      reviewItemId: binding.reviewItemId,
      cycleId: binding.cycleId,
      referenceAtUtc: binding.referenceAtUtc,
      referenceQuality: binding.referenceQuality,
      entityType: binding.entityType,
      entityKey: binding.entityKey,
      dueAtUtc: binding.dueAtUtc,
      minimumMatureAtUtc: binding.minimumMatureAtUtc,
      excludeFamilyIds: Array.isArray(binding.excludeFamilyIds) ? binding.excludeFamilyIds.slice(-policy.reviewItem.maxRecentProbeFamilies) : [],
    });
    totalCostUnits += cost;
  }
  return freezeDeep({
    planVersion: PRACTICE_REVIEW_PLAN_VERSION,
    profileId: queue.profileId,
    contextId: queue.contextId,
    createdAt: queue.generatedAt,
    totalCostUnits,
    bindings,
  });
}

export async function validatePracticeReviewPlanForPreparation({
  plan,
  repository,
  profileId,
  contextId,
  contentPlan,
  policy = PRACTICE_REVIEW_POLICY_V1,
} = {}) {
  const fail = (code, reason) => ({ valid: false, code, reason });
  if (!plan || plan.planVersion !== PRACTICE_REVIEW_PLAN_VERSION) return fail("PRACTICE_REVIEW_PLAN_STALE", "unsupported-plan-version");
  if (plan.profileId !== profileId || plan.contextId !== contextId) return fail("PRACTICE_REVIEW_PLAN_STALE", "plan-context-mismatch");
  if (!Array.isArray(plan.bindings) || plan.bindings.length < 1 || plan.bindings.length > policy.plan.maxBindings) return fail("PRACTICE_REVIEW_PLAN_STALE", "binding-count");
  const targets = new Set((contentPlan?.targetEntities ?? []).map((target) => identity(target.entityType, target.entityKey)));
  const reviewItems = typeof repository?.listReviewItems === "function"
    ? await repository.listReviewItems(profileId, contextId)
    : (await repository.listReviewItemsAcrossContexts(profileId)).filter((item) => item.contextId === contextId);
  const byId = new Map(reviewItems.map((item) => [item.reviewItemId, item]));
  const seen = new Set();
  for (const binding of plan.bindings) {
    if (seen.has(binding.reviewItemId)) return fail("PRACTICE_REVIEW_PLAN_STALE", "duplicate-review-item");
    seen.add(binding.reviewItemId);
    const item = byId.get(binding.reviewItemId);
    if (!item || item.state !== "active") return fail("PRACTICE_REVIEW_PLAN_STALE", "review-item-inactive");
    if (item.profileId !== profileId || item.contextId !== contextId || item.entityType !== binding.entityType || item.entityKey !== binding.entityKey) return fail("PRACTICE_REVIEW_PLAN_STALE", "binding-identity-mismatch");
    if (item.cycle?.cycleId !== binding.cycleId || item.cycle?.referenceAtUtc !== binding.referenceAtUtc) return fail("PRACTICE_REVIEW_PLAN_STALE", "cycle-changed");
    if (!targets.has(identity(binding.entityType, binding.entityKey))) return fail("PRACTICE_REVIEW_PLAN_TARGET_MISMATCH", "content-target-missing");
  }
  return { valid: true, code: null, reason: null, reviewItems: plan.bindings.map((binding) => byId.get(binding.reviewItemId)) };
}
