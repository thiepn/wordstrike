import {
  appState,
  canLaunchLevel,
  changeScreen,
  clearAttemptRuntime,
  isDevelopmentMode,
  getDefaultResultsIndex,
  getResultsActions,
  isResultsInputBlocked,
  moveLevelGridSelection,
  returnFromSettings,
  Screens,
  shouldPersistLevelResult,
} from "./state.js";
import {
  generateBossLevel,
  generateLevel,
} from "./levelGenerator.js";
import { generateBossEncounter } from "./bossGenerator.js";
import {
  loadSave,
  resetProgress,
  updateLevelResult,
  updateSetting,
  updateSpeedTestTimerPosition,
} from "./storage.js";
import {
  loadBossWordBank,
  loadCommonWordBank,
  loadWordBank,
  createNormalWordAttempt,
} from "./wordBank.js";
import { loadSpeedTestWordBank } from "./speedTestWords.js";
import { calculateGrade } from "./scoring.js";
import {
  calculateSessionAccuracy,
  calculateSessionWpm,
} from "./sessionMetrics.js";
import { handleBossKey, handleGameplayKey } from "./input.js";
import {
  resumeGameLoop,
  startLevelLoop,
  stopGameLoop,
} from "./gameLoop.js";
import {
  completeBossPhrase,
  resumeBossLoop,
  startBossLoop,
  stopBossLoop,
} from "./bossLoop.js";
import { createAttemptSeed, parseDeveloperSeed } from "./random.js";
import {
  clearSpeedTestLayout,
  hidePauseOverlay,
  renderBossShell,
  renderEndlessReady,
  renderEndlessResults,
  renderEndlessShell,
  renderDailyReady,
  renderDailyResults,
  renderDailyShell,
  renderGameplayShell,
  renderLevelSelect,
  renderModeSelect,
  renderSpeedTestResults,
  renderSpeedTestRun,
  renderDevModeIndicator,
  renderDevSessionDiagnostics,
  renderResults,
  renderSettings,
  renderTitle,
  showPauseOverlay,
  showEndlessPauseOverlay,
  showDailyPauseOverlay,
  showSpeedTestPauseOverlay,
  updateEndlessHud,
  updateDailyHud,
  updateBossHud,
  updateHud,
  updateSpeedTestRun,
  updateGlobalSubmissionRegion,
} from "./ui.js";
import { getAllModes, isModeEnabled, MODE_IDS } from "./modes.js";
import {
  beginCampaignSession,
  finalizeCampaignSession,
  syncCampaignSession,
} from "./campaignSession.js";
import {
  clearSession,
  pauseSession,
  resumeSession,
} from "./sessionManager.js";
import { cleanupCurrentSession } from "./sessionCleanup.js";
import {
  DEFAULT_SPEED_TEST_CONFIG_ID,
  getSpeedTestConfig,
  normalizeSpeedTestConfigId,
  moveSpeedTestConfiguration,
  parseDeveloperSpeedTestConfig,
} from "./speedTestConfig.js";
import {
  clearSpeedTestRuntime,
  getCurrentSpeedTest,
  getSpeedTestCurrentWord,
  handleCurrentSpeedTestKey,
  pauseSpeedTest,
  resumeSpeedTest,
  startSpeedTest,
  stopSpeedTestLoop,
} from "./speedTest.js";
import { createEndlessVocabulary } from "./endlessWords.js";
import {
  clearEndlessRuntime,
  handleEndlessKey,
  resumeEndlessLoop,
  startEndlessRun,
  stopEndlessLoop,
} from "./endlessMode.js";
import { createDailyVocabulary, generateDailyPlan } from "./dailyGenerator.js";
import { getUtcDateKey, isValidDailyDateKey, parseDailyDateOverride } from "./dailyDate.js";
import {
  ensureStoredPlayerProfile,
  getDailyRecord,
  loadModeData,
  updateStoredDisplayName,
} from "./modeStorage.js";
import { copyPlayerIdToClipboard, validateDisplayName } from "./playerProfile.js";
import { getStatisticsSnapshot } from "./statistics.js";
import {
  renderProfileStatistics,
  renderSettingsAccountManagement,
  STATISTICS_TABS,
  updateLeaderboardUsernameFeedback,
  updateProfileAuthSection,
} from "./statisticsUi.js";
import {
  clearDailyRuntime,
  handleDailyKey,
  resumeDailyLoop,
  startDailyRun,
  stopDailyLoop,
} from "./dailyMode.js";
import {
  attachAppClickListener,
  resolveAppClickAction,
} from "./appClickRouting.js";
import {
  getAuthState,
  initializeAuth,
  signInWithGoogle,
  signOut,
  subscribeToAuth,
} from "./authService.js";
import {
  cancelUsernameChange,
  changeUsername,
  checkUsernameAvailability,
  claimUsername,
  getLeaderboardProfileState,
  initializeLeaderboardProfile,
  resetLeaderboardProfile,
  setUsernameDraft,
  startUsernameChange,
  subscribeToLeaderboardProfile,
} from "./leaderboardProfileService.js";
import { captureGameplayBackspace, isTextEntryTarget } from "./inputSafety.js";
import {
  createMobileInputAdapter,
  keyboardEventFromNormalized,
} from "./mobileInputAdapter.js";
import { createOnboardingController } from "./onboarding.js";
import { createOnboardingView } from "./onboardingView.js";
import {
  isHintSeen,
  getOnboardingStorageDiagnostic,
  markHintSeen,
  resetAllOnboarding,
  resetContextualHints,
} from "./onboardingStorage.js";
import {
  dismissContextualHint,
  getActiveContextualHint,
  showContextualHint,
} from "./contextualHints.js";
import {
  getLeaderboardState,
  getLeaderboardKeyboardTarget,
  initializeLeaderboards,
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_BOARDS,
  refreshLeaderboard,
  resetLeaderboardState,
  selectLeaderboardBoard,
  selectLeaderboardCategory,
  selectTypingDuration,
  subscribeToLeaderboards,
} from "./leaderboardService.js";
import { renderLeaderboards } from "./leaderboardUi.js";
import {
  clearSubmissionState,
  getSubmissionState,
  prepareResultSubmission,
  retryCurrentSubmission,
  submitCurrentResult,
  subscribeToSubmissions,
} from "./leaderboardSubmissionService.js";
import {
  savePendingResultSubmission,
} from "./pendingResultSubmission.js";
import { createPendingResultCoordinator } from "./pendingResultCoordinator.js";
import { createPracticeFeatureGate } from "./practiceLab/practiceFeatureGate.js";
import { createPracticeExperimentRegistry } from "./practiceLab/practiceExperimentRegistry.js";
import { createPracticeLabController } from "./practiceLab/practiceLabController.js";
import {
  armPreparedResult,
  clearAutomaticSubmission,
  handleAutomaticSubmissionStateChange,
} from "./automaticSubmissionController.js";
import {
  consumeLeaderboardReturnState,
  leaderboardReturnStateForBoard,
  saveLeaderboardReturnState,
} from "./leaderboardReturnState.js";

const titleActions = ["modes", "leaderboards", "profile", "settings"];
const currentTimeMs = () => globalThis.performance?.now?.() ?? Date.now();
let lastAuthUiKey = "";
let bootstrapReady = false;
let pendingLeaderboardReturn = null;
let leaderboardNotice = "";
let deactivateGameplayInput = () => {};
const onboardingController = createOnboardingController();
let onboardingView = null;
let tutorialHintMode = null;
let practiceLabFeatureGate = null;
let practiceLabRegistry = null;
let practiceLabController = null;

function getPracticeLabFeatureGate() {
  if (!practiceLabFeatureGate) practiceLabFeatureGate = createPracticeFeatureGate({ developerMode: appState.devMode });
  return practiceLabFeatureGate;
}

function ensurePracticeLabController() {
  if (practiceLabController) return practiceLabController;
  const featureGate = getPracticeLabFeatureGate();
  practiceLabRegistry = createPracticeExperimentRegistry({ featureGate });
  practiceLabController = createPracticeLabController({
    root: document.querySelector("#app"), featureGate, experimentRegistry: practiceLabRegistry,
    appNavigation: {
      exit: openModeSelect,
    },
  });
  return practiceLabController;
}

