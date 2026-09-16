export const MODE_IDS = Object.freeze({
  CAMPAIGN: "campaign",
  SPEED_TEST: "speed-test",
  ENDLESS: "endless",
  ARCADE_RUSH: "arcade-rush", // Legacy persistence / diagnostics compatibility only.
  FLOW: "flow",
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
  // Keep the legacy definition runtime-capable so historical diagnostics and
  // explicit developer deep links can still exercise old data safely. Public
  // discovery is controlled independently by `visible: false` and route: null.
  Object.freeze({
    id: MODE_IDS.ARCADE_RUSH,
    name: "Arcade Rush",
    shortLabel: "Retired",
    description: "Legacy mode retained for historical data compatibility.",
    enabled: true,
    visible: false,
    status: "retired",
    route: null,
    supportsPause: true,
    supportsSeed: true,
    storesProgress: true,
  }),
  Object.freeze({
    id: MODE_IDS.FLOW,
    name: "Flow",
    shortLabel: "Natural Typing",
    description: "Type complete passages with natural correction and rhythm.",
    enabled: true,
    visible: true,
    status: "available",
    route: "flow-ready",
    supportsPause: false,
    supportsSeed: false,
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
