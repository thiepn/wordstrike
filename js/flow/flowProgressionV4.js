import { getResilientBrowserStorage } from "../browserStorage.js";
import { FLOW_V3_THEME_IDS } from "./flowStreamPlanV3.js?v=20260923b";

export const FLOW_PROGRESSION_V4_STORAGE_KEY = "wordstrike_flow_progression_v4";
export const FLOW_PROGRESSION_V4_VERSION = 1;
export const FLOW_PROGRESSION_V4_MAX_SESSION_IDS = 240;

const SPECIFIC_THEME_IDS = Object.freeze(FLOW_V3_THEME_IDS.filter((theme) => theme !== "mixed"));
const THEME_TARGET = SPECIFIC_THEME_IDS.length;

export const FLOW_PROGRESSION_V4_MILESTONES = Object.freeze([
  Object.freeze({ id: "runs-1", category: "runs", name: "First Current", description: "Finish your first Flow run.", metric: "runs", target: 1 }),
  Object.freeze({ id: "runs-5", category: "runs", name: "In Rhythm", description: "Finish 5 Flow runs.", metric: "runs", target: 5 }),
  Object.freeze({ id: "runs-10", category: "runs", name: "Ten Deep", description: "Finish 10 Flow runs.", metric: "runs", target: 10 }),
  Object.freeze({ id: "runs-25", category: "runs", name: "Flow Regular", description: "Finish 25 Flow runs.", metric: "runs", target: 25 }),
  Object.freeze({ id: "runs-50", category: "runs", name: "Long Game", description: "Finish 50 Flow runs.", metric: "runs", target: 50 }),

  Object.freeze({ id: "words-500", category: "volume", name: "Five Hundred", description: "Type 500 standard words in Flow.", metric: "words", target: 500 }),
  Object.freeze({ id: "words-2500", category: "volume", name: "Longform Habit", description: "Type 2,500 standard words in Flow.", metric: "words", target: 2_500 }),
  Object.freeze({ id: "words-10000", category: "volume", name: "Ten Thousand", description: "Type 10,000 standard words in Flow.", metric: "words", target: 10_000 }),
  Object.freeze({ id: "words-25000", category: "volume", name: "Deep Library", description: "Type 25,000 standard words in Flow.", metric: "words", target: 25_000 }),

  Object.freeze({ id: "score-50000", category: "score", name: "Signal", description: "Earn 50,000 lifetime Flow score.", metric: "score", target: 50_000 }),
  Object.freeze({ id: "score-250000", category: "score", name: "Current", description: "Earn 250,000 lifetime Flow score.", metric: "score", target: 250_000 }),
  Object.freeze({ id: "score-1000000", category: "score", name: "Million Point Flow", description: "Earn 1,000,000 lifetime Flow score.", metric: "score", target: 1_000_000 }),

  Object.freeze({ id: "wpm-60", category: "speed", name: "Cruising", description: "Reach 60 WPM in an eligible Flow run.", metric: "wpm", target: 60 }),
  Object.freeze({ id: "wpm-80", category: "speed", name: "Fast Current", description: "Reach 80 WPM in an eligible Flow run.", metric: "wpm", target: 80 }),
  Object.freeze({ id: "wpm-100", category: "speed", name: "Triple Digits", description: "Reach 100 WPM in an eligible Flow run.", metric: "wpm", target: 100 }),
  Object.freeze({ id: "wpm-120", category: "speed", name: "High Velocity", description: "Reach 120 WPM in an eligible Flow run.", metric: "wpm", target: 120 }),

  Object.freeze({ id: "consistency-80", category: "consistency", name: "Settled", description: "Reach 80 consistency in an eligible Flow run.", metric: "consistency", target: 80 }),
  Object.freeze({ id: "consistency-90", category: "consistency", name: "Locked In", description: "Reach 90 consistency in an eligible Flow run.", metric: "consistency", target: 90 }),
  Object.freeze({ id: "consistency-95", category: "consistency", name: "Metronomic", description: "Reach 95 consistency in an eligible Flow run.", metric: "consistency", target: 95 }),

  Object.freeze({ id: "themes-3", category: "variety", name: "Explorer", description: "Type across 3 Flow themes.", metric: "themes", target: Math.min(3, THEME_TARGET) }),
  Object.freeze({ id: "themes-all", category: "variety", name: "Full Spectrum", description: "Type across every Flow theme.", metric: "themes", target: THEME_TARGET }),

  Object.freeze({ id: "eligible-streak-3", category: "streak", name: "Three Strong", description: "Record 3 eligible runs in a row.", metric: "eligibleStreak", target: 3 }),
  Object.freeze({ id: "eligible-streak-7", category: "streak", name: "Seven Strong", description: "Record 7 eligible runs in a row.", metric: "eligibleStreak", target: 7 }),
  Object.freeze({ id: "precision-streak-3", category: "precision", name: "Clean Line", description: "Record 3 eligible runs at 98%+ accuracy in a row.", metric: "precisionStreak", target: 3 }),
  Object.freeze({ id: "endurance-5m", category: "endurance", name: "Stay With It", description: "Sustain one eligible Flow run for 5 active minutes.", metric: "endurance", target: 5 * 60_000 }),
].filter((milestone) => milestone.target > 0));

