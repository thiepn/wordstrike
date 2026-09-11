// WORDSTRIKE V11 — Typing Test results observer hub.
//
// V1-V7 are historical additive result layers. They still construct
// MutationObserver instances internally, but during their one-time module boot
// those observers are virtualized here and backed by one native observer.
// After the legacy layers finish booting, the global constructor is restored so
// unrelated features (including scoped Practice overlays) keep native behavior.

export const SPEED_TEST_RESULTS_OBSERVER_HUB_VERSION = 11;

const NativeMutationObserver = globalThis.MutationObserver;
const registrations = new Set();
let nativeObserver = null;
let captureReleased = false;
let nativeObserverCreations = 0;
let nativeRebuilds = 0;

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

function mergeOptions(current, incoming) {
  if (!current) return { ...incoming, attributeFilter: incoming.attributeFilter == null ? null : [...incoming.attributeFilter] };
  const attributes = current.attributes || incoming.attributes;
  let attributeFilter = current.attributeFilter;
  if (attributes) {
    if ((current.attributes && current.attributeFilter == null) || (incoming.attributes && incoming.attributeFilter == null)) {
      attributeFilter = null;
    } else {
      attributeFilter = [...new Set([...(current.attributeFilter || []), ...(incoming.attributeFilter || [])])];
    }
  }
  return {
    childList: current.childList || incoming.childList,
    subtree: current.subtree || incoming.subtree,
    attributes,
    attributeOldValue: current.attributeOldValue || incoming.attributeOldValue,
    attributeFilter,
    characterData: current.characterData || incoming.characterData,
    characterDataOldValue: current.characterDataOldValue || incoming.characterDataOldValue,
  };
}

function nativeOptions(options) {
  const result = {
    childList: options.childList,
    subtree: options.subtree,
    attributes: options.attributes,
    characterData: options.characterData,
  };
  if (options.attributeOldValue) result.attributeOldValue = true;
  if (options.characterDataOldValue) result.characterDataOldValue = true;
  if (options.attributes && Array.isArray(options.attributeFilter)) result.attributeFilter = options.attributeFilter;
  return result;
}

function containsTarget(root, target) {
  if (root === target) return true;
  try {
    return typeof root?.contains === "function" && root.contains(target);
  } catch {
    return false;
  }
}

function observationMatchesRecord(target, options, record) {
  if (!record) return false;
  if (record.target !== target && !(options.subtree && containsTarget(target, record.target))) return false;
  if (record.type === "childList") return options.childList;
  if (record.type === "characterData") return options.characterData;
  if (record.type === "attributes") {
    if (!options.attributes) return false;
    if (!Array.isArray(options.attributeFilter)) return true;
    return options.attributeFilter.includes(String(record.attributeName || ""));
  }
  return false;
}

function reportCallbackError(error) {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
    return;
  }
  globalThis.console?.error?.("Typing Test results observer callback failed", error);
}

function dispatchRecords(records = []) {
  for (const registration of [...registrations]) {
    if (!registration.observations.size) continue;
    const relevant = records.filter((record) => {
      for (const [target, options] of registration.observations) {
        if (observationMatchesRecord(target, options, record)) return true;
      }
      return false;
    });
    if (!relevant.length) continue;
    try {
      registration.callback(relevant, registration.proxy);
    } catch (error) {
      reportCallbackError(error);
    }
  }
}

function ensureNativeObserver() {
  if (nativeObserver || typeof NativeMutationObserver !== "function") return nativeObserver;
  nativeObserver = new NativeMutationObserver(dispatchRecords);
  nativeObserverCreations += 1;
  return nativeObserver;
}

function rebuildNativeObservation() {
  const observer = ensureNativeObserver();
  if (!observer) return;
  observer.disconnect();
  nativeRebuilds += 1;

  const targets = new Map();
  for (const registration of registrations) {
    for (const [target, options] of registration.observations) {
      targets.set(target, mergeOptions(targets.get(target), options));
    }
  }

  for (const [target, options] of targets) {
    if (!(options.childList || options.attributes || options.characterData)) continue;
    observer.observe(target, nativeOptions(options));
  }
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
    rebuildNativeObservation();
  }

  disconnect() {
    if (!this.__wordstrikeRegistration.observations.size) return;
    this.__wordstrikeRegistration.observations.clear();
    rebuildNativeObservation();
  }

  takeRecords() {
    // Historical Typing Test observers never consume takeRecords(). Returning an
    // empty list avoids one virtual observer draining records owned by the hub.
    return [];
  }
}

const captureInstalled = typeof NativeMutationObserver === "function";
if (captureInstalled) {
  globalThis.MutationObserver = VirtualMutationObserver;
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
    nativeObserverCreations,
    nativeRebuilds,
    virtualObserverCount: registrations.size,
    activeVirtualObserverCount: [...registrations].filter((registration) => registration.observations.size > 0).length,
  });
}
