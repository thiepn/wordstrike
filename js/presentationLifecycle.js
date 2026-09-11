// WORDSTRIKE V10 — shared presentation lifecycle coordinator.
//
// Presentation modules remain responsible for their own idempotent DOM work.
// This coordinator owns the single production MutationObserver and coalesces
// bursts of DOM changes into one presentation pass per animation frame.

const DEFAULT_OBSERVER_OPTIONS = Object.freeze({
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["hidden"],
});

function defaultSchedule(callback) {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(callback, 0);
}

function defaultCancel(handle) {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
    return;
  }
  globalThis.clearTimeout?.(handle);
}

export function createPresentationLifecycle({
  root,
  presenters = [],
  MutationObserverImpl = globalThis.MutationObserver,
  schedule = defaultSchedule,
  cancel = defaultCancel,
  observerOptions = DEFAULT_OBSERVER_OPTIONS,
  onError = (error, presenter) => console.error(`Presentation sync failed: ${presenter?.id || "unknown"}`, error),
} = {}) {
  const orderedPresenters = Object.freeze(
    presenters
      .filter((presenter) => presenter && typeof presenter.sync === "function")
      .map((presenter, index) => Object.freeze({
        id: presenter.id || `presenter-${index + 1}`,
        sync: presenter.sync,
      })),
  );

  let observer = null;
  let frameId = null;
  let running = false;
  let flushing = false;

  function flush() {
    frameId = null;
    if (!running || flushing) return false;
    flushing = true;
    try {
      for (const presenter of orderedPresenters) {
        try {
          presenter.sync();
        } catch (error) {
          onError?.(error, presenter);
        }
      }
    } finally {
      flushing = false;
    }
    return true;
  }

  function queue() {
    if (!running || frameId != null) return false;
    frameId = schedule(flush);
    return true;
  }

  function start() {
    if (running) return false;
    running = true;
    if (root && typeof MutationObserverImpl === "function") {
      observer = new MutationObserverImpl(queue);
      observer.observe(root, observerOptions);
    }
    queue();
    return true;
  }

  function stop() {
    if (!running && observer == null && frameId == null) return false;
    running = false;
    observer?.disconnect?.();
    observer = null;
    if (frameId != null) cancel(frameId);
    frameId = null;
    flushing = false;
    return true;
  }

  return Object.freeze({
    start,
    stop,
    queue,
    flush,
    isRunning: () => running,
    presenterIds: Object.freeze(orderedPresenters.map((presenter) => presenter.id)),
  });
}

export { DEFAULT_OBSERVER_OPTIONS as PRESENTATION_OBSERVER_OPTIONS };