export const FLOW_PROGRESSION_V4_REWARD_TIERS = Object.freeze([
  Object.freeze({ id: "open-current", name: "Open Current", requiredMilestones: 0 }),
  Object.freeze({ id: "in-rhythm", name: "In Rhythm", requiredMilestones: 5 }),
  Object.freeze({ id: "steady-current", name: "Steady Current", requiredMilestones: 10 }),
  Object.freeze({ id: "locked-in", name: "Locked In", requiredMilestones: 15 }),
  Object.freeze({ id: "deep-flow", name: "Deep Flow", requiredMilestones: 20 }),
  Object.freeze({ id: "flow-state", name: "Flow State", requiredMilestones: FLOW_PROGRESSION_V4_MILESTONES.length }),
]);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value) => Math.max(0, Math.round(finite(value)));
const safeObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function cleanThemeCounts(value) {
  const source = safeObject(value);
  const output = {};
  for (const theme of SPECIFIC_THEME_IDS) {
    const count = integer(source[theme]);
    if (count > 0) output[theme] = count;
  }
  return output;
}

function cleanBest(value) {
  const source = safeObject(value);
  return {
    score: integer(source.score),
    wpm: Math.max(0, finite(source.wpm)),
    accuracy: clamp(finite(source.accuracy), 0, 100),
    consistency: clamp(finite(source.consistency), 0, 100),
    activeDurationMs: Math.max(0, finite(source.activeDurationMs)),
    words: integer(source.words),
  };
}

function cleanStreaks(value) {
  const source = safeObject(value);
  return {
    eligibleCurrent: integer(source.eligibleCurrent),
    eligibleBest: integer(source.eligibleBest),
    precisionCurrent: integer(source.precisionCurrent),
    precisionBest: integer(source.precisionBest),
  };
}

export function createDefaultFlowProgressionV4() {
  return {
    version: FLOW_PROGRESSION_V4_VERSION,
    totals: {
      runs: 0,
      eligibleRuns: 0,
      words: 0,
      correctCharacters: 0,
      score: 0,
      activeDurationMs: 0,
    },
    best: cleanBest(),
    streaks: cleanStreaks(),
    themes: {},
    milestones: {},
    lastPlayedAt: null,
    recordedSessionIds: [],
  };
}

