import { Screens } from "./appScreens.js";

export const NATIVE_BACK_STATE_KEY = "__wordstrikeNativeBack";
const ROOT_STATE = "root";
const GUARD_STATE = "guard";

function invoke(action) {
  if (typeof action === "function") action();
  return true;
}

export function createWordStrikeBackHandler({
  state,
  onboardingController,
  getSpeedTestState,
  backPracticeLab,
  backFlow,
  cancelProfileNameEdit,
  openTitle,
  openModeSelect,
  openLevelSelect,
  openEndlessReady,
  openArcadeRushReady,
  resetSpeedTestAttempt,
  pauseGame,
  pauseTypingTest,
  backFromSettings,
} = {}) {
  if (!state || typeof state !== "object") {
    throw new TypeError("Native back navigation requires app state");
  }

  return function handleWordStrikeBack() {
    if (onboardingController?.getState?.()) {
      onboardingController.close?.();
      return true;
    }

    if (typeof backFlow === "function" && backFlow() === true) {
      return true;
    }

    if (
      state.profileEditing &&
      (state.screen === Screens.PROFILE_STATS || state.screen === Screens.SETTINGS)
    ) {
      return invoke(cancelProfileNameEdit);
    }

    switch (state.screen) {
      case Screens.TITLE:
        return false;
      case Screens.MODE_SELECT:
      case Screens.PROFILE_STATS:
      case Screens.LEADERBOARDS:
        return invoke(openTitle);
      case Screens.PRACTICE_LAB:
        return typeof backPracticeLab === "function"
          ? backPracticeLab() !== false
          : invoke(openModeSelect);
      case Screens.ENDLESS_READY:
        return invoke(openModeSelect);
      case Screens.ENDLESS_RESULTS:
        return invoke(() => openEndlessReady?.("native-back"));
      case Screens.ARCADE_RUSH_READY:
        return invoke(openModeSelect);
      case Screens.ARCADE_RUSH_RESULTS:
        return invoke(() => openArcadeRushReady?.("native-back"));
      case Screens.SPEED_TEST_RUN: {
        const speedTest = getSpeedTestState?.();
        if (speedTest?.phase === "ACTIVE") return invoke(pauseTypingTest);
        return invoke(openModeSelect);
      }
      case Screens.SPEED_TEST_RESULTS:
        return invoke(() => resetSpeedTestAttempt?.("change-test"));
      case Screens.LEVEL_SELECT:
        return invoke(openModeSelect);
      case Screens.PLAYING:
        return invoke(pauseGame);
      case Screens.PAUSED: {
        if (getSpeedTestState?.()?.phase === "PAUSED") return invoke(openModeSelect);
        if (state.game?.mode === "endless") {
          return invoke(() => openEndlessReady?.("native-back"));
        }
        if (state.game?.mode === "arcade-rush") {
          return invoke(() => openArcadeRushReady?.("native-back"));
        }
        return invoke(() => openLevelSelect?.("native-back"));
      }
      case Screens.RESULTS:
        return invoke(() => openLevelSelect?.("native-back"));
      case Screens.SETTINGS:
        return invoke(backFromSettings);
      default:
        return false;
    }
  };
}

export function createNativeBackNavigation({ windowRef = globalThis.window, onBack } = {}) {
  const history = windowRef?.history;
  let mounted = false;
  let baseState = null;

  const arm = () => {
    history.pushState({ ...baseState, [NATIVE_BACK_STATE_KEY]: GUARD_STATE }, "");
  };

  const handlePopState = (event) => {
    if (!mounted || event?.state?.[NATIVE_BACK_STATE_KEY] !== ROOT_STATE) return;
    let handled = false;
    try {
      handled = onBack?.() === true;
    } catch (error) {
      console.error("Native back navigation failed", error);
      try { arm(); } catch {}
      return;
    }

    if (handled) {
      try { arm(); } catch {}
      return;
    }

    mounted = false;
    windowRef.removeEventListener?.("popstate", handlePopState);
    history.back?.();
  };

  return Object.freeze({
    mount() {
      if (mounted) return true;
      if (
        !history ||
        typeof history.replaceState !== "function" ||
        typeof history.pushState !== "function" ||
        typeof windowRef?.addEventListener !== "function"
      ) return false;
      try {
        const existingState = history.state && typeof history.state === "object"
          ? history.state
          : {};
        baseState = { ...existingState, [NATIVE_BACK_STATE_KEY]: ROOT_STATE };
        history.replaceState(baseState, "");
        arm();
        windowRef.addEventListener("popstate", handlePopState);
        mounted = true;
        return true;
      } catch {
        baseState = null;
        return false;
      }
    },
    destroy() {
      if (!mounted) return false;
      mounted = false;
      windowRef.removeEventListener?.("popstate", handlePopState);
      return true;
    },
    isMounted: () => mounted,
  });
}
