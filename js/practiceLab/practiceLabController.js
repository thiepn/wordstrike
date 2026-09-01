import {
  attachPracticeRegistryRuntime,
  getPracticeRegistryLazyState,
} from "./practiceExperimentRegistry.js";

const IS_NODE_RUNTIME = Boolean(globalThis.process?.versions?.node);
const nodeRuntime = IS_NODE_RUNTIME
  ? await import("./practiceLabControllerRuntime.js")
  : null;

export const PRACTICE_LAB_ONBOARDING_VERSION = 1;

export function createPracticeLabController(options = {}) {
  if (nodeRuntime) return nodeRuntime.createPracticeLabController(options);

  const {
    root,
    appNavigation = {},
    experimentRegistry,
    logger = null,
  } = options;
  let runtimeController = null;
  let runtimePromise = null;
  let mountRequested = false;
  let requestedRoute;
  const pendingSubscribers = new Set();
  const runtimeUnsubscribers = new Map();

  const loadingSnapshot = () => Object.freeze({
    mounted: false,
    loading: runtimePromise !== null && runtimeController === null,
    route: null,
    historyDepth: 0,
    listenerCount: 0,
    renderCount: 0,
    lastRenderReason: runtimePromise ? "lazy-load" : null,
    featureGate: options.featureGate?.getSnapshot?.() ?? null,
    registry: experimentRegistry?.getDiagnostics?.() ?? null,
  });

  const loadRuntime = () => {
    if (runtimePromise) return runtimePromise;
    runtimePromise = Promise.all([
      import("./practiceExperimentRegistryRuntime.js"),
      import("./practiceLabControllerRuntime.js"),
    ]).then(([registryModule, controllerModule]) => {
      const lazyRegistry = getPracticeRegistryLazyState(experimentRegistry);
      if (lazyRegistry?.destroyed) return null;

      let resolvedRegistry = experimentRegistry;
      if (lazyRegistry) {
        resolvedRegistry = registryModule.createPracticeExperimentRegistry(lazyRegistry.options);
        if (!attachPracticeRegistryRuntime(experimentRegistry, resolvedRegistry)) return null;
      }

      runtimeController = controllerModule.createPracticeLabController({
        ...options,
        experimentRegistry: resolvedRegistry,
      });
      for (const listener of pendingSubscribers) {
        runtimeUnsubscribers.set(listener, runtimeController.subscribe(listener));
      }
      if (mountRequested) runtimeController.mount(requestedRoute);
      return runtimeController;
    }).catch((error) => {
      logger?.warn?.("Practice Lab lazy load failed", error);
      console.warn("Practice Lab could not be loaded.", error);
      if (mountRequested) appNavigation.exit?.();
      return null;
    });
    return runtimePromise;
  };

  return Object.freeze({
    mount(initialRoute) {
      mountRequested = true;
      requestedRoute = initialRoute;
      if (runtimeController) return runtimeController.mount(initialRoute);
      if (root && "innerHTML" in root) {
        root.innerHTML = '<section class="practice-lab-shell" aria-busy="true"><p>LOADING PRACTICE LAB...</p></section>';
      }
      void loadRuntime();
      return loadingSnapshot();
    },
    navigate(...args) {
      return runtimeController?.navigate(...args) ?? false;
    },
    back() {
      if (runtimeController) return runtimeController.back();
      if (!mountRequested) return false;
      mountRequested = false;
      appNavigation.exit?.();
      return true;
    },
    getSnapshot() {
      return runtimeController?.getSnapshot() ?? loadingSnapshot();
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Controller listener must be a function");
      if (runtimeController) return runtimeController.subscribe(listener);
      pendingSubscribers.add(listener);
      return () => {
        pendingSubscribers.delete(listener);
        runtimeUnsubscribers.get(listener)?.();
        runtimeUnsubscribers.delete(listener);
      };
    },
    unmount() {
      const wasPending = mountRequested;
      mountRequested = false;
      if (runtimeController) return runtimeController.unmount();
      return wasPending;
    },
  });
}