export function sanitizeFlowProgressionV4(value) {
  const source = safeObject(value);
  const totals = safeObject(source.totals);
  const milestoneIds = new Set(FLOW_PROGRESSION_V4_MILESTONES.map((milestone) => milestone.id));
  return {
    version: FLOW_PROGRESSION_V4_VERSION,
    totals: {
      runs: integer(totals.runs),
      eligibleRuns: integer(totals.eligibleRuns),
      words: integer(totals.words),
      correctCharacters: integer(totals.correctCharacters),
      score: integer(totals.score),
      activeDurationMs: Math.max(0, finite(totals.activeDurationMs)),
    },
    best: cleanBest(source.best),
    streaks: cleanStreaks(source.streaks),
    themes: cleanThemeCounts(source.themes),
    milestones: Object.fromEntries(
      Object.entries(safeObject(source.milestones))
        .filter(([id, at]) => milestoneIds.has(id) && Number.isFinite(Number(at)) && Number(at) > 0)
        .map(([id, at]) => [id, Number(at)]),
    ),
    lastPlayedAt: source.lastPlayedAt == null ? null : Math.max(0, finite(source.lastPlayedAt)),
    recordedSessionIds: [...new Set(
      (Array.isArray(source.recordedSessionIds) ? source.recordedSessionIds : [])
        .filter((id) => typeof id === "string" && id),
    )].slice(0, FLOW_PROGRESSION_V4_MAX_SESSION_IDS),
  };
}

function progressionMetricValue(progress, metric) {
  if (metric === "runs") return progress.totals.runs;
  if (metric === "words") return progress.totals.words;
  if (metric === "score") return progress.totals.score;
  if (metric === "wpm") return progress.best.wpm;
  if (metric === "consistency") return progress.best.consistency;
  if (metric === "themes") return Object.keys(progress.themes).length;
  if (metric === "eligibleStreak") return progress.streaks.eligibleBest;
  if (metric === "precisionStreak") return progress.streaks.precisionBest;
  if (metric === "endurance") return progress.best.activeDurationMs;
  return 0;
}

function markReachedMilestones(progress, at) {
  const newlyEarned = [];
  for (const milestone of FLOW_PROGRESSION_V4_MILESTONES) {
    if (progress.milestones[milestone.id]) continue;
    if (progressionMetricValue(progress, milestone.metric) < milestone.target) continue;
    progress.milestones[milestone.id] = Math.max(1, finite(at, Date.now()));
    newlyEarned.push(milestone);
  }
  return newlyEarned;
}

function cleanRecordResult(value) {
  if (!value || typeof value !== "object" || typeof value.sessionId !== "string" || !value.sessionId) return null;
  return {
    sessionId: value.sessionId,
    completed: value.completed === true,
    recordEligible: value.recordEligible === true,
    endedAt: Math.max(0, finite(value.endedAt)),
    score: integer(value.score),
    wpm: Math.max(0, finite(value.wpm)),
    accuracy: clamp(finite(value.accuracy), 0, 100),
    consistency: clamp(finite(value.consistency), 0, 100),
    activeDurationMs: Math.max(0, finite(value.activeDurationMs)),
    wordsCompleted: integer(value.wordsCompleted),
    correctCharacters: integer(value.correctCharacters),
    theme: typeof value.theme === "string" ? value.theme : "mixed",
  };
}

function applyRun(progress, run, themes = []) {
  if (!run?.completed || run.correctCharacters <= 0) return false;
  progress.totals.runs += 1;
  progress.totals.eligibleRuns += run.recordEligible ? 1 : 0;
  progress.totals.words += run.wordsCompleted;
  progress.totals.correctCharacters += run.correctCharacters;
  progress.totals.score += run.score;
  progress.totals.activeDurationMs += run.activeDurationMs;
  progress.lastPlayedAt = Math.max(progress.lastPlayedAt || 0, run.endedAt);

  progress.best.score = Math.max(progress.best.score, run.score);
  if (run.recordEligible) {
    progress.best.wpm = Math.max(progress.best.wpm, run.wpm);
    progress.best.accuracy = Math.max(progress.best.accuracy, run.accuracy);
    progress.best.consistency = Math.max(progress.best.consistency, run.consistency);
    progress.best.activeDurationMs = Math.max(progress.best.activeDurationMs, run.activeDurationMs);
    progress.best.words = Math.max(progress.best.words, run.wordsCompleted);
  }

  if (run.recordEligible) progress.streaks.eligibleCurrent += 1;
  else progress.streaks.eligibleCurrent = 0;
  progress.streaks.eligibleBest = Math.max(progress.streaks.eligibleBest, progress.streaks.eligibleCurrent);

  if (run.recordEligible && run.accuracy >= 98) progress.streaks.precisionCurrent += 1;
  else progress.streaks.precisionCurrent = 0;
  progress.streaks.precisionBest = Math.max(progress.streaks.precisionBest, progress.streaks.precisionCurrent);

  const exploredThemes = new Set([
    ...themes,
    run.theme,
  ].filter((theme) => SPECIFIC_THEME_IDS.includes(theme)));
  for (const theme of exploredThemes) progress.themes[theme] = (progress.themes[theme] || 0) + 1;
  return true;
}