function unmountPracticeLab() {
  practiceLabController?.unmount();
  practiceLabRegistry?.destroy();
  practiceLabController = null;
  practiceLabRegistry = null;
}
const pendingResultCoordinator = createPendingResultCoordinator({
  onUsernameRequired: () => {
    if (bootstrapReady && appState.screen !== Screens.SETTINGS) openAccountSettings();
  },
  onFailure: () => {
    if (bootstrapReady && appState.screen !== Screens.SETTINGS) openAccountSettings();
  },
  onSuccess: (_state, intent) => {
    if (bootstrapReady) openLeaderboardBoard(intent.boardKey, { notice: "LAST RESULT SUBMITTED" });
  },
});

function ensureOnboardingView() {
  onboardingView ||= createOnboardingView(onboardingController);
  return onboardingView;
}

function openTutorial(id, { source = "help", onComplete = null, primaryLabel = null } = {}) {
  ensureOnboardingView();
  return onboardingController.open(id, {
    source,
    onComplete,
    primaryLabel,
    signedIn: getAuthState().status === "signed-in",
  });
}

function openAutomaticTutorial(id, onComplete = null, options = {}) {
  if (!onboardingController.shouldOpenAutomatically(id)) return false;
  return openTutorial(id, { source: "automatic", onComplete, ...options });
}

function beginContextualHints(mode, text, timeoutMs = 3500) {
  const runId = `${mode}-tutorial-run`;
  if (isHintSeen(runId)) return false;
  markHintSeen(runId);
  tutorialHintMode = mode;
  showContextualHint(`${mode}-start`, text, { timeoutMs });
  return true;
}

function stopActiveLoops() {
  stopGameLoop();
  stopBossLoop();
  stopSpeedTestLoop();
  stopEndlessLoop();
  stopDailyLoop();
}

function unmountGameplayInput() {
  deactivateGameplayInput();
  deactivateGameplayInput = () => {};
}

function discardActiveAttempt() {
  dismissContextualHint();
  tutorialHintMode = null;
  unmountGameplayInput();
  clearAttemptRuntime(appState.game);
  clearSpeedTestLayout();
  clearSpeedTestRuntime();
  clearEndlessRuntime();
  clearDailyRuntime();
}

function routeActiveGameplayKey(event) {
  if (appState.screen === Screens.SPEED_TEST_RUN) {
    const speedState = getCurrentSpeedTest();
    if (event.target?.dataset?.speedTimerPosition) return true;
    if (speedState?.phase === "PREPARING" && [
      "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End",
    ].includes(event.key)) {
      event.preventDefault();
      changeSpeedTestConfig(moveSpeedTestConfiguration(appState.speedTestConfigId, event.key));
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      pauseTypingTest();
      return true;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      resetSpeedTestAttempt("tab-reset");
      return true;
    }
    const beforeWords = speedState?.metrics?.wordsCompleted || 0;
    const handled = handleCurrentSpeedTestKey(event, currentTimeMs());
    if (tutorialHintMode === "typing" && handled) {
      if (event.key === " " && (speedState?.metrics?.wordsCompleted || 0) > beforeWords) {
        dismissContextualHint();
        tutorialHintMode = null;
      } else if (
        beforeWords === 0 &&
        speedState?.typedBuffer === getSpeedTestCurrentWord(speedState)
      ) {
        showContextualHint("typing-space", "PRESS SPACE AFTER EACH WORD", { timeoutMs: 0 });
      }
    }
    return true;
  }
  if (appState.screen !== Screens.PLAYING) return false;
  if (event.key === "Escape") {
    event.preventDefault();
    pauseGame();
    return true;
  }
  if (appState.game?.mode === "endless") {
    handleEndlessKey(event, appState.game);
    updateEndlessHud(appState.game);
  } else if (appState.game?.mode === "daily") {
    handleDailyKey(event, appState.game);
    updateDailyHud(appState.game);
  } else if (appState.game?.mode === "boss") {
    handleBossKey(event, appState.game, appState.save.settings, completeBossPhrase);
    updateBossHud(appState.game);
  } else {
    const beforeCompleted = appState.game?.completedWordCount || 0;
    handleGameplayKey(event, appState.game, appState.save.settings, updateHud);
    updateHud(appState.game);
    if (
      tutorialHintMode === "campaign" &&
      (appState.game?.completedWordCount || 0) > beforeCompleted
    ) {
      showContextualHint("campaign-continue", "KEEP GOING", { timeoutMs: 2200 });
      tutorialHintMode = null;
    }
  }
  return true;
}

function mountGameplayInput() {
  deactivateGameplayInput();
  deactivateGameplayInput = createMobileInputAdapter({
    onInput: (input) => routeActiveGameplayKey(keyboardEventFromNormalized(input)),
    isEnabled: () => [Screens.PLAYING, Screens.SPEED_TEST_RUN].includes(appState.screen),
  });
}

function cleanupCampaignAttempt(reason, { clearSessionState = true } = {}) {
  cleanupCurrentSession({
    reason,
    stopGameplay: stopActiveLoops,
    hidePause: hidePauseOverlay,
    clearRuntime: discardActiveAttempt,
    clearSessionState,
  });
  appState.game = null;
  appState.pauseIndex = 0;
  clearAutomaticSubmission();
  clearSubmissionState();
}

function prepareAutomaticResultSubmission(mode, result) {
  const authState = getAuthState();
  const profileState = getLeaderboardProfileState();
  prepareResultSubmission(mode, result, authState, profileState);
  armPreparedResult(authState, profileState);
}

function startPreparedAutomaticSubmission() {
  void handleAutomaticSubmissionStateChange(getAuthState(), getLeaderboardProfileState());
}

function getAttemptSeed() {
  return appState.devMode && appState.developerSeed
    ? appState.developerSeed
    : createAttemptSeed();
}

function openTitle() {
  unmountPracticeLab();
  cleanupCampaignAttempt("main-menu");
  changeScreen(Screens.TITLE);
  appState.menuIndex = 0;
  appState.profileEditing = false;
  renderCurrentScreen();
}

function openProfileStatistics() {
  cleanupCampaignAttempt("profile-stats");
  ensureStoredPlayerProfile();
  appState.statisticsTabIndex = 0;
  appState.statisticsRecentFilter = "all";
  appState.profileEditing = false;
  appState.profileDraft = "";
  appState.profileNameError = "";
  appState.profileCopyMessage = "";
  changeScreen(Screens.PROFILE_STATS);
  renderCurrentScreen();
}

function openLeaderboardBoard(boardKey, { notice = "" } = {}) {
  leaderboardNotice = notice;
  cleanupCampaignAttempt("leaderboards");
  changeScreen(Screens.LEADERBOARDS);
  renderCurrentScreen();
  void initializeLeaderboards(boardKey);
  openAutomaticTutorial("leaderboards", (choice) => {
    if (choice === "google") {
      saveLeaderboardReturnState(leaderboardReturnStateForBoard(boardKey));
      void signInWithGoogle();
    }
  });
}

function openLeaderboards() {
  openLeaderboardBoard(LEADERBOARD_BOARDS.CAMPAIGN);
}

function openLeaderboardReturn(returnState) {
  if (returnState?.screen === "title") {
    openTitle();
    return;
  }
  const boardKey = returnState?.selectedCategory === LEADERBOARD_CATEGORIES.TYPING
    ? returnState.typingDuration === 15 ? LEADERBOARD_BOARDS.TYPING_15 : LEADERBOARD_BOARDS.TYPING_60
    : returnState?.selectedCategory === LEADERBOARD_CATEGORIES.ENDLESS
      ? LEADERBOARD_BOARDS.ENDLESS
      : returnState?.selectedCategory === LEADERBOARD_CATEGORIES.DAILY
        ? LEADERBOARD_BOARDS.DAILY
        : LEADERBOARD_BOARDS.CAMPAIGN;
  openLeaderboardBoard(boardKey);
}

