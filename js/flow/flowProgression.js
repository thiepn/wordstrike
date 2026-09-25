import { getResilientBrowserStorage } from "../browserStorage.js";
import { MODE_IDS } from "../modes.js";
import {
  getModeSummary,
  getRecentSessions,
  recordCompletedSession,
} from "../modeStorageV2.js";
import { buildFlowWeaknessProfile } from "./flowAdaptive.js";
import { normalizeFlowModifierIds } from "./flowModifiers.js";
import { createFlowScoreV2Result } from "./flowScoreV2.js?v=20260923a";

export const FLOW_PROGRESS_STORAGE_KEY = "wordstrike_flow_progress_v1";
export const FLOW_ONBOARDING_STORAGE_KEY = "wordstrike_flow_onboarding_v1";
export const FLOW_PROGRESS_VERSION = 1;
export const MAX_FLOW_HISTORY = 12;
export const MAX_FLOW_RECORDED_IDS = 50;

export const FLOW_MILESTONES = Object.freeze([
  Object.freeze({ id: "first-flow", name: "First Flow", description: "Complete your first Flow run." }),
  Object.freeze({ id: "five-runs", name: "In Rhythm", description: "Complete 5 Flow runs." }),
  Object.freeze({ id: "standard-run", name: "Sustained", description: "Complete a Standard Flow run." }),
  Object.freeze({ id: "long-run", name: "Longform", description: "Complete a Long Flow run." }),
  Object.freeze({ id: "precision-98", name: "Precision", description: "Finish a run at 98%+ raw accuracy." }),
  Object.freeze({ id: "locked-in", name: "Locked In", description: "Finish with a Cadence score of 92+." }),
  Object.freeze({ id: "high-flow", name: "High Flow", description: "Average 90+ Flow over a run." }),
  Object.freeze({ id: "adaptive-run", name: "Targeted Practice", description: "Complete a run containing an adaptive focus passage." }),
  Object.freeze({ id: "modifier-run", name: "Shaped Session", description: "Complete a run with at least one modifier." }),
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeSetup(value = {}) {
  return {
    sessionLength: ["quick", "standard", "long"].includes(value.sessionLength) ? value.sessionLength : "standard",
    category: typeof value.category === "string" ? value.category : "mixed",
    difficulty: ["smooth", "natural", "advanced", "expert"].includes(value.difficulty) ? value.difficulty : "natural",
    modifiers: normalizeFlowModifierIds(value.modifiers || []),
  };
}

function emptyBest() {
  return {
    score: 0,
    wpm: 0,
    accuracy: 0,
    cadence: 0,
    averageFlow: 0,
    averageMomentum: 1,
  };
}

export function createDefaultFlowProgress() {
  return {
    version: FLOW_PROGRESS_VERSION,
    completedRuns: 0,
    totalCharacters: 0,
    totalWords: 0,
    totalActiveMs: 0,
    lastPlayedAt: null,
    lastSetup: safeSetup(),
    best: emptyBest(),
    counts: {
      length: { quick: 0, standard: 0, long: 0 },
      category: {},
      difficulty: { smooth: 0, natural: 0, advanced: 0, expert: 0 },
      modifierRuns: 0,
      adaptiveRuns: 0,
      focusPassages: 0,
    },
    milestones: {},
    lastWeaknessProfile: [],
    history: [],
    recordedSessionIds: [],
  };
}

function sanitizeWeaknesses(value) {
  const source = Array.isArray(value) ? value : (Array.isArray(value?.weaknesses) ? value.weaknesses : []);
  return source.slice(0, 5).filter((item) => item && typeof item.key === "string").map((item) => ({
    key: item.key,
    label: typeof item.label === "string" ? item.label : item.key,
    score: Math.max(0, finite(item.score)),
    expected: item.expected == null ? null : String(item.expected),
    actual: item.actual == null ? null : String(item.actual),
  }));
}

export function sanitizeFlowProgress(value) {
  const source = safeObject(value);
  const counts = safeObject(source.counts);
  const best = safeObject(source.best);
  return {
    version: FLOW_PROGRESS_VERSION,
    completedRuns: Math.max(0, Math.round(finite(source.completedRuns))),
    totalCharacters: Math.max(0, Math.round(finite(source.totalCharacters))),
    totalWords: Math.max(0, Math.round(finite(source.totalWords))),
    totalActiveMs: Math.max(0, finite(source.totalActiveMs)),
    lastPlayedAt: source.lastPlayedAt == null ? null : finite(source.lastPlayedAt, null),
    lastSetup: safeSetup(source.lastSetup),
    best: {
      score: Math.max(0, finite(best.score)),
      wpm: Math.max(0, finite(best.wpm)),
      accuracy: Math.max(0, Math.min(100, finite(best.accuracy))),
      cadence: Math.max(0, Math.min(100, finite(best.cadence))),
      averageFlow: Math.max(0, Math.min(100, finite(best.averageFlow))),
      averageMomentum: Math.max(1, finite(best.averageMomentum, 1)),
    },
    counts: {
      length: Object.fromEntries(["quick", "standard", "long"].map((key) => [key, Math.max(0, Math.round(finite(counts.length?.[key])))])),
      category: Object.fromEntries(Object.entries(safeObject(counts.category)).map(([key, count]) => [key, Math.max(0, Math.round(finite(count)))])),
      difficulty: Object.fromEntries(["smooth", "natural", "advanced", "expert"].map((key) => [key, Math.max(0, Math.round(finite(counts.difficulty?.[key])))])),
      modifierRuns: Math.max(0, Math.round(finite(counts.modifierRuns))),
      adaptiveRuns: Math.max(0, Math.round(finite(counts.adaptiveRuns))),
      focusPassages: Math.max(0, Math.round(finite(counts.focusPassages))),
    },
    milestones: Object.fromEntries(Object.entries(safeObject(source.milestones)).filter(([id, at]) => FLOW_MILESTONES.some((item) => item.id === id) && Number.isFinite(Number(at))).map(([id, at]) => [id, Number(at)])),
    lastWeaknessProfile: sanitizeWeaknesses(source.lastWeaknessProfile),
    history: Array.isArray(source.history) ? source.history.slice(0, MAX_FLOW_HISTORY).filter((item) => item && typeof item.sessionId === "string").map((item) => ({ ...item })) : [],
    recordedSessionIds: Array.isArray(source.recordedSessionIds) ? [...new Set(source.recordedSessionIds.filter((id) => typeof id === "string"))].slice(0, MAX_FLOW_RECORDED_IDS) : [],
  };
}

export function loadFlowProgress() {
  try {
    const raw = getResilientBrowserStorage()?.getItem(FLOW_PROGRESS_STORAGE_KEY);
    if (!raw) return createDefaultFlowProgress();
    return sanitizeFlowProgress(JSON.parse(raw));
  } catch {
    return createDefaultFlowProgress();
  }
}

export function saveFlowProgress(progress) {
  const clean = sanitizeFlowProgress(progress);
  try {
    getResilientBrowserStorage()?.setItem(FLOW_PROGRESS_STORAGE_KEY, JSON.stringify(clean));
    return clean;
  } catch {
    return clean;
  }
}

export function hasSeenFlowOnboarding() {
  try { return getResilientBrowserStorage()?.getItem(FLOW_ONBOARDING_STORAGE_KEY) === "seen"; } catch { return false; }
}

export function markFlowOnboardingSeen() {
  try { getResilientBrowserStorage()?.setItem(FLOW_ONBOARDING_STORAGE_KEY, "seen"); return true; } catch { return false; }
}

export function saveFlowLastSetup(setup) {
  const progress = loadFlowProgress();
  progress.lastSetup = safeSetup(setup);
  return saveFlowProgress(progress);
}

function max(previous, next, fallback = 0) {
  return Math.max(finite(previous, fallback), finite(next, fallback));
}

function focusPassageCount(plan) {
  const canonical = plan?.adaptive?.targetedPassageCount;
  const legacy = plan?.focusPassageCount;
  return Math.max(0, Math.round(finite(canonical, finite(legacy))));
}

function milestoneEligible(id, progress, run) {
  const gameplay = run.snapshot?.gameplay || {};
  const cadence = run.snapshot?.cadence || {};
  if (id === "first-flow") return progress.completedRuns >= 1;
  if (id === "five-runs") return progress.completedRuns >= 5;
  if (id === "standard-run") return progress.counts.length.standard >= 1;
  if (id === "long-run") return progress.counts.length.long >= 1;
  if (id === "precision-98") return finite(gameplay.accuracyPercent) >= 98;
  if (id === "locked-in") return finite(cadence.cadenceScore, -1) >= 92;
  if (id === "high-flow") return finite(gameplay.averageFlow) >= 90;
  if (id === "adaptive-run") return focusPassageCount(run.plan) > 0;
  if (id === "modifier-run") return normalizeFlowModifierIds(run.plan?.modifiers || run.snapshot?.modifiers || []).length > 0;
  return false;
}

export function recordFlowProgression({ sessionId, endedAt = Date.now(), snapshot, plan = null }) {
  const progress = loadFlowProgress();
  if (!sessionId || !snapshot || progress.recordedSessionIds.includes(sessionId)) {
    return { progress, newlyEarned: [], recorded: false };
  }

  const gameplay = snapshot.gameplay || {};
  const cadence = snapshot.cadence || {};
  const publicResult = createFlowScoreV2Result({ sessionId, endedAt, snapshot, plan });
  const resultScore = publicResult?.score ?? gameplay.score;
  const resultWpm = publicResult?.wpm ?? cadence.finalWpm;
  const resultAccuracy = publicResult?.accuracy ?? gameplay.accuracyPercent;
  const resultConsistency = publicResult?.consistency ?? cadence.cadenceScore;
  const sessionLength = plan?.sessionLength || snapshot.sessionLength || "standard";
  const category = plan?.category || snapshot.category || "mixed";
  const difficulty = plan?.difficulty || snapshot.difficulty || "natural";
  const modifiers = normalizeFlowModifierIds(plan?.modifiers || snapshot.modifiers || []);
  const focusPassages = focusPassageCount(plan);
  const weaknessProfile = sanitizeWeaknesses(buildFlowWeaknessProfile(snapshot));

  progress.completedRuns += 1;
  progress.totalCharacters += Math.max(0, Math.round(finite(snapshot.currentIndex)));
  progress.totalWords += Math.max(0, Math.round(finite(snapshot.wordTimings?.length)));
  progress.totalActiveMs += Math.max(0, finite(cadence.typingDurationMs));
  progress.lastPlayedAt = endedAt;
  progress.lastSetup = safeSetup({ sessionLength, category, difficulty, modifiers });
  progress.best.score = max(progress.best.score, resultScore);
  progress.best.wpm = max(progress.best.wpm, resultWpm);
  progress.best.accuracy = max(progress.best.accuracy, resultAccuracy);
  progress.best.cadence = max(progress.best.cadence, resultConsistency);
  progress.best.averageFlow = max(progress.best.averageFlow, gameplay.averageFlow);
  progress.best.averageMomentum = max(progress.best.averageMomentum, gameplay.averageMomentum, 1);
  if (progress.counts.length[sessionLength] != null) progress.counts.length[sessionLength] += 1;
  progress.counts.category[category] = (progress.counts.category[category] || 0) + 1;
  if (progress.counts.difficulty[difficulty] != null) progress.counts.difficulty[difficulty] += 1;
  if (modifiers.length) progress.counts.modifierRuns += 1;
  if (focusPassages > 0) progress.counts.adaptiveRuns += 1;
  progress.counts.focusPassages += focusPassages;
  if (weaknessProfile.length) progress.lastWeaknessProfile = weaknessProfile;

  const runContext = { snapshot, plan };
  const newlyEarned = [];
  for (const milestone of FLOW_MILESTONES) {
    if (progress.milestones[milestone.id] || !milestoneEligible(milestone.id, progress, runContext)) continue;
    progress.milestones[milestone.id] = endedAt;
    newlyEarned.push(milestone);
  }

  progress.history.unshift({
    sessionId,
    endedAt,
    score: Math.max(0, Math.round(finite(resultScore))),
    wpm: Math.max(0, finite(resultWpm)),
    accuracy: Math.max(0, Math.min(100, finite(resultAccuracy))),
    cadence: resultConsistency == null ? null : Math.max(0, finite(resultConsistency)),
    averageFlow: Math.max(0, finite(gameplay.averageFlow)),
    sessionLength,
    category,
    difficulty,
    modifiers,
    focusPassages,
  });
  progress.history = progress.history.slice(0, MAX_FLOW_HISTORY);
  progress.recordedSessionIds = [sessionId, ...progress.recordedSessionIds.filter((id) => id !== sessionId)].slice(0, MAX_FLOW_RECORDED_IDS);

  return { progress: saveFlowProgress(progress), newlyEarned, recorded: true };
}

export function createFlowSessionResult({ sessionId, endedAt = Date.now(), snapshot, plan = null }) {
  const gameplay = snapshot?.gameplay || {};
  const cadence = snapshot?.cadence || {};
  const publicResult = createFlowScoreV2Result({ sessionId, endedAt, snapshot, plan });
  const raw = Array.isArray(snapshot?.rawKeystrokes) ? snapshot.rawKeystrokes : [];
  const blockedBackspaces = Math.max(0, Math.round(finite(snapshot?.blockedBackspaces)));
  const correct = Math.max(0, Math.round(finite(gameplay.correctKeystrokes)));
  const incorrect = Math.max(0, Math.round(finite(gameplay.incorrectKeystrokes)));
  const wordsCompleted = Math.max(0, Math.round(finite(snapshot?.wordTimings?.length)));
  return {
    schemaVersion: 1,
    sessionId,
    modeId: MODE_IDS.FLOW,
    variantId: publicResult?.variantId
      || `${plan?.sessionLength || snapshot?.sessionLength || "standard"}:${plan?.difficulty || snapshot?.difficulty || "natural"}`,
    endedAt,
    state: "complete",
    sessionState: "complete",
    success: true,
    developerMode: false,
    score: Math.max(0, Math.round(finite(publicResult?.score ?? gameplay.score))),
    grade: null,
    accuracy: Math.max(0, Math.min(100, finite(publicResult?.accuracy ?? gameplay.accuracyPercent))),
    wpm: Math.max(0, finite(publicResult?.wpm ?? cadence.finalWpm)),
    activeDurationMs: Math.max(0, finite(cadence.typingDurationMs)),
    characters: {
      correct,
      incorrect,
      missed: 0,
      totalKeystrokes: raw.length + blockedBackspaces,
    },
    words: {
      completed: wordsCompleted,
      missed: 0,
    },
    modeData: {
      cadenceScore: cadence.cadenceScore,
      consistencyScore: publicResult?.consistency ?? cadence.cadenceScore,
      flowScoreRulesVersion: publicResult?.rulesVersion ?? null,
      flowScoreMetricVersion: publicResult?.metricVersion ?? null,
      flowBoardKey: publicResult?.boardKey ?? null,
      recordEligible: publicResult?.recordEligible ?? null,
      averageFlow: gameplay.averageFlow,
      averageMomentum: gameplay.averageMomentum,
      sessionLength: plan?.sessionLength || snapshot?.sessionLength || "standard",
      category: plan?.category || snapshot?.category || "mixed",
      difficulty: plan?.difficulty || snapshot?.difficulty || "natural",
      chapterCount: plan?.chapterCount || 1,
      passageCount: plan?.passageCount || 1,
      focusPassageCount: focusPassageCount(plan),
      modifiers: normalizeFlowModifierIds(plan?.modifiers || snapshot?.modifiers || []),
    },
  };
}

export function recordFlowSession({ sessionId, endedAt = Date.now(), snapshot, plan = null }) {
  const result = createFlowSessionResult({ sessionId, endedAt, snapshot, plan });
  const genericRecorded = recordCompletedSession(result);
  const progression = recordFlowProgression({ sessionId, endedAt, snapshot, plan });
  return { result, genericRecorded, ...progression };
}

export function getFlowIntegrationSummary() {
  const progress = loadFlowProgress();
  const generic = getModeSummary(MODE_IDS.FLOW);
  const recent = getRecentSessions().filter((item) => item.modeId === MODE_IDS.FLOW).slice(0, 5);
  return { progress, generic, recent };
}
