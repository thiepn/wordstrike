import { createPracticeContentPlan } from "./practiceSessionContract.js";
import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";
import { hashPracticeContent } from "./practiceIds.js";
import { PRACTICE_COACH_REVIEW_GENERATOR_VERSION } from "./practiceCoachConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function targetCount(word, entityType, entityKey) {
  const source = String(word).normalize("NFC").toLowerCase();
  const target = String(entityKey).normalize("NFC").toLowerCase();
  if (!target) return 0;
  if (entityType === "word") return source === target ? 1 : 0;
  const sourceChars = Array.from(source);
  const targetChars = Array.from(target);
  if (!targetChars.length || sourceChars.length < targetChars.length) return 0;
  let count = 0;
  for (let i = 0; i <= sourceChars.length - targetChars.length; i += 1) {
    if (targetChars.every((char, offset) => sourceChars[i + offset] === char)) count += 1;
  }
  return count;
}

function exactTokenSelection(candidates, targetCountNeeded) {
  const bounded = candidates.slice(0, 128);
  const states = Array(targetCountNeeded + 1).fill(null);
  states[0] = [];
  for (let amount = 0; amount <= targetCountNeeded; amount += 1) {
    if (!states[amount]) continue;
    for (let index = 0; index < bounded.length; index += 1) {
      const candidate = bounded[index];
      const next = amount + candidate.opportunityCount;
      if (next > targetCountNeeded || states[next]) continue;
      states[next] = [...states[amount], candidate];
    }
  }
  if (states[targetCountNeeded]) return states[targetCountNeeded];
  const singles = bounded.filter((candidate) => candidate.opportunityCount === 1);
  if (!singles.length) return null;
  return Array.from({ length: targetCountNeeded }, (_, index) => singles[index % singles.length]);
}

async function buildFreshLexicalCandidates(binding, targetIndex) {
  const exclude = new Set(binding.excludeFamilyIds ?? []);
  const wordKeys = await targetIndex.getTargetWordRefs({
    partition: "training",
    purpose: "training",
    entityType: binding.entityType,
    entityKey: binding.entityKey,
  });
  const candidates = [];
  for (const lexicalKey of [...new Set(wordKeys)].sort()) {
    const count = targetCount(lexicalKey, binding.entityType, binding.entityKey);
    if (count < 1) continue;
    const summary = await targetIndex.getWordSummary({ partition: "training", purpose: "training", lexicalKey });
    const refs = (summary?.contents ?? [])
      .filter((ref) => ref?.familyId && !exclude.has(ref.familyId))
      .sort((a, b) => a.familyId.localeCompare(b.familyId) || a.contentId.localeCompare(b.contentId));
    if (!refs.length) continue;
    candidates.push({ lexicalKey, opportunityCount: count, familyId: refs[0].familyId, contentId: refs[0].contentId });
  }
  return candidates.sort((a, b) => a.opportunityCount - b.opportunityCount
    || a.familyId.localeCompare(b.familyId)
    || a.lexicalKey.localeCompare(b.lexicalKey));
}

async function buildProbeForBinding(binding, targetIndex, policy) {
  const required = policy.probe.minimumOpportunities?.[binding.entityType];
  if (!Number.isInteger(required) || required < 1) return null;
  const candidates = await buildFreshLexicalCandidates(binding, targetIndex);
  if (!candidates.length) return null;
  const tokens = exactTokenSelection(candidates, required);
  if (!tokens || tokens.reduce((sum, token) => sum + token.opportunityCount, 0) !== required) return null;
  return {
    binding,
    requiredOpportunities: required,
    tokens,
    familyIds: [...new Set(tokens.map((token) => token.familyId))],
  };
}

function interleaveProbes(probes) {
  const output = [];
  let index = 0;
  while (true) {
    let added = false;
    for (let probeIndex = 0; probeIndex < probes.length; probeIndex += 1) {
      const token = probes[probeIndex].tokens[index];
      if (!token) continue;
      output.push({ ...token, probeIndex });
      added = true;
    }
    if (!added) break;
    index += 1;
  }
  return output;
}