function openModeSelect() {
  unmountPracticeLab();
  cleanupCampaignAttempt("mode-select");
  changeScreen(Screens.MODE_SELECT);
  appState.modeSelection = 0;
  renderCurrentScreen();
}

function openPracticeLab() {
  if (!getPracticeLabFeatureGate().canAccess()) return false;
  cleanupCampaignAttempt("practice-lab");
  changeScreen(Screens.PRACTICE_LAB);
  renderCurrentScreen();
  return true;
}

function openEndlessReady(reason = "endless-ready") {
  cleanupCampaignAttempt(reason);
  changeScreen(Screens.ENDLESS_READY);
  renderCurrentScreen();
  if (reason === "mode-select") {
    openAutomaticTutorial("endless", (choice) => {
      if (choice === "primary") startEndless("mode-select");
    });
  }
}

function openDailyReady(reason = "daily-ready") {
  cleanupCampaignAttempt(reason);
  if (!appState.devMode || !appState.dailyDateOverride) {
    appState.dailyDateKey = getUtcDateKey();
  }
  appState.dailyResult = null;
  appState.dailyRecordFlags = null;
  changeScreen(Screens.DAILY_READY);
  renderCurrentScreen();
  if (reason === "mode-select") {
    openAutomaticTutorial("daily", (choice) => {
      if (choice === "primary") startDaily("daily-ready", appState.dailyDateKey);
    });
  }
}

function openLevelSelect(reason = "level-select") {
  cleanupCampaignAttempt(reason);
  changeScreen(Screens.LEVEL_SELECT);
  const selectionLimit = appState.devMode ? 100 : appState.save.currentFurthestLevel;
  appState.levelSelection = Math.min(appState.currentLevel || 1, selectionLimit, 100);
  renderCurrentScreen();
}

function openSettings() {
  changeScreen(Screens.SETTINGS);
  appState.settingsIndex = 0;
  renderCurrentScreen();
}

function openAccountSettings() {
  cleanupCampaignAttempt("account-settings");
  openSettings();
  globalThis.requestAnimationFrame?.(() => {
    const account = document.querySelector("#settings-account-management");
    account?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    account?.focus?.({ preventScroll: true });
  });
}

function backFromSettings() {
  returnFromSettings();
  renderCurrentScreen();
}

function startLevel(levelNumber, source = "level-select") {
  const safeLevel = Math.max(1, Math.min(100, levelNumber));
  const legitimatelyUnlocked = safeLevel <= appState.save.currentFurthestLevel;
  if (!canLaunchLevel(appState.devMode, appState.save.currentFurthestLevel, safeLevel)) return;
  if (safeLevel % 10 === 0 && source !== "developer" && openAutomaticTutorial("boss", (choice) => {
    if (choice === "primary") startLevel(safeLevel, source);
  })) return;
  cleanupCampaignAttempt(source === "retry" ? "retry" : "new-session");
  appState.campaignResult = null;
  appState.currentLevel = safeLevel;
  if (safeLevel % 10 === 0) {
    startBossLevel(safeLevel, legitimatelyUnlocked, source);
    return;
  }
  const config = generateLevel(safeLevel);
  const attemptSeed = getAttemptSeed();
  const attempt = createNormalWordAttempt(appState.wordBank, config, attemptSeed);
  beginCampaignSession({
    level: safeLevel,
    isBoss: false,
    seed: attemptSeed,
    source: appState.devMode ? "developer" : source,
    developerMode: appState.devMode,
    difficultyData: config,
  });
  changeScreen(Screens.PLAYING);
  renderGameplayShell(
    safeLevel,
    config.lives,
    config,
    appState.devMode,
    { attemptSeed, ...attempt },
    { pause: pauseGame },
  );
  mountGameplayInput();
  const game = startLevelLoop(
    safeLevel,
    config,
    attempt.spawnQueue,
    {
      onHudUpdate: (currentGame) => {
        syncCampaignSession(currentGame);
        updateHud(currentGame);
        if (
          tutorialHintMode === "campaign" &&
          !getActiveContextualHint() &&
          !isHintSeen("campaign-danger") &&
          currentGame.words.some((word) => Number(word.travelProgress) >= 0.7)
        ) {
          showContextualHint("campaign-danger", "WORDS DAMAGE THE CORE IF THEY REACH THE CENTER", { timeoutMs: 3000 });
        }
      },
      onEnd: finishLevel,
    },
    { attemptSeed, selectedWords: attempt.selectedWords },
  );
  game.persistResult = shouldPersistLevelResult(appState.devMode, legitimatelyUnlocked);
  game.devMode = appState.devMode;
  syncCampaignSession(game);
  if (!appState.devMode) beginContextualHints("campaign", "TYPE THE HIGHLIGHTED WORD", 3200);
}

function finishSpeedTest(state, result) {
  if (!result || appState.screen === Screens.SPEED_TEST_RESULTS) return;
  unmountGameplayInput();
  appState.speedTestResult = result;
  appState.speedTestRecordFlags = { ...state.recordFlags };
  appState.speedTestResultsIndex = 1;
  appState.speedTestResultsReadyAt = currentTimeMs() + 200;
  prepareAutomaticResultSubmission("typing", result);
  changeScreen(Screens.SPEED_TEST_RESULTS);
  renderCurrentScreen();
  startPreparedAutomaticSubmission();
}

function resetSpeedTestAttempt(source = "mode-select") {
  const config = getSpeedTestConfig(appState.speedTestConfigId)
    || getSpeedTestConfig(DEFAULT_SPEED_TEST_CONFIG_ID);
  cleanupCampaignAttempt(source === "retry" ? "retry" : "new-session");
  appState.speedTestResult = null;
  appState.speedTestRecordFlags = null;
  appState.speedTestResultsIndex = 0;
  appState.speedTestResultsReadyAt = 0;
  appState.pauseIndex = 0;
  const attemptSeed = getAttemptSeed();
  const state = startSpeedTest({
    config,
    wordPool: appState.speedTestWordBank.words,
    attemptSeed,
    developerMode: appState.devMode,
    source,
    deferSession: source === "change-test",
    onUpdate: updateSpeedTestRun,
    onComplete: finishSpeedTest,
  });
  if (!state) {
    openModeSelect();
    return;
  }
  state.timerPosition = appState.save.settings.speedTestTimerPosition;
  changeScreen(Screens.SPEED_TEST_RUN);
  renderSpeedTestRun(state, appState.devMode, {
    selectConfig: changeSpeedTestConfig,
    restart: () => resetSpeedTestAttempt("topbar-restart"),
    pause: pauseTypingTest,
    help: () => {
      if (getCurrentSpeedTest()?.phase === "PREPARING") openTutorial("typing");
    },
    setTimerPosition: changeSpeedTestTimerPosition,
  });
  mountGameplayInput();
  updateSpeedTestRun(state, currentTimeMs());
  if (!appState.devMode && source === "mode-select") {
    beginContextualHints("typing", "START TYPING TO BEGIN", 0);
  }
}

function changeSpeedTestTimerPosition(position) {
  const state = getCurrentSpeedTest();
  if (!state) return;
  state.timerPosition = updateSpeedTestTimerPosition(appState.save, position);
  if (appState.screen === Screens.SPEED_TEST_RUN) {
    renderCurrentScreen();
    updateSpeedTestRun(state, currentTimeMs());
  }
}

function finishEndless(game, result) {
  if (!result || appState.screen === Screens.ENDLESS_RESULTS) return;
  unmountGameplayInput();
  appState.endlessResult = result;
  appState.endlessResultsIndex = 0;
  appState.endlessResultsReadyAt = currentTimeMs() + 200;
  prepareAutomaticResultSubmission("endless", result);
  changeScreen(Screens.ENDLESS_RESULTS);
  renderCurrentScreen();
  startPreparedAutomaticSubmission();
}

function finishDaily(game, result) {
  if (!result || appState.screen === Screens.DAILY_RESULTS) return;
  unmountGameplayInput();
  appState.dailyResult = result;
  appState.dailyRecordFlags = { ...game.recordFlags };
  appState.dailyResultsIndex = 0;
  appState.dailyResultsReadyAt = currentTimeMs() + 200;
  prepareAutomaticResultSubmission("daily", result);
  changeScreen(Screens.DAILY_RESULTS);
  renderCurrentScreen();
  startPreparedAutomaticSubmission();
}