export function bootstrapFlowProgressionV4(sourceRecords) {
  const progress = createDefaultFlowProgressionV4();
  const source = safeObject(sourceRecords);
  const history = (Array.isArray(source.history) ? source.history : [])
    .map(cleanRecordResult)
    .filter(Boolean)
    .sort((a, b) => a.endedAt - b.endedAt);

  for (const run of history) {
    applyRun(progress, run, run.theme === "mixed" ? [] : [run.theme]);
  }

  progress.totals.runs = Math.max(progress.totals.runs, integer(source.completedRuns));
  progress.totals.eligibleRuns = Math.max(progress.totals.eligibleRuns, integer(source.eligibleRuns));
  progress.recordedSessionIds = [...new Set([
    ...(Array.isArray(source.recordedSessionIds) ? source.recordedSessionIds : []),
    ...history.map((run) => run.sessionId),
  ].filter((id) => typeof id === "string" && id))].slice(0, FLOW_PROGRESSION_V4_MAX_SESSION_IDS);

  const personalBest = cleanRecordResult(source.personalBest);
  if (personalBest?.recordEligible) {
    progress.best.score = Math.max(progress.best.score, personalBest.score);
    progress.best.wpm = Math.max(progress.best.wpm, personalBest.wpm);
    progress.best.accuracy = Math.max(progress.best.accuracy, personalBest.accuracy);
    progress.best.consistency = Math.max(progress.best.consistency, personalBest.consistency);
    progress.best.activeDurationMs = Math.max(progress.best.activeDurationMs, personalBest.activeDurationMs);
    progress.best.words = Math.max(progress.best.words, personalBest.wordsCompleted);
  }

  markReachedMilestones(progress, progress.lastPlayedAt || 1);
  return sanitizeFlowProgressionV4(progress);
}

export function loadFlowProgressionV4({ sourceRecords = null } = {}) {
  try {
    const raw = getResilientBrowserStorage()?.getItem(FLOW_PROGRESSION_V4_STORAGE_KEY);
    if (raw) return sanitizeFlowProgressionV4(JSON.parse(raw));
  } catch {
    // Fall through to a recoverable baseline.
  }
  return sourceRecords ? bootstrapFlowProgressionV4(sourceRecords) : createDefaultFlowProgressionV4();
}

