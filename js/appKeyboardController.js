import { captureGameplayBackspace, isTextEntryTarget } from "./inputSafety.js";
import { getAllModes } from "./modes.js";
import {
  getLeaderboardKeyboardTarget,
  getLeaderboardState,
  refreshLeaderboard,
  selectLeaderboardBoard,
} from "./leaderboardService.js";
import { getCurrentSpeedTest } from "./speedTest.js";
import { STATISTICS_TABS } from "./statisticsUi.js";
import { getResultsActions, isResultsInputBlocked, Screens } from "./state.js";
import { observePracticePhysicalTelemetryKeyDown } from "./practiceLab/practicePhysicalTelemetryRuntime.js";

const LEADERBOARD_NAVIGATION_KEYS = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End",
]);

const ARCADE_RUSH_RESULT_ACTION_INDEX = Object.freeze({
  "play-again": 0,
  "mode-select": 1,
  "main-menu": 2,
  leaderboard: 3,
});

function cycleIndex(index, direction, length) {
  return (index + direction + length) % length;
}

export function createGlobalKeyboardController({
  state,
  currentTimeMs,
  routeActiveGameplayKey,
  cancelProfileNameEdit,
  saveProfileName,
  openTitle,
  selectStatisticsTab,
  resumeGame,
  renderPauseOverlay,
  resetSpeedTestAttempt,
  startCampaignPlacement,
  openModeSelect,
  startEndless,
  startArcadeRush,
  openArcadeRushLeaderboard,
  retryCurrentLevel,
  backPracticeLab,
  activateTitleAction,
  renderCurrentScreen,
  syncModeSelection,
  syncResultsSelection,
  activateSelectedMode,
  moveLevelSelection,
  startLevel,
  openLevelSelect,
  backFromSettings,
  toggleSetting,
  confirmReset,
  titleActionCount = 4,
} = {}) {
  if (!state || typeof state !== "object") throw new TypeError("Keyboard controller requires app state");
  if (typeof currentTimeMs !== "function") throw new TypeError("Keyboard controller requires a clock");
  if (typeof routeActiveGameplayKey !== "function") throw new TypeError("Keyboard controller requires gameplay routing");
  const renderModeSelection = typeof syncModeSelection === "function"
    ? syncModeSelection
    : renderCurrentScreen;
  const renderResultsSelection = typeof syncResultsSelection === "function"
    ? syncResultsSelection
    : () => renderCurrentScreen?.();

  return function handleGlobalKeydown(event) {
    if (event?.defaultPrevented) return;
    // Native mode controls must not type, launch a level, restart, or navigate a menu.
    const presentation = event.target?.closest?.("[data-mode-presentation]");
    if (presentation) {
      if (event.key === "Escape" && presentation.open) {
        event.preventDefault?.();
        presentation.open = false;
        presentation.querySelector("summary")?.focus?.();
        return;
      }
      if (event.key !== "Escape") return;
    }
    const gameplayInputMode = state.screen === Screens.SPEED_TEST_RUN
      ? "typing"
      : state.screen === Screens.PLAYING
        ? state.game?.mode || "campaign"
        : null;
    if (captureGameplayBackspace(event, {
      mode: gameplayInputMode,
      onTypingBackspace: (backspaceEvent) => routeActiveGameplayKey(backspaceEvent),
    })) return;
    // Text entry remains isolated; only commands from our gameplay input are routed.
    const isGameplayInput = event.target?.matches?.("textarea.gameplay-input") === true;
    const isGameplayCommand = event.key === "Escape"
      || (gameplayInputMode === "typing" && event.key === "Tab");
    if (gameplayInputMode && isGameplayInput && isGameplayCommand) {
      routeActiveGameplayKey(event);
      return;
    }
    // PL36 reuses this existing global keydown pipeline. The observer is inert unless
    // an eligible physical-keyboard Practice session has explicitly activated it.
    if (state.screen === Screens.PRACTICE_LAB) observePracticePhysicalTelemetryKeyDown(event);
    if (isTextEntryTarget(event.target)) return;
    if (
      ["Enter", " "].includes(event.key) &&
      event.target?.matches?.("button, a, summary, [role=button], [role=tab]")
    ) return;
    if (routeActiveGameplayKey(event)) return;

    if (state.screen === Screens.PROFILE_STATS) {
      if (state.profileEditing) {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelProfileNameEdit();
        } else if (event.key === "Enter") {
          event.preventDefault();
          saveProfileName(event.target?.value);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        openTitle();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        selectStatisticsTab(cycleIndex(state.statisticsTabIndex, direction, STATISTICS_TABS.length));
      }
      return;
    }

    if (state.screen === Screens.PAUSED) {
      if (state.game?.mode === "arcade-rush") {
        const actions = ["resume", "restart", "modes"];
        if (event.key === "Escape") {
          resumeGame();
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault?.();
          const direction = event.key === "ArrowUp" ? -1 : 1;
          state.pauseIndex = cycleIndex(state.pauseIndex, direction, actions.length);
          renderPauseOverlay();
        } else if (event.key === "Enter") {
          const action = actions[state.pauseIndex] || actions[0];
          if (action === "resume") resumeGame();
          else if (action === "restart") startArcadeRush?.("restart");
          else openModeSelect();
        }
        return;
      }
      if (event.key === "Escape") {
        resumeGame();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault?.();
        const direction = event.key === "ArrowUp" ? -1 : 1;
        state.pauseIndex = cycleIndex(state.pauseIndex, direction, 4);
        renderPauseOverlay();
      } else if (event.key === "Enter") {
        if (getCurrentSpeedTest()?.phase === "PAUSED") {
          [
            resumeGame,
            () => resetSpeedTestAttempt("pause-restart"),
            openModeSelect,
            openTitle,
          ][state.pauseIndex]();
        } else if (state.game?.mode === "endless") {
          [resumeGame, () => startEndless("restart"), openModeSelect, openTitle][state.pauseIndex]();
        } else {
          [resumeGame, retryCurrentLevel, openModeSelect, openTitle][state.pauseIndex]();
        }
      }
      return;
    }

    if (state.screen === Screens.PRACTICE_LAB) {
      if (event.key === "Escape") backPracticeLab?.();
      return;
    }

    if (state.screen === Screens.TITLE) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault?.();
        const direction = event.key === "ArrowUp" ? -1 : 1;
        state.menuIndex = cycleIndex(state.menuIndex, direction, titleActionCount);
        renderCurrentScreen();
      } else if (event.key === "Enter") {
        activateTitleAction();
      }
      return;
    }

    if (state.screen === Screens.LEADERBOARDS) {
      if (event.key === "Escape") openTitle();
      else if (LEADERBOARD_NAVIGATION_KEYS.has(event.key)) {
        event.preventDefault?.();
        const boardKey = getLeaderboardKeyboardTarget(getLeaderboardState(), event.key);
        if (boardKey) void selectLeaderboardBoard(boardKey);
      } else if (event.key.toLowerCase() === "r") {
        void refreshLeaderboard();
      }
      return;
    }

    if (state.screen === Screens.MODE_SELECT) {
      const itemCount = getAllModes().length + 1;
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault?.();
        state.modeSelection = cycleIndex(state.modeSelection, -1, itemCount);
        renderModeSelection();
      } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault?.();
        state.modeSelection = cycleIndex(state.modeSelection, 1, itemCount);
        renderModeSelection();
      } else if (event.key === "Enter") {
        if (state.modeSelection === getAllModes().length) openTitle();
        else activateSelectedMode();
      } else if (event.key === "Escape") {
        openTitle();
      }
      return;
    }

    if (state.screen === Screens.ENDLESS_READY) {
      if (event.key === "Escape") openModeSelect();
      else if (event.key === "Enter") startEndless("mode-select");
      return;
    }

    if (state.screen === Screens.ENDLESS_RESULTS) {
      const actions = ["retry", "modes", "title"];
      if (isResultsInputBlocked(event, currentTimeMs(), state.endlessResultsReadyAt)) return;
      if (event.key === "Escape") {
        openModeSelect();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault?.();
        const direction = event.key === "ArrowUp" ? -1 : 1;
        state.endlessResultsIndex = cycleIndex(state.endlessResultsIndex, direction, actions.length);
        renderResultsSelection(Screens.ENDLESS_RESULTS, state.endlessResultsIndex);
      } else if (event.key === "Enter") {
        const action = actions[state.endlessResultsIndex];
        if (action === "retry") startEndless("retry");
        else if (action === "modes") openModeSelect();
        else openTitle();
      }
      return;
    }

    if (state.screen === Screens.ARCADE_RUSH_READY) {
      if (event.key === "Escape") openModeSelect();
      else if (event.key === "Enter") startArcadeRush?.("arcade-rush-ready");
      return;
    }

    if (state.screen === Screens.ARCADE_RUSH_RESULTS) {
      const actions = ["retry", "modes", "title", "leaderboard"];
      if (isResultsInputBlocked(event, currentTimeMs(), state.arcadeRushResultsReadyAt)) return;
      if (event.key === "Escape") {
        openModeSelect();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault?.();
        const focusedAction = event.target?.closest?.("[data-rush-action]")?.dataset?.rushAction;
        const focusedIndex = ARCADE_RUSH_RESULT_ACTION_INDEX[focusedAction];
        if (Number.isInteger(focusedIndex)) state.arcadeRushResultsIndex = focusedIndex;
        const direction = event.key === "ArrowUp" ? -1 : 1;
        state.arcadeRushResultsIndex = cycleIndex(state.arcadeRushResultsIndex, direction, actions.length);
        renderResultsSelection(Screens.ARCADE_RUSH_RESULTS, state.arcadeRushResultsIndex);
      } else if (event.key === "Enter") {
        const action = actions[state.arcadeRushResultsIndex];
        if (action === "retry") startArcadeRush?.("retry");
        else if (action === "modes") openModeSelect();
        else if (action === "title") openTitle();
        else openArcadeRushLeaderboard?.();
      }
      return;
    }

    if (state.screen === Screens.SPEED_TEST_RESULTS) {
      const campaignPlacement = state.speedTestResult?.sessionSource === "campaign-placement";
      const actions = campaignPlacement
        ? ["campaign", "retry", "modes", "title"]
        : ["retry", "change", "modes", "title"];
      if (isResultsInputBlocked(event, currentTimeMs(), state.speedTestResultsReadyAt)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (campaignPlacement) openLevelSelect("placement-result");
        else resetSpeedTestAttempt("change-test");
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const direction = event.key === "ArrowUp" ? -1 : 1;
        state.speedTestResultsIndex = cycleIndex(state.speedTestResultsIndex, direction, actions.length);
        renderResultsSelection(Screens.SPEED_TEST_RESULTS, state.speedTestResultsIndex);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const action = actions[state.speedTestResultsIndex];
        if (action === "campaign") openLevelSelect("placement-result");
        else if (action === "retry") {
          if (campaignPlacement) startCampaignPlacement?.();
          else resetSpeedTestAttempt("retry");
        }
        else if (action === "change") resetSpeedTestAttempt("change-test");
        else if (action === "modes") openModeSelect();
        else openTitle();
      }
      return;
    }

    if (state.screen === Screens.LEVEL_SELECT) {
      if (event.key.startsWith("Arrow")) {
        event.preventDefault?.();
        moveLevelSelection(event.key);
      }
      if (event.key === "Enter") startLevel(state.levelSelection);
      if (event.key === "Escape") openModeSelect();
      return;
    }

    if (state.screen === Screens.RESULTS) {
      const actions = getResultsActions(state.results);
      if (isResultsInputBlocked(event, currentTimeMs(), state.resultsReadyAt)) return;
      if (event.key === "Escape") {
        openLevelSelect();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault?.();
        const direction = event.key === "ArrowUp" ? -1 : 1;
        state.resultsIndex = cycleIndex(state.resultsIndex, direction, actions.length);
        renderResultsSelection(Screens.RESULTS, state.resultsIndex);
      } else if (event.key === "Enter") {
        const action = actions[state.resultsIndex];
        if (action === "retry") startLevel(state.results.levelNumber, "retry");
        else if (action === "next") startLevel(state.results.levelNumber + 1, "next-level");
        else if (action === "levels") openLevelSelect();
        else openTitle();
      }
      return;
    }

    if (state.screen === Screens.SETTINGS) {
      if (event.key === "Escape") {
        backFromSettings();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault?.();
        const direction = event.key === "ArrowUp" ? -1 : 1;
        state.settingsIndex = cycleIndex(state.settingsIndex, direction, 5);
        renderCurrentScreen();
      } else if (event.key === "Enter") {
        const keys = ["strictMode", "particles", "screenShake"];
        if (state.settingsIndex < 3) toggleSetting(keys[state.settingsIndex]);
        if (state.settingsIndex === 3) confirmReset();
        if (state.settingsIndex === 4) backFromSettings();
      }
    }
  };
}