function startDaily(source = "daily-ready", dateKey = appState.dailyDateKey) {
  cleanupCampaignAttempt(source === "retry" ? "retry" : "new-session");
  const challengeDateKey = isValidDailyDateKey(dateKey) ? dateKey : getUtcDateKey();
  const vocabulary = createDailyVocabulary({
    commonWords: appState.commonWordBank.words,
    campaignBank: appState.wordBank,
  });
  const plan = generateDailyPlan({ dateKey: challengeDateKey, vocabulary });
  const game = startDailyRun({
    plan,
    developerMode: appState.devMode,
    dateOverride: appState.dailyDateOverride,
    source,
    onUpdate: updateDailyHud,
    onComplete: finishDaily,
  });
  if (!game) {
    openDailyReady("start-failed");
    return;
  }
  appState.dailyDateKey = challengeDateKey;
  changeScreen(Screens.PLAYING);
  renderDailyShell(game, appState.devMode, { pause: pauseGame });
  mountGameplayInput();
  updateDailyHud(game);
  if (!appState.devMode) beginContextualHints("daily", "COMPLETE ALL WAVES TO FINISH TODAY’S CHALLENGE");
}

function startEndless(source = "mode-select") {
  cleanupCampaignAttempt(["retry", "restart"].includes(source) ? source : "new-session");
  const game = startEndlessRun({
    seed: getAttemptSeed(),
    vocabulary: createEndlessVocabulary({
      commonWords: appState.commonWordBank.words,
      campaignBank: appState.wordBank,
      bossBank: appState.bossWordBank,
    }),
    startStage: appState.devMode ? appState.endlessStartStage : 1,
    recordEligible: !appState.devMode,
    developerMode: appState.devMode,
    source,
    onUpdate: updateEndlessHud,
    onComplete: finishEndless,
  });
  if (!game) {
    openEndlessReady("start-failed");
    return;
  }
  changeScreen(Screens.PLAYING);
  renderEndlessShell(game, appState.devMode, { pause: pauseGame });
  mountGameplayInput();
  updateEndlessHud(game);
  if (!appState.devMode) beginContextualHints("endless", "DIFFICULTY INCREASES AS YOU SURVIVE");
}

function changeSpeedTestConfig(configId) {
  const state = getCurrentSpeedTest();
  if (state?.phase === "ACTIVE") return;
  const next = normalizeSpeedTestConfigId(configId);
  if (next === appState.speedTestConfigId) return;
  appState.speedTestConfigId = next;
  resetSpeedTestAttempt("change-test");
}

function pauseTypingTest() {
  if (appState.screen !== Screens.SPEED_TEST_RUN) return;
  if (!pauseSpeedTest(currentTimeMs())) return;
  deactivateGameplayInput.blur?.();
  dismissContextualHint();
  tutorialHintMode = null;
  changeScreen(Screens.PAUSED);
  appState.pauseIndex = 0;
  renderPauseOverlay();
}

function startBossLevel(levelNumber, legitimatelyUnlocked, source) {
  const baseConfig = generateBossLevel(levelNumber);
  const attemptSeed = getAttemptSeed();
  const encounter = generateBossEncounter(
    appState.bossWordBank,
    levelNumber,
    attemptSeed,
  );
  const phrases = encounter.segments;
  const config = {
    ...baseConfig,
    attemptSeed,
    vocabularySource: appState.bossWordBank?.source || "dedicated",
    timeLimitSec: encounter.timing.effectiveTimeLimitSec,
    generationAttempt: encounter.generationAttempt,
    fallbackUsed: encounter.fallbackUsed,
    tierPatterns: encounter.tierPatterns,
    tierCounts: encounter.tierCounts,
    wordSources: encounter.wordSources,
    targetSegmentCharacters: encounter.targetSegmentCharacters,
    ...encounter.metrics,
    ...encounter.timing,
  };
  beginCampaignSession({
    level: levelNumber,
    isBoss: true,
    seed: attemptSeed,
    source: appState.devMode ? "developer" : source,
    developerMode: appState.devMode,
    difficultyData: config,
  });
  changeScreen(Screens.PLAYING);
  renderBossShell(levelNumber, config, appState.devMode, {
    attemptSeed,
    encounter,
  }, { pause: pauseGame });
  mountGameplayInput();
  const game = startBossLoop(levelNumber, config, phrases, {
    onUpdate: (currentGame) => {
      syncCampaignSession(currentGame);
      updateBossHud(currentGame);
    },
    onEnd: finishLevel,
  });
  game.persistResult = shouldPersistLevelResult(appState.devMode, legitimatelyUnlocked);
  game.attemptSeed = attemptSeed;
}

function finishLevel(game, success) {
  unmountGameplayInput();
  const wpm = calculateSessionWpm({
    characterCount: game.correctCharacters,
    activeDurationMs: game.elapsedMs,
  });
  const accuracy = calculateSessionAccuracy({
    correctKeystrokes: game.correctKeystrokes,
    totalKeystrokes: game.totalKeystrokes,
    missedCharacters: game.missedCharacters,
  });
  const grade = calculateGrade({
    accuracy,
    failed: !success,
  });
  const isBoss = game.mode === "boss";
  appState.results = {
    grade,
    wpm,
    accuracy,
    maxCombo: game.maxCombo,
    score: game.score,
    livesRemaining: isBoss ? 0 : game.lives,
    startingLives: isBoss ? 0 : game.config.lives,
    levelNumber: game.levelNumber,
    isBoss,
    timeRemaining: isBoss ? game.remainingMs / 1000 : 0,
    phrasesCompleted: isBoss ? game.phrasesCompleted : 0,
    phraseCount: isBoss ? game.phrases.length : 0,
  };
  appState.campaignResult = finalizeCampaignSession(game, appState.results, success);
  if (success && game.persistResult) {
    updateLevelResult(appState.save, game.levelNumber, appState.results);
  }
  prepareAutomaticResultSubmission("campaign", appState.campaignResult);
  appState.resultsIndex = getDefaultResultsIndex(appState.results);
  appState.resultsReadyAt = currentTimeMs() + 200;
  changeScreen(Screens.RESULTS);
  renderCurrentScreen();
  startPreparedAutomaticSubmission();
}

function pauseGame() {
  if (appState.screen !== Screens.PLAYING) return;
  deactivateGameplayInput.blur?.();
  dismissContextualHint();
  tutorialHintMode = null;
  changeScreen(Screens.PAUSED);
  pauseSession();
  if (appState.game?.mode === "endless") stopEndlessLoop();
  if (appState.game?.mode === "daily") stopDailyLoop();
  appState.pauseIndex = 0;
  renderPauseOverlay();
}

function retryCurrentLevel() {
  startLevel(appState.currentLevel, "retry");
}

function renderPauseOverlay() {
  if (getCurrentSpeedTest()?.phase === "PAUSED") {
    showSpeedTestPauseOverlay(appState.pauseIndex, {
      resume: resumeGame,
      restart: () => resetSpeedTestAttempt("pause-restart"),
      modes: openModeSelect,
      title: openTitle,
      select: (index) => { appState.pauseIndex = index; },
    });
    return;
  }
  if (appState.game?.mode === "endless") {
    showEndlessPauseOverlay(appState.pauseIndex, {
      resume: resumeGame,
      restart: () => startEndless("restart"),
      modes: openModeSelect,
      title: openTitle,
      select: (index) => { appState.pauseIndex = index; },
    });
    return;
  }
  if (appState.game?.mode === "daily") {
    showDailyPauseOverlay(appState.pauseIndex, {
      resume: resumeGame,
      retry: () => startDaily("retry", appState.game.config.dateKey),
      modes: openModeSelect,
      title: openTitle,
      select: (index) => { appState.pauseIndex = index; },
    });
    return;
  }
  showPauseOverlay(appState.pauseIndex, {
    resume: resumeGame,
    retry: retryCurrentLevel,
    modes: openModeSelect,
    title: openTitle,
    select: (index) => { appState.pauseIndex = index; },
  });
}

