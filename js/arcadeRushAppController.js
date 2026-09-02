import {
  ARCADE_RUSH_MODE_ID,
  ARCADE_RUSH_UI_ACTIONS,
  createArcadeRushDomUiController,
  createArcadeRushRuntime,
  createArcadeRushUiBindings,
  createArcadeRushUiPort,
  createArcadeRushVocabulary,
  createCoreBreakerBossPort,
  generateArcadeRushPlan,
  isArcadeRushSeed,
} from "./arcadeRush/index.js";
import {
  beginSession,
  completeSession,
  getCurrentSession,
  markSessionActive,
  markSessionResultPersisted,
  setSessionState,
} from "./sessionManager.js";
import {
  advanceWordTrajectory,
  createWordTrajectory,
  projectWordTrajectory,
} from "./gameplayWorld.js";
import { updateWordSeparation } from "./gameLoop.js";
import { changeScreen, Screens } from "./state.js";
import { getAuthState } from "./authService.js";
import { getLeaderboardProfileState } from "./leaderboardProfileService.js";
import {
  getLeaderboardState,
  initializeLeaderboards,
  LEADERBOARD_BOARDS,
} from "./leaderboardService.js";
import { renderLeaderboards } from "./leaderboardUi.js";
import { createArcadeRushShadowCoordinator } from "./arcadeRushShadowCoordinator.js";

export { ARCADE_RUSH_MODE_ID };

const DEFAULT_VIEWPORT = Object.freeze({ width: 1280, height: 720 });

function safeViewport(root) {
  const layer = root?.querySelector?.("[data-rush-word-layer]");
  const rect = layer?.getBoundingClientRect?.();
  const width = Number(layer?.clientWidth || rect?.width || DEFAULT_VIEWPORT.width);
  const height = Number(layer?.clientHeight || rect?.height || DEFAULT_VIEWPORT.height);
  return {
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_VIEWPORT.width,
    height: Number.isFinite(height) && height > 0 ? height : DEFAULT_VIEWPORT.height,
  };
}

function targetingState() {
  return {
    mode: "idle",
    prefix: "",
    candidateIds: [],
    activeTargetId: null,
    startedAtActiveMs: null,
  };
}

function createRenderer(root, getSettings) {
  const elements = new Map();

  function layer() {
    return root?.querySelector?.("[data-rush-word-layer]") || null;
  }

  function clearWords() {
    for (const record of elements.values()) record.position?.remove?.();
    elements.clear();
  }

  function createWord(word) {
    const mount = layer();
    const documentRef = root?.ownerDocument || globalThis.document;
    if (!mount || !documentRef?.createElement) return false;
    const position = documentRef.createElement("div");
    const separation = documentRef.createElement("div");
    const visual = documentRef.createElement("div");
    const text = documentRef.createElement("span");
    const typed = documentRef.createElement("span");
    const remaining = documentRef.createElement("span");
    position.className = "word-position";
    separation.className = "word-separation";
    visual.className = "word-visual";
    text.className = "word-text";
    typed.className = "typed-letter";
    remaining.className = "remaining-letter";
    position.dataset.wordId = String(word.id);
    position.setAttribute("aria-label", word.text);
    text.append(typed, remaining);
    visual.append(text);
    separation.append(visual);
    position.append(separation);
    mount.append(position);
    elements.set(word.id, { position, separation, visual, typed, remaining });
    updateWord(word, {});
    return true;
  }

  function updateWord(word, state = {}) {
    const record = elements.get(word.id);
    if (!record) return false;
    const typedIndex = state.candidate
      ? Math.max(0, Number(state.prefixLength) || 0)
      : Math.max(0, Number(word.typedIndex) || 0);
    record.position.style.transform = `translate3d(${Number(word.x) || 0}px, ${Number(word.y) || 0}px, 0) translate(-50%, -50%)`;
    record.separation.style.transform = `translate3d(${Number(word.separationX) || 0}px, ${Number(word.separationY) || 0}px, 0)`;
    record.visual.classList.toggle("active", state.active === true);
    record.visual.classList.toggle("candidate", state.candidate === true);
    record.typed.textContent = word.text.slice(0, typedIndex);
    record.remaining.textContent = word.text.slice(typedIndex);
    return true;
  }

  function removeWord(word) {
    const record = elements.get(word?.id);
    if (!record) return false;
    record.position?.remove?.();
    elements.delete(word.id);
    return true;
  }

  function flashWrong(wordId) {
    const visual = elements.get(Number(wordId))?.visual;
    if (!visual) return false;
    visual.classList.remove("wrong");
    void visual.offsetWidth;
    visual.classList.add("wrong");
    return true;
  }

  function flashDamage() {
    const surface = root?.querySelector?.('[data-rush-view="gameplay"]');
    if (!surface) return false;
    surface.classList.remove("damage-flash");
    void surface.offsetWidth;
    surface.classList.add("damage-flash");
    const settings = typeof getSettings === "function" ? getSettings() || {} : {};
    if (settings.screenShake !== false && typeof surface.animate === "function") {
      surface.animate([
        { transform: "translate(0,0)" },
        { transform: "translate(-4px,2px)" },
        { transform: "translate(4px,-2px)" },
        { transform: "translate(0,0)" },
      ], { duration: 180 });
    }
    globalThis.setTimeout?.(() => surface.classList.remove("damage-flash"), 260);
    return true;
  }

  return {
    clearWords,
    createWord,
    updateWord,
    removeWord,
    flashDamage,
    flashWrong,
  };
}

