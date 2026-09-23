import { calculateGrade } from "./scoring.js";
import {
  isBetterEndlessScoreRecord,
  isBetterEndlessStageRecord,
  migrateModeDataToV2,
} from "./modeStorage.js";
import { MODE_IDS } from "./modes.js";
import {
  ACCOUNT_SNAPSHOT_SCHEMA_VERSION,
  applyAccountCounters,
  mergeAccountSyncState,
} from "./accountSyncMerge.js";

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const finite = (value) => value == null ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const maximum = (a, b) => {
  const av = finite(a);
  const bv = finite(b);
  if (av == null) return bv;
  if (bv == null) return av;
  return Math.max(av, bv);
};
const minimumNullable = (a, b) => {
  const values = [finite(a), finite(b)].filter((value) => value != null);
  return values.length ? Math.min(...values) : null;
};

function mergeNumericObject(local = {}, remote = {}) {
  const merged = { ...remote, ...local };
  for (const key of new Set([...Object.keys(remote || {}), ...Object.keys(local || {})])) {
    if (typeof local?.[key] === "number" || typeof remote?.[key] === "number") {
      merged[key] = maximum(local?.[key], remote?.[key]) ?? 0;
    }
  }
  return merged;
}

function mergeCampaignRecord(local, remote) {
  if (!local) return clone(remote);
  if (!remote) return clone(local);
  const bestAccuracy = maximum(local.bestAccuracy, remote.bestAccuracy) ?? 0;
  return {
    ...remote,
    ...local,
    grade: calculateGrade({ accuracy: bestAccuracy }),
    bestWPM: maximum(local.bestWPM, remote.bestWPM) ?? 0,
    bestAccuracy,
    bestScore: maximum(local.bestScore, remote.bestScore) ?? 0,
    maxCombo: maximum(local.maxCombo, remote.maxCombo) ?? 0,
    bestTimeRemaining: maximum(local.bestTimeRemaining, remote.bestTimeRemaining) ?? 0,
    bossCleared: local.bossCleared === true || remote.bossCleared === true,
  };
}

function campaignFurthest(campaign) {
  return Math.max(1, Number(campaign?.campaignFurthestLevel ?? campaign?.currentFurthestLevel) || 1);
}

function mergeCampaign(local = {}, remote = {}, preferLocalSettings = true) {
  const levels = {};
  for (const key of new Set([
    ...Object.keys(remote?.levels || {}),
    ...Object.keys(local?.levels || {}),
  ])) {
    levels[key] = mergeCampaignRecord(local?.levels?.[key], remote?.levels?.[key]);
  }
  const furthest = Math.max(campaignFurthest(local), campaignFurthest(remote));
  return {
    ...(preferLocalSettings ? remote : local),
    ...(preferLocalSettings ? local : remote),
    levels,
    campaignFurthestLevel: furthest,
    currentFurthestLevel: furthest,
    settings: clone(preferLocalSettings ? (local?.settings ?? remote?.settings ?? {}) : (remote?.settings ?? local?.settings ?? {})),
  };
}

function speedRecordWinner(local, remote) {
  if (!local) return clone(remote);
  if (!remote) return clone(local);
  const tuple = (record) => [
    finite(record?.bestWpm) ?? -1,
    finite(record?.tieAccuracy) ?? -1,
    finite(record?.tieRawWpm) ?? -1,
    -(finite(record?.bestResultAt) ?? Number.MAX_SAFE_INTEGER),
  ];
  const lt = tuple(local);
  const rt = tuple(remote);
  let winner = local;
  for (let index = 0; index < lt.length; index += 1) {
    if (lt[index] === rt[index]) continue;
    winner = lt[index] > rt[index] ? local : remote;
    break;
  }
  return {
    ...clone(winner),
    bestWpm: maximum(local.bestWpm, remote.bestWpm),
    bestRawWpm: maximum(local.bestRawWpm, remote.bestRawWpm),
    bestAccuracy: maximum(local.bestAccuracy, remote.bestAccuracy),
    bestExactWords: maximum(local.bestExactWords, remote.bestExactWords),
  };
}

function mergeRecordMap(local = {}, remote = {}) {
  return Object.fromEntries([...new Set([...Object.keys(remote), ...Object.keys(local)])].map((key) => [
    key,
    speedRecordWinner(local[key], remote[key]),
  ]));
}

