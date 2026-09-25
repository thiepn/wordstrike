export const BROWSER_STORAGE_FALLBACK_MARKER_KEY = "wordstrike.browser-storage-fallback-keys.v1";

function safeGlobalStorage(name, root = globalThis) {
  try {
    return root?.[name] ?? null;
  } catch {
    return null;
  }
}

function hasStorageApi(storage) {
  return Boolean(
    storage &&
    typeof storage.getItem === "function" &&
    typeof storage.setItem === "function"
  );
}

function canRemove(storage) {
  return Boolean(storage && typeof storage.removeItem === "function");
}

function readFallbackKeys(sessionStorage) {
  if (!hasStorageApi(sessionStorage)) return new Set();
  try {
    const raw = sessionStorage.getItem(BROWSER_STORAGE_FALLBACK_MARKER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((key) => typeof key === "string" && key)
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeFallbackKeys(sessionStorage, keys) {
  if (!hasStorageApi(sessionStorage)) return false;
  try {
    if (!keys.size) {
      if (canRemove(sessionStorage)) {
        sessionStorage.removeItem(BROWSER_STORAGE_FALLBACK_MARKER_KEY);
      } else {
        sessionStorage.setItem(BROWSER_STORAGE_FALLBACK_MARKER_KEY, "[]");
      }
    } else {
      sessionStorage.setItem(
        BROWSER_STORAGE_FALLBACK_MARKER_KEY,
        JSON.stringify([...keys].slice(-128)),
      );
    }
    return true;
  } catch {
    return false;
  }
}

function markSessionFallback(sessionStorage, key, enabled) {
  if (!hasStorageApi(sessionStorage) || key === BROWSER_STORAGE_FALLBACK_MARKER_KEY) {
    return false;
  }
  const keys = readFallbackKeys(sessionStorage);
  if (enabled) keys.add(key);
  else keys.delete(key);
  return writeFallbackKeys(sessionStorage, keys);
}

function readFrom(storage, key) {
  if (!hasStorageApi(storage)) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function createResilientBrowserStorage({
  localStorage = safeGlobalStorage("localStorage"),
  sessionStorage = safeGlobalStorage("sessionStorage"),
} = {}) {
  const local = hasStorageApi(localStorage) ? localStorage : null;
  const session = hasStorageApi(sessionStorage) ? sessionStorage : null;
  if (!local && !session) return null;

  return Object.freeze({
    getItem(key) {
      const storageKey = String(key);
      const sessionPreferred = readFallbackKeys(session).has(storageKey);
      const first = sessionPreferred ? session : local;
      const second = sessionPreferred ? local : session;

      const firstValue = readFrom(first, storageKey);
      if (firstValue != null) return firstValue;

      const secondValue = readFrom(second, storageKey);
      if (secondValue != null) return secondValue;

      if (sessionPreferred) markSessionFallback(session, storageKey, false);
      return null;
    },

    setItem(key, value) {
      const storageKey = String(key);
      const storageValue = String(value);
      let lastError = null;

      if (local) {
        try {
          local.setItem(storageKey, storageValue);
          // Clear any fallback copy/marker after local persistence recovers.
          try { if (canRemove(session)) session.removeItem(storageKey); } catch {}
          markSessionFallback(session, storageKey, false);
          return;
        } catch (error) {
          lastError = error;
        }
      }

      if (session) {
        try {
          session.setItem(storageKey, storageValue);
          markSessionFallback(session, storageKey, true);
          return;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError ?? new Error("Browser storage is unavailable.");
    },

    removeItem(key) {
      const storageKey = String(key);
      let removed = false;
      let lastError = null;

      for (const storage of [local, session]) {
        if (!storage || !canRemove(storage)) continue;
        try {
          storage.removeItem(storageKey);
          removed = true;
        } catch (error) {
          lastError = error;
        }
      }
      markSessionFallback(session, storageKey, false);

      if (!removed && lastError) throw lastError;
    },
  });
}

export function getResilientBrowserStorage() {
  return createResilientBrowserStorage();
}
