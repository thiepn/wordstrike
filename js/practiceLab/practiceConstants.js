import {
  PRACTICE_LIMITS as PRACTICE_LIMITS_V30,
  PRACTICE_OBSOLETE_INDEXES as PRACTICE_OBSOLETE_INDEXES_V30,
  PRACTICE_STORE_DEFINITIONS as PRACTICE_STORE_DEFINITIONS_V30,
} from "./practiceConstantsV30.js";

export * from "./practiceConstantsV30.js";

export const PRACTICE_DATABASE_VERSION = 9;

export const PRACTICE_LIMITS = Object.freeze({
  ...PRACTICE_LIMITS_V30,
  customTextCount: 50,
  customTextCharacters: 100_000,
  customTextTotalCharacters: 1_000_000,
  customTextTitleLength: 120,
  customTextBytes: 256 * 1024,
  customTextTotalBytes: 5 * 1024 * 1024,
});

export const PRACTICE_STORE_DEFINITIONS = Object.freeze({
  ...PRACTICE_STORE_DEFINITIONS_V30,
  customTexts: Object.freeze({
    keyPath: "customTextId",
    indexes: [
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
      Object.freeze({ name: "createdAt", keyPath: "createdAt" }),
    ],
  }),
});

export const PRACTICE_OBSOLETE_INDEXES = Object.freeze({
  ...PRACTICE_OBSOLETE_INDEXES_V30,
  customTexts: Object.freeze(["lastUsedAt", "normalizedTitle"]),
});

export const PRACTICE_STORE_NAMES = Object.freeze(Object.keys(PRACTICE_STORE_DEFINITIONS));
