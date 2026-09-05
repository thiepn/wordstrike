import {
  PRACTICE_LIMITS,
  QUOTA_RECOVERY_STEPS,
} from "./practiceConstants.js";

const time = (value, fallback = 0) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function oldest(records, field = "updatedAt") {
  return [...records].sort((a, b) => time(a[field]) - time(b[field]));
}

function isProtectedSession(record, preserveSessionIds) {
  return record.experimentId === "full-assessment"
    || record.milestone === true
    || preserveSessionIds.has(record.sessionId);
}

function sessionDeletes(records, nowMs, preserveSessionIds) {
  const protectedIds = new Set(preserveSessionIds || []);
  const sorted = oldest(records, "completedAtUtc");
  const deletions = new Set();
  const maximumAge = nowMs - PRACTICE_LIMITS.sessionSummaryDays * 86400000;
  for (const record of sorted) {
    if (!isProtectedSession(record, protectedIds) && time(record.completedAtUtc) < maximumAge) {
      deletions.add(record.sessionId);
    }
  }
  const survivors = sorted.filter((record) => !deletions.has(record.sessionId));
  const target = records.length > PRACTICE_LIMITS.sessionSummaryHardCap
    ? PRACTICE_LIMITS.sessionSummaryHardCap
    : PRACTICE_LIMITS.sessionSummarySoftCap;
  for (const record of survivors) {
    if (records.length - deletions.size <= target) break;
    if (!isProtectedSession(record, protectedIds)) deletions.add(record.sessionId);
  }
  return [...deletions];
}

function skillDeletes(records, reviewItems = []) {
  const caps = { bigram: PRACTICE_LIMITS.bigramStats, trigram: PRACTICE_LIMITS.trigramStats, word: PRACTICE_LIMITS.wordStats };
  const linked = new Set(reviewItems.map((record) => `${record.profileId}\0${record.contextId}\0${record.entityType}\0${record.entityKey}`));
  const identity = (record) => `${record.profileId}\0${record.contextId}\0${record.entityType}\0${record.entityKey}`;
  const deletions = [];
  const compare = (a, b) => (
    (a.confidenceScore || 0) - (b.confidenceScore || 0)
    || (a.evidence?.observation?.targetedSessionCount || 0) - (b.evidence?.observation?.targetedSessionCount || 0)
    || (a.evidence?.opportunities?.count || 0) - (b.evidence?.opportunities?.count || 0)
    || time(a.lastObservedAt || a.updatedAt) - time(b.lastObservedAt || b.updatedAt)
    || (a.priority || 0) - (b.priority || 0)
    || String(a.statId).localeCompare(String(b.statId))
  );
  for (const [type, cap] of Object.entries(caps)) {
    const group = records.filter((record) => record.entityType === type);
    if (group.length <= cap) continue;
    const candidates = group.filter((record) => !linked.has(identity(record))).sort(compare);
    deletions.push(...candidates.slice(0, Math.min(candidates.length, group.length - cap)).map((record) => record.statId));
  }
  const patterns = records.filter((record) => ["punctuation-transition", "number-pattern", "symbol-pattern"].includes(record.entityType));
  if (patterns.length > PRACTICE_LIMITS.patternStats) {
    const candidates = patterns.filter((record) => !linked.has(identity(record))).sort(compare);
    deletions.push(...candidates.slice(0, Math.min(candidates.length, patterns.length - PRACTICE_LIMITS.patternStats)).map((record) => record.statId));
  }
  return [...new Set(deletions)];
}

function reviewDeletes(records) {
  const deletions = new Set();
  const activeByEntity = new Map();
  for (const record of [...records].sort((a, b) => time(b.updatedAt) - time(a.updatedAt))) {
    const key = `${record.profileId}:\0${record.contextId}:\0${record.entityType}:\0${record.entityKey}`;
    if (activeByEntity.has(key)) deletions.add(record.reviewItemId);
    else activeByEntity.set(key, record.reviewItemId);
  }
  if (records.length - deletions.size > PRACTICE_LIMITS.reviewItems) {
    const candidates = oldest(records.filter((record) => !deletions.has(record.reviewItemId)))
      .sort((a, b) => {
        const aPriority = ["mastered", "suspended"].includes(a.state) ? 0 : 1;
        const bPriority = ["mastered", "suspended"].includes(b.state) ? 0 : 1;
        return aPriority - bPriority || time(a.updatedAt) - time(b.updatedAt);
      });
    for (const record of candidates) {
      if (records.length - deletions.size <= PRACTICE_LIMITS.reviewItems) break;
      deletions.add(record.reviewItemId);
    }
  }
  return [...deletions];
}

export function buildPracticeRetentionPlan({
  now = Date.now(),
  checkpoints = [],
  sessionSummaries = [],
  skillStats = [],
  reviewItems = [],
  quarantine = [],
  preserveSessionIds = [],
} = {}) {
  const nowMs = typeof now === "function" ? Number(now()) : Number(now);
  return Object.freeze({
    order: QUOTA_RECOVERY_STEPS,
    activeSessionCheckpoints: checkpoints
      .filter((record) => time(record.expiresAt, Infinity) <= nowMs)
      .map((record) => record.profileId),
    sessionSummaries: sessionDeletes(sessionSummaries, nowMs, preserveSessionIds),
    reviewItems: reviewDeletes(reviewItems),
    skillStats: skillDeletes(skillStats, reviewItems),
    quarantine: oldest(quarantine, "detectedAt")
      .slice(0, Math.max(0, quarantine.length - PRACTICE_LIMITS.quarantineRecords))
      .map((record) => record.quarantineId),
    customTexts: Object.freeze([]),
  });
}

export function hasMeaningfulAbandonedActivity({
  typedCharacterCount = 0,
  activeDurationMs = 0,
} = {}) {
  return typedCharacterCount >= PRACTICE_LIMITS.abandonmentCharacters
    || activeDurationMs >= PRACTICE_LIMITS.abandonmentActiveMs;
}