function mergeUsageMap(local = {}, remote = {}) {
  return Object.fromEntries([...new Set([...Object.keys(remote), ...Object.keys(local)])].map((key) => [
    key,
    maximum(local[key], remote[key]) ?? 0,
  ]));
}

function chooseIndependentRecord(local, remote, valueField = "value") {
  if (!local) return clone(remote);
  if (!remote) return clone(local);
  const lv = finite(local[valueField]) ?? -1;
  const rv = finite(remote[valueField]) ?? -1;
  if (lv !== rv) return clone(lv > rv ? local : remote);
  const ls = finite(local.stage) ?? -1;
  const rs = finite(remote.stage) ?? -1;
  if (ls !== rs) return clone(ls > rs ? local : remote);
  return clone((finite(local.achievedAt) ?? Infinity) <= (finite(remote.achievedAt) ?? Infinity) ? local : remote);
}

function mergeEndlessRecords(local = {}, remote = {}) {
  const bestStage = !local.bestStage ? clone(remote.bestStage)
    : !remote.bestStage ? clone(local.bestStage)
      : clone(isBetterEndlessStageRecord(local.bestStage, remote.bestStage) ? local.bestStage : remote.bestStage);
  const highestScore = !local.highestScore ? clone(remote.highestScore)
    : !remote.highestScore ? clone(local.highestScore)
      : clone(isBetterEndlessScoreRecord(local.highestScore, remote.highestScore) ? local.highestScore : remote.highestScore);
  return {
    bestStage,
    highestScore,
    longestSurvival: chooseIndependentRecord(local.longestSurvival, remote.longestSurvival, "survivalTimeMs"),
    mostWordsCompleted: chooseIndependentRecord(local.mostWordsCompleted, remote.mostWordsCompleted, "wordsCompleted"),
    highestCombo: chooseIndependentRecord(local.highestCombo, remote.highestCombo),
    highestPerfectStreak: chooseIndependentRecord(local.highestPerfectStreak, remote.highestPerfectStreak),
    bestAccuracy: chooseIndependentRecord(local.bestAccuracy, remote.bestAccuracy),
    bestAverageWpm: chooseIndependentRecord(local.bestAverageWpm, remote.bestAverageWpm),
  };
}

function mergeModeSummary(modeId, local = {}, remote = {}) {
  const merged = {
    ...remote,
    ...local,
    completedSessions: maximum(local.completedSessions, remote.completedSessions) ?? 0,
    failedSessions: maximum(local.failedSessions, remote.failedSessions) ?? 0,
    activePlaytimeMs: maximum(local.activePlaytimeMs, remote.activePlaytimeMs) ?? 0,
    bestWpm: maximum(local.bestWpm, remote.bestWpm),
    bestAccuracy: maximum(local.bestAccuracy, remote.bestAccuracy),
    highestScore: maximum(local.highestScore, remote.highestScore),
    activity: mergeNumericObject(local.activity, remote.activity),
  };

  if (modeId === MODE_IDS.SPEED_TEST) {
    merged.records = mergeRecordMap(local.records, remote.records);
    merged.configUsage = mergeUsageMap(local.configUsage, remote.configUsage);
    merged.wordSetRecords = {};
    for (const wordSetId of new Set([
      ...Object.keys(remote.wordSetRecords || {}),
      ...Object.keys(local.wordSetRecords || {}),
    ])) {
      merged.wordSetRecords[wordSetId] = mergeRecordMap(local.wordSetRecords?.[wordSetId], remote.wordSetRecords?.[wordSetId]);
    }
    merged.wordSetConfigUsage = {};
    for (const wordSetId of new Set([...Object.keys(remote.wordSetConfigUsage || {}), ...Object.keys(local.wordSetConfigUsage || {})])) {
      merged.wordSetConfigUsage[wordSetId] = mergeUsageMap(local.wordSetConfigUsage?.[wordSetId], remote.wordSetConfigUsage?.[wordSetId]);
    }
    merged.wordSetActivity = {};
    for (const wordSetId of new Set([...Object.keys(remote.wordSetActivity || {}), ...Object.keys(local.wordSetActivity || {})])) {
      merged.wordSetActivity[wordSetId] = mergeNumericObject(local.wordSetActivity?.[wordSetId], remote.wordSetActivity?.[wordSetId]);
    }
  } else if (modeId === MODE_IDS.ENDLESS) {
    merged.highestStage = maximum(local.highestStage, remote.highestStage);
    merged.records = mergeEndlessRecords(local.records, remote.records);
  } else if (modeId === MODE_IDS.ARCADE_RUSH) {
    merged.records = mergeNumericObject(local.records, remote.records);
    merged.records.fastestCompletion = minimumNullable(local.records?.fastestCompletion, remote.records?.fastestCompletion);
  }
  return merged;
}

