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

export function clonePracticeValue(value) {
  if (value == null) return value;
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fall through to JSON cloning so callers receive one consistent failure.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

