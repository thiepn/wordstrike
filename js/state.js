import { Screens, isKnownScreen } from "./appScreens.js";
import {
  appState,
  getStateDomain,
  getStateOwner,
  patchStateDomain,
  resetStateDomains,
  snapshotStateDomains,
  STATE_DOMAIN_NAMES,
  stateDomains,
} from "./appStateDomains.js";

export {
  appState,
  getStateDomain,
  getStateOwner,
  patchStateDomain,
  resetStateDomains,
  snapshotStateDomains,
  STATE_DOMAIN_NAMES,
  stateDomains,
  Screens,
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
  if (!isKnownScreen(nextScreen)) throw new TypeError(`Unknown app screen: ${nextScreen}`);
  const navigation = stateDomains.navigation;
  if (remember && nextScreen === Screens.SETTINGS) {
    navigation.previousScreen = navigation.screen;
  }
  navigation.screen = nextScreen;
  return navigation.screen;
}

export function returnFromSettings() {
  const navigation = stateDomains.navigation;
  navigation.screen = isKnownScreen(navigation.previousScreen)
    ? navigation.previousScreen
    : Screens.TITLE;
  return navigation.screen;
}
