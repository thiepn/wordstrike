export const MODE_IDS = Object.freeze({
  CAMPAIGN: "campaign",
  SPEED_TEST: "speed-test",
  ENDLESS: "endless",
  ARCADE_RUSH: "arcade-rush",
  PRACTICE: "practice",
});

const MODE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: MODE_IDS.CAMPAIGN,
    name: "Campaign",
    shortLabel: "100 Levels",
    description: "Defend the core through 100 levels.",
    enabled: true,
    visible: true,
    status: "available",
    route: "level-select",
    supportsPause: true,
    supportsSeed: true,
    storesProgress: true,
  }),
  Object.freeze({
    id: MODE_IDS.SPEED_TEST,
    name: "Typing Test",
    shortLabel: "Speed + Accuracy",
    description: "Measure your typing speed and accuracy.",
    enabled: true,
    visible: true,
    status: "available",
    route: "speed-test",
    supportsPause: true,
    supportsSeed: true,
    storesProgress: true,
  }),
  Object.freeze({
    id: MODE_IDS.ENDLESS,
    name: "Endless",
    shortLabel: "Survival",
    description: "Survive escalating stages for as long as possible.",
    enabled: true,
    visible: true,
    status: "available",
    route: "endless-ready",
    supportsPause: true,
    supportsSeed: true,
    storesProgress: true,
  }),
  Object.freeze({
    id: MODE_IDS.ARCADE_RUSH,
    name: "Arcade Rush",
    shortLabel: "Score Attack",
    description: "Race through escalating waves and defeat Core Breaker.",
    enabled: true,
    visible: true,
    status: "available",
    route: "arcade-rush-ready",
    supportsPause: true,
    supportsSeed: true,
    storesProgress: true,
  }),
  Object.freeze({
    id: MODE_IDS.PRACTICE,
    name: "Practice Lab",
    shortLabel: "Training",
    description: "Train focused typing skills.",
    enabled: false,
    visible: true,
    status: "coming-soon",
    route: null,
    supportsPause: true,
    supportsSeed: true,
    storesProgress: true,
  }),
]);

const MODE_BY_ID = new Map(MODE_DEFINITIONS.map((mode) => [mode.id, mode]));

export function isValidModeId(modeId) {
  return typeof modeId === "string" && MODE_BY_ID.has(modeId);
}

export function getModeDefinition(modeId) {
  return MODE_BY_ID.get(modeId) || null;
}

export function getRegisteredModes() {
  return [...MODE_DEFINITIONS];
}

export function getAllModes({ includeHidden = false } = {}) {
  return MODE_DEFINITIONS.filter((mode) => includeHidden || mode.visible !== false);
}

export function getEnabledModes({ includeHidden = false } = {}) {
  return MODE_DEFINITIONS.filter((mode) => (
    mode.enabled && (includeHidden || mode.visible !== false)
  ));
}

export function isModeEnabled(modeId) {
  return getModeDefinition(modeId)?.enabled === true;
}
