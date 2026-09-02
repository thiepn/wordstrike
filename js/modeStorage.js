import * as core from "./modeStorageV2.js";

export * from "./modeStorageV2.js";

function normalizeNullableRecentLevels(data) {
  for (const session of data?.recentSessions || []) {
    if (session?.modeData?.level === 0) session.modeData.level = null;
  }
  return data;
}

export function migrateModeDataToV2(value) {
  return normalizeNullableRecentLevels(core.migrateModeDataToV2(value));
}

export function loadModeData() {
  return normalizeNullableRecentLevels(core.loadModeData());
}

export function getRecentSessions() {
  return loadModeData().recentSessions.map((summary) => ({
    ...summary,
    modeData: { ...summary.modeData },
  }));
}