function createInput(renderer) {
  function resetTargeting(game) {
    game.activeTargetId = null;
    game.targetingState = targetingState();
    return true;
  }

  function reconcileTargeting(game) {
    const state = game.targetingState || targetingState();
    game.targetingState = state;
    if (state.mode !== "locked") return null;
    const target = game.words.find((word) => word.id === state.activeTargetId);
    if (!target) {
      resetTargeting(game);
      return null;
    }
    return target;
  }

  function closestCandidate(game, key) {
    return game.words
      .filter((word) => !word.resolved && word.text.startsWith(key))
      .sort((first, second) => {
        const firstProgress = Number(first.trajectory?.travelProgress) || 0;
        const secondProgress = Number(second.trajectory?.travelProgress) || 0;
        return secondProgress - firstProgress || first.id - second.id;
      })[0] || null;
  }

  function lock(game, api, word, prefix) {
    game.targetingState = {
      mode: "locked",
      prefix,
      candidateIds: [],
      activeTargetId: word.id,
      startedAtActiveMs: game.elapsedMs,
    };
    api.setActiveTarget(word.id);
  }

  function handleBackspace(event, game, api) {
    const state = game.targetingState;
    if (state?.mode !== "locked" || !state.activeTargetId || !state.prefix) return false;
    const word = game.words.find((candidate) => candidate.id === state.activeTargetId);
    if (!word) {
      resetTargeting(game);
      return false;
    }
    event.preventDefault?.();
    const prefix = state.prefix.slice(0, -1);
    api.setWordProgress(word.id, prefix.length);
    if (!prefix) resetTargeting(game);
    else state.prefix = prefix;
    return true;
  }

  function handleKey(event, game, api) {
    if (!event || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key === "Backspace") return handleBackspace(event, game, api);
    if (typeof event.key !== "string" || !/^[a-zA-Z]$/.test(event.key)) return false;
    const key = event.key.toLowerCase();
    event.preventDefault?.();
    const state = game.targetingState || targetingState();
    game.targetingState = state;

    if (state.mode === "locked") {
      const target = reconcileTargeting(game);
      if (!target) {
        api.recordIncorrectCharacter(1);
        return true;
      }
      const expected = target.text[target.typedIndex];
      if (expected !== key) {
        api.recordIncorrectCharacter(1);
        renderer.flashWrong(target.id);
        return true;
      }
      api.recordCorrectCharacter(target.id, 1);
      state.prefix += key;
      if (target.typedIndex >= target.text.length) api.completeWord(target.id);
      return true;
    }

    const target = closestCandidate(game, key);
    if (!target) {
      api.recordIncorrectCharacter(1);
      return true;
    }
    lock(game, api, target, key);
    api.recordCorrectCharacter(target.id, 1);
    if (target.typedIndex >= target.text.length) api.completeWord(target.id);
    return true;
  }

  return { handleKey, reconcileTargeting, resetTargeting };
}

