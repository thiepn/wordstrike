import {
  PRACTICE_DATABASE_NAME,
  PRACTICE_DATABASE_VERSION,
  PRACTICE_OBSOLETE_INDEXES,
  PRACTICE_STORE_DEFINITIONS,
  PRACTICE_STORE_NAMES,
} from "./practiceConstants.js";
import {
  PRACTICE_STORAGE_ERROR_CODES,
  assertPracticeSerializable,
  isQuotaExceededError,
  practiceStorageError,
} from "./practiceStorageContract.js";

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
  });
}

function containsName(collection, name) {
  if (typeof collection?.contains === "function") return collection.contains(name);
  return Array.from(collection || []).includes(name);
}

function normalizeKeyPath(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  return value == null ? value : String(value);
}

function sameKeyPath(left, right) {
  return JSON.stringify(normalizeKeyPath(left)) === JSON.stringify(normalizeKeyPath(right));
}

function indexMatchesDefinition(store, definition) {
  if (typeof store?.index !== "function") return true;
  try {
    const current = store.index(definition.name);
    return sameKeyPath(current.keyPath, definition.keyPath)
      && Boolean(current.unique) === Boolean(definition.options?.unique)
      && Boolean(current.multiEntry) === Boolean(definition.options?.multiEntry);
  } catch {
    return false;
  }
}

export function getPracticeDatabaseSchemaIssues(database) {
  const issues = [];
  for (const [storeName, definition] of Object.entries(PRACTICE_STORE_DEFINITIONS)) {
    if (!containsName(database.objectStoreNames, storeName)) {
      issues.push({ storeName, issue: "missing-store" });
      continue;
    }
    let transaction;
    let store;
    try {
      transaction = database.transaction([storeName], "readonly");
      store = transaction.objectStore(storeName);
    } catch (cause) {
      issues.push({ storeName, issue: "unreadable-store", cause: cause?.name ?? "unknown" });
      continue;
    }
    if (!sameKeyPath(store.keyPath, definition.keyPath)) {
      issues.push({ storeName, issue: "key-path-mismatch", expected: definition.keyPath, actual: store.keyPath });
    }
    for (const indexDefinition of definition.indexes) {
      if (!containsName(store.indexNames, indexDefinition.name)) {
        issues.push({ storeName, indexName: indexDefinition.name, issue: "missing-index" });
        continue;
      }
      if (!indexMatchesDefinition(store, indexDefinition)) {
        issues.push({ storeName, indexName: indexDefinition.name, issue: "index-definition-mismatch" });
      }
    }
  }
  return issues;
}

export function applyPracticeDatabaseUpgrade(database, transaction = null) {
  for (const [storeName, definition] of Object.entries(PRACTICE_STORE_DEFINITIONS)) {
    const exists = database.objectStoreNames.contains(storeName);
    const store = exists
      ? transaction?.objectStore?.(storeName) ?? null
      : database.createObjectStore(storeName, { keyPath: definition.keyPath });
    if (!store) continue;
    if (exists && transaction) {
      for (const obsoleteIndex of PRACTICE_OBSOLETE_INDEXES[storeName] || []) {
        if (containsName(store.indexNames, obsoleteIndex)) store.deleteIndex(obsoleteIndex);
      }
    }
    for (const index of definition.indexes) {
      if (containsName(store.indexNames, index.name) && transaction && !indexMatchesDefinition(store, index)) {
        store.deleteIndex(index.name);
      }
      if (!containsName(store.indexNames, index.name)) store.createIndex(index.name, index.keyPath, index.options || {});
    }
  }
}

