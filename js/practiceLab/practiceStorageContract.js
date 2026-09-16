import {
  PRACTICE_STORE_DEFINITIONS,
  PRACTICE_STORE_NAMES,
} from "./practiceConstants.js";

export const PRACTICE_STORAGE_ERROR_CODES = Object.freeze({
  UNAVAILABLE: "PRACTICE_STORAGE_UNAVAILABLE",
  OPEN_FAILED: "PRACTICE_STORAGE_OPEN_FAILED",
  TRANSACTION_FAILED: "PRACTICE_STORAGE_TRANSACTION_FAILED",
  QUOTA_EXCEEDED: "PRACTICE_STORAGE_QUOTA_EXCEEDED",
  VALIDATION_FAILED: "PRACTICE_STORAGE_VALIDATION_FAILED",
  MIGRATION_FAILED: "PRACTICE_STORAGE_MIGRATION_FAILED",
  UNSUPPORTED_VERSION: "PRACTICE_STORAGE_UNSUPPORTED_VERSION",
  RECORD_NOT_FOUND: "PRACTICE_STORAGE_RECORD_NOT_FOUND",
  DUPLICATE: "PRACTICE_STORAGE_DUPLICATE",
  LIMIT_REACHED: "PRACTICE_STORAGE_LIMIT_REACHED",
  RECOVERY_REQUIRED: "PRACTICE_STORAGE_RECOVERY_REQUIRED",
});

export class PracticeStorageError extends Error {
  constructor(code, message, {
    operation = null,
    storeName = null,
    recordId = null,
    recoverable = false,
    cause = null,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "PracticeStorageError";
    this.code = code;
    this.operation = operation;
    this.storeName = storeName;
    this.recordId = recordId;
    this.recoverable = recoverable;
  }
}

export function practiceStorageError(code, message, details = {}) {
  return new PracticeStorageError(code, message, details);
}

export function isPracticeStoreName(name) {
  return PRACTICE_STORE_NAMES.includes(name);
}

export function getPracticeStoreKey(storeName, record) {
  const keyPath = PRACTICE_STORE_DEFINITIONS[storeName]?.keyPath;
  if (!keyPath) throw new TypeError(`Unknown Practice store: ${storeName}`);
  if (Array.isArray(keyPath)) return keyPath.map((key) => record?.[key]);
  return record?.[keyPath];
}

export function isQuotaExceededError(error) {
  return error?.name === "QuotaExceededError"
    || error?.code === 22
    || error?.code === 1014
    || error?.code === PRACTICE_STORAGE_ERROR_CODES.QUOTA_EXCEEDED;
}

function serializabilityFailure(path, reason, valueType = null) {
  return practiceStorageError(
    PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED,
    "Practice storage value is not canonically serializable",
    { operation: "serialize", recordId: path || "record", recoverable: true, cause: { path: path || "record", reason, valueType } },
  );
}

export function assertPracticeSerializable(value, { maxDepth = 64 } = {}) {
  const stack = new WeakSet();
  const visit = (current, path, depth) => {
    if (depth > maxDepth) throw serializabilityFailure(path, "MAX_DEPTH");
    if (current === null) return;
    const type = typeof current;
    if (type === "string" || type === "boolean") return;
    if (type === "number") {
      if (!Number.isFinite(current)) throw serializabilityFailure(path, "NONFINITE_NUMBER", type);
      return;
    }
    if (type === "undefined" || type === "function" || type === "symbol" || type === "bigint") throw serializabilityFailure(path, "UNSUPPORTED_TYPE", type);
    if (type !== "object") throw serializabilityFailure(path, "UNSUPPORTED_TYPE", type);
    if (stack.has(current)) throw serializabilityFailure(path, "CYCLIC_VALUE", type);
    if (!Array.isArray(current)) {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) throw serializabilityFailure(path, "NON_PLAIN_OBJECT", current?.constructor?.name ?? type);
    }
    stack.add(current);
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) visit(current[index], `${path}[${index}]`, depth + 1);
    } else {
      for (const [key, entry] of Object.entries(current)) visit(entry, path ? `${path}.${key}` : key, depth + 1);
    }
    stack.delete(current);
  };
  visit(value, "", 0);
  return value;
}

export function clonePracticeValue(value) {
  if (value == null) return value;
  if (typeof globalThis.structuredClone === "function") {
    try { return globalThis.structuredClone(value); } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(value));
}
