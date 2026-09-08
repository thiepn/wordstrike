import { createPracticeContentPlan, createPracticeSegmenter } from "./practiceSessionContract.js";
import { PRACTICE_REAL_TEXT_ERRORS, PRACTICE_REAL_TEXT_GENERATOR_VERSION } from "./practiceRealTextConstants.js";
import { validatePracticeRealTextPlan } from "./practiceRealTextPlan.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const fail = (code, message, details = null) => Object.assign(new Error(message), { code, details, recoverable: true });

export function buildPracticeRealTextContentPlan({ plan, pool, contentItems = [], segmenter = null } = {}) {
  if (!validatePracticeRealTextPlan(plan, pool)) throw fail(PRACTICE_REAL_TEXT_ERRORS.POOL_STALE, "Real Text plan is stale for this pool");
  const byId = new Map(contentItems.filter((item) => item?.partition === "training").map((item) => [item.contentId, item]));
  const segment = createPracticeSegmenter(segmenter);
  const pieces = [];
  const units = [];
  let cursor = 0;
  for (const [selectedIndex, selected] of plan.selectedUnits.entries()) {
    for (const contentId of selected.orderedContentIds) {
      const item = byId.get(contentId);
      const expectedHash = selected.contentHashes[contentId];
      if (!item || item.partition !== "training" || item.contentHash !== expectedHash) throw fail(PRACTICE_REAL_TEXT_ERRORS.CONTENT_HASH_MISMATCH, `Real Text source content changed: ${contentId}`);
      if (pieces.length) { pieces.push(plan.separator); cursor += segment(plan.separator).length; }
      const startIndex = cursor;
      const graphemes = segment(item.text);
      pieces.push(item.text);
      cursor += graphemes.length;
      units.push({
        unitId: `realtext-${selectedIndex + 1}-${units.length + 1}`,
        type: item.contentType === "sentence" ? "sentence" : "paragraph",
        startIndex,
        endIndex: cursor,
        text: item.text,
        metadata: {
          sourceContentId: item.contentId,
          sourceFamilyId: item.familyId,
          realTextUnitId: selected.unitId,
        },
      });
    }
  }
  if (cursor < plan.requiredGraphemes) throw fail(PRACTICE_REAL_TEXT_ERRORS.INSUFFICIENT_CAPACITY, "Materialized Real Text content is below the fixed duration capacity", { expected: plan.requiredGraphemes, actual: cursor });
  return createPracticeContentPlan({
    contentId: `practice-content_real-text-${plan.planHash}`.replace(/[^a-z0-9._-]/gi, "-"),
    contentGeneratorVersion: PRACTICE_REAL_TEXT_GENERATOR_VERSION,
    text: pieces.join(""),
    units,
    targetEntities: [],
    completion: { mode: "duration", value: plan.durationMs },
    metadata: {
      sourceType: "real-text-training",
      partition: "training",
      language: plan.language,
      realTextVersion: plan.version,
      realTextPlanHash: plan.planHash,
      realTextPoolId: plan.poolId,
      realTextPoolVersion: plan.poolVersion,
      realTextPoolChecksum: plan.poolChecksum,
      selectedUnitIds: plan.selectedUnits.map((unit) => unit.unitId),
      requiredGraphemes: plan.requiredGraphemes,
      selectedGraphemeCapacity: plan.selectedGraphemeCapacity,
    },
  }, { segmenter });
}

export function createPracticeRealTextContentLoader({ loadTrainingContentItems } = {}) {
  if (typeof loadTrainingContentItems !== "function") throw new TypeError("Real Text loader requires an explicit training-content loader");
  return async ({ plan, pool, segmenter = null }) => {
    const ids = [...new Set(plan.selectedUnits.flatMap((unit) => unit.orderedContentIds))];
    const items = await loadTrainingContentItems({ partition: "training", contentIds: ids });
    if (!Array.isArray(items) || items.length !== ids.length) throw fail(PRACTICE_REAL_TEXT_ERRORS.CONTENT_HASH_MISMATCH, "Real Text training loader returned incomplete content");
    return freezeDeep(buildPracticeRealTextContentPlan({ plan, pool, contentItems: items, segmenter }));
  };
}
