const RELEASE_FLAG = "flowRelease";
const FLOW_RELEASE_VERSION = 1;
const FLOW_RELEASE_CACHE_NAME = "wordstrike-flow-release-v1";
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
  "flowCategory",
  "flowDifficulty",
  "flowSeed",
  "flowUiStart",
  "flowCatalog",
  "flowPassage",
]);

const FLOW_RELEASE_ASSETS = Object.freeze([
  "./js/flow/flowRuntimeLoader.js?v=20260916a",
  "./js/flow/flowMigrationPresentation.js?v=20260915a",
  "./js/flow/flowAdaptive.js",
  "./js/flow/flowAdaptivePhase10.js?v=20260916a",
  "./js/flow/flowCadence.js",
  "./js/flow/flowCatalog.js",
  "./js/flow/flowConfig.js",
  "./js/flow/flowContent.js",
  "./js/flow/flowContentExpansion.js",
  "./js/flow/flowEngine.js",
  "./js/flow/flowGameplay.js",
  "./js/flow/flowIntegrationBootstrap.js?v=20260916a",
  "./js/flow/flowIntegrationPhase11.js?v=20260916a",
  "./js/flow/flowModifiers.js",
  "./js/flow/flowModifiersPhase9.js?v=20260916a",
  "./js/flow/flowPassages.js",
  "./js/flow/flowPhase1.js?v=20260916d",
  "./js/flow/flowProgression.js",
  "./js/flow/flowRunPlan.js",
  "./js/flow/flowSelection.js",
  "./js/flow/flowShell.js",
  "./js/flow/flowState.js",
  "./js/flow/flowUiPhase7.js?v=20260916a",
  "./js/flow/flowUiPhase7KeyboardGuard.js?v=20260916a",
  "./js/flow/flowUiPhase7Polish.js?v=20260916a",
  "./js/flow/flowUxPhase8.js?v=20260916a",
  "./js/flow/flowVisualPhase6.js?v=20260916a",
  "./styles/screens/flow-phase1.css?v=20260916d",
  "./styles/screens/flow-phase5.css?v=20260916a",
  "./styles/screens/flow-visual-phase6.css?v=20260916b",
  "./styles/screens/flow-visual-phase6-polish.css?v=20260916a",
  "./styles/screens/flow-ui-phase7.css?v=20260916a",
  "./styles/screens/flow-ui-phase7-polish.css?v=20260916b",
  "./styles/screens/flow-ux-phase8.css?v=20260916a",
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
  url.searchParams.set("flowModifiers", "1");
  url.searchParams.set("flowAdaptive", "1");
  url.searchParams.set("flowIntegration", "1");
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

function launchPublicFlow() {
  const next = releaseUrl();
  globalThis.location.assign(next.href);
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
    launchPublicFlow();
  }, true);
  const app = document.querySelector("#app");
  if (app) new MutationObserver(bindPublicModeEntry).observe(app, { childList: true, subtree: true });
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
    observer?.observe(app, { childList: true, subtree: true });
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
  };
  new MutationObserver(() => queueMicrotask(inspect)).observe(app, { childList: true, subtree: true });
  queueMicrotask(inspect);
}

export async function warmFlowOfflineCache() {
  if (!globalThis.caches?.open || !globalThis.fetch) return { supported: false, cached: 0 };
  try {
    // Flow owns a small cache outside the rotating `wordstrike-pwa-*` namespace.
    // PWA activation intentionally deletes older app-shell caches, so coupling
    // Flow warm-up to a guessed shell version could erase freshly cached assets
    // during a first install or service-worker upgrade. The service worker's
    // fetch fallback uses caches.match(request), which searches this cache too.
    const cache = await globalThis.caches.open(FLOW_RELEASE_CACHE_NAME);
    const urls = FLOW_RELEASE_ASSETS.map((asset) => new URL(asset, globalThis.location.href).href);
    await cache.addAll(urls);
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
    await import("./flowIntegrationBootstrap.js?v=20260916a");
    await import("./flowPhase1.js?v=20260916d");
    await import("./flowVisualPhase6.js?v=20260916a");

    const params = new URLSearchParams(globalThis.location.search);
    if (params.get("flowUi") === "1") {
      await import("./flowUiPhase7KeyboardGuard.js?v=20260916a");
      await import("./flowUiPhase7.js?v=20260916a");
      await import("./flowUiPhase7Polish.js?v=20260916a");
      if (params.get("flowUx") === "1") {
        await import("./flowUxPhase8.js?v=20260916a");
        if (params.get("flowModifiers") === "1") {
          await import("./flowModifiersPhase9.js?v=20260916a");
        }
        if (params.get("flowAdaptive") === "1") {
          await import("./flowAdaptivePhase10.js?v=20260916a");
        }
        if (params.get("flowIntegration") === "1") {
          await import("./flowIntegrationPhase11.js?v=20260916a");
        }
      }
    }
  } finally {
    if (release) {
      removeTemporaryDeveloperFlag();
      clearReleaseBootstrapGuard?.();
    }
  }

  if (release) installReleaseExitCleanup();
  return true;
}

const offlineReady = warmFlowOfflineCache();
installModeEntryRouting();
const runtimeReady = importFlowRuntime().catch((error) => {
  console.error("Flow runtime failed to initialize", error);
  return false;
});

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
