import { validatePracticeExperimentDescriptor } from "./practiceSessionContract.js";
import { PRACTICE_EXPERIMENT_CATALOG } from "./practiceExperimentCatalog.js";

const optionalFactories = ["setupFactory", "sessionFactory", "resultFactory"];
const implementationStatuses = new Set(["available", "preview"]);

export const PRACTICE_REGISTRY_ERROR_CODES = Object.freeze({
  DESTROYED: "PRACTICE_REGISTRY_DESTROYED",
  INVALID_REGISTRATION: "PRACTICE_REGISTRY_INVALID_REGISTRATION",
  UNKNOWN_EXPERIMENT: "PRACTICE_REGISTRY_UNKNOWN_EXPERIMENT",
  DUPLICATE_REGISTRATION: "PRACTICE_REGISTRY_DUPLICATE_REGISTRATION",
  INVALID_DESCRIPTOR: "PRACTICE_REGISTRY_INVALID_DESCRIPTOR",
  DESCRIPTOR_MISMATCH: "PRACTICE_REGISTRY_DESCRIPTOR_MISMATCH",
});

export class PracticeRegistryError extends Error {
  constructor(code, message, { experimentId = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "PracticeRegistryError";
    this.code = code;
    this.experimentId = experimentId;
  }
}

const registryError = (code, message, details) => new PracticeRegistryError(code, message, details);

export function createPracticeExperimentRegistry({
  catalog = PRACTICE_EXPERIMENT_CATALOG,
  featureGate = { canAccess: () => true },
  logger = null,
} = {}) {
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  const registrations = new Map();
  const subscribers = new Set();
  let destroyed = false;

  const assertActive = () => { if (destroyed) throw registryError(PRACTICE_REGISTRY_ERROR_CODES.DESTROYED, "Practice experiment registry is destroyed"); };
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
    const runnable = featureAllowed && implementationStatuses.has(entry.status) && registration !== null;
    let availability = entry.status;
    if (!featureAllowed) availability = "gated";
    else if (entry.status === "available" && !registration) availability = "implementation-missing";
    else if (runnable) availability = "available";
    return Object.freeze({ catalogEntry: entry, registration, featureAllowed, runnable, availability });
  };

  return Object.freeze({
    register(registration) {
      assertActive();
      if (!registration || typeof registration !== "object") throw registryError(PRACTICE_REGISTRY_ERROR_CODES.INVALID_REGISTRATION, "Registration must be an object");
      const { experimentId, implementationVersion, descriptorFactory } = registration;
      if (!catalogById.has(experimentId)) throw registryError(PRACTICE_REGISTRY_ERROR_CODES.UNKNOWN_EXPERIMENT, `Unknown Practice experiment: ${experimentId}`, { experimentId });
      if (registrations.has(experimentId)) throw registryError(PRACTICE_REGISTRY_ERROR_CODES.DUPLICATE_REGISTRATION, `Practice experiment already registered: ${experimentId}`, { experimentId });
      if (!Number.isInteger(implementationVersion) || implementationVersion < 1) throw registryError(PRACTICE_REGISTRY_ERROR_CODES.INVALID_REGISTRATION, "implementationVersion must be a positive integer", { experimentId });
      if (typeof descriptorFactory !== "function") throw registryError(PRACTICE_REGISTRY_ERROR_CODES.INVALID_REGISTRATION, "descriptorFactory must be a function", { experimentId });
      optionalFactories.forEach((key) => { if (registration[key] != null && typeof registration[key] !== "function") throw registryError(PRACTICE_REGISTRY_ERROR_CODES.INVALID_REGISTRATION, `${key} must be a function`, { experimentId }); });
      let descriptor;
      try { descriptor = descriptorFactory(); } catch (cause) {
        throw registryError(PRACTICE_REGISTRY_ERROR_CODES.INVALID_DESCRIPTOR, "Practice descriptor factory failed", { experimentId, cause });
      }
      const validation = validatePracticeExperimentDescriptor(descriptor);
      if (!validation.valid) throw registryError(PRACTICE_REGISTRY_ERROR_CODES.INVALID_DESCRIPTOR, `Invalid Practice descriptor: ${validation.errors[0]?.message}`, { experimentId });
      if (descriptor.id !== experimentId) throw registryError(PRACTICE_REGISTRY_ERROR_CODES.DESCRIPTOR_MISMATCH, "Practice descriptor ID must match its catalog experiment ID", { experimentId });
      const catalogEntry = catalogById.get(experimentId);
      if (descriptor.category !== catalogEntry.category) throw registryError(PRACTICE_REGISTRY_ERROR_CODES.DESCRIPTOR_MISMATCH, "Practice descriptor category must match its catalog category", { experimentId });
      const validatedDescriptor = Object.freeze({
        ...descriptor,
        abilityChannel: descriptor.abilityChannel ?? null,
        supportedCompletionModes: Object.freeze([...descriptor.supportedCompletionModes]),
      });
      const stored = Object.freeze({ experimentId, implementationVersion, descriptor: validatedDescriptor, descriptorFactory, ...Object.fromEntries(optionalFactories.filter((key) => registration[key]).map((key) => [key, registration[key]])) });
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
      if (typeof listener !== "function") throw registryError(PRACTICE_REGISTRY_ERROR_CODES.INVALID_REGISTRATION, "Registry listener must be a function");
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
