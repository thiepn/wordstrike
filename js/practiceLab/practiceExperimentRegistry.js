import { validatePracticeExperimentDescriptor } from "./practiceSessionContract.js";
import { PRACTICE_EXPERIMENT_CATALOG } from "./practiceExperimentCatalog.js";

const optionalFactories = ["setupFactory", "sessionFactory", "resultFactory"];

export function createPracticeExperimentRegistry({
  catalog = PRACTICE_EXPERIMENT_CATALOG,
  featureGate = { canAccess: () => true },
  logger = null,
} = {}) {
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  const registrations = new Map();
  const subscribers = new Set();
  let destroyed = false;

  const assertActive = () => { if (destroyed) throw new Error("Practice experiment registry is destroyed"); };
  const emit = (type, experimentId) => {
    const event = Object.freeze({ type, experimentId, registeredCount: registrations.size });
    [...subscribers].forEach((listener) => {
      try { listener(event); } catch (error) { logger?.warn?.("Practice registry subscriber failed", error); }
    });
  };
  const resolve = (entry) => {
    if (!entry) return null;
    const registration = registrations.get(entry.id) || null;
    const featureAllowed = featureGate.canAccess() === true;
    const runnable = featureAllowed && entry.status === "available" && registration !== null;
    let availability = entry.status;
    if (!featureAllowed) availability = "gated";
    else if (entry.status === "available" && !registration) availability = "implementation-missing";
    else if (runnable) availability = "available";
    return Object.freeze({ catalogEntry: entry, registration, featureAllowed, runnable, availability });
  };

  return Object.freeze({
    register(registration) {
      assertActive();
      if (!registration || typeof registration !== "object") throw new TypeError("Registration must be an object");
      const { experimentId, implementationVersion, descriptorFactory } = registration;
      if (!catalogById.has(experimentId)) throw new Error(`Unknown Practice experiment: ${experimentId}`);
      if (registrations.has(experimentId)) throw new Error(`Practice experiment already registered: ${experimentId}`);
      if (!Number.isInteger(implementationVersion) || implementationVersion < 1) throw new TypeError("implementationVersion must be a positive integer");
      if (typeof descriptorFactory !== "function") throw new TypeError("descriptorFactory must be a function");
      optionalFactories.forEach((key) => { if (registration[key] != null && typeof registration[key] !== "function") throw new TypeError(`${key} must be a function`); });
      const descriptor = descriptorFactory();
      const validation = validatePracticeExperimentDescriptor(descriptor);
      if (!validation.valid) throw new TypeError(`Invalid Practice descriptor: ${validation.errors[0]?.message}`);
      if (descriptor.id !== experimentId) throw new Error("Practice descriptor ID must match its catalog experiment ID");
      const stored = Object.freeze({ experimentId, implementationVersion, descriptorFactory, ...Object.fromEntries(optionalFactories.filter((key) => registration[key]).map((key) => [key, registration[key]])) });
      registrations.set(experimentId, stored);
      emit("registered", experimentId);
      return stored;
    },
    unregister(experimentId) {
      assertActive();
      if (!registrations.delete(experimentId)) return false;
      emit("unregistered", experimentId);
      return true;
    },
    hasImplementation: (experimentId) => !destroyed && registrations.has(experimentId),
    getCatalogEntry: (experimentId) => catalogById.get(experimentId) || null,
    getRegistration: (experimentId) => destroyed ? null : registrations.get(experimentId) || null,
    getResolvedExperiment: (experimentId) => resolve(catalogById.get(experimentId)),
    listResolvedExperiments: () => catalog.map(resolve),
    subscribe(listener) {
      assertActive();
      if (typeof listener !== "function") throw new TypeError("Registry listener must be a function");
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    getDiagnostics: () => Object.freeze({ destroyed, catalogCount: catalog.length, registeredCount: registrations.size, subscriberCount: subscribers.size, availableCount: catalog.map(resolve).filter((item) => item.runnable).length }),
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      registrations.clear();
      subscribers.clear();
      return true;
    },
  });
}
