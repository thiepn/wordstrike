import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSER_STORAGE_FALLBACK_MARKER_KEY,
  createResilientBrowserStorage,
  getResilientBrowserStorage,
} from "../js/browserStorage.js";
import {
  CAMPAIGN_BACKUP_KEY,
  createDefaultSave,
  loadSave,
  saveGame,
  updateLevelResult,
} from "../js/storage.js";
import {
  createDefaultModeData,
  loadModeData,
  MODE_DATA_STORAGE_KEY,
  saveModeData,
} from "../js/modeStorage.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }
  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }
  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
  removeItem(key) {
    this.values.delete(String(key));
  }
}

function installStorageGlobals({ local, session }) {
  const oldLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const oldSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    ...(typeof local === "function" ? { get: local } : { value: local }),
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: session,
  });

  return () => {
    if (oldLocal) Object.defineProperty(globalThis, "localStorage", oldLocal);
    else delete globalThis.localStorage;
    if (oldSession) Object.defineProperty(globalThis, "sessionStorage", oldSession);
    else delete globalThis.sessionStorage;
  };
}

test("resilient storage falls back to sessionStorage when Firefox rejects localStorage access", () => {
  const session = new MemoryStorage();
  const restore = installStorageGlobals({
    local() {
      throw Object.assign(new Error("storage unavailable"), {
        name: "NS_ERROR_NOT_AVAILABLE",
      });
    },
    session,
  });

  try {
    const storage = getResilientBrowserStorage();
    assert.ok(storage);
    storage.setItem("wordstrike-test", "saved");
    assert.equal(storage.getItem("wordstrike-test"), "saved");
    assert.equal(session.getItem("wordstrike-test"), "saved");
    assert.match(
      session.getItem(BROWSER_STORAGE_FALLBACK_MARKER_KEY) || "",
      /wordstrike-test/,
    );
  } finally {
    restore();
  }
});

test("per-key fallback keeps the newest session copy authoritative after a local quota failure", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  local.setItem("large-key", "old-local");

  const quotaLocal = {
    getItem: (key) => local.getItem(key),
    removeItem: (key) => local.removeItem(key),
    setItem() {
      throw Object.assign(new Error("quota"), { name: "QuotaExceededError" });
    },
  };

  const storage = createResilientBrowserStorage({
    localStorage: quotaLocal,
    sessionStorage: session,
  });
  storage.setItem("large-key", "new-session");

  const reloaded = createResilientBrowserStorage({
    localStorage: quotaLocal,
    sessionStorage: session,
  });
  assert.equal(reloaded.getItem("large-key"), "new-session");
  assert.equal(local.getItem("large-key"), null, "stale persistent copy should be cleared after the failed write");
});

test("Campaign saves and compact progress backup survive Firefox localStorage failure", () => {
  const session = new MemoryStorage();
  const restore = installStorageGlobals({
    local() {
      throw Object.assign(new Error("storage unavailable"), {
        name: "NS_ERROR_NOT_AVAILABLE",
      });
    },
    session,
  });

  try {
    const save = createDefaultSave();
    assert.equal(saveGame(save), true);
    assert.ok(session.getItem("wordstrike_save"));

    assert.equal(updateLevelResult(save, 1, {
      grade: "A",
      accuracy: 98,
      wpm: 72,
      score: 1400,
      maxCombo: 12,
      timeRemaining: 4,
      isBoss: false,
    }), true);
    assert.ok(session.getItem(CAMPAIGN_BACKUP_KEY));

    const restored = loadSave();
    assert.equal(restored.campaignFurthestLevel, 2);
    assert.equal(restored.levels["1"].bestWPM, 72);
  } finally {
    restore();
  }
});

test("Typing/mode history persists through the same Firefox fallback", () => {
  const session = new MemoryStorage();
  const restore = installStorageGlobals({
    local() {
      throw Object.assign(new Error("storage unavailable"), {
        name: "NS_ERROR_NOT_AVAILABLE",
      });
    },
    session,
  });

  try {
    const data = createDefaultModeData();
    data.totals.completedSessions = 3;
    assert.equal(saveModeData(data), true);
    assert.ok(session.getItem(MODE_DATA_STORAGE_KEY));

    const restored = loadModeData();
    assert.equal(restored.totals.completedSessions, 3);
  } finally {
    restore();
  }
});

test("legacy read/write storage shims remain compatible without removeItem", () => {
  const values = new Map();
  const legacyStorage = {
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
  };
  const storage = createResilientBrowserStorage({
    localStorage: legacyStorage,
    sessionStorage: null,
  });
  assert.ok(storage);
  storage.setItem("legacy-key", "legacy-value");
  assert.equal(storage.getItem("legacy-key"), "legacy-value");
  assert.doesNotThrow(() => storage.removeItem("legacy-key"));
});

console.log("Firefox browser-storage fallback preserves Campaign and mode history when localStorage is unavailable.");