function profileTime(profile) {
  return finite(profile?.updatedAt) ?? finite(profile?.createdAt) ?? 0;
}

function mergeModeData(localValue, remoteValue) {
  const local = migrateModeDataToV2(localValue);
  const remote = migrateModeDataToV2(remoteValue);
  const modes = {};
  for (const modeId of Object.keys(local.modes)) {
    modes[modeId] = mergeModeSummary(modeId, local.modes[modeId], remote.modes[modeId]);
  }
  const recent = new Map();
  for (const item of [...(remote.recentSessions || []), ...(local.recentSessions || [])]) {
    if (!item?.sessionId) continue;
    const previous = recent.get(item.sessionId);
    if (!previous || (finite(item.endedAt) ?? 0) >= (finite(previous.endedAt) ?? 0)) recent.set(item.sessionId, clone(item));
  }
  const recentSessions = [...recent.values()].sort((a, b) => (finite(b.endedAt) ?? 0) - (finite(a.endedAt) ?? 0)).slice(0, 30);
  const profile = profileTime(local.profile) >= profileTime(remote.profile) ? clone(local.profile) : clone(remote.profile);
  const lifetime = {
    ...mergeNumericObject(local.lifetime, remote.lifetime),
    firstSessionAt: minimumNullable(local.lifetime?.firstSessionAt, remote.lifetime?.firstSessionAt),
    lastSessionAt: maximum(local.lifetime?.lastSessionAt, remote.lifetime?.lastSessionAt),
    historicalBackfillApplied: local.lifetime?.historicalBackfillApplied === true
      || remote.lifetime?.historicalBackfillApplied === true,
  };
  return migrateModeDataToV2({
    ...remote,
    ...local,
    profile,
    lifetime,
    totals: mergeNumericObject(local.totals, remote.totals),
    modes,
    recentSessions,
    recordedSessionIds: [...new Set([...(local.recordedSessionIds || []), ...(remote.recordedSessionIds || [])])].slice(0, 100),
  });
}

export function hasMeaningfulLocalProgress(snapshot) {
  const campaign = snapshot?.campaign;
  const mode = snapshot?.mode;
  if (campaignFurthest(campaign) > 1 || Object.keys(campaign?.levels || {}).length > 0) return true;
  if ((finite(mode?.totals?.completedSessions) ?? 0) > 0 || (finite(mode?.totals?.failedSessions) ?? 0) > 0) return true;
  const speedRecords = mode?.modes?.[MODE_IDS.SPEED_TEST]?.wordSetRecords || {};
  return Object.values(speedRecords).some((records) => Object.values(records || {}).some((record) => finite(record?.bestWpm) != null));
}

export function mergeWordStrikeSnapshotsWithSyncState(
  localSnapshot,
  remoteSnapshot,
  options = {},
) {
  const remote = remoteSnapshot?.data || {};
  const syncMerge = mergeAccountSyncState(localSnapshot, remoteSnapshot, options);
  const campaign = mergeCampaign(localSnapshot?.campaign, remote.campaign, true);
  const mergedMode = mergeModeData(localSnapshot?.mode, remote.mode);
  const mode = applyAccountCounters(mergedMode, syncMerge.counters);
  const settings = clone(syncMerge.settings || {});
  campaign.settings = clone(settings);
  const updatedAt = Number(options.now);
  return {
    snapshot: {
      schemaVersion: ACCOUNT_SNAPSHOT_SCHEMA_VERSION,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
      campaign,
      mode,
      settings,
      sync: syncMerge.sync,
    },
    localState: syncMerge.localState,
  };
}

export function mergeWordStrikeSnapshots(localSnapshot, remoteSnapshot, options = {}) {
  return mergeWordStrikeSnapshotsWithSyncState(localSnapshot, remoteSnapshot, options).snapshot;
}
