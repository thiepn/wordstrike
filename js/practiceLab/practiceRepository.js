import { createPracticeRepository as createLegacyPracticeRepository } from "./practiceRepositoryLegacy.js";
import { derivePracticeReviewDueStatus } from "./practiceReviewItem.js";
import { toPracticeUtcIso } from "./practiceTime.js";

export function createPracticeRepository(options = {}) {
  const { dataStore, now = Date.now } = options;
  const core = createLegacyPracticeRepository(options);
  if (!dataStore) return core;

  const listReviewItems = async (profileId, contextId = null) => {
    const resolvedContextId = contextId ?? (await core.getPracticeProfile())?.activeContextId ?? null;
    if (!resolvedContextId) return [];
    const records = await dataStore.query("reviewItems", "contextId", resolvedContextId);
    return records.filter((record) => record.profileId === profileId && record.contextId === resolvedContextId);
  };

  return Object.freeze({
    ...core,
    listReviewItems,
    async listDueReviewItems(profileId, contextId = null, dueAtUtc = toPracticeUtcIso(now)) {
      const items = await listReviewItems(profileId, contextId);
      const queryNow = new Date(dueAtUtc);
      return items
        .map((item) => ({ item, dueStatus: derivePracticeReviewDueStatus(item, queryNow) }))
        .filter(({ dueStatus }) => dueStatus === "due" || dueStatus === "overdue")
        .sort((a, b) => (
          (a.dueStatus === "overdue" ? 0 : 1) - (b.dueStatus === "overdue" ? 0 : 1)
          || String(a.item.dueAtUtc).localeCompare(String(b.item.dueAtUtc))
          || a.item.entityType.localeCompare(b.item.entityType)
          || a.item.entityKey.localeCompare(b.item.entityKey)
        ))
        .map(({ item }) => item);
    },
    deleteReviewItem(reviewItemId) {
      return dataStore.delete("reviewItems", reviewItemId);
    },
  });
}
