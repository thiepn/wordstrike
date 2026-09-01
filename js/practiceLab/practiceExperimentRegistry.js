const IS_NODE_RUNTIME = Boolean(globalThis.process?.versions?.node);
const nodeRuntime = IS_NODE_RUNTIME
  ? await import("./practiceExperimentRegistryRuntime.js")
  : null;

const FALLBACK_ERROR_CODES = Object.freeze({
  DESTROYED: "PRACTICE_REGISTRY_DESTROYED",
  INVALID_REGISTRATION: "PRACTICE_REGISTRY_INVALID_REGISTRATION",
  UNKNOWN_EXPERIMENT: "PRACTICE_REGISTRY_UNKNOWN_EXPERIMENT",
  DUPLICATE_REGISTRATION: "PRACTICE_REGISTRY_DUPLICATE_REGISTRATION",
  INVALID_DESCRIPTOR: "PRACTICE_REGISTRY_INVALID_DESCRIPTOR",
  DESCRIPTOR_MISMATCH: "PRACTICE_REGISTRY_DESCRIPTOR_MISMATCH",
});

class LazyPracticeRegistryError extends Error {
  constructor(code, message, { experimentId = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "PracticeRegistryError";
    this.code = code;
    this.experimentId = experimentId;
  }
}

export const PRACTICE_REGISTRY_ERROR_CODES = nodeRuntime?.PRACTICE_REGISTRY_ERROR_CODES
  ?? FALLBACK_ERROR_CODES;
export const PracticeRegistryError = nodeRuntime?.PracticeRegistryError
  ?? LazyPracticeRegistryError;

const lazyRegistryState = new WeakMap();

function notLoadedError() {
  return new PracticeRegistryError(
    PRACTICE_REGISTRY_ERROR_CODES.INVALID_REGISTRATION,
    "Practice registry runtime is not loaded yet",
  );
}

export function getPracticeRegistryLazyState(registry) {
  return lazyRegistryState.get(registry) || null;
}

export function attachPracticeRegistryRuntime(registry, runtimeRegistry) {
  const state = lazyRegistryState.get(registry);
  if (!state || state.destroyed) {
    runtimeRegistry?.destroy?.();
    return false;
  }
  state.runtime = runtimeRegistry;
  return true;
}

export function createPracticeExperimentRegistry(options = {}) {
  if (nodeRuntime) return nodeRuntime.createPracticeExperimentRegistry(options);

  const state = {
    options,
    runtime: null,
    destroyed: false,
  };

  const registry = Object.freeze({
    register(...args) {
      if (!state.runtime) throw notLoadedError();
      return state.runtime.register(...args);
    },
    unregister(...args) {
      return state.runtime?.unregister(...args) ?? false;
    },
    hasImplementation(...args) {
      return state.runtime?.hasImplementation(...args) ?? false;
    },
    getCatalogEntry(...args) {
      return state.runtime?.getCatalogEntry(...args) ?? null;
    },
    getRegistration(...args) {
      return state.runtime?.getRegistration(...args) ?? null;
    },
    getResolvedExperiment(...args) {
      return state.runtime?.getResolvedExperiment(...args) ?? null;
    },
    listResolvedExperiments() {
      return state.runtime?.listResolvedExperiments() ?? [];
    },
    subscribe(...args) {
      if (!state.runtime) throw notLoadedError();
      return state.runtime.subscribe(...args);
    },
    getDiagnostics() {
      return state.runtime?.getDiagnostics() ?? Object.freeze({
        destroyed: state.destroyed,
        catalogCount: 0,
        registeredCount: 0,
        subscriberCount: 0,
        availableCount: 0,
        lazy: true,
      });
    },
    destroy() {
      if (state.destroyed) return false;
      state.destroyed = true;
      state.runtime?.destroy?.();
      state.runtime = null;
      return true;
    },
  });

  lazyRegistryState.set(registry, state);
  return registry;
}
