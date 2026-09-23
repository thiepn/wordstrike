export function pauseHiddenGameplay({
  hidden,
  screen,
  screens,
  speedTest,
  pauseTypingTest,
  pauseGameplay,
} = {}) {
  if (hidden !== true) return false;
  if (screen === screens?.SPEED_TEST_RUN) {
    if (speedTest?.phase !== "ACTIVE" || typeof pauseTypingTest !== "function") return false;
    pauseTypingTest();
    return true;
  }
  if (screen === screens?.PLAYING) {
    if (typeof pauseGameplay !== "function") return false;
    pauseGameplay();
    return true;
  }
  return false;
}

export function createGameplayVisibilityLifecycle({
  documentRef = globalThis.document,
  getScreen,
  getSpeedTest,
  screens,
  pauseTypingTest,
  pauseGameplay,
} = {}) {
  let mounted = false;
  const handleVisibilityChange = () => pauseHiddenGameplay({
    hidden: documentRef?.hidden === true,
    screen: getScreen?.(),
    screens,
    speedTest: getSpeedTest?.(),
    pauseTypingTest,
    pauseGameplay,
  });
  return Object.freeze({
    handleVisibilityChange,
    mount() {
      if (mounted || typeof documentRef?.addEventListener !== "function") return false;
      documentRef.addEventListener("visibilitychange", handleVisibilityChange);
      mounted = true;
      return true;
    },
    unmount() {
      if (!mounted || typeof documentRef?.removeEventListener !== "function") return false;
      documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
      mounted = false;
      return true;
    },
  });
}
