const RELEASE_FLAG = "flowRelease";
const FLOW_RELEASE_VERSION = 7;
const FLOW_RELEASE_CACHE_NAME = "wordstrike-flow-release-v10";
const FLOW_RELEASE_QUERY_KEYS = Object.freeze([
  "mode",
  RELEASE_FLAG,
  "flowRun",
  "flowUi",
  "flowUx",
  "flowModifiers",
  "flowModifierIds",
  "flowAdaptive",
  "flowWeaknesses",
  "flowResumeAdaptive",
  "flowIntegration",
  "flowLength",
  "flowTheme",
  "flowCategory",
  "flowDifficulty",
  "flowSeed",
  "flowUiStart",
  "flowCatalog",
  "flowPassage",
]);

const FLOW_RELEASE_ASSETS = Object.freeze([
  "./js/flow/flowRuntimeLoader.js?v=20260923i",
  "./js/leaderboardReturnState.js",
  "./js/pendingResultSubmission.js",
  "./js/submissionOutbox.js",
  "./js/leaderboardSubmissionService.js",
  "./js/leaderboardProfileService.js",
  "./js/authService.js",
  "./js/supabaseConfig.js",
  "./js/supabaseClient.js",
  "./js/gameVersion.js",
  "./js/leaderboardUsername.js",
  "./js/leaderboardService.js",
  "./js/arcadeRushLeaderboard.js",
  "./js/sessionResult.js",
  "./js/random.js",
  "./js/arcadeRush/arcadeRushContract.js",
  "./js/arcadeRush/arcadeRushConfig.js",
  "./js/arcadeRush/arcadeRushBoss.js",
  "./js/arcadeRush/arcadeRushGenerator.js",
  "./js/arcadeRush/arcadeRushScoring.js",
  "./js/arcadeRush/arcadeRushResult.js",
  "./js/flow/flowMigrationPresentation.js?v=20260923a",
  "./js/flow/flowAdaptive.js",
  "./js/flow/flowAdaptivePhase10.js?v=20260923a",
  "./js/flow/flowCadence.js",
  "./js/flow/flowCatalog.js",
  "./js/flow/flowConfig.js",
  "./js/flow/flowContent.js",
  "./js/flow/flowContentExpansion.js",
  "./js/flow/flowCorpusV2.js?v=20260923a",
  "./js/flow/flowCorpusHistory.js?v=20260923a",
  "./js/flow/flowEngine.js",
  "./js/flow/flowGameplay.js",
  "./js/flow/flowGameModeV2.js?v=20260923c",
  "./js/flow/flowIntegrationBootstrap.js?v=20260923b",
  "./js/flow/flowIntegrationPhase11.js?v=20260923b",
  "./js/flow/flowLongformContent.js",
  "./js/flow/flowModifiers.js",
  "./js/flow/flowModifiersPhase9.js?v=20260923a",
  "./js/flow/flowPassages.js",
  "./js/flow/flowPhase1.js?v=20260923i",
  "./js/flow/flowProgression.js",
  "./js/flow/flowProgression.js?v=20260923a",
  "./js/flow/flowRunPlan.js",
  "./js/flow/flowRunPlan.js?v=20260923e",
  "./js/flow/flowScoreV2.js?v=20260923f",
  "./js/flow/flowRecordsV3.js?v=20260923a",
  "./js/flow/flowRecordsV3.js",
  "./js/flow/flowScoreV3.js?v=20260923a",
  "./js/flow/flowScoreV3.js",
  "./js/flow/flowStreamPlanV3.js?v=20260923a",
  "./js/flow/flowScoreV2.js",
  "./js/flow/flowScoreV2.js?v=20260923a",
  "./js/flow/flowRecordsV2.js?v=20260923a",
  "./js/flow/flowRecordsV2.js?v=20260923f",
  "./js/flow/flowSelection.js",
  "./js/flow/flowShell.js",
  "./js/flow/flowState.js",
  "./js/flow/flowUiPhase7.js?v=20260923a",
  "./js/flow/flowUiPhase7KeyboardGuard.js?v=20260923a",
  "./js/flow/flowUiPhase7Polish.js?v=20260923a",
  "./js/flow/flowUxPhase8.js?v=20260923b",
  "./js/flow/flowVisualPhase6.js?v=20260923a",
  "./styles/screens/flow-phase1.css?v=20260916d",
  "./styles/screens/flow-phase5.css?v=20260916a",
  "./styles/screens/flow-game-mode-v2.css?v=20260923d",
  "./styles/screens/flow-visual-phase6.css?v=20260923a",
  "./styles/screens/flow-visual-phase6-polish.css?v=20260916a",
  "./styles/screens/flow-ui-phase7.css?v=20260916a",
  "./styles/screens/flow-ui-phase7-polish.css?v=20260916b",
  "./styles/screens/flow-ux-phase8.css?v=20260923a",
  "./styles/screens/flow-modifiers-phase9.css?v=20260916a",
  "./styles/screens/flow-adaptive-phase10.css?v=20260916a",
  "./styles/screens/flow-integration-phase11.css?v=20260916a",
]);