function resumeGame() {
  if (appState.screen !== Screens.PAUSED) return;
  hidePauseOverlay();
  if (getCurrentSpeedTest()?.phase === "PAUSED") {
    changeScreen(Screens.SPEED_TEST_RUN);
    resumeSpeedTest(currentTimeMs());
    updateSpeedTestRun(getCurrentSpeedTest(), currentTimeMs());
    return;
  }
  changeScreen(Screens.PLAYING);
  resumeSession();
  if (appState.game?.mode === "boss") resumeBossLoop();
  else if (appState.game?.mode === "endless") resumeEndlessLoop();
  else if (appState.game?.mode === "daily") resumeDailyLoop();
  else resumeGameLoop();
}

function activateTitleAction() {
  const action = titleActions[appState.menuIndex];
  if (action === "modes") openModeSelect();
  if (action === "leaderboards") openLeaderboards();
  if (action === "profile") openProfileStatistics();
  if (action === "settings") openSettings();
}

function selectStatisticsTab(index) {
  appState.statisticsTabIndex = Math.max(
    0,
    Math.min(STATISTICS_TABS.length - 1, Number(index) || 0),
  );
  appState.profileEditing = false;
  appState.profileNameError = "";
  appState.profileCopyMessage = "";
  renderCurrentScreen();
}

function beginProfileNameEdit() {
  const profile = ensureStoredPlayerProfile();
  appState.profileEditing = true;
  appState.profileDraft = profile.displayName;
  appState.profileNameError = "";
  renderCurrentScreen();
  const input = document.querySelector("#profile-name-input");
  input?.focus?.();
  input?.select?.();
}

function cancelProfileNameEdit() {
  appState.profileEditing = false;
  appState.profileDraft = "";
  appState.profileNameError = "";
  renderCurrentScreen();
}

function saveProfileName(value = document.querySelector("#profile-name-input")?.value) {
  const validation = validateDisplayName(value);
  if (!validation.valid) {
    appState.profileNameError = "USE 2–20 CHARACTERS WITHOUT CONTROL CHARACTERS";
    appState.profileDraft = typeof value === "string" ? value : "";
    renderCurrentScreen();
    return false;
  }
  updateStoredDisplayName(validation.value);
  appState.profileEditing = false;
  appState.profileDraft = "";
  appState.profileNameError = "";
  renderCurrentScreen();
  return true;
}

async function copyPlayerId() {
  const profile = ensureStoredPlayerProfile();
  const copied = await copyPlayerIdToClipboard(profile.playerId);
  appState.profileCopyMessage = copied ? "ID COPIED" : "COPY UNAVAILABLE";
  if (appState.screen === Screens.PROFILE_STATS) renderCurrentScreen();
  window.setTimeout(() => {
    if (appState.screen !== Screens.PROFILE_STATS) return;
    appState.profileCopyMessage = "";
    renderCurrentScreen();
  }, 1800);
}

function activateSelectedMode(modeId = getAllModes()[appState.modeSelection]?.id) {
  if (modeId === MODE_IDS.PRACTICE) return openPracticeLab();
  if (!isModeEnabled(modeId)) return false;
  const route = getAllModes().find((mode) => mode.id === modeId)?.route;
  if (route === "level-select") {
    openLevelSelect("mode-select");
    openAutomaticTutorial("campaign", (choice) => {
      if (choice === "primary" && appState.save.currentFurthestLevel === 1) startLevel(1, "level-select");
    }, { primaryLabel: appState.save.currentFurthestLevel === 1 ? "START LEVEL 1" : "CONTINUE" });
  }
  else if (route === "speed-test") {
    appState.speedTestConfigId = DEFAULT_SPEED_TEST_CONFIG_ID;
    if (!openAutomaticTutorial("typing", () => resetSpeedTestAttempt("mode-select"))) {
      resetSpeedTestAttempt("mode-select");
    }
  }
  else if (route === "endless-ready") openEndlessReady("mode-select");
  else if (route === "daily-ready") openDailyReady("mode-select");
  else return false;
  return true;
}

function toggleSetting(key) {
  updateSetting(appState.save, key, !appState.save.settings[key]);
  renderCurrentScreen();
}

function confirmReset() {
  if (window.confirm("Reset all level progress? Settings will be kept.")) {
    resetProgress(appState.save);
    appState.currentLevel = 1;
    renderCurrentScreen();
  }
}

function renderCurrentScreen() {
  if (appState.screen === Screens.TITLE) {
    renderTitle(appState.menuIndex, {
      modes: openModeSelect,
      profile: openProfileStatistics,
      settings: openSettings,
    });
  } else if (appState.screen === Screens.LEADERBOARDS) {
    renderLeaderboards(
      getLeaderboardState(),
      getAuthState(),
      getLeaderboardProfileState(),
      leaderboardNotice,
    );
  } else if (appState.screen === Screens.MODE_SELECT) {
    renderModeSelect(getPracticeLabFeatureGate().resolveModeDefinitions(getAllModes()), appState.modeSelection, {
      select: (index) => {
        if (appState.modeSelection === index) return;
        appState.modeSelection = index;
        renderCurrentScreen();
      },
      activate: activateSelectedMode,
      back: openTitle,
    });
  } else if (appState.screen === Screens.PRACTICE_LAB) {
    ensurePracticeLabController().mount();
  } else if (appState.screen === Screens.ENDLESS_READY) {
    renderEndlessReady({
      start: () => startEndless("mode-select"),
      help: () => openTutorial("endless"),
      back: openModeSelect,
    });
  } else if (appState.screen === Screens.ENDLESS_RESULTS) {
    renderEndlessResults(
      appState.endlessResult,
      appState.endlessResultsIndex,
      {
        retry: () => startEndless("retry"),
        modes: openModeSelect,
        title: openTitle,
        select: (index) => {
          if (appState.endlessResultsIndex === index) return;
          appState.endlessResultsIndex = index;
          renderCurrentScreen();
        },
      },
      getSubmissionState(),
    );
  } else if (appState.screen === Screens.DAILY_READY) {
    renderDailyReady({
      dateKey: appState.dailyDateKey,
      record: getDailyRecord(appState.dailyDateKey),
      developer: appState.devMode,
    }, {
      start: () => startDaily("daily-ready", appState.dailyDateKey),
      help: () => openTutorial("daily"),
      back: openModeSelect,
    });
  } else if (appState.screen === Screens.DAILY_RESULTS) {
    renderDailyResults(
      appState.dailyResult,
      appState.dailyRecordFlags,
      appState.dailyResultsIndex,
      {
        retry: () => startDaily("retry", appState.dailyResult.modeData.dateKey),
        modes: openModeSelect,
        title: openTitle,
        select: (index) => {
          if (appState.dailyResultsIndex === index) return;
          appState.dailyResultsIndex = index;
          renderCurrentScreen();
        },
      },
      getSubmissionState(),
    );
  } else if (appState.screen === Screens.SPEED_TEST_RUN) {
    const state = getCurrentSpeedTest();
    if (state) {
      renderSpeedTestRun(state, appState.devMode, {
        selectConfig: changeSpeedTestConfig,
        restart: () => resetSpeedTestAttempt("topbar-restart"),
        pause: pauseTypingTest,
        help: () => {
          if (getCurrentSpeedTest()?.phase === "PREPARING") openTutorial("typing");
        },
        setTimerPosition: changeSpeedTestTimerPosition,
      });
      updateSpeedTestRun(state, currentTimeMs());
    }
  } else if (appState.screen === Screens.SPEED_TEST_RESULTS) {
    renderSpeedTestResults(
      appState.speedTestResult,
      appState.speedTestRecordFlags,
      appState.speedTestResultsIndex,
      {
        retry: () => resetSpeedTestAttempt("retry"),
        change: () => resetSpeedTestAttempt("change-test"),
        modes: openModeSelect,
        title: openTitle,
        select: (index) => {
          if (index === appState.speedTestResultsIndex) return;
          appState.speedTestResultsIndex = index;
          renderCurrentScreen();
        },
      },
      getSubmissionState(),
    );
  } else if (appState.screen === Screens.LEVEL_SELECT) {
    renderLevelSelect(
      appState.save,
      appState.levelSelection,
      appState.devMode,
      appState.bossWordBank,
      appState.developerSeed,
      {
      back: openModeSelect,
      select: (level) => startLevel(level, "level-select"),
      devInspect: inspectDevLevel,
      devLaunch: (level) => startLevel(level, "developer"),
      helpCampaign: () => openTutorial("campaign"),
      helpBoss: () => openTutorial("boss"),
      },
    );
  } else if (appState.screen === Screens.RESULTS) {
    renderResults(appState.results, appState.resultsIndex, {
      retry: () => startLevel(appState.results.levelNumber, "retry"),
      next: () => startLevel(appState.results.levelNumber + 1, "next-level"),
      levels: openLevelSelect,
      title: openTitle,
      select: (index) => { appState.resultsIndex = index; },
    }, getSubmissionState());
  } else if (appState.screen === Screens.SETTINGS) {
    const localProfile = ensureStoredPlayerProfile();
    renderSettings(appState.save, appState.settingsIndex, {
      toggle: toggleSetting,
      reset: confirmReset,
      back: backFromSettings,
      saveName: saveProfileName,
      cancelName: cancelProfileNameEdit,
      tutorial: (id) => openTutorial(id, { source: "settings" }),
      resetHints: () => {
        resetContextualHints();
        dismissContextualHint({ persist: false });
      },
      resetTutorials: () => {
        if (window.confirm("Reset every tutorial and contextual hint?")) resetAllOnboarding();
      },
    }, renderSettingsAccountManagement({
      localProfile,
      editing: appState.profileEditing,
      draft: appState.profileDraft,
      nameError: appState.profileNameError,
      authState: getAuthState(),
      leaderboardProfileState: getLeaderboardProfileState(),
      pendingResultState: pendingResultCoordinator.getState(),
    }));
  } else if (appState.screen === Screens.PROFILE_STATS) {
    const storage = loadModeData();
    const profile = storage.profile || ensureStoredPlayerProfile();
    if (!storage.profile) storage.profile = profile;
    renderProfileStatistics({
      snapshot: getStatisticsSnapshot(storage, appState.save, getUtcDateKey()),
      storage,
      activeTab: appState.statisticsTabIndex,
      recentFilter: appState.statisticsRecentFilter,
      editing: appState.profileEditing,
      draft: appState.profileDraft,
      nameError: appState.profileNameError,
      copyMessage: appState.profileCopyMessage,
      developerMode: appState.devMode,
      authState: getAuthState(),
      leaderboardProfileState: getLeaderboardProfileState(),
    }, {
      selectTab: selectStatisticsTab,
      viewRecent: () => selectStatisticsTab(5),
      setRecentFilter: (filter) => {
        appState.statisticsRecentFilter = filter;
        renderCurrentScreen();
      },
      editName: beginProfileNameEdit,
      saveName: () => saveProfileName(),
      cancelName: cancelProfileNameEdit,
      copyId: copyPlayerId,
      back: openTitle,
    });
  }
  document.querySelector(".dev-mode-indicator")?.remove();
  document.querySelector(".dev-session-diagnostics")?.remove();
  if (appState.devMode) {
    renderDevModeIndicator();
    renderDevSessionDiagnostics();
  }
}

