export const LOCAL_DATA_CHANGED_EVENT = "wordstrike:local-data-changed";

export function notifyLocalDataChanged(domain = "unknown") {
  try {
    if (typeof globalThis.dispatchEvent !== "function") return false;
    const detail = Object.freeze({ domain: String(domain), at: Date.now() });
    const event = typeof globalThis.CustomEvent === "function"
      ? new globalThis.CustomEvent(LOCAL_DATA_CHANGED_EVENT, { detail })
      : Object.assign(new Event(LOCAL_DATA_CHANGED_EVENT), { detail });
    return globalThis.dispatchEvent(event);
  } catch {
    return false;
  }
}
