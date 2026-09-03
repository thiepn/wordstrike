import {
  PRACTICE_STORE_DEFINITIONS,
  PRACTICE_STORE_NAMES,
} from "./practiceConstants.js";
import {
  PRACTICE_STORAGE_ERROR_CODES,
  clonePracticeValue,
  getPracticeStoreKey,
  isPracticeStoreName,
  practiceStorageError,
} from "./practiceStorageContract.js";

function serializeKey(key) {
  return JSON.stringify(key);
}

function indexValue(record, keyPath) {
  return Array.isArray(keyPath)
    ? keyPath.map((key) => record?.[key])
    : record?.[keyPath];
}

function sameIndexValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isIndexable(value) {
  return Array.isArray(value) ? value.every((entry) => entry !== undefined) : value !== undefined;
}

function matchesQuery(value, query) {
  if (typeof query === "function") return query(value);
  if (query && typeof query === "object" && !Array.isArray(query)) {
    if ("equals" in query) return JSON.stringify(value) === JSON.stringify(query.equals);
    if ("upperBound" in query && value > query.upperBound) return false;
    if ("lowerBound" in query && value < query.lowerBound) return false;
    return true;
  }
  return JSON.stringify(value) === JSON.stringify(query);
}

export function createPracticeMemoryStore({ initialData = {} } = {}) {
  let opened = false;
  let stores = new Map(PRACTICE_STORE_NAMES.map((name) => [name, new Map()]));

  for (const [storeName, records] of Object.entries(initialData)) {
    if (!isPracticeStoreName(storeName)) continue;
    for (const record of records || []) {
      stores.get(storeName).set(serializeKey(getPracticeStoreKey(storeName, record)), clonePracticeValue(record));
    }
  }

  const ensureStore = (storeName) => {
    if (!isPracticeStoreName(storeName)) throw practiceStorageError(
      PRACTICE_STORAGE_ERROR_CODES.TRANSACTION_FAILED,
      `Unknown Practice store: ${storeName}`,
      { operation: "access", storeName },
    );
    return stores.get(storeName);
  };

  const apiFor = (workingStores = stores) => {
    const getStore = (name) => {
      if (!isPracticeStoreName(name)) throw new TypeError(`Unknown Practice store: ${name}`);
      return workingStores.get(name);
    };
    return {
      async get(storeName, key) {
        return clonePracticeValue(getStore(storeName).get(serializeKey(key)) ?? null);
      },
      async put(storeName, record) {
        const key = getPracticeStoreKey(storeName, record);
        if (key == null || (Array.isArray(key) && key.some((entry) => entry == null))) throw new TypeError(`Missing key for ${storeName}`);
        const serializedKey = serializeKey(key);
        const definition = PRACTICE_STORE_DEFINITIONS[storeName];
        for (const index of definition?.indexes || []) {
          if (!index.options?.unique) continue;
          const target = indexValue(record, index.keyPath);
          if (!isIndexable(target)) continue;
          for (const [candidateKey, candidate] of getStore(storeName)) {
            if (candidateKey === serializedKey) continue;
            if (sameIndexValue(indexValue(candidate, index.keyPath), target)) {
              const constraint = new Error(`Unique index violation: ${storeName}.${index.name}`);
              constraint.name = "ConstraintError";
              throw constraint;
            }
          }
        }
        getStore(storeName).set(serializedKey, clonePracticeValue(record));
        return clonePracticeValue(record);
      },
      async delete(storeName, key) {
        return getStore(storeName).delete(serializeKey(key));
      },
      async list(storeName) {
        return [...getStore(storeName).values()].map(clonePracticeValue);
      },
      async query(storeName, indexName, query) {
        const definition = PRACTICE_STORE_DEFINITIONS[storeName];
        const index = definition?.indexes.find((candidate) => candidate.name === indexName);
        if (!index) throw new TypeError(`Unknown index ${storeName}.${indexName}`);
        return [...getStore(storeName).values()]
          .filter((record) => matchesQuery(indexValue(record, index.keyPath), query))
          .map(clonePracticeValue);
      },
      async clearStore(storeName) {
        getStore(storeName).clear();
        return true;
      },
    };
  };

  return Object.freeze({
    kind: "memory",
    async open() {
      opened = true;
      return this;
    },
    close() {
      opened = false;
    },
    get isOpen() {
      return opened;
    },
    get(storeName, key) {
      return apiFor().get(storeName, key);
    },
    put(storeName, record) {
      return apiFor().put(storeName, record);
    },
    delete(storeName, key) {
      return apiFor().delete(storeName, key);
    },
    list(storeName) {
      return apiFor().list(storeName);
    },
    query(storeName, indexName, query) {
      return apiFor().query(storeName, indexName, query);
    },
    clearStore(storeName) {
      return apiFor().clearStore(storeName);
    },
    async runTransaction(storeNames, _mode, callback) {
      const names = [...new Set(storeNames)];
      names.forEach(ensureStore);
      const working = new Map(stores);
      for (const name of names) {
        working.set(name, new Map([...stores.get(name)].map(([key, value]) => [key, clonePracticeValue(value)])));
      }
      try {
        const outcome = await callback(apiFor(working));
        stores = working;
        return outcome;
      } catch (cause) {
        if (cause?.code) throw cause;
        throw practiceStorageError(
          PRACTICE_STORAGE_ERROR_CODES.TRANSACTION_FAILED,
          "Practice memory transaction failed",
          { operation: "transaction", recoverable: true, cause },
        );
      }
    },
    async deleteDatabase() {
      stores = new Map(PRACTICE_STORE_NAMES.map((name) => [name, new Map()]));
      opened = false;
      return true;
    },
  });
}