function handleAppClick(event) {
  const root = document.querySelector("#app");
  const readyAt = appState.screen === Screens.ENDLESS_RESULTS
    ? appState.endlessResultsReadyAt
    : appState.screen === Screens.DAILY_RESULTS
      ? appState.dailyResultsReadyAt
      : appState.screen === Screens.SPEED_TEST_RESULTS
        ? appState.speedTestResultsReadyAt
        : appState.resultsReadyAt;
  const action = resolveAppClickAction(event, {
    root,
    screen: appState.screen,
    readyAt,
    now: currentTimeMs(),
  });
  if (!action) return;
  event.preventDefault();
  const startResultGoogleSignIn = (boardKey, mode, result) => {
    const intent = savePendingResultSubmission(mode, result);
    if (!intent || intent.boardKey !== boardKey) return;
    pendingResultCoordinator.resetLifecycle();
    saveLeaderboardReturnState(leaderboardReturnStateForBoard(boardKey));
    void signInWithGoogle();
  };
  const handleAccountAction = () => {
    if (action === "auth-google-sign-in") void signInWithGoogle();
    else if (action === "auth-sign-out") {
      pendingResultCoordinator.discard();
      void signOut();
    }
    else if (action === "leaderboard-username-start-change") startUsernameChange();
    else if (action === "leaderboard-username-cancel-change") cancelUsernameChange();
    else {
      const username = document.querySelector("#leaderboard-username-input")?.value ?? "";
      if (action === "leaderboard-username-check") void checkUsernameAvailability(username);
      else if (action === "leaderboard-username-claim") void claimUsername(username);
      else if (action === "leaderboard-username-save-change") void changeUsername(username);
      else return false;
    }
    return true;
  };
  if (appState.screen === Screens.ENDLESS_RESULTS) {
    if (action === "submit-global-score") void submitCurrentResult();
    else if (action === "retry-global-score") void retryCurrentSubmission();
    else if (action === "view-endless-leaderboard") openLeaderboardBoard(LEADERBOARD_BOARDS.ENDLESS);
    else if (action === "open-account-settings") openAccountSettings();
    else if (action === "result-google-sign-in") startResultGoogleSignIn(LEADERBOARD_BOARDS.ENDLESS, "endless", appState.endlessResult);
    else if (action === "retry") startEndless("retry");
    else if (action === "modes") openModeSelect();
    else if (action === "title") openTitle();
  } else if (appState.screen === Screens.DAILY_RESULTS) {
    if (action === "submit-global-score") void submitCurrentResult();
    else if (action === "retry-global-score") void retryCurrentSubmission();
    else if (action === "view-daily-leaderboard") openLeaderboardBoard(LEADERBOARD_BOARDS.DAILY);
    else if (action === "open-account-settings") openAccountSettings();
    else if (action === "result-google-sign-in") startResultGoogleSignIn(LEADERBOARD_BOARDS.DAILY, "daily", appState.dailyResult);
    else if (action === "retry") startDaily("retry", appState.dailyResult.modeData.dateKey);
    else if (action === "modes") openModeSelect();
    else if (action === "title") openTitle();
  } else if (appState.screen === Screens.SPEED_TEST_RESULTS) {
    const boardKey = appState.speedTestResult?.modeData?.durationSeconds === 15
      ? LEADERBOARD_BOARDS.TYPING_15
      : LEADERBOARD_BOARDS.TYPING_60;
    if (action === "submit-global-score") void submitCurrentResult();
    else if (action === "retry-global-score") void retryCurrentSubmission();
    else if (action === "result-google-sign-in") startResultGoogleSignIn(boardKey, "typing", appState.speedTestResult);
    else if (action === "open-account-settings") openAccountSettings();
    else if (action === "view-typing-15-leaderboard") openLeaderboardBoard(LEADERBOARD_BOARDS.TYPING_15);
    else if (action === "view-typing-60-leaderboard") openLeaderboardBoard(LEADERBOARD_BOARDS.TYPING_60);
  } else if (appState.screen === Screens.RESULTS) {
    if (action === "submit-global-score") void submitCurrentResult();
    else if (action === "retry-global-score") void retryCurrentSubmission();
    else if (action === "result-google-sign-in") startResultGoogleSignIn(LEADERBOARD_BOARDS.CAMPAIGN, "campaign", appState.results);
    else if (action === "open-account-settings") openAccountSettings();
    else if (action === "view-campaign-leaderboard") openLeaderboardBoard(LEADERBOARD_BOARDS.CAMPAIGN);
  } else if (appState.screen === Screens.PROFILE_STATS) {
    handleAccountAction();
  } else if (appState.screen === Screens.SETTINGS) {
    if (action === "retry-pending-result") {
      void pendingResultCoordinator.resume(getAuthState(), getLeaderboardProfileState());
    }
    else if (action === "discard-pending-result") {
      pendingResultCoordinator.discard();
      renderCurrentScreen();
    }
    else if (action === "settings-edit-name") beginProfileNameEdit();
    else if (action === "settings-save-name") saveProfileName();
    else if (action === "settings-cancel-name") cancelProfileNameEdit();
    else handleAccountAction();
  } else if (appState.screen === Screens.TITLE && action === "open-leaderboards") {
    openLeaderboards();
  } else if (appState.screen === Screens.LEADERBOARDS) {
    if (action === "leaderboard-select-campaign") {
      void selectLeaderboardCategory(LEADERBOARD_CATEGORIES.CAMPAIGN);
    } else if (action === "leaderboard-select-typing") {
      void selectLeaderboardCategory(LEADERBOARD_CATEGORIES.TYPING);
    } else if (action === "leaderboard-select-daily") {
      void selectLeaderboardBoard(LEADERBOARD_BOARDS.DAILY);
    } else if (action === "leaderboard-select-endless") {
      void selectLeaderboardBoard(LEADERBOARD_BOARDS.ENDLESS);
    } else if (action === "leaderboard-refresh") {
      void refreshLeaderboard();
    } else if (action === "leaderboard-typing-select-60") {
      void selectTypingDuration(60);
    } else if (action === "leaderboard-typing-select-15") {
      void selectTypingDuration(15);
    } else if (action === "leaderboard-google-sign-in") {
      const state = getLeaderboardState();
      saveLeaderboardReturnState({
        screen: "leaderboards",
        selectedCategory: state.selectedCategory,
        typingDuration: state.selectedTypingDuration,
      });
      void signInWithGoogle();
    } else if (action === "leaderboard-open-username") {
      openAccountSettings();
    } else if (action === "leaderboard-main-menu") {
      openTitle();
    } else if (action === "leaderboard-help") {
      openTutorial("leaderboards");
    }
  }
}