function paramsFor(locationLike = globalThis.location) {
  return new URLSearchParams(locationLike?.search || "");
}

export function isFlowReleaseRoute(locationLike = globalThis.location) {
  const params = paramsFor(locationLike);
  return params.get(RELEASE_FLAG) === "1" && params.get("mode") === "flow";
}

export function isFlowDeveloperRoute(locationLike = globalThis.location) {
  const params = paramsFor(locationLike);
  return params.get("dev") === "1" && params.get("mode") === "flow";
}

function createReleaseSeed() {
  const stamp = Date.now().toString(36);
  try {
    const values = new Uint32Array(2);
    globalThis.crypto?.getRandomValues?.(values);
    if (values[0] || values[1]) return `release-${stamp}-${values[0].toString(36)}${values[1].toString(36)}`;
  } catch {
    // Date + Math.random fallback keeps public launches varied on older browsers.
  }
  return `release-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
}

function releaseUrl(locationLike = globalThis.location) {
  const href = locationLike?.href || globalThis.location?.href || "http://localhost/";
  const url = new URL(href);
  url.searchParams.delete("dev");
  url.searchParams.set("mode", "flow");
  url.searchParams.set(RELEASE_FLAG, "1");
  url.searchParams.set("flowRun", "1");
  url.searchParams.set("flowUi", "1");
  url.searchParams.set("flowUx", "1");
  url.searchParams.set("flowModifiers", "0");
  url.searchParams.set("flowAdaptive", "0");
  url.searchParams.set("flowIntegration", "1");
  for (const key of [
    "flowCategory",
    "flowDifficulty",
    "flowModifierIds",
    "flowWeaknesses",
    "flowResumeAdaptive",
    "flowUiStart",
    "flowCatalog",
    "flowPassage",
  ]) {
    url.searchParams.delete(key);
  }
  if (!url.searchParams.has("flowSeed")) url.searchParams.set("flowSeed", createReleaseSeed());
  return url;
}

export function buildFlowReleaseUrl(locationLike = globalThis.location) {
  return releaseUrl(locationLike).href;
}

export function stripFlowReleaseUrl(locationLike = globalThis.location) {
  const href = locationLike?.href || globalThis.location?.href || "http://localhost/";
  const url = new URL(href);
  for (const key of FLOW_RELEASE_QUERY_KEYS) url.searchParams.delete(key);
  if (url.searchParams.get("dev") === "1" && isFlowReleaseRoute(locationLike)) {
    url.searchParams.delete("dev");
  }
  return url.href;
}

function replaceUrl(url) {
  globalThis.history?.replaceState?.(null, "", url.href || String(url));
}

let runtimeReady = Promise.resolve(false);
let publicLaunchPromise = null;

function runFlowRuntime() {
  const request = importFlowRuntime().catch((error) => {
    console.error("Flow runtime failed to initialize", error);
    return false;
  });
  runtimeReady = request;
  return request;
}

function launchPublicFlow() {
  if (publicLaunchPromise) return publicLaunchPromise;
  const next = releaseUrl();
  // Flow used to force a full document navigation here. That made the main app
  // bootstrap twice and then serially loaded Flow on top. Keep the same release
  // URL contract, but activate Flow inside the already-running document.
  replaceUrl(next);
  const request = runFlowRuntime();
  const launch = request.finally(() => {
    if (publicLaunchPromise === launch) publicLaunchPromise = null;
  });
  publicLaunchPromise = launch;
  return publicLaunchPromise;
}

function bindPublicModeEntry() {
  if (typeof document === "undefined" || isFlowReleaseRoute()) return;
  for (const button of document.querySelectorAll('button[data-mode-id="flow"]')) {
    button.dataset.flowReleaseEntry = "true";
  }
}

function installModeEntryRouting() {
  if (typeof document === "undefined") return;
  document.addEventListener("click", (event) => {
    if (isFlowReleaseRoute()) return;
    const target = event.target?.closest?.('button[data-mode-id="flow"]');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void launchPublicFlow();
  }, true);

  // The listener above is intentionally installed on release pages too so it
  // survives a same-document Flow exit and can launch Flow again afterwards.
  // The MutationObserver is only needed on non-release pages and stays disabled
  // during active Flow typing to avoid waking on gameplay DOM mutations.
  if (isFlowReleaseRoute()) return;
  const app = document.querySelector("#app");
  if (app) new MutationObserver(bindPublicModeEntry).observe(app, { childList: true });
  bindPublicModeEntry();
}

function waitForModeSelect(timeoutMs = 5000) {
  if (typeof document === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    let completed = false;
    let triedOpen = false;
    const finish = (value) => {
      if (completed) return;
      completed = true;
      observer?.disconnect();
      globalThis.clearTimeout?.(timer);
      resolve(value);
    };
    const inspect = () => {
      if (document.querySelector(".mode-select-screen")) {
        finish(true);
        return;
      }
      const modes = document.querySelector('[data-action="modes"]');
      if (modes && !triedOpen) {
        triedOpen = true;
        modes.click();
      }
    };
    const app = document.querySelector("#app");
    const observer = app ? new MutationObserver(inspect) : null;
    observer?.observe(app, { childList: true });
    const timer = globalThis.setTimeout?.(() => finish(false), timeoutMs);
    inspect();
  });
}

function removeTemporaryDeveloperFlag() {
  const url = new URL(globalThis.location.href);
  url.searchParams.delete("dev");
  replaceUrl(url);
}

function installReleaseBootstrapGuard() {
  if (typeof document === "undefined") return () => {};
  const id = "flow-release-bootstrap-guard";
  document.getElementById(id)?.remove();
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    html[data-flow-release-booting="true"] #app [data-flow-view] {
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;
  document.head?.append(style);
  document.documentElement?.setAttribute("data-flow-release-booting", "true");
  return () => {
    document.documentElement?.removeAttribute("data-flow-release-booting");
    style.remove();
  };
}

function installReleaseExitCleanup() {
  if (typeof document === "undefined") return;
  const app = document.querySelector("#app");
  if (!app) return;
  let seenActive = false;
  let cleaned = false;
  let observer = null;
  const inspect = () => {
    const controller = globalThis.window?.wordstrikeFlowPhase1;
    if (controller?.isActive?.()) {
      seenActive = true;
      return;
    }
    if (!seenActive || cleaned || !document.querySelector(".mode-select-screen")) return;
    cleaned = true;
    replaceUrl(stripFlowReleaseUrl());
    bindPublicModeEntry();
    observer?.disconnect();
  };
  observer = new MutationObserver(() => queueMicrotask(inspect));
  observer.observe(app, { childList: true });
  queueMicrotask(inspect);
}

export async function warmFlowOfflineCache() {
  if (!globalThis.caches?.open || !globalThis.fetch) return { supported: false, cached: 0 };
  try {
    const cache = await globalThis.caches.open(FLOW_RELEASE_CACHE_NAME);
    const urls = FLOW_RELEASE_ASSETS.map((asset) => new URL(asset, globalThis.location.href).href);
    const missing = [];
    for (const url of urls) {
      if (!(await cache.match(url))) missing.push(url);
    }
    if (missing.length) await cache.addAll(missing);
    return { supported: true, cached: urls.length, cacheName: FLOW_RELEASE_CACHE_NAME };
  } catch (error) {
    return {
      supported: true,
      cached: 0,
      cacheName: FLOW_RELEASE_CACHE_NAME,
      error: String(error?.message || error),
    };
  }
}

function scheduleFlowOfflineCacheWarmup() {
  if (typeof document === "undefined") return warmFlowOfflineCache();
  return new Promise((resolve) => {
    const run = () => {
      // Never compete with the critical Flow activation path. If Flow is being
      // entered right now, give module loading and first paint priority.
      if (isFlowReleaseRoute()) {
        globalThis.setTimeout?.(() => void warmFlowOfflineCache().then(resolve), 1200);
        return;
      }
      void warmFlowOfflineCache().then(resolve);
    };
    if (typeof globalThis.requestIdleCallback === "function") {
      globalThis.requestIdleCallback(run, { timeout: 1800 });
    } else {
      globalThis.setTimeout?.(run, 900);
    }
  });
}

async function importFlowRuntime() {
  const release = isFlowReleaseRoute();
  const developer = isFlowDeveloperRoute();
  if (!release && !developer) return false;

  let clearReleaseBootstrapGuard = null;
  if (release) {
    const normalized = releaseUrl();
    replaceUrl(normalized);
    await waitForModeSelect();
    clearReleaseBootstrapGuard = installReleaseBootstrapGuard();
    const temporary = new URL(globalThis.location.href);
    temporary.searchParams.set("dev", "1");
    replaceUrl(temporary);
  }

  try {
    // Integration defaults must run before Phase 1 resolves its immutable run
    // plan. Everything after that is presentation/integration and can load in
    // dependency-safe waves instead of eleven serial network/parse waits.
    const integrationBootstrap = await import("./flowIntegrationBootstrap.js?v=20260923b");
    integrationBootstrap.applyFlowIntegrationDefaults?.();
    await Promise.all([
      import("./flowPhase1.js?v=20260923i"),
      import("./flowVisualPhase6.js?v=20260923a"),
    ]);

    const params = new URLSearchParams(globalThis.location.search);
    if (params.get("flowUi") === "1") {
      const [keyboardGuard] = await Promise.all([
        import("./flowUiPhase7KeyboardGuard.js?v=20260923a"),
        import("./flowUiPhase7.js?v=20260923a"),
      ]);
      // UI7 inserts its setup inside the already-mounted READY screen. The
      // root-only observer intentionally ignores that subtree mutation, so
      // explicitly refresh the keyboard/presentation guard once after UI7's
      // initial decorator microtask instead of observing every typed character.
      await Promise.resolve();
      keyboardGuard.refreshFlowUiGuard?.();
      await import("./flowUiPhase7Polish.js?v=20260923a");
      if (params.get("flowUx") === "1") {
        await import("./flowUxPhase8.js?v=20260923b");
        await Promise.resolve();
        const extensions = [];
        if (params.get("flowModifiers") === "1") extensions.push(import("./flowModifiersPhase9.js?v=20260923a"));
        if (params.get("flowAdaptive") === "1") extensions.push(import("./flowAdaptivePhase10.js?v=20260923a"));
        if (params.get("flowIntegration") === "1") extensions.push(import("./flowIntegrationPhase11.js?v=20260923b"));
        await Promise.all(extensions);
      }
    }
    if (release) {
      await import("./flowGameModeV2.js?v=20260923c");
    }
    // Dynamic imports are cached after the first visit. Explicit activation lets
    // the same document re-enter Flow with a freshly resolved release seed/setup
    // instead of requiring a reload just to rerun module side effects.
    globalThis.window?.wordstrikeFlowPhase1?.activateFromLocation?.();
  } finally {
    if (release) {
      removeTemporaryDeveloperFlag();
      clearReleaseBootstrapGuard?.();
    }
  }

  if (release) installReleaseExitCleanup();
  return true;
}

const offlineReady = scheduleFlowOfflineCacheWarmup();
installModeEntryRouting();
runtimeReady = runFlowRuntime();

if (globalThis.window) {
  window.wordstrikeFlowReleasePhase13 = Object.freeze({
    version: FLOW_RELEASE_VERSION,
    isReleaseRoute: () => isFlowReleaseRoute(),
    buildReleaseUrl: () => buildFlowReleaseUrl(),
    stripReleaseUrl: () => stripFlowReleaseUrl(),
    offlineReady: () => offlineReady,
    runtimeReady: () => runtimeReady,
    offlineAssetCount: FLOW_RELEASE_ASSETS.length,
    offlineCacheName: FLOW_RELEASE_CACHE_NAME,
  });
}

export { FLOW_RELEASE_ASSETS, FLOW_RELEASE_CACHE_NAME, FLOW_RELEASE_QUERY_KEYS };
