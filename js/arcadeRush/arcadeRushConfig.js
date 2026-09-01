import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_DISPLAY_NAME,
  ARCADE_RUSH_FINALE_COUNT,
  ARCADE_RUSH_MODE_ID,
  ARCADE_RUSH_READY_ROUTE,
  ARCADE_RUSH_RULES_STATUS,
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_TARGET_DURATION_MS,
  ARCADE_RUSH_WAVE_COUNT,
} from "./arcadeRushContract.js";

export const ARCADE_RUSH_FOUNDATION_CONFIG = Object.freeze({
  contractVersion: ARCADE_RUSH_CONTRACT_VERSION,
  modeId: ARCADE_RUSH_MODE_ID,
  displayName: ARCADE_RUSH_DISPLAY_NAME,
  readyRoute: ARCADE_RUSH_READY_ROUTE,
  waveCount: ARCADE_RUSH_WAVE_COUNT,
  finaleCount: ARCADE_RUSH_FINALE_COUNT,
  startingIntegrity: ARCADE_RUSH_STARTING_INTEGRITY,
  targetDurationMs: ARCADE_RUSH_TARGET_DURATION_MS,
  rulesStatus: ARCADE_RUSH_RULES_STATUS,
});

export function getArcadeRushFoundationConfig() {
  return ARCADE_RUSH_FOUNDATION_CONFIG;
}

export function isArcadeRushFoundationConfig(value) {
  return Boolean(
    value &&
    value.contractVersion === ARCADE_RUSH_CONTRACT_VERSION &&
    value.modeId === ARCADE_RUSH_MODE_ID &&
    value.waveCount === ARCADE_RUSH_WAVE_COUNT &&
    value.finaleCount === ARCADE_RUSH_FINALE_COUNT &&
    value.startingIntegrity === ARCADE_RUSH_STARTING_INTEGRITY,
  );
}