export function createPracticeCoachReviewContentHash(contentPlan, reviewPlan) {
  return hashPracticeContent(JSON.stringify({
    generatorVersion: PRACTICE_COACH_REVIEW_GENERATOR_VERSION,
    contentHash: contentPlan?.contentHash ?? null,
    bindings: (reviewPlan?.bindings ?? []).map((binding) => ({
      reviewItemId: binding.reviewItemId,
      cycleId: binding.cycleId,
      referenceAtUtc: binding.referenceAtUtc,
      entityType: binding.entityType,
      entityKey: binding.entityKey,
    })),
  }));
}

export async function buildPracticeCoachReviewPreflight({
  sessionId,
  reviewPlan,
  targetIndex,
  policy = PRACTICE_REVIEW_POLICY_V1,
} = {}) {
  if (typeof sessionId !== "string" || !sessionId) throw new TypeError("Coach Review preflight requires plannedSessionId");
  if (!reviewPlan || !Array.isArray(reviewPlan.bindings) || !targetIndex) throw new TypeError("Coach Review preflight requires review plan and target index");
  const probes = [];
  for (const binding of reviewPlan.bindings.slice(0, 4)) {
    const probe = await buildProbeForBinding(binding, targetIndex, policy);
    if (probe) probes.push(probe);
  }
  if (!probes.length) return freezeDeep({ status: "unavailable", reason: "no-fresh-family", reviewPlan: null, contentPlan: null, reviewContentPlanHash: null });
  const tokens = interleaveProbes(probes);
  const textParts = [];
  const unitDrafts = [];
  let cursor = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    if (index) { textParts.push(" "); cursor += 1; }
    const token = tokens[index];
    const text = token.lexicalKey;
    const length = Array.from(text).length;
    textParts.push(text);
    unitDrafts.push({
      unitId: `review-token-${index + 1}`,
      type: "word",
      startIndex: cursor,
      endIndex: cursor + length,
      text,
      metadata: {
        generated: true,
        sourceFamilyId: token.familyId,
        sourceContentId: token.contentId,
        reviewItemId: probes[token.probeIndex].binding.reviewItemId,
      },
    });
    cursor += length;
  }
  const selectedBindings = probes.map((probe) => ({ ...probe.binding }));
  const compactReviewPlan = {
    ...reviewPlan,
    totalCostUnits: reviewPlan.totalCostUnits,
    bindings: selectedBindings,
  };
  const contentPlan = createPracticeContentPlan({
    contentId: `practice-content_coach-review-${hashPracticeContent(sessionId).slice(-8)}`,
    contentGeneratorVersion: PRACTICE_COACH_REVIEW_GENERATOR_VERSION,
    text: textParts.join(""),
    units: unitDrafts,
    targetEntities: selectedBindings.map((binding) => ({ entityType: binding.entityType, entityKey: binding.entityKey, directTarget: true })),
    completion: { mode: "content", value: null },
    metadata: {
      partition: "training",
      purpose: "retention-review",
      coachReview: {
        generatorVersion: PRACTICE_COACH_REVIEW_GENERATOR_VERSION,
        plannedSessionId: sessionId,
        interleaved: probes.length > 1,
        probes: probes.map((probe) => ({
          reviewItemId: probe.binding.reviewItemId,
          opportunityCount: probe.requiredOpportunities,
          familyIds: probe.familyIds,
        })),
      },
    },
  });
  const reviewContentPlanHash = createPracticeCoachReviewContentHash(contentPlan, compactReviewPlan);
  return freezeDeep({
    status: "ready",
    reason: null,
    reviewPlan: { ...compactReviewPlan, reviewContentPlanHash },
    contentPlan,
    reviewContentPlanHash,
  });
}
