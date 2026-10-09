import {
  attachPracticeRegistryRuntime,
  getPracticeRegistryLazyState,
} from "./practiceExperimentRegistry.js";

// Node contract tests use the authoritative runtime directly. The browser
// loads it only when Practice Lab is entered, keeping the WordStrike title and
// other four modes free from the experiment bundle.
const IS_NODE_RUNTIME = Boolean(globalThis.process?.versions?.node);
const nodeRuntime = IS_NODE_RUNTIME ? await import("./practiceLabControllerCurrent.js") : null;

export const PRACTICE_LAB_ONBOARDING_VERSION = 1;

// Registration order is stable because several experiment definitions share
// training and assessment dependencies with the controller.
const EXPERIMENT_MODULES = Object.freeze([
  ["./practiceCombinationRepairExperiment.js", "registerPracticeCombinationRepairExperiment"],
  ["./practiceWeakKeysExperiment.js", "registerPracticeWeakKeysExperiment"],
  ["./practiceProblemWordsExperiment.js", "registerPracticeProblemWordsExperiment"],
  ["./practiceAccuracyRecoveryExperiment.js", "registerPracticeAccuracyRecoveryExperiment"],
  ["./practiceRealTextExperiment.js", "registerPracticeRealTextExperiment"],
  ["./practicePaceLadderExperiment.js", "registerPracticePaceLadderExperiment"],
  ["./practiceBurstSprintsExperiment.js", "registerPracticeBurstSprintsExperiment"],
  ["./practiceCommonWordsExperiment.js", "registerPracticeCommonWordsExperiment"],
  ["./practiceConsistencyExperiment.js", "registerPracticeConsistencyExperiment"],
  ["./practiceEnduranceExperiment.js", "registerPracticeEnduranceExperiment"],
  ["./practicePunctuationCapitalsExperiment.js", "registerPracticePunctuationCapitalsExperiment"],
  ["./practiceNumbersSymbolsExperiment.js", "registerPracticeNumbersSymbolsExperiment"],
  ["./practiceCustomTextExperiment.js", "registerPracticeCustomTextExperiment"],
  ["./practiceWeaknessBossExperiment.js", "registerPracticeWeaknessBossExperiment"],
  ["./practiceGraduatedFluencyExperiments.js", "registerPracticeGraduatedFluencyExperiments"],
]);

export function createPracticeLabController(options = {}) {
  if (nodeRuntime) return nodeRuntime.createPracticeLabController(options);

  const { root, appNavigation = {}, experimentRegistry, logger = null } = options;
  let runtimeController = null;
  let runtimePromise = null;
  let mountRequested = false;
  let requestedRoute;
  const pendingSubscribers = new Set();
  const runtimeUnsubscribers = new Map();

  function loadingSnapshot() {
    return Object.freeze({
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
  }

  function loadRuntime() {
    if (runtimePromise) return runtimePromise;
    runtimePromise = Promise.all([
      import("./practiceExperimentRegistryRuntime.js"),
      import("./practiceLabControllerCurrent.js"),
      ...EXPERIMENT_MODULES.map(([url]) => import(url)),
    ]).then(([registryModule, controllerModule, ...experimentModules]) => {
      const lazyRegistry = getPracticeRegistryLazyState(experimentRegistry);
      if (lazyRegistry?.destroyed) return null;

      let resolvedRegistry = experimentRegistry;
      if (lazyRegistry) {
        resolvedRegistry = registryModule.createPracticeExperimentRegistry(lazyRegistry.options);
        if (!attachPracticeRegistryRuntime(experimentRegistry, resolvedRegistry)) return null;
      }

      for (const [index, [, registerName]] of EXPERIMENT_MODULES.entries()) {
        experimentModules[index][registerName](resolvedRegistry);
      }

      runtimeController = controllerModule.createPracticeLabController({
        ...options,
        experimentRegistry: resolvedRegistry,
      });
      for (const listener of pendingSubscribers) {
        runtimeUnsubscribers.set(listener, runtimeController.subscribe(listener));
      }
      // Unmount during import must never resurrect a hidden Practice screen.
      if (mountRequested) runtimeController.mount(requestedRoute);
      return runtimeController;
    }).catch((error) => {
      logger?.warn?.("PRACTICE_LAZY_LOAD_FAILED", {
        code: "PRACTICE_LAZY_LOAD_FAILED",
        name: error?.name ?? "Error",
      });
      if (mountRequested) appNavigation.exit?.();
      return null;
    });
    return runtimePromise;
  }

  function mount(initialRoute) {
    mountRequested = true;
    requestedRoute = initialRoute;
    if (runtimeController) return runtimeController.mount(initialRoute);
    if (root && "innerHTML" in root) {
      root.innerHTML = '<section class="practice-lab-shell" aria-busy="true"><p>LOADING PRACTICE LAB...</p></section>';
    }
    void loadRuntime();
    return loadingSnapshot();
  }

  function unmount() {
    const wasPending = mountRequested;
    mountRequested = false;
    if (runtimeController) return runtimeController.unmount();
    return wasPending;
  }

  function back() {
    if (runtimeController) return runtimeController.back();
    if (!mountRequested) return false;
    mountRequested = false;
    appNavigation.exit?.();
    return true;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Controller listener must be a function");
    }
    if (runtimeController) return runtimeController.subscribe(listener);
    pendingSubscribers.add(listener);
    return () => {
      pendingSubscribers.delete(listener);
      runtimeUnsubscribers.get(listener)?.();
      runtimeUnsubscribers.delete(listener);
    };
  }

  return Object.freeze({
    mount,
    unmount,
    back,
    navigate: (...args) => runtimeController?.navigate(...args) ?? false,
    getSnapshot: () => runtimeController?.getSnapshot() ?? loadingSnapshot(),
    subscribe,
  });
}