export function saveFlowProgressionV4(value) {
  const clean = sanitizeFlowProgressionV4(value);
  try {
    getResilientBrowserStorage()?.setItem(FLOW_PROGRESSION_V4_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Progress feedback remains non-blocking when storage is unavailable.
  }
  return clean;
}

export function getFlowRewardTierV4(progress) {
  const earnedCount = Object.keys(safeObject(progress?.milestones)).length;
  return FLOW_PROGRESSION_V4_REWARD_TIERS.reduce(
    (current, tier) => earnedCount >= tier.requiredMilestones ? tier : current,
    FLOW_PROGRESSION_V4_REWARD_TIERS[0],
  );
}

function formatMetric(metric, value) {
  const safe = Math.max(0, finite(value));
  if (metric === "score" || metric === "words" || metric === "runs") return Math.round(safe).toLocaleString("en-US");
  if (metric === "wpm") return `${safe.toFixed(safe >= 100 ? 0 : 1)} WPM`;
  if (metric === "consistency") return `${safe.toFixed(0)} CONS`;
  if (metric === "themes") return `${Math.round(safe)} THEMES`;
  if (metric === "eligibleStreak" || metric === "precisionStreak") return `${Math.round(safe)} RUNS`;
  if (metric === "endurance") {
    const minutes = Math.floor(safe / 60_000);
    const seconds = Math.floor((safe % 60_000) / 1000);
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  return String(Math.round(safe));
}

export function getFlowProgressionSummaryV4(progress = loadFlowProgressionV4()) {
  const clean = sanitizeFlowProgressionV4(progress);
  const earnedCount = Object.keys(clean.milestones).length;
  const tier = getFlowRewardTierV4(clean);
  const candidates = FLOW_PROGRESSION_V4_MILESTONES
    .map((milestone, index) => {
      if (clean.milestones[milestone.id]) return null;
      const current = progressionMetricValue(clean, milestone.metric);
      const ratio = clamp(current / Math.max(1, milestone.target), 0, 1);
      return { milestone, index, current, ratio };
    })
    .filter(Boolean)
    .sort((a, b) => b.ratio - a.ratio || a.index - b.index);
  const next = candidates[0] || null;

  return Object.freeze({
    version: FLOW_PROGRESSION_V4_VERSION,
    earnedCount,
    totalMilestones: FLOW_PROGRESSION_V4_MILESTONES.length,
    completionRatio: FLOW_PROGRESSION_V4_MILESTONES.length
      ? earnedCount / FLOW_PROGRESSION_V4_MILESTONES.length
      : 1,
    tier,
    themesExplored: Object.keys(clean.themes).length,
    themeTarget: THEME_TARGET,
    totals: Object.freeze({ ...clean.totals }),
    best: Object.freeze({ ...clean.best }),
    streaks: Object.freeze({ ...clean.streaks }),
    nextMilestone: next ? Object.freeze({
      ...next.milestone,
      current: next.current,
      ratio: next.ratio,
      currentLabel: formatMetric(next.milestone.metric, next.current),
      targetLabel: formatMetric(next.milestone.metric, next.milestone.target),
    }) : null,
  });
}

export function recordFlowProgressionV4(result, { plan = null, sourceRecords = null } = {}) {
  const run = cleanRecordResult(result);
  const progress = loadFlowProgressionV4({ sourceRecords });
  const previousTier = getFlowRewardTierV4(progress);
  if (!run || !run.completed || run.correctCharacters <= 0 || progress.recordedSessionIds.includes(run.sessionId)) {
    return Object.freeze({
      recorded: false,
      progression: progress,
      newlyEarned: Object.freeze([]),
      previousTier,
      rewardTier: previousTier,
      tierUnlocked: false,
      summary: getFlowProgressionSummaryV4(progress),
    });
  }

  const themes = Array.isArray(plan?.corpusThemes) ? plan.corpusThemes.map(String) : [];
  applyRun(progress, run, themes);
  progress.recordedSessionIds = [
    run.sessionId,
    ...progress.recordedSessionIds.filter((id) => id !== run.sessionId),
  ].slice(0, FLOW_PROGRESSION_V4_MAX_SESSION_IDS);
  const newlyEarned = markReachedMilestones(progress, run.endedAt || Date.now());
  const saved = saveFlowProgressionV4(progress);
  const rewardTier = getFlowRewardTierV4(saved);

  return Object.freeze({
    recorded: true,
    progression: saved,
    newlyEarned: Object.freeze([...newlyEarned]),
    previousTier,
    rewardTier,
    tierUnlocked: rewardTier.id !== previousTier.id,
    summary: getFlowProgressionSummaryV4(saved),
  });
}

export function resetFlowProgressionV4() {
  try { getResilientBrowserStorage()?.removeItem(FLOW_PROGRESSION_V4_STORAGE_KEY); } catch { /* no-op */ }
  return createDefaultFlowProgressionV4();
}
