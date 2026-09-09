import {
  PRACTICE_COMMON_WORD_BANDS,
  PRACTICE_COMMON_WORD_BAND_RANGES,
  PRACTICE_COMMON_WORD_BREADTH_MODEL_VERSION,
  PRACTICE_COMMON_WORD_CONFIDENCE_RANK,
} from "./practiceCommonWordsConstants.js";
import { PRACTICE_COMMON_WORDS_POLICY_V1 } from "./practiceCommonWordsPolicy.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const pct = (count, total) => total > 0 ? (count / total) * 100 : 0;
const wordStats = (skillStats) => new Map((Array.isArray(skillStats) ? skillStats : []).filter((stat) => stat?.entityType === "word" && typeof stat.entityKey === "string").map((stat) => [stat.entityKey, stat]));
const masteryMap = (snapshot) => new Map((snapshot?.entities ?? []).filter((entry) => entry?.entityType === "word" && typeof entry.entityKey === "string").map((entry) => [entry.entityKey, entry]));

function classify(stat, mastery, policy) {
  const opportunities = Math.max(0, Number(stat?.evidence?.opportunities?.count ?? stat?.opportunityCount ?? 0) || 0);
  const sessions = Math.max(0, Number(stat?.evidence?.observation?.sessionCount ?? stat?.sessionCount ?? 0) || 0);
  const score = Number(mastery?.automaticity?.score);
  const confidence = mastery?.automaticity?.confidenceLevel ?? "none";
  const automatic = Number.isFinite(score)
    && score >= policy.breadth.automaticMinimumScore
    && (PRACTICE_COMMON_WORD_CONFIDENCE_RANK[confidence] ?? 0) >= PRACTICE_COMMON_WORD_CONFIDENCE_RANK[policy.breadth.automaticMinimumConfidence];
  const strong = automatic
    && score >= policy.breadth.strongMinimumScore
    && confidence === policy.breadth.strongMinimumConfidence;
  const repeated = opportunities >= policy.breadth.repeatedMinimumOpportunities && sessions >= policy.breadth.repeatedMinimumSessions;
  return Object.freeze({
    state: strong ? "strong" : automatic ? "automatic" : repeated ? "repeated-evidence" : opportunities >= 1 ? "observed" : "unobserved",
    opportunities,
    sessionCount: sessions,
    automatic,
    strong,
    repeated,
    observed: opportunities >= 1,
  });
}

function summarize(entries, totalWords) {
  const counts = {
    unobservedCount: entries.filter((entry) => !entry.coverage.observed).length,
    observedCount: entries.filter((entry) => entry.coverage.observed).length,
    repeatedEvidenceCount: entries.filter((entry) => entry.coverage.repeated).length,
    automaticCount: entries.filter((entry) => entry.coverage.automatic).length,
    strongCount: entries.filter((entry) => entry.coverage.strong).length,
  };
  return Object.freeze({
    totalWords,
    ...counts,
    observedPercent: pct(counts.observedCount, totalWords),
    repeatedEvidencePercent: pct(counts.repeatedEvidenceCount, totalWords),
    automaticPercent: pct(counts.automaticCount, totalWords),
    strongPercent: pct(counts.strongCount, totalWords),
  });
}

export function buildPracticeCommonWordBreadthSnapshot({
  profileId,
  contextId,
  referenceBank,
  skillStats = [],
  masterySnapshot = null,
  policy = PRACTICE_COMMON_WORDS_POLICY_V1,
  generatedAt = null,
} = {}) {
  if (!profileId || !contextId) throw new TypeError("Common-word breadth requires profile and context");
  if (referenceBank?.referenceId !== "WS-COMMON-EN-1" || !Array.isArray(referenceBank?.words) || referenceBank.words.length !== 1200) throw new TypeError("Common-word breadth requires WS-COMMON-EN-1");
  const stats = wordStats(skillStats); const mastery = masteryMap(masterySnapshot);
  const entries = referenceBank.words.map((word) => Object.freeze({
    lexicalKey: word.lexicalKey,
    rank: word.rank,
    band: word.band,
    coverage: classify(stats.get(word.lexicalKey), mastery.get(word.lexicalKey), policy),
  }));
  const bands = Object.fromEntries(PRACTICE_COMMON_WORD_BANDS.map((band) => {
    const bandEntries = entries.filter((entry) => entry.band === band);
    return [band, summarize(bandEntries, PRACTICE_COMMON_WORD_BAND_RANGES[band].size)];
  }));
  return freezeDeep({
    breadthModelVersion: PRACTICE_COMMON_WORD_BREADTH_MODEL_VERSION,
    profileId,
    contextId,
    referenceId: referenceBank.referenceId,
    referenceVersion: referenceBank.referenceVersion,
    generatedAt,
    overall: summarize(entries, 1200),
    bands,
    words: entries,
    terminology: "Typing breadth measures WordStrike typing evidence across the common-word reference; it does not estimate language vocabulary knowledge.",
  });
}
