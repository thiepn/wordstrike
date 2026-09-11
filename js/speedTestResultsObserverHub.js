// WORDSTRIKE V12 — Typing Test results compatibility capture bridge.
//
// V1-V7 are historical additive result layers. Their module-level installers
// still construct MutationObserver instances, but V12 captures those callbacks
// as inert compatibility registrations. TypingResultsRuntime invokes them
// explicitly from the shared presentation lifecycle instead of keeping another
// app/body MutationObserver alive.
//
// After historical module boot, the native constructor is restored. Scoped
// observers created later (for example a temporary Practice overlay) therefore
// remain normal browser observers and are not part of this bridge.

export const SPEED_TEST_RESULTS_OBSERVER_HUB_VERSION = 12;

const NativeMutationObserver = globalThis.MutationObserver;
const registrations = new Set();
let captureReleased = false;
let manualDispatchPasses = 0;
let callbackInvocations = 0;
let callbackErrors = 0;

function normalizeOptions(options = {}) {
  const attributes = options.attributes === true || options.attributeOldValue === true || Array.isArray(options.attributeFilter);
  const characterData = options.characterData === true || options.characterDataOldValue === true;
  return Object.freeze({
    childList: options.childList === true,
    subtree: options.subtree === true,
    attributes,
    attributeOldValue: options.attributeOldValue === true,
    attributeFilter: Array.isArray(options.attributeFilter)
      ? Object.freeze([...new Set(options.attributeFilter.map(String))])
      : null,
    characterData,
    characterDataOldValue: options.characterDataOldValue === true,
  });
}

function reportCallbackError(error) {
  callbackErrors += 1;
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
    return;
  }
  globalThis.console?.error?.("Typing Test results compatibility callback failed", error);
}

class VirtualMutationObserver {
  constructor(callback) {
    if (typeof callback !== "function") throw new TypeError("MutationObserver callback must be a function");
    const registration = {
      callback,
      observations: new Map(),
      proxy: this,
    };
    this.__wordstrikeRegistration = registration;
    registrations.add(registration);
  }

  observe(target, options = {}) {
    if (!target) throw new TypeError("MutationObserver target is required");
    const normalized = normalizeOptions(options);
    if (!(normalized.childList || normalized.attributes || normalized.characterData)) {
      throw new TypeError("MutationObserver options must enable childList, attributes, or characterData");
    }
    this.__wordstrikeRegistration.observations.set(target, normalized);
  }

  disconnect() {
    this.__wordstrikeRegistration.observations.clear();
  }

  takeRecords() {
    return [];
  }
}

const captureInstalled = typeof NativeMutationObserver === "function";
if (captureInstalled) {
  globalThis.MutationObserver = VirtualMutationObserver;
}

// V12's explicit runtime intentionally invokes every active compatibility
// callback in historical registration order. Each callback already owns its
// idempotence/readiness checks, so it does not need fabricated mutation records.
export function runSpeedTestResultsObserverCallbacks() {
  manualDispatchPasses += 1;
  let invoked = 0;
  for (const registration of [...registrations]) {
    if (!registration.observations.size) continue;
    try {
      registration.callback([], registration.proxy);
      callbackInvocations += 1;
      invoked += 1;
    } catch (error) {
      reportCallbackError(error);
    }
  }
  return invoked;
}

export function releaseSpeedTestResultsObserverCapture() {
  if (captureReleased) return false;
  captureReleased = true;
  if (captureInstalled && globalThis.MutationObserver === VirtualMutationObserver) {
    globalThis.MutationObserver = NativeMutationObserver;
  }
  return true;
}

export function getSpeedTestResultsObserverHubDiagnostics() {
  return Object.freeze({
    version: SPEED_TEST_RESULTS_OBSERVER_HUB_VERSION,
    captureInstalled,
    captureReleased,
    nativeObservationEnabled: false,
    nativeObserverCreations: 0,
    nativeRebuilds: 0,
    virtualObserverCount: registrations.size,
    activeVirtualObserverCount: [...registrations].filter((registration) => registration.observations.size > 0).length,
    manualDispatchPasses,
    callbackInvocations,
    callbackErrors,
  });
}
