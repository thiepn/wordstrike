// WORDSTRIKE V12 — explicit Typing Test results runtime.
//
// The historical V1-V7 result layers are treated as idempotent compatibility
// feature steps. V12 owns when those steps run, when the Results screen is
// mounted, and when scoped Coach-overlay observation/listeners are released.

import { getCurrentSpeedTest } from "./speedTest.js";
import { runSpeedTestResultsObserverCallbacks } from "./speedTestResultsObserverHub.js";

export const TYPING_RESULTS_RUNTIME_VERSION = 12;

const RESULTS_SELECTOR = "#app .speed-results-screen";
const PRACTICE_OVERLAY_SELECTOR = "[data-typing-coach-practice-overlay]";
const PRACTICE_ATTRIBUTE_FILTER = Object.freeze([
  "data-practice-view",
  "disabled",
  "aria-disabled",
]);

const defaultSchedule = (callback) => {
  if (typeof globalThis.queueMicrotask === "function") {
    globalThis.queueMicrotask(callback);
    return null;
  }
  return globalThis.setTimeout?.(callback, 0) ?? null;
};

function defaultResolveContext() {
  if (typeof document === "undefined") return null;
  const screen = document.querySelector(RESULTS_SELECTOR);
  const result = getCurrentSpeedTest()?.result;
  if (!screen || !result) return null;
  return {
    screen,
    result,
    sessionId: typeof result.sessionId === "string" && result.sessionId
      ? result.sessionId
      : null,
  };
}

function defaultResolveOverlay() {
  if (typeof document === "undefined") return null;
  return document.querySelector(PRACTICE_OVERLAY_SELECTOR);
}

function defaultEventTarget() {
  return typeof document === "undefined" ? null : document;
}

function reportRuntimeError(error) {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
    return;
  }
  globalThis.console?.error?.("Typing Results runtime sync failed", error);
}

export function createTypingResultsRuntime({
  dispatchFeatures = runSpeedTestResultsObserverCallbacks,
  resolveContext = defaultResolveContext,
  resolveOverlay = defaultResolveOverlay,
  MutationObserverImpl = null,
  eventTarget = defaultEventTarget(),
  schedule = defaultSchedule,
  onError = reportRuntimeError,
} = {}) {
  let mounted = false;
  let sessionId = null;
  let documentClickListenerActive = false;
  let observedOverlay = null;
  let overlayObserver = null;
  let syncQueued = false;
  let destroying = false;

  const diagnostics = {
    mountCount: 0,
    syncCount: 0,
    destroyCount: 0,
    queuedSyncCount: 0,
    featurePassCount: 0,
    featureCallbackCount: 0,
    featurePassErrors: 0,
    overlayObserverCreations: 0,
  };

  function featurePass() {
    diagnostics.featurePassCount += 1;
    try {
      const invoked = Number(dispatchFeatures?.()) || 0;
      diagnostics.featureCallbackCount += Math.max(0, invoked);
      return invoked;
    } catch (error) {
      diagnostics.featurePassErrors += 1;
      onError?.(error);
      return 0;
    }
  }

  function queueSync() {
    if (destroying || syncQueued) return false;
    syncQueued = true;
    diagnostics.queuedSyncCount += 1;
    schedule(() => {
      syncQueued = false;
      sync();
    });
    return true;
  }

  function removeDocumentClickListener() {
    if (!documentClickListenerActive) return;
    eventTarget?.removeEventListener?.("click", queueSync, true);
    documentClickListenerActive = false;
  }

  function ensureDocumentClickListener() {
    if (documentClickListenerActive || !eventTarget?.addEventListener) return;
    eventTarget.addEventListener("click", queueSync, true);
    documentClickListenerActive = true;
  }

  function disconnectOverlayObserver() {
    overlayObserver?.disconnect?.();
    overlayObserver = null;
    observedOverlay = null;
  }

  function ensureOverlayObserver() {
    const overlay = resolveOverlay?.() || null;
    if (overlay === observedOverlay && overlayObserver) return;
    disconnectOverlayObserver();
    if (!overlay) return;
    const Observer = MutationObserverImpl || globalThis.MutationObserver;
    if (typeof Observer !== "function") return;
    overlayObserver = new Observer(queueSync);
    overlayObserver.observe(overlay, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: PRACTICE_ATTRIBUTE_FILTER,
    });
    observedOverlay = overlay;
    diagnostics.overlayObserverCreations += 1;
  }

  function closeLegacyPracticeOverlay() {
    const overlay = resolveOverlay?.();
    const close = overlay?.querySelector?.("[data-coach-close-practice]");
    if (typeof close?.click === "function") close.click();
  }

  function teardown({ count = true } = {}) {
    if (!mounted && !documentClickListenerActive && !overlayObserver && !observedOverlay) return false;
    destroying = true;
    removeDocumentClickListener();
    disconnectOverlayObserver();
    closeLegacyPracticeOverlay();
    mounted = false;
    sessionId = null;
    syncQueued = false;
    destroying = false;
    if (count) diagnostics.destroyCount += 1;
    return true;
  }

  function mount(context) {
    if (!context) return false;
    const nextSessionId = context.sessionId || null;
    if (mounted && sessionId !== nextSessionId) teardown();
    if (!mounted) {
      mounted = true;
      sessionId = nextSessionId;
      diagnostics.mountCount += 1;
      ensureDocumentClickListener();
    }
    ensureOverlayObserver();
    return true;
  }

  function sync() {
    featurePass();
    const context = resolveContext?.() || null;
    if (!context) {
      teardown();
      return false;
    }
    mount(context);
    ensureOverlayObserver();
    diagnostics.syncCount += 1;
    return true;
  }

  function destroy() {
    return teardown();
  }

  function getDiagnostics() {
    return Object.freeze({
      version: TYPING_RESULTS_RUNTIME_VERSION,
      mounted,
      sessionId,
      documentClickListenerActive,
      overlayObserverActive: Boolean(overlayObserver),
      syncQueued,
      ...diagnostics,
    });
  }

  return Object.freeze({
    mount,
    sync,
    destroy,
    queueSync,
    isMounted: () => mounted,
    getDiagnostics,
  });
}

const typingResultsRuntime = createTypingResultsRuntime();

export function syncTypingResultsRuntime() {
  return typingResultsRuntime.sync();
}

export function destroyTypingResultsRuntime() {
  return typingResultsRuntime.destroy();
}

export function getTypingResultsRuntimeDiagnostics() {
  return typingResultsRuntime.getDiagnostics();
}

export { PRACTICE_ATTRIBUTE_FILTER as TYPING_RESULTS_PRACTICE_ATTRIBUTE_FILTER };
