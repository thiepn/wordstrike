export const Screens = Object.freeze({
  TITLE: "TITLE",
  MODE_SELECT: "MODE_SELECT",
  PRACTICE_LAB: "PRACTICE_LAB",
  ENDLESS_READY: "ENDLESS_READY",
  ENDLESS_RESULTS: "ENDLESS_RESULTS",
  DAILY_READY: "DAILY_READY",
  DAILY_RESULTS: "DAILY_RESULTS",
  SPEED_TEST_RUN: "SPEED_TEST_RUN",
  SPEED_TEST_RESULTS: "SPEED_TEST_RESULTS",
  LEVEL_SELECT: "LEVEL_SELECT",
  PLAYING: "PLAYING",
  PAUSED: "PAUSED",
  RESULTS: "RESULTS",
  SETTINGS: "SETTINGS",
  PROFILE_STATS: "PROFILE_STATS",
  LEADERBOARDS: "LEADERBOARDS",
});

export const appState = {
  screen: Screens.TITLE,
  previousScreen: Screens.TITLE,
  devMode: false,
  developerSeed: null,
  save: null,
  wordBank: null,
  bossWordBank: null,
  speedTestWordBank: null,
  commonWordBank: null,
  currentLevel: 1,
  game: null,
  results: null,
  campaignResult: null,
  menuIndex: 0,
  modeSelection: 0,
  speedTestConfigId: "time-60",
  speedTestResultsIndex: 0,
  speedTestResultsReadyAt: 0,
  speedTestResult: null,
  speedTestRecordFlags: null,
  endlessResult: null,
  endlessResultsIndex: 0,
  endlessResultsReadyAt: 0,
  endlessStartStage: 1,
  dailyDateKey: null,
  dailyDateOverride: false,
  dailyResult: null,
  dailyRecordFlags: null,
  dailyResultsIndex: 0,
  dailyResultsReadyAt: 0,
  levelSelection: 1,
  pauseIndex: 0,
  resultsIndex: 0,
  resultsReadyAt: 0,
  settingsIndex: 0,
  statisticsTabIndex: 0,
  statisticsRecentFilter: "all",
  profileEditing: false,
  profileDraft: "",
  profileNameError: "",
  profileCopyMessage: "",
};

export function getResultsActions(result) {
  const cleared = result?.grade !== "Fail";
  return [
    ...(cleared && result.levelNumber < 100 ? ["next"] : []),
    "retry",
    "levels",
    "title",
  ];
}

export function getDefaultResultsIndex(result) {
  const actions = getResultsActions(result);
  if (result?.grade === "Fail") return actions.indexOf("retry");
  return actions.indexOf(result?.levelNumber < 100 ? "next" : "levels");
}

export function isResultsInputBlocked(event, nowMs, readyAtMs) {
  return event?.repeat === true || nowMs < readyAtMs;
}

export function clearAttemptRuntime(game) {
  if (!game) return;
  game.activeTargetId = null;
  if (game.mode === "normal") {
    game.targetingState = {
      mode: "idle",
      prefix: "",
      candidateIds: [],
      activeTargetId: null,
      startedAtActiveMs: null,
    };
    if (Array.isArray(game.words)) game.words.length = 0;
    if (Array.isArray(game.wordQueue)) game.wordQueue.length = 0;
    // Clear obsolete fields if an old in-memory snapshot is supplied.
    delete game.modifierRuntime;
    delete game.blackoutStats;
    delete game.chainRuntime;
    delete game.forcedModifier;
  } else if (game.mode === "endless") {
    if (Array.isArray(game.words)) game.words.length = 0;
    if (Array.isArray(game.rollingEvents)) game.rollingEvents.length = 0;
    game.targetingState = {
      mode: "idle",
      prefix: "",
      candidateIds: [],
      activeTargetId: null,
      startedAtActiveMs: null,
    };
    delete game.activeModifier;
    delete game.previousModifier;
    delete game.modifiersSurvived;
    delete game.blackoutStats;
    game.bannerText = "";
    game.immunityUntilMs = 0;
  } else if (game.mode === "boss") {
    if (Array.isArray(game.segments)) game.segments.length = 0;
    if (Array.isArray(game.phrases)) game.phrases.length = 0;
    game.currentPhrase = "";
    game.transitionElapsedMs = 0;
  } else if (game.mode === "daily") {
    if (Array.isArray(game.words)) game.words.length = 0;
    game.bannerText = "";
    game.immunityUntilMs = 0;
    game.targetingState = {
      mode: "idle",
      prefix: "",
      candidateIds: [],
      activeTargetId: null,
      startedAtActiveMs: null,
    };
  }
}

export function isDevelopmentMode(search = "") {
  return new URLSearchParams(search).get("dev") === "1";
}

export function shouldPersistLevelResult(devMode, legitimatelyUnlocked) {
  return !devMode && legitimatelyUnlocked;
}

export function canLaunchLevel(devMode, currentFurthestLevel, levelNumber) {
  return (
    Number.isInteger(levelNumber) &&
    levelNumber >= 1 &&
    levelNumber <= 100 &&
    (devMode || levelNumber <= currentFurthestLevel)
  );
}

export function moveLevelGridSelection(currentLevel, key, maximumLevel = 100) {
  const delta = key === "ArrowLeft" ? -1
    : key === "ArrowRight" ? 1
      : key === "ArrowUp" ? -10
        : key === "ArrowDown" ? 10
          : 0;
  return Math.max(1, Math.min(maximumLevel, currentLevel + delta));
}

export function changeScreen(nextScreen, { remember = true } = {}) {
  if (remember && nextScreen === Screens.SETTINGS) {
    appState.previousScreen = appState.screen;
  }
  appState.screen = nextScreen;
}

export function returnFromSettings() {
  appState.screen = appState.previousScreen || Screens.TITLE;
}