function createWorld(root) {
  function syncWord(word) {
    if (!word?.trajectory) return word;
    word.x = word.trajectory.x;
    word.y = word.trajectory.y;
    word.travelProgress = word.trajectory.travelProgress;
    if (!Number.isFinite(word.separationX)) word.separationX = 0;
    if (!Number.isFinite(word.separationY)) word.separationY = 0;
    return word;
  }

  function createTrajectory(entry) {
    return createWordTrajectory({
      edge: entry.edge,
      ratio: entry.edgeRatio,
      speed: entry.trajectoryProfile?.speedPxPerSec,
    });
  }

  function projectTrajectory(word) {
    projectWordTrajectory(word.trajectory, safeViewport(root));
    syncWord(word);
    return word;
  }

  function advanceTrajectory(word, deltaMs) {
    const reachedCore = advanceWordTrajectory(word.trajectory, deltaMs, safeViewport(root));
    syncWord(word);
    return reachedCore;
  }

  function updateSeparation(_words, game) {
    updateWordSeparation(game, safeViewport(root), 16);
    return true;
  }

  return { createTrajectory, projectTrajectory, advanceTrajectory, updateSeparation };
}

function defaultScheduler() {
  return {
    requestFrame(callback) {
      return globalThis.requestAnimationFrame(callback);
    },
    cancelFrame(id) {
      globalThis.cancelAnimationFrame(id);
    },
  };
}

function sessionPort() {
  return {
    begin: beginSession,
    complete: completeSession,
    getCurrent: getCurrentSession,
    markActive: markSessionActive,
    markResultPersisted: markSessionResultPersisted,
    setState: setSessionState,
  };
}

function openArcadeRushLeaderboard() {
  changeScreen(Screens.LEADERBOARDS);
  renderLeaderboards(
    getLeaderboardState(),
    getAuthState(),
    getLeaderboardProfileState(),
    "",
  );
  void initializeLeaderboards(LEADERBOARD_BOARDS.ARCADE_RUSH);
  return true;
}

export function parseArcadeRushDeveloperSeed(searchOrValue = "") {
  const source = String(searchOrValue ?? "");
  const raw = source.includes("?") || source.includes("=")
    ? new URLSearchParams(source.startsWith("?") ? source.slice(1) : source).get("rushSeed")
    : source;
  if (raw == null || String(raw).trim() === "") return null;
  const value = Number(String(raw).trim());
  return isArcadeRushSeed(value) ? value : null;
}