function handleAppInput(event) {
  if (event.target?.id !== "leaderboard-username-input") return;
  setUsernameDraft(event.target.value);
  updateLeaderboardUsernameFeedback(event.target.value);
}

function moveLevelSelection(key) {
  const selectionLimit = appState.devMode ? 100 : appState.save.currentFurthestLevel;
  appState.levelSelection = moveLevelGridSelection(
    appState.levelSelection,
    key,
    Math.min(100, selectionLimit),
  );
  renderCurrentScreen();
}

function inspectDevLevel(levelNumber) {
  if (!appState.devMode || !Number.isFinite(levelNumber)) return;
  appState.levelSelection = Math.max(1, Math.min(100, Math.round(levelNumber)));
  renderCurrentScreen();
  const input = document.querySelector("#dev-level-input");
  input?.focus();
}

function handleGlobalKeydown(event) {
  const gameplayInputMode = appState.screen === Screens.SPEED_TEST_RUN
    ? "typing"
    : appState.screen === Screens.PLAYING
      ? appState.game?.mode || "campaign"
      : null;
  if (captureGameplayBackspace(event, {
    mode: gameplayInputMode,
    onTypingBackspace: (backspaceEvent) => routeActiveGameplayKey(backspaceEvent),
  })) return;
  if (isTextEntryTarget(event.target)) return;
  if (["Enter", " "].includes(event.key) && event.target?.matches?.("button, a, [role=tab]")) return;
  if (routeActiveGameplayKey(event)) return;

  if (appState.screen === Screens.PROFILE_STATS) {
    if (appState.profileEditing) {
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
      selectStatisticsTab(
        (appState.statisticsTabIndex + direction + STATISTICS_TABS.length)
          % STATISTICS_TABS.length,
      );
    }
    return;
  }

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", "Escape"].includes(event.key)) {
    event.preventDefault();
  }

  if (appState.screen === Screens.PAUSED) {
    if (event.key === "Escape") {
      resumeGame();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const direction = event.key === "ArrowUp" ? -1 : 1;
      appState.pauseIndex = (appState.pauseIndex + direction + 4) % 4;
      renderPauseOverlay();
    } else if (event.key === "Enter") {
      if (getCurrentSpeedTest()?.phase === "PAUSED") {
        [
          resumeGame,
          () => resetSpeedTestAttempt("pause-restart"),
          openModeSelect,
          openTitle,
        ][appState.pauseIndex]();
      } else if (appState.game?.mode === "endless") {
        [resumeGame, () => startEndless("restart"), openModeSelect, openTitle][appState.pauseIndex]();
      } else if (appState.game?.mode === "daily") {
        [resumeGame, () => startDaily("retry", appState.game.config.dateKey), openModeSelect, openTitle][appState.pauseIndex]();
      } else {
        [resumeGame, retryCurrentLevel, openModeSelect, openTitle][appState.pauseIndex]();
      }
    }
    return;
  }

  if (appState.screen === Screens.PRACTICE_LAB) {
    if (event.key === "Escape") practiceLabController?.back();
    return;
  }

  if (appState.screen === Screens.TITLE) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const direction = event.key === "ArrowUp" ? -1 : 1;
      appState.menuIndex = (appState.menuIndex + direction + titleActions.length) % titleActions.length;
      renderCurrentScreen();
    } else if (event.key === "Enter") {
      activateTitleAction();
    }
    return;
  }

  if (appState.screen === Screens.LEADERBOARDS) {
    if (event.key === "Escape") openTitle();
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      const boardKey = getLeaderboardKeyboardTarget(getLeaderboardState(), event.key);
      if (boardKey) void selectLeaderboardBoard(boardKey);
    }
    else if (event.key.toLowerCase() === "r") void refreshLeaderboard();
    return;
  }

  if (appState.screen === Screens.MODE_SELECT) {
    const itemCount = getAllModes().length + 1;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      appState.modeSelection = (
        appState.modeSelection - 1 + itemCount
      ) % itemCount;
      renderCurrentScreen();
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      appState.modeSelection = (appState.modeSelection + 1) % itemCount;
      renderCurrentScreen();
    } else if (event.key === "Enter") {
      if (appState.modeSelection === getAllModes().length) openTitle();
      else activateSelectedMode();
    } else if (event.key === "Escape") {
      openTitle();
    }
    return;
  }

  if (appState.screen === Screens.ENDLESS_READY) {
    if (event.key === "Escape") openModeSelect();
    else if (event.key === "Enter") startEndless("mode-select");
    return;
  }

  if (appState.screen === Screens.ENDLESS_RESULTS) {
    const actions = ["retry", "modes", "title"];
    if (isResultsInputBlocked(
      event,
      currentTimeMs(),
      appState.endlessResultsReadyAt,
    )) return;
    if (event.key === "Escape") {
      openModeSelect();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const direction = event.key === "ArrowUp" ? -1 : 1;
      appState.endlessResultsIndex = (
        appState.endlessResultsIndex + direction + actions.length
      ) % actions.length;
      renderCurrentScreen();
    } else if (event.key === "Enter") {
      const action = actions[appState.endlessResultsIndex];
      if (action === "retry") startEndless("retry");
      else if (action === "modes") openModeSelect();
      else openTitle();
    }
    return;
  }

  if (appState.screen === Screens.DAILY_READY) {
    if (event.key === "Escape") openModeSelect();
    else if (event.key === "Enter") startDaily("daily-ready", appState.dailyDateKey);
    return;
  }

  if (appState.screen === Screens.DAILY_RESULTS) {
    const actions = ["retry", "modes", "title"];
    if (isResultsInputBlocked(event, currentTimeMs(), appState.dailyResultsReadyAt)) return;
    if (event.key === "Escape") {
      openModeSelect();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const direction = event.key === "ArrowUp" ? -1 : 1;
      appState.dailyResultsIndex = (
        appState.dailyResultsIndex + direction + actions.length
      ) % actions.length;
      renderCurrentScreen();
    } else if (event.key === "Enter") {
      const action = actions[appState.dailyResultsIndex];
      if (action === "retry") startDaily("retry", appState.dailyResult.modeData.dateKey);
      else if (action === "modes") openModeSelect();
      else openTitle();
    }
    return;
  }

  if (appState.screen === Screens.SPEED_TEST_RESULTS) {
    const actions = ["retry", "change", "modes", "title"];
    if (isResultsInputBlocked(
      event,
      currentTimeMs(),
      appState.speedTestResultsReadyAt,
    )) return;
    if (event.key === "Tab") {
      event.preventDefault();
      resetSpeedTestAttempt("retry");
    } else if (event.key === "Escape") {
      event.preventDefault();
      resetSpeedTestAttempt("change-test");
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? -1 : 1;
      appState.speedTestResultsIndex = (
        appState.speedTestResultsIndex + direction + actions.length
      ) % actions.length;
      renderCurrentScreen();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const action = actions[appState.speedTestResultsIndex];
      if (action === "retry") resetSpeedTestAttempt("retry");
      else if (action === "change") resetSpeedTestAttempt("change-test");
      else if (action === "modes") openModeSelect();
      else openTitle();
    }
    return;
  }

  if (appState.screen === Screens.LEVEL_SELECT) {
    if (event.key.startsWith("Arrow")) moveLevelSelection(event.key);
    if (event.key === "Enter") startLevel(appState.levelSelection);
    if (event.key === "Escape") openModeSelect();
    return;
  }

  if (appState.screen === Screens.RESULTS) {
    const actions = getResultsActions(appState.results);
    if (isResultsInputBlocked(event, currentTimeMs(), appState.resultsReadyAt)) return;
    if (event.key === "Escape") {
      openLevelSelect();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const direction = event.key === "ArrowUp" ? -1 : 1;
      appState.resultsIndex = (
        appState.resultsIndex + direction + actions.length
      ) % actions.length;
      renderCurrentScreen();
    } else if (event.key === "Enter") {
      const action = actions[appState.resultsIndex];
      if (action === "retry") startLevel(appState.results.levelNumber, "retry");
      else if (action === "next") startLevel(appState.results.levelNumber + 1, "next-level");
      else if (action === "levels") openLevelSelect();
      else openTitle();
    }
    return;
  }

  if (appState.screen === Screens.SETTINGS) {
    if (event.key === "Escape") {
      backFromSettings();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const direction = event.key === "ArrowUp" ? -1 : 1;
      appState.settingsIndex = (appState.settingsIndex + direction + 5) % 5;
      renderCurrentScreen();
    } else if (event.key === "Enter") {
      const keys = ["strictMode", "particles", "screenShake"];
      if (appState.settingsIndex < 3) toggleSetting(keys[appState.settingsIndex]);
      if (appState.settingsIndex === 3) confirmReset();
      if (appState.settingsIndex === 4) backFromSettings();
    }
  }
}

