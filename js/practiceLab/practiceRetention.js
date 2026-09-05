import {
  PRACTICE_LIMITS,
  QUOTA_RECOVERY_STEPS,
} from "./practiceConstants.js";

const time = (value, fallback = 0) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const entityIdentity = (record) => `${record.profileId}\0${record.contextId}\0${record.entityType}\0${record.entityKey}`;

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
    if (!isProtectedSession(record, protectedIds) && time(record.completedAtUtc) < maximumAge) deletions.add(record.sessionId);
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

function canonicalSkillEvidenceAmount(record) {
  const evidence = record?.evidence;
  if (!evidence) return 0;
  return Number(evidence.opportunities?.count || 0)
    + Number(evidence.timing?.eligibleCount || 0)
    + Number(evidence.launchTiming?.eligibleCount || 0)
    + Number(evidence.errors?.primaryEpisodeCount || 0);
}

function protectsSkillFromOrdinaryPruning(review) {
  return review?.state === "active"
    || (review?.state === "suspended" && review?.suspensionReason === "retention-failed");
}

function skillDeletes(records, reviewItems = []) {
  const caps = { bigram: PRACTICE_LIMITS.bigramStats, trigram: PRACTICE_LIMITS.trigramStats, word: PRACTICE_LIMITS.wordStats };
  const protectedEntities = new Set(reviewItems.filter(protectsSkillFromOrdinaryPruning).map(entityIdentity));
  const deletions = [];
  const compare = (a, b) => (
    (a.confidenceScore || 0) - (b.confidenceScore || 0)
    || canonicalSkillEvidenceAmount(a) - canonicalSkillEvidenceAmount(b)
    || (a.evidence?.observation?.targetedSessionCount || 0) - (b.evidence?.observation?.targetedSessionCount || 0)
    || time(a.lastObservedAt || a.updatedAt) - time(b.lastObservedAt || b.updatedAt)
    || String(a.statId).localeCompare(String(b.statId))
  );
  for (const [type, cap] of Object.entries(caps)) {
    const group = records.filter((record) => record.entityType === type);
    if (group.length <= cap) continue;
    const candidates = group.filter((record) => !protectedEntities.has(entityIdentity(record))).sort(compare);
    deletions.push(...candidates.slice(0, Math.min(candidates.length, group.length - cap)).map((record) => record.statId));
  }
  const patterns = records.filter((record) => ["punctuation-transition", "number-pattern", "symbol-pattern"].includes(record.entityType));
  if (patterns.length > PRACTICE_LIMITS.patternStats) {
    const candidates = patterns.filter((record) => !protectedEntities.has(entityIdentity(record))).sort(compare);
    deletions.push(...candidates.slice(0, Math.min(candidates.length, patterns.length - PRACTICE_LIMITS.patternStats)).map((record) => record.statId));
  }
  return [...new Set(deletions)];
}

function reviewPruneRank(record) {
  if (record.state === "inactive") return 0;
  if (record.state === "suspended" && record.suspensionReason !== "retention-failed") return 1;
  if (record.state === "suspended" && record.suspensionReason === "retention-failed") return 3;
  if (record.state === "active") return 4;
  return 2;
}

function reviewDeletes(records, skillStats = [], prunedStatIds = new Set()) {
  const deletions = new Set();
  const skillByEntity = new Map(skillStats.map((record) => [entityIdentity(record), record]));
  const activeByEntity = new Map();
  for (const record of [...records].sort((a, b) => time(b.updatedAt) - time(a.updatedAt))) {
    const key = entityIdentity(record);
    const skill = skillByEntity.get(key);
    if (!skill || prunedStatIds.has(skill.statId)) {
      deletions.add(record.reviewItemId);
      continue;
    }
    if (activeByEntity.has(key)) deletions.add(record.reviewItemId);
    else activeByEntity.set(key, record.reviewItemId);
  }
  if (records.length - deletions.size > PRACTICE_LIMITS.reviewItems) {
    const candidates = records
      .filter((record) => !deletions.has(record.reviewItemId))
      .slice()
      .sort((a, b) => (
        reviewPruneRank(a) - reviewPruneRank(b)
        || Number(a.retention?.currentCycleVerificationCount || 0) - Number(b.retention?.currentCycleVerificationCount || 0)
        || time(a.updatedAt) - time(b.updatedAt)
        || String(a.reviewItemId).localeCompare(String(b.reviewItemId))
      ));
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
  learningStates = [],
  reviewItems = [],
  quarantine = [],
  preserveSessionIds = [],
} = {}) {
  const rawNow = typeof now === "function" ? now() : now;
  const nowMs = rawNow instanceof Date ? rawNow.getTime() : Number(rawNow);
  const skillStatIds = skillDeletes(skillStats, reviewItems);
  const prunedStats = new Set(skillStatIds);
  return Object.freeze({
    order: QUOTA_RECOVERY_STEPS,
    activeSessionCheckpoints: checkpoints
      .filter((record) => time(record.expiresAt, Infinity) <= nowMs)
      .map((record) => record.profileId),
    sessionSummaries: sessionDeletes(sessionSummaries, nowMs, preserveSessionIds),
    reviewItems: reviewDeletes(reviewItems, skillStats, prunedStats),
    skillStats: skillStatIds,
    learningStates: learningStates
      .filter((record) => prunedStats.has(record.statId))
      .map((record) => record.learningStateId),
    quarantine: oldest(quarantine, "detectedAt")
      .slice(0, Math.max(0, quarantine.length - PRACTICE_LIMITS.quarantineRecords))
      .map((record) => record.quarantineId),
    customTexts: Object.freeze([]),
  });
}

export function hasMeaningfulAbandonedActivity({ typedCharacterCount = 0, activeDurationMs = 0 } = {}) {
  return typedCharacterCount >= PRACTICE_LIMITS.abandonmentCharacters
    || activeDurationMs >= PRACTICE_LIMITS.abandonmentActiveMs;
}