export function createPracticeIndexedDbStore({
  indexedDB = globalThis.indexedDB,
  databaseName = PRACTICE_DATABASE_NAME,
  databaseVersion = PRACTICE_DATABASE_VERSION,
} = {}) {
  let database = null;

  const requireDatabase = () => {
    if (!database) throw practiceStorageError(
      PRACTICE_STORAGE_ERROR_CODES.UNAVAILABLE,
      "Practice IndexedDB is not open",
      { operation: "access", recoverable: true },
    );
    return database;
  };

  const transactionApi = (transaction) => ({
    get(storeName, key) {
      return requestPromise(transaction.objectStore(storeName).get(key));
    },
    put(storeName, record) {
      assertPracticeSerializable(record);
      return requestPromise(transaction.objectStore(storeName).put(record)).then(() => record);
    },
    delete(storeName, key) {
      return requestPromise(transaction.objectStore(storeName).delete(key)).then(() => true);
    },
    list(storeName) {
      return requestPromise(transaction.objectStore(storeName).getAll());
    },
    query(storeName, indexName, query) {
      const index = transaction.objectStore(storeName).index(indexName);
      return requestPromise(index.getAll(query));
    },
    clearStore(storeName) {
      return requestPromise(transaction.objectStore(storeName).clear()).then(() => true);
    },
  });

  const one = async (storeName, mode, operation) => {
    const transaction = requireDatabase().transaction([storeName], mode);
    const completion = transactionPromise(transaction);
    // Observe completion immediately: a rejected request also aborts the
    // transaction and must not leave a second, unhandled promise rejection.
    void completion.catch(() => {});
    try {
      const value = await operation(transactionApi(transaction));
      await completion;
      return value;
    } catch (cause) {
      try { transaction.abort(); } catch {}
      await completion.catch(() => {});
      throw cause;
    }
  };

  return Object.freeze({
    kind: "indexeddb",
    async open() {
      if (database) return this;
      if (!indexedDB?.open) throw practiceStorageError(
        PRACTICE_STORAGE_ERROR_CODES.UNAVAILABLE,
        "IndexedDB is unavailable; large Practice data cannot be persisted",
        { operation: "open", recoverable: true },
      );
      try {
        const request = indexedDB.open(databaseName, databaseVersion);
        request.onupgradeneeded = () => applyPracticeDatabaseUpgrade(request.result, request.transaction);
        database = await requestPromise(request);
        const schemaIssues = getPracticeDatabaseSchemaIssues(database);
        if (schemaIssues.length) {
          database.close();
          database = null;
          throw practiceStorageError(
            PRACTICE_STORAGE_ERROR_CODES.RECOVERY_REQUIRED,
            "Practice database schema repair did not converge",
            { operation: "open", recoverable: true, cause: { schemaIssues } },
          );
        }
        database.onversionchange = () => {
          database?.close();
          database = null;
        };
        return this;
      } catch (cause) {
        if (cause?.code) throw cause;
        throw practiceStorageError(
          PRACTICE_STORAGE_ERROR_CODES.OPEN_FAILED,
          "Unable to open the Practice database",
          { operation: "open", recoverable: true, cause },
        );
      }
    },
    close() {
      database?.close();
      database = null;
    },
    get isOpen() {
      return Boolean(database);
    },
    get(storeName, key) {
      return one(storeName, "readonly", (api) => api.get(storeName, key));
    },
    put(storeName, record) {
      return one(storeName, "readwrite", (api) => api.put(storeName, record));
    },
    delete(storeName, key) {
      return one(storeName, "readwrite", (api) => api.delete(storeName, key));
    },
    list(storeName) {
      return one(storeName, "readonly", (api) => api.list(storeName));
    },
    query(storeName, indexName, query) {
      return one(storeName, "readonly", (api) => api.query(storeName, indexName, query));
    },
    clearStore(storeName) {
      return one(storeName, "readwrite", (api) => api.clearStore(storeName));
    },
    async runTransaction(storeNames, mode, callback) {
      const names = [...new Set(storeNames)];
      const invalid = names.find((name) => !PRACTICE_STORE_NAMES.includes(name));
      if (invalid) throw new TypeError(`Unknown Practice store: ${invalid}`);
      const transaction = requireDatabase().transaction(names, mode);
      const completion = transactionPromise(transaction);
      void completion.catch(() => {});
      try {
        const value = await callback(transactionApi(transaction));
        await completion;
        return value;
      } catch (cause) {
        try { transaction.abort(); } catch {}
        await completion.catch(() => {});
        if (typeof cause?.code === "string" && cause.code.startsWith("PRACTICE_")) throw cause;
        throw practiceStorageError(
          isQuotaExceededError(cause) ? PRACTICE_STORAGE_ERROR_CODES.QUOTA_EXCEEDED : PRACTICE_STORAGE_ERROR_CODES.TRANSACTION_FAILED,
          "Practice IndexedDB transaction failed",
          { operation: "transaction", recoverable: true, cause },
        );
      }
    },
    async deleteDatabase() {
      this.close();
      if (!indexedDB?.deleteDatabase) throw practiceStorageError(
        PRACTICE_STORAGE_ERROR_CODES.UNAVAILABLE,
        "IndexedDB is unavailable",
        { operation: "delete-database", recoverable: true },
      );
      await requestPromise(indexedDB.deleteDatabase(databaseName));
      return true;
    },
  });
}