async function bootstrap() {
  clearSession();
  subscribeToAuth((authState) => {
    const authUiKey = `${authState.status}:${authState.user?.id ?? ""}`;
    const authUiChanged = authUiKey !== lastAuthUiKey;
    lastAuthUiKey = authUiKey;
    if (authUiChanged) {
      const selectedBoard = getLeaderboardState().selectedBoardKey;
      resetLeaderboardState();
      if (appState.screen === Screens.LEADERBOARDS) void initializeLeaderboards(selectedBoard);
    }
    if (authState.status === "signed-in") {
      void initializeLeaderboardProfile(authState.user);
      if (authUiChanged) {
        const returnState = consumeLeaderboardReturnState();
        if (returnState) {
          pendingLeaderboardReturn = returnState;
          if (bootstrapReady) {
            openLeaderboardReturn(returnState);
            pendingLeaderboardReturn = null;
          }
        }
      }
    }
    else resetLeaderboardProfile();
    if ([Screens.DAILY_RESULTS, Screens.ENDLESS_RESULTS, Screens.SPEED_TEST_RESULTS, Screens.RESULTS].includes(appState.screen)) {
      void handleAutomaticSubmissionStateChange(authState, getLeaderboardProfileState());
    }
    if (bootstrapReady) void pendingResultCoordinator.evaluate(authState, getLeaderboardProfileState());
    if (authUiChanged && (
      appState.screen === Screens.SETTINGS ||
      (appState.screen === Screens.PROFILE_STATS && appState.statisticsTabIndex === 6)
    )) {
      updateProfileAuthSection(authState, getLeaderboardProfileState());
    }
  });
  subscribeToLeaderboardProfile((profileState) => {
    if (
      appState.screen === Screens.SETTINGS ||
      (appState.screen === Screens.PROFILE_STATS && appState.statisticsTabIndex === 6)
    ) {
      if (appState.screen === Screens.SETTINGS) renderCurrentScreen();
      else updateProfileAuthSection(getAuthState(), profileState);
    }
    if (appState.screen === Screens.LEADERBOARDS) renderCurrentScreen();
    if ([Screens.DAILY_RESULTS, Screens.ENDLESS_RESULTS, Screens.SPEED_TEST_RESULTS, Screens.RESULTS].includes(appState.screen)) {
      void handleAutomaticSubmissionStateChange(getAuthState(), profileState);
    }
    if (bootstrapReady) void pendingResultCoordinator.evaluate(getAuthState(), profileState);
  });
  subscribeToSubmissions((submissionState) => {
    if ([Screens.DAILY_RESULTS, Screens.ENDLESS_RESULTS, Screens.SPEED_TEST_RESULTS, Screens.RESULTS].includes(appState.screen)) {
      updateGlobalSubmissionRegion(submissionState);
    }
  });
  pendingResultCoordinator.subscribe(() => {
    if (bootstrapReady && appState.screen === Screens.SETTINGS) renderCurrentScreen();
  });
  subscribeToLeaderboards(() => {
    if (appState.screen === Screens.LEADERBOARDS) renderCurrentScreen();
  });
  void initializeAuth();
  const search = new URLSearchParams(window.location.search);
  appState.devMode = isDevelopmentMode(window.location.search);
  practiceLabFeatureGate = createPracticeFeatureGate({ developerMode: appState.devMode });
  if (appState.devMode) {
    window.wordstrikeOnboarding = Object.freeze({
      inspect: getOnboardingStorageDiagnostic,
      open: (id) => openTutorial(id, { source: "help" }),
      reset: resetAllOnboarding,
    });
  }
  appState.developerSeed = appState.devMode
    ? parseDeveloperSeed(window.location.search)
    : null;
  appState.endlessStartStage = appState.devMode
    ? Math.max(1, Number.parseInt(search.get("stage"), 10) || 1)
    : 1;
  appState.dailyDateOverride = appState.devMode && isValidDailyDateKey(search.get("date"));
  appState.dailyDateKey = appState.devMode
    ? parseDailyDateOverride(window.location.search)
    : getUtcDateKey();
  appState.save = loadSave();
  [
    appState.wordBank,
    appState.bossWordBank,
    appState.speedTestWordBank,
    appState.commonWordBank,
  ] = await Promise.all([
    loadWordBank(),
    loadBossWordBank(),
    loadSpeedTestWordBank(),
    loadCommonWordBank(),
  ]);
  document.addEventListener("keydown", handleGlobalKeydown);
  const appRoot = document.querySelector("#app");
  attachAppClickListener(appRoot, handleAppClick);
  appRoot?.addEventListener("input", handleAppInput);
  bootstrapReady = true;
  if (
    appState.devMode &&
    search.get("mode") === MODE_IDS.SPEED_TEST
  ) {
    appState.speedTestConfigId = parseDeveloperSpeedTestConfig(
      window.location.search,
    );
    resetSpeedTestAttempt("developer");
  } else if (appState.devMode && search.get("mode") === MODE_IDS.ENDLESS) {
    openEndlessReady("developer");
  } else if (appState.devMode && search.get("mode") === MODE_IDS.DAILY) {
    openDailyReady("developer");
  } else if (pendingLeaderboardReturn) {
    const returnState = pendingLeaderboardReturn;
    pendingLeaderboardReturn = null;
    openLeaderboardReturn(returnState);
  } else {
    renderCurrentScreen();
    openAutomaticTutorial("general", (choice) => {
      renderCurrentScreen();
      if (choice === "google") {
        saveLeaderboardReturnState({ screen: "title" });
        void signInWithGoogle();
      }
    });
  }
  void pendingResultCoordinator.evaluate(getAuthState(), getLeaderboardProfileState());
}

bootstrap();
