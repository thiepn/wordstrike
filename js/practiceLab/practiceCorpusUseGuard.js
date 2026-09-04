import { PRACTICE_CORPUS_PURPOSE_PARTITIONS } from "./practiceCorpusConstants.js";

export function assertPracticeContentUse({ item, purpose } = {}) {
  const requiredPartition = PRACTICE_CORPUS_PURPOSE_PARTITIONS[purpose];
  if (!requiredPartition) {
    const error = new TypeError(`Unknown Practice corpus content purpose: ${purpose}`);
    error.code = "PRACTICE_CORPUS_UNKNOWN_PURPOSE";
    throw error;
  }
  if (!item || item.partition !== requiredPartition) {
    const error = new TypeError(`Practice corpus content for ${purpose} must come from ${requiredPartition}`);
    error.code = "PRACTICE_CORPUS_PARTITION_MISMATCH";
    error.details = { purpose, requiredPartition, actualPartition: item?.partition ?? null, contentId: item?.contentId ?? null };
    throw error;
  }
  return item;
}