export function createArcadeRushAppController({
  root,
  getSettings = () => ({}),
  actions = {},
  callbacks = {},
  resultOptions = () => ({}),
  clock = { now: () => globalThis.performance?.now?.() ?? Date.now() },
  scheduler = null,
} = {}) {
  if (!root) return null;
  const renderer = createRenderer(root, getSettings);
  const input = createInput(renderer);
  const world = createWorld(root);
  const shadowCoordinator = createArcadeRushShadowCoordinator();
  const resolvedActions = {
    ...actions,
    [ARCADE_RUSH_UI_ACTIONS.LEADERBOARD]: (payload) => {
      if (typeof actions[ARCADE_RUSH_UI_ACTIONS.LEADERBOARD] === "function") {
        const handled = actions[ARCADE_RUSH_UI_ACTIONS.LEADERBOARD](payload);
        if (handled !== false) return handled;
      }
      return openArcadeRushLeaderboard();
    },
  };
  const resolveResultOptions = (result, options = null) => {
    const configured = options || resultOptions(result) || {};
    return shadowCoordinator.enhanceResultOptions({
      ...configured,
      leaderboardAvailable: true,
    });
  };
  const uiController = createArcadeRushDomUiController({ root, actions: resolvedActions });
  if (!uiController) {
    shadowCoordinator.destroy();
    return null;
  }
  const uiPort = createArcadeRushUiPort(uiController);
  const uiBindings = createArcadeRushUiBindings(uiPort, {
    resultOptions: (result) => resolveResultOptions(result),
  });
  if (!uiPort || !uiBindings) {
    shadowCoordinator.destroy();
    return null;
  }

  let runtime = null;
  let latestSnapshot = null;

  function publish(snapshot) {
    latestSnapshot = snapshot || latestSnapshot;
    if (snapshot) callbacks.onSnapshot?.(snapshot);
  }

  function runtimeCallbacks() {
    return {
      onUpdate(snapshot) {
        publish(snapshot);
        uiBindings.onUpdate(snapshot);
      },
      onWaveTransition(snapshot, detail) {
        publish(snapshot);
        uiBindings.onWaveTransition(snapshot, detail);
      },
      onWaveStart(snapshot, wave) {
        publish(snapshot);
        uiBindings.onWaveStart(snapshot, wave);
      },
      onBossIntro(snapshot, detail) {
        publish(snapshot);
        uiBindings.onBossIntro(snapshot, detail);
      },
      onBossStart(snapshot, detail) {
        publish(snapshot);
        uiBindings.onBossStart(snapshot, detail);
      },
      onPause(snapshot) {
        publish(snapshot);
        uiBindings.onPause(snapshot);
      },
      onResume(snapshot) {
        publish(snapshot);
        uiBindings.onResume(snapshot);
      },
      onComplete(snapshot, result) {
        publish(snapshot);
        shadowCoordinator.onTerminal(result);
        callbacks.onComplete?.(snapshot, result);
        uiBindings.onComplete(snapshot, result);
      },
      onFailure(snapshot, result) {
        publish(snapshot);
        shadowCoordinator.onTerminal(result);
        callbacks.onFailure?.(snapshot, result);
        uiBindings.onFailure(snapshot, result);
      },
      onCleanup(snapshot) {
        publish(snapshot);
        uiBindings.onCleanup(snapshot);
        callbacks.onCleanup?.(snapshot);
      },
    };
  }

  function renderReady(options = {}) {
    latestSnapshot = null;
    return uiController.renderReady(shadowCoordinator.enhanceReadyOptions(options));
  }

  function renderResults(result, options = {}) {
    return uiController.renderResults(result, resolveResultOptions(result, options));
  }

  function start({
    seed,
    commonWords,
    campaignBank,
    developerMode = false,
    source = "arcade-rush-ready",
  } = {}) {
    const shadowStart = shadowCoordinator.prepareStart({ seed, developerMode });
    if (!isArcadeRushSeed(shadowStart.seed)) return null;
    const vocabulary = createArcadeRushVocabulary({ commonWords, campaignBank });
    const plan = generateArcadeRushPlan({ seed: shadowStart.seed, vocabulary });
    if (!plan) return null;
    runtime?.cleanup?.({ abortSession: false });
    renderer.clearWords();
    runtime = createArcadeRushRuntime({
      plan,
      ports: {
        clock,
        scheduler: scheduler || defaultScheduler(),
        renderer,
        input,
        world,
        session: sessionPort(),
      },
      bossPort: createCoreBreakerBossPort(),
      source,
      developerMode: shadowStart.developerMode,
      callbacks: runtimeCallbacks(),
    });
    const started = runtime?.start?.() || null;
    if (started) {
      shadowCoordinator.onStarted({ developerMode: shadowStart.developerMode });
      publish(started);
    }
    return started;
  }

  function stop(options = {}) {
    return runtime?.stop?.(options) ?? false;
  }

  function cleanup(options = {}) {
    const cleaned = runtime?.cleanup?.(options) ?? false;
    renderer.clearWords();
    runtime = null;
    latestSnapshot = null;
    return cleaned;
  }

  function pause() {
    return runtime?.pause?.() ?? false;
  }

  function resume() {
    return runtime?.resume?.() ?? false;
  }

  function handleKey(event) {
    return runtime?.handleKey?.(event) ?? false;
  }

  function focusPauseAction(index = 0) {
    const buttons = root.querySelectorAll?.('[data-rush-role="pause-overlay"] [data-rush-action]') || [];
    const safeIndex = Math.max(0, Math.min(buttons.length - 1, Number(index) || 0));
    buttons[safeIndex]?.focus?.();
    return buttons.length > 0;
  }

  return Object.freeze({
    renderReady,
    renderResults,
    start,
    stop,
    cleanup,
    pause,
    resume,
    handleKey,
    focusPauseAction,
    getSnapshot: () => latestSnapshot || runtime?.getSnapshot?.() || null,
    getUiController: () => uiController,
    getShadowCertification: shadowCoordinator.inspect,
    verifyShadowLeaderboard: shadowCoordinator.verifyLeaderboard,
    destroy() {
      runtime?.dispose?.({ abortSession: false });
      runtime = null;
      latestSnapshot = null;
      renderer.clearWords();
      shadowCoordinator.destroy();
      return uiController.destroy();
    },
  });
}
