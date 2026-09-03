import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const replaceOnce = (file, from, to) => {
  const source = read(file);
  if (!source.includes(from)) throw new Error(`PL5 patch anchor missing in ${file}: ${from.slice(0, 80)}`);
  write(file, source.replace(from, to));
};
const replaceRegex = (file, regex, replacement, minimum = 1) => {
  const source = read(file);
  const matches = source.match(regex);
  if (!matches || matches.length < minimum) throw new Error(`PL5 regex anchor missing in ${file}: ${regex}`);
  write(file, source.replace(regex, replacement));
};

// ---------------------------------------------------------------------------
// SCHEMA / CONSTANTS
// ---------------------------------------------------------------------------
replaceOnce("js/practiceLab/practiceConstants.js",
  'export const PRACTICE_DATABASE_VERSION = 1;\nexport const PRACTICE_MANIFEST_VERSION = 1;\n',
  'export const PRACTICE_DATABASE_VERSION = 2;\nexport const PRACTICE_MANIFEST_VERSION = 1;\nexport const PRACTICE_CONTEXT_FINGERPRINT_VERSION = 1;\n');
replaceOnce("js/practiceLab/practiceConstants.js",
`export const PRACTICE_RECORD_VERSIONS = Object.freeze({
  profile: 2,
  skillStat: 1,
  sessionSummary: 1,
  reviewItem: 1,
  customText: 1,
  preset: 1,
  checkpoint: 1,
  quarantine: 1,
});`,
`export const PRACTICE_RECORD_VERSIONS = Object.freeze({
  context: 1,
  profile: 3,
  skillStat: 2,
  sessionSummary: 2,
  reviewItem: 2,
  customText: 1,
  preset: 1,
  checkpoint: 2,
  quarantine: 1,
});`);
replaceOnce("js/practiceLab/practiceConstants.js",
`  profiles: Object.freeze({
    keyPath: "profileId",
    indexes: [
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
    ],
  }),
  skillStats: Object.freeze({`,
`  profiles: Object.freeze({
    keyPath: "profileId",
    indexes: [
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
    ],
  }),
  contexts: Object.freeze({
    keyPath: "contextId",
    indexes: [
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
      Object.freeze({ name: "lastUsedAt", keyPath: "lastUsedAt" }),
      Object.freeze({
        name: "profileFingerprint",
        keyPath: ["profileId", "fingerprint"],
        options: { unique: true },
      }),
    ],
  }),
  skillStats: Object.freeze({`);
replaceOnce("js/practiceLab/practiceConstants.js",
`      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "entityType", keyPath: "entityType" }),`,
`      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "contextId", keyPath: "contextId" }),
      Object.freeze({ name: "entityType", keyPath: "entityType" }),`);
replaceOnce("js/practiceLab/practiceConstants.js",
`      Object.freeze({
        name: "profileEntity",
        keyPath: ["profileId", "entityType", "entityKey"],
        options: { unique: true },
      }),
    ],
  }),
  sessionSummaries:`,
`      Object.freeze({
        name: "profileContextEntity",
        keyPath: ["profileId", "contextId", "entityType", "entityKey"],
        options: { unique: true },
      }),
    ],
  }),
  sessionSummaries:`);
replaceOnce("js/practiceLab/practiceConstants.js",
`    indexes: [
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "experimentId", keyPath: "experimentId" }),`,
`    indexes: [
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "contextId", keyPath: "contextId" }),
      Object.freeze({ name: "experimentId", keyPath: "experimentId" }),`);
// The remaining profileEntity occurrence belongs to reviewItems.
replaceOnce("js/practiceLab/practiceConstants.js",
`      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "dueAtUtc", keyPath: "dueAtUtc" }),`,
`      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "contextId", keyPath: "contextId" }),
      Object.freeze({ name: "dueAtUtc", keyPath: "dueAtUtc" }),`);
replaceOnce("js/practiceLab/practiceConstants.js",
`      Object.freeze({
        name: "profileEntity",
        keyPath: ["profileId", "entityType", "entityKey"],
        options: { unique: true },
      }),
    ],
  }),
  customTexts:`,
`      Object.freeze({
        name: "profileContextEntity",
        keyPath: ["profileId", "contextId", "entityType", "entityKey"],
        options: { unique: true },
      }),
    ],
  }),
  customTexts:`);
replaceOnce("js/practiceLab/practiceConstants.js",
`export const PRACTICE_STORE_NAMES = Object.freeze(Object.keys(PRACTICE_STORE_DEFINITIONS));`,
`export const PRACTICE_OBSOLETE_INDEXES = Object.freeze({
  skillStats: Object.freeze(["profileEntity"]),
  reviewItems: Object.freeze(["profileEntity"]),
});

export const PRACTICE_STORE_NAMES = Object.freeze(Object.keys(PRACTICE_STORE_DEFINITIONS));`);
replaceOnce("js/practiceLab/practiceConstants.js",
`export const REVIEW_STATES = Object.freeze([
  "new", "due", "learning", "improving", "stable", "mastered", "suspended",
]);`,
`export const REVIEW_STATES = Object.freeze([
  "new", "due", "learning", "improving", "stable", "mastered", "suspended",
]);
export const PRACTICE_INPUT_METHODS = Object.freeze(["unknown", "physical", "software"]);`);

// ---------------------------------------------------------------------------
// IDs + CONTEXT MODEL
// ---------------------------------------------------------------------------
write("js/practiceLab/practiceIds.js", `const PREFIXES = Object.freeze({
  profile: "practice-profile_",
  context: "practice-context_",
  session: "practice-session_",
  review: "practice-review_",
  customText: "practice-text_",
  preset: "practice-preset_",
  quarantine: "practice-quarantine_",
});

function fallbackToken(now, random) {
  const suppliedTime = Number(now?.());
  const time = Math.max(0, Number.isFinite(suppliedTime) ? suppliedTime : Date.now()).toString(36);
  const parts = Array.from({ length: 4 }, () => {
    const suppliedRandom = Number(random?.());
    const sample = Number.isFinite(suppliedRandom) ? suppliedRandom : Math.random();
    return Math.floor(Math.max(0, Math.min(0.999999999999, sample)) * 0x100000000)
      .toString(36)
      .padStart(7, "0");
  });
  return [time, ...parts].join("-");
}

export function createPracticeId(kind, {
  cryptoObject = globalThis.crypto,
  now = () => Date.now(),
  random = () => Math.random(),
  uuid,
} = {}) {
  const prefix = PREFIXES[kind];
  if (!prefix) throw new TypeError(\`Unknown Practice ID kind: \${kind}\`);
  const value = uuid?.()
    ?? cryptoObject?.randomUUID?.()
    ?? fallbackToken(now, random);
  return \`\${prefix}\${String(value).toLowerCase()}\`;
}

export const createPracticeProfileId = (options) => createPracticeId("profile", options);
export const createPracticeContextId = (options) => createPracticeId("context", options);
export const createPracticeSessionId = (options) => createPracticeId("session", options);
export const createPracticeReviewItemId = (options) => createPracticeId("review", options);
export const createPracticeCustomTextId = (options) => createPracticeId("customText", options);
export const createPracticePresetId = (options) => createPracticeId("preset", options);
export const createPracticeQuarantineId = (options) => createPracticeId("quarantine", options);

export function createDefaultPracticeContextId(profileId) {
  if (!isPracticeId(profileId, "profile")) throw new TypeError("Default Practice context requires a valid profileId");
  return \`practice-context_default-\${encodeURIComponent(profileId)}\`;
}

function encodeIdentityPart(value) {
  const encoded = encodeURIComponent(String(value));
  return \`\${encoded.length}:\${encoded}\`;
}

export function createSkillStatId(profileId, contextId, entityType, entityKey) {
  if (arguments.length !== 4) throw new TypeError("createSkillStatId requires profileId, contextId, entityType, and entityKey");
  return \`practice-stat_\${[
    profileId, contextId, entityType, entityKey,
  ].map(encodeIdentityPart).join("|")}\`;
}

export function hashPracticeContent(value = "") {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return \`fnv1a32-\${(hash >>> 0).toString(16).padStart(8, "0")}\`;
}

export function isPracticeId(value, kind) {
  const prefix = PREFIXES[kind];
  return Boolean(prefix && typeof value === "string" && value.startsWith(prefix) && value.length > prefix.length + 7 && value.length <= 500);
}
`);

write("js/practiceLab/practiceContext.js", `import {
  PRACTICE_CONTEXT_FINGERPRINT_VERSION,
  PRACTICE_INPUT_METHODS,
  PRACTICE_RECORD_VERSIONS,
} from "./practiceConstants.js";
import {
  createDefaultPracticeContextId,
  createPracticeContextId,
  isPracticeId,
} from "./practiceIds.js";
import { toPracticeUtcIso } from "./practiceTime.js";

const MAX_LOCALE_LENGTH = 40;
const MAX_LAYOUT_LENGTH = 40;
const MAX_HARDWARE_PROFILE_ID_LENGTH = 120;

export function normalizePracticeDataLocale(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LOCALE_LENGTH) return null;
  const hyphenated = trimmed.replaceAll("_", "-");
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(hyphenated)) return null;
  const parts = hyphenated.split("-");
  const canonical = parts.map((part, index) => {
    if (index === 0) return part.toLowerCase();
    if (/^[A-Za-z]{4}$/.test(part)) return part[0].toUpperCase() + part.slice(1).toLowerCase();
    if (/^[A-Za-z]{2}$/.test(part) || /^\\d{3}$/.test(part)) return part.toUpperCase();
    return part.toLowerCase();
  }).join("-");
  return canonical.length <= MAX_LOCALE_LENGTH ? canonical : null;
}

export function normalizePracticeKeyboardLayout(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > MAX_LAYOUT_LENGTH) return null;
  return /^[a-z0-9][a-z0-9+._-]*$/.test(normalized) ? normalized : null;
}

export function normalizePracticeInputMethod(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return PRACTICE_INPUT_METHODS.includes(normalized) ? normalized : null;
}

export function normalizePracticeHardwareProfileId(value) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_HARDWARE_PROFILE_ID_LENGTH) return undefined;
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized) ? normalized : undefined;
}

export function normalizePracticeContextComponents({
  dataLocale,
  keyboardLayout,
  inputMethod = "unknown",
  hardwareProfileId = null,
} = {}) {
  const normalized = {
    dataLocale: normalizePracticeDataLocale(dataLocale),
    keyboardLayout: normalizePracticeKeyboardLayout(keyboardLayout),
    inputMethod: normalizePracticeInputMethod(inputMethod),
    hardwareProfileId: normalizePracticeHardwareProfileId(hardwareProfileId),
  };
  if (!normalized.dataLocale || !normalized.keyboardLayout || !normalized.inputMethod || normalized.hardwareProfileId === undefined) {
    throw new TypeError("Invalid Practice context components");
  }
  return Object.freeze(normalized);
}

const component = (value) => encodeURIComponent(String(value));

export function createPracticeContextFingerprint(input) {
  const normalized = normalizePracticeContextComponents(input);
  const hardware = normalized.hardwareProfileId == null
    ? "none"
    : \`id:\${component(normalized.hardwareProfileId)}\`;
  return [
    \`v\${PRACTICE_CONTEXT_FINGERPRINT_VERSION}\`,
    \`locale:\${component(normalized.dataLocale)}\`,
    \`layout:\${component(normalized.keyboardLayout)}\`,
    \`input:\${normalized.inputMethod}\`,
    \`hardware:\${hardware}\`,
  ].join("|");
}

export function createPracticeContextRecord({
  contextId = createPracticeContextId(),
  profileId,
  dataLocale = "en",
  keyboardLayout = "qwerty",
  inputMethod = "unknown",
  hardwareProfileId = null,
  now = Date.now,
  overrides = {},
} = {}) {
  if (!isPracticeId(profileId, "profile")) throw new TypeError("Practice context requires a valid profileId");
  if (!isPracticeId(contextId, "context")) throw new TypeError("Practice context requires a valid contextId");
  const normalized = normalizePracticeContextComponents({ dataLocale, keyboardLayout, inputMethod, hardwareProfileId });
  const timestamp = toPracticeUtcIso(now);
  return {
    contextId,
    profileId,
    recordVersion: PRACTICE_RECORD_VERSIONS.context,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: timestamp,
    ...normalized,
    fingerprint: createPracticeContextFingerprint(normalized),
    ...JSON.parse(JSON.stringify(overrides)),
  };
}

export function createDefaultPracticeContext({
  profileId,
  dataLocale = "en",
  keyboardLayout = "qwerty",
  now = Date.now,
  overrides = {},
} = {}) {
  return createPracticeContextRecord({
    contextId: createDefaultPracticeContextId(profileId),
    profileId,
    dataLocale,
    keyboardLayout,
    inputMethod: "unknown",
    hardwareProfileId: null,
    now,
    overrides,
  });
}
`);

// ---------------------------------------------------------------------------
// DEFAULTS / SCHEMAS
// ---------------------------------------------------------------------------
replaceOnce("js/practiceLab/practiceDefaults.js",
`  createPracticeCustomTextId,
  createPracticePresetId,
  createPracticeProfileId,`,
`  createDefaultPracticeContextId,
  createPracticeCustomTextId,
  createPracticePresetId,
  createPracticeProfileId,`);
replaceOnce("js/practiceLab/practiceDefaults.js",
`export function createDefaultPracticeProfile({
  profileId = createPracticeProfileId(),
  now = Date.now,
  locale = "en",
  keyboardLayout = "qwerty",
  overrides = {},
} = {}) {`,
`export function createDefaultPracticeProfile({
  profileId = createPracticeProfileId(),
  now = Date.now,
  locale = "en",
  keyboardLayout = "qwerty",
  activeContextId = createDefaultPracticeContextId(profileId),
  overrides = {},
} = {}) {`);
replaceOnce("js/practiceLab/practiceDefaults.js",
`    dataLocale: locale,
    keyboardLayout,
    firstAssessmentCompleted: false,`,
`    dataLocale: locale,
    keyboardLayout,
    activeContextId,
    firstAssessmentCompleted: false,`);
replaceOnce("js/practiceLab/practiceDefaults.js",
`export function createDefaultSkillStat({
  profileId = createPracticeProfileId(),
  entityType = "key",
  entityKey = "a",
  statId = createSkillStatId(profileId, entityType, entityKey),`,
`export function createDefaultSkillStat({
  profileId = createPracticeProfileId(),
  contextId = createDefaultPracticeContextId(profileId),
  entityType = "key",
  entityKey = "a",
  statId = createSkillStatId(profileId, contextId, entityType, entityKey),`);
replaceOnce("js/practiceLab/practiceDefaults.js",
`    statId,
    profileId,
    entityType,`,
`    statId,
    profileId,
    contextId,
    entityType,`);
replaceOnce("js/practiceLab/practiceDefaults.js",
`export function createDefaultSessionSummary({
  sessionId = createPracticeSessionId(),
  profileId = createPracticeProfileId(),
  experimentId`,
`export function createDefaultSessionSummary({
  sessionId = createPracticeSessionId(),
  profileId = createPracticeProfileId(),
  contextId = createDefaultPracticeContextId(profileId),
  experimentId`);
replaceOnce("js/practiceLab/practiceDefaults.js",
`    sessionId,
    profileId,
    recordVersion: PRACTICE_RECORD_VERSIONS.sessionSummary,`,
`    sessionId,
    profileId,
    contextId,
    recordVersion: PRACTICE_RECORD_VERSIONS.sessionSummary,`);
replaceOnce("js/practiceLab/practiceDefaults.js",
`export function createDefaultReviewItem({
  reviewItemId = createPracticeReviewItemId(),
  profileId = createPracticeProfileId(),
  entityType`,
`export function createDefaultReviewItem({
  reviewItemId = createPracticeReviewItemId(),
  profileId = createPracticeProfileId(),
  contextId = createDefaultPracticeContextId(profileId),
  entityType`);
replaceOnce("js/practiceLab/practiceDefaults.js",
`    reviewItemId,
    profileId,
    recordVersion: PRACTICE_RECORD_VERSIONS.reviewItem,`,
`    reviewItemId,
    profileId,
    contextId,
    recordVersion: PRACTICE_RECORD_VERSIONS.reviewItem,`);
replaceOnce("js/practiceLab/practiceDefaults.js",
`export function createDefaultCheckpoint({
  profileId = createPracticeProfileId(),
  sessionId`,
`export function createDefaultCheckpoint({
  profileId = createPracticeProfileId(),
  contextId = createDefaultPracticeContextId(profileId),
  sessionId`);
replaceOnce("js/practiceLab/practiceDefaults.js",
`  return {
    profileId,
    sessionId,
    recordVersion: PRACTICE_RECORD_VERSIONS.checkpoint,`,
`  return {
    profileId,
    contextId,
    sessionId,
    recordVersion: PRACTICE_RECORD_VERSIONS.checkpoint,`);
write("js/practiceLab/practiceDefaults.js", read("js/practiceLab/practiceDefaults.js") + '\nexport { createDefaultPracticeContext } from "./practiceContext.js";\n');

replaceOnce("js/practiceLab/practiceSchemas.js",
`export const PRACTICE_RECORD_TYPES = Object.freeze({
  profile:`,
`export const PRACTICE_RECORD_TYPES = Object.freeze({
  context: Object.freeze({ storeName: "contexts", versionField: "recordVersion" }),
  profile:`);

// ---------------------------------------------------------------------------
// VALIDATION
// ---------------------------------------------------------------------------
replaceOnce("js/practiceLab/practiceValidation.js",
`import { createSkillStatId, isPracticeId } from "./practiceIds.js";
import { isValidPracticeDayKey, isValidPracticeUtcIso } from "./practiceTime.js";`,
`import { createSkillStatId, isPracticeId } from "./practiceIds.js";
import {
  createPracticeContextFingerprint,
  normalizePracticeDataLocale,
  normalizePracticeHardwareProfileId,
  normalizePracticeInputMethod,
  normalizePracticeKeyboardLayout,
} from "./practiceContext.js";
import { isValidPracticeDayKey, isValidPracticeUtcIso } from "./practiceTime.js";`);
replaceOnce("js/practiceLab/practiceValidation.js",
`  requiredString(errors, profile.dataLocale, "dataLocale", 40);
  requiredString(errors, profile.keyboardLayout, "keyboardLayout", 40);`,
`  requiredString(errors, profile.dataLocale, "dataLocale", 40);
  requiredString(errors, profile.keyboardLayout, "keyboardLayout", 40);
  validId(errors, profile.activeContextId, "activeContextId", "context");`);
replaceOnce("js/practiceLab/practiceValidation.js",
`function validEntityKey(errors, type, key, path = "entityKey") {`,
`export function validatePracticeContext(context) {
  const errors = [];
  if (!isPlainObject(context)) return result([{ path: "context", code: "INVALID_TYPE", message: "context must be an object" }]);
  validId(errors, context.contextId, "contextId", "context");
  validId(errors, context.profileId, "profileId", "profile");
  validateVersion(errors, context.recordVersion, PRACTICE_RECORD_VERSIONS.context);
  timestamp(errors, context.createdAt, "createdAt");
  timestamp(errors, context.updatedAt, "updatedAt");
  timestamp(errors, context.lastUsedAt, "lastUsedAt");
  const locale = normalizePracticeDataLocale(context.dataLocale);
  if (!locale) error(errors, "dataLocale", "INVALID_LOCALE", "dataLocale is invalid");
  else if (locale !== context.dataLocale) error(errors, "dataLocale", "NOT_NORMALIZED", "dataLocale must use canonical normalization");
  const layout = normalizePracticeKeyboardLayout(context.keyboardLayout);
  if (!layout) error(errors, "keyboardLayout", "INVALID_LAYOUT", "keyboardLayout is invalid");
  else if (layout !== context.keyboardLayout) error(errors, "keyboardLayout", "NOT_NORMALIZED", "keyboardLayout must be normalized");
  const inputMethod = normalizePracticeInputMethod(context.inputMethod);
  if (!inputMethod || inputMethod !== context.inputMethod) error(errors, "inputMethod", "INVALID_ENUM", "inputMethod must be unknown, physical, or software");
  const hardware = normalizePracticeHardwareProfileId(context.hardwareProfileId);
  if (hardware === undefined || hardware !== context.hardwareProfileId) error(errors, "hardwareProfileId", "INVALID_ID", "hardwareProfileId must be null or a bounded Practice-local identifier");
  requiredString(errors, context.fingerprint, "fingerprint", 400);
  try {
    const expected = createPracticeContextFingerprint(context);
    if (context.fingerprint !== expected) error(errors, "fingerprint", "IDENTITY_MISMATCH", "fingerprint does not match normalized context components");
  } catch {
    // Component-specific errors above remain the authoritative diagnostics.
  }
  return result(errors);
}

function validEntityKey(errors, type, key, path = "entityKey") {`);
replaceOnce("js/practiceLab/practiceValidation.js",
`  requiredString(errors, stat.statId, "statId", 500);
  validId(errors, stat.profileId, "profileId", "profile");
  validateVersion`,
`  requiredString(errors, stat.statId, "statId", 500);
  validId(errors, stat.profileId, "profileId", "profile");
  validId(errors, stat.contextId, "contextId", "context");
  validateVersion`);
replaceOnce("js/practiceLab/practiceValidation.js",
`    typeof stat.profileId === "string"
    && typeof stat.entityType === "string"
    && typeof stat.entityKey === "string"
    && stat.statId !== createSkillStatId(stat.profileId, stat.entityType, stat.entityKey)
  ) error(errors, "statId", "IDENTITY_MISMATCH", "statId does not match the profile/entity identity");`,
`    typeof stat.profileId === "string"
    && typeof stat.contextId === "string"
    && typeof stat.entityType === "string"
    && typeof stat.entityKey === "string"
    && stat.statId !== createSkillStatId(stat.profileId, stat.contextId, stat.entityType, stat.entityKey)
  ) error(errors, "statId", "IDENTITY_MISMATCH", "statId does not match the profile/context/entity identity");`);
replaceOnce("js/practiceLab/practiceValidation.js",
`  validId(errors, summary.sessionId, "sessionId", "session");
  validId(errors, summary.profileId, "profileId", "profile");`,
`  validId(errors, summary.sessionId, "sessionId", "session");
  validId(errors, summary.profileId, "profileId", "profile");
  validId(errors, summary.contextId, "contextId", "context");`);
replaceOnce("js/practiceLab/practiceValidation.js",
`  validId(errors, item.reviewItemId, "reviewItemId", "review");
  validId(errors, item.profileId, "profileId", "profile");`,
`  validId(errors, item.reviewItemId, "reviewItemId", "review");
  validId(errors, item.profileId, "profileId", "profile");
  validId(errors, item.contextId, "contextId", "context");`);
replaceOnce("js/practiceLab/practiceValidation.js",
`  validId(errors, record.profileId, "profileId", "profile");
  validId(errors, record.sessionId, "sessionId", "session");
  validateVersion(errors, record.recordVersion, PRACTICE_RECORD_VERSIONS.checkpoint);`,
`  validId(errors, record.profileId, "profileId", "profile");
  validId(errors, record.contextId, "contextId", "context");
  validId(errors, record.sessionId, "sessionId", "session");
  validateVersion(errors, record.recordVersion, PRACTICE_RECORD_VERSIONS.checkpoint);`);
replaceOnce("js/practiceLab/practiceValidation.js",
`  return {
    ...value,
    manifestVersion: Number(value.manifestVersion),
    settings: normalizePracticeSettings(value.settings),
  };`,
`  return {
    ...value,
    manifestVersion: Number(value.manifestVersion),
    databaseVersion: PRACTICE_DATABASE_VERSION,
    settings: normalizePracticeSettings(value.settings),
  };`);

// ---------------------------------------------------------------------------
// MIGRATIONS
// ---------------------------------------------------------------------------
write("js/practiceLab/practiceMigrations.js", `import {
  PRACTICE_MANIFEST_VERSION,
  PRACTICE_RECORD_VERSIONS,
} from "./practiceConstants.js";
import { PRACTICE_RECORD_TYPES } from "./practiceSchemas.js";
import {
  normalizeCustomTextMetadata,
  normalizePracticeManifest,
  normalizeSessionSummary,
  normalizeSkillStat,
  validateCheckpoint,
  validateCustomText,
  validatePracticeContext,
  validatePracticeManifest,
  validatePracticeProfile,
  validatePreset,
  validateReviewItem,
  validateSessionSummary,
  validateSkillStat,
} from "./practiceValidation.js";
import {
  createDefaultPracticeContextId,
  createSkillStatId,
} from "./practiceIds.js";
import {
  PRACTICE_STORAGE_ERROR_CODES,
  clonePracticeValue,
  practiceStorageError,
} from "./practiceStorageContract.js";

const validators = Object.freeze({
  context: validatePracticeContext,
  profile: validatePracticeProfile,
  skillStat: validateSkillStat,
  sessionSummary: validateSessionSummary,
  reviewItem: validateReviewItem,
  customText: validateCustomText,
  preset: validatePreset,
  checkpoint: validateCheckpoint,
});

const normalizers = Object.freeze({
  context: (value) => value,
  profile: (value) => value,
  skillStat: normalizeSkillStat,
  sessionSummary: normalizeSessionSummary,
  reviewItem: (value) => value,
  customText: normalizeCustomTextMetadata,
  preset: (value) => value,
  checkpoint: (value) => value,
});

const migrations = Object.freeze({
  profile: Object.freeze({
    0: (value) => ({ ...value, recordVersion: 1 }),
    1: (value) => ({ ...value, recordVersion: 2, lastTrainingDayKey: value.lastTrainingDayKey ?? null }),
    2: (value) => ({
      ...value,
      recordVersion: 3,
      activeContextId: createDefaultPracticeContextId(value.profileId),
    }),
  }),
  skillStat: Object.freeze({
    1: (value) => {
      const contextId = createDefaultPracticeContextId(value.profileId);
      return {
        ...value,
        recordVersion: 2,
        contextId,
        statId: createSkillStatId(value.profileId, contextId, value.entityType, value.entityKey),
      };
    },
  }),
  sessionSummary: Object.freeze({
    1: (value) => ({
      ...value,
      recordVersion: 2,
      contextId: createDefaultPracticeContextId(value.profileId),
    }),
  }),
  reviewItem: Object.freeze({
    1: (value) => ({
      ...value,
      recordVersion: 2,
      contextId: createDefaultPracticeContextId(value.profileId),
    }),
  }),
  checkpoint: Object.freeze({
    1: (value) => ({
      ...value,
      recordVersion: 2,
      contextId: createDefaultPracticeContextId(value.profileId),
    }),
  }),
});

function promoteForCurrentValidation(type, value, version) {
  if (type === "profile" && version <= 2) return {
    ...value,
    recordVersion: PRACTICE_RECORD_VERSIONS.profile,
    lastTrainingDayKey: value.lastTrainingDayKey ?? null,
    activeContextId: createDefaultPracticeContextId(value.profileId),
  };
  if (type === "skillStat" && version === 1) {
    const contextId = createDefaultPracticeContextId(value.profileId);
    return {
      ...value,
      recordVersion: PRACTICE_RECORD_VERSIONS.skillStat,
      contextId,
      statId: createSkillStatId(value.profileId, contextId, value.entityType, value.entityKey),
    };
  }
  if (["sessionSummary", "reviewItem", "checkpoint"].includes(type) && version === 1) return {
    ...value,
    recordVersion: PRACTICE_RECORD_VERSIONS[type],
    contextId: createDefaultPracticeContextId(value.profileId),
  };
  return value;
}

function validateIntermediate(type, value, version, validate) {
  return validate(promoteForCurrentValidation(type, value, version));
}

function failure(code, message, details = {}) {
  return {
    ok: false,
    error: practiceStorageError(code, message, {
      operation: "migrate",
      recoverable: code !== PRACTICE_STORAGE_ERROR_CODES.UNSUPPORTED_VERSION,
      ...details,
    }),
  };
}

function migrate({ input, type, versionField, targetVersion, normalize, validate }) {
  let value;
  try { value = clonePracticeValue(input); } catch (cause) {
    return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, \`Unable to clone \${type}\`, { cause });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, \`\${type} must be an object\`);
  const suppliedVersion = value[versionField];
  const fromVersion = suppliedVersion == null ? 0 : Number(suppliedVersion);
  if (!Number.isInteger(fromVersion) || fromVersion < 0) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, \`\${type} has an invalid version\`);
  if (fromVersion > targetVersion) return failure(PRACTICE_STORAGE_ERROR_CODES.UNSUPPORTED_VERSION, \`\${type} version \${fromVersion} is newer than supported version \${targetVersion}\`);
  const steps = [];
  let currentVersion = fromVersion;
  while (currentVersion < targetVersion) {
    const migrateStep = migrations[type]?.[currentVersion]
      ?? (currentVersion === 0 ? (current) => ({ ...current, [versionField]: 1 }) : null);
    if (!migrateStep) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, \`\${type} has no migration from version \${currentVersion}\`);
    const previousVersion = currentVersion;
    try { value = migrateStep(value); } catch (cause) {
      return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, \`\${type} migration from version \${previousVersion} failed\`, { cause });
    }
    currentVersion = Number(value[versionField]);
    if (!Number.isInteger(currentVersion) || currentVersion !== previousVersion + 1) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, \`\${type} migration did not advance sequentially\`);
    const intermediate = validateIntermediate(type, value, currentVersion, validate);
    if (!intermediate.valid) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, \`\${type} failed validation after version \${currentVersion}\`, { cause: intermediate.errors });
    steps.push(\`\${type}:\${previousVersion}->\${currentVersion}\`);
  }
  value = normalize(value);
  const validation = validate(value);
  if (!validation.valid) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, \`\${type} failed validation after migration\`, { cause: validation.errors });
  return { ok: true, value, fromVersion, toVersion: targetVersion, migrated: steps.length > 0, steps };
}

export function migratePracticeManifest(record) {
  return migrate({ input: record, type: "manifest", versionField: "manifestVersion", targetVersion: PRACTICE_MANIFEST_VERSION, normalize: normalizePracticeManifest, validate: validatePracticeManifest });
}

export function migratePracticeRecord(recordType, record) {
  if (!PRACTICE_RECORD_TYPES[recordType] || !validators[recordType]) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, \`Unknown Practice record type: \${recordType}\`);
  return migrate({ input: record, type: recordType, versionField: "recordVersion", targetVersion: PRACTICE_RECORD_VERSIONS[recordType], normalize: normalizers[recordType], validate: validators[recordType] });
}
`);

// ---------------------------------------------------------------------------
// INDEXEDDB RECONCILIATION + MEMORY UNIQUE INDEX BEHAVIOR
// ---------------------------------------------------------------------------
replaceOnce("js/practiceLab/practiceIndexedDbStore.js",
`  PRACTICE_STORE_DEFINITIONS,
  PRACTICE_STORE_NAMES,`,
`  PRACTICE_OBSOLETE_INDEXES,
  PRACTICE_STORE_DEFINITIONS,
  PRACTICE_STORE_NAMES,`);
replaceOnce("js/practiceLab/practiceIndexedDbStore.js",
`export function applyPracticeDatabaseUpgrade(database, transaction = null) {
  for (const [storeName, definition] of Object.entries(PRACTICE_STORE_DEFINITIONS)) {
    const exists = database.objectStoreNames.contains(storeName);
    const store = exists
      ? transaction?.objectStore?.(storeName) ?? null
      : database.createObjectStore(storeName, { keyPath: definition.keyPath });
    if (!store) continue;
    for (const index of definition.indexes) {
      if (!containsName(store.indexNames, index.name)) store.createIndex(index.name, index.keyPath, index.options || {});
    }
  }
}`,
`export function applyPracticeDatabaseUpgrade(database, transaction = null) {
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
      if (!containsName(store.indexNames, index.name)) store.createIndex(index.name, index.keyPath, index.options || {});
    }
  }
}`);

replaceOnce("js/practiceLab/practiceMemoryStore.js",
`function matchesQuery(value, query) {`,
`function sameIndexValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isIndexable(value) {
  return Array.isArray(value) ? value.every((entry) => entry !== undefined) : value !== undefined;
}

function matchesQuery(value, query) {`);
replaceOnce("js/practiceLab/practiceMemoryStore.js",
`      async put(storeName, record) {
        const key = getPracticeStoreKey(storeName, record);
        if (key == null || (Array.isArray(key) && key.some((entry) => entry == null))) throw new TypeError(\`Missing key for \${storeName}\`);
        getStore(storeName).set(serializeKey(key), clonePracticeValue(record));
        return clonePracticeValue(record);
      },`,
`      async put(storeName, record) {
        const key = getPracticeStoreKey(storeName, record);
        if (key == null || (Array.isArray(key) && key.some((entry) => entry == null))) throw new TypeError(\`Missing key for \${storeName}\`);
        const serializedKey = serializeKey(key);
        const definition = PRACTICE_STORE_DEFINITIONS[storeName];
        for (const index of definition?.indexes || []) {
          if (!index.options?.unique) continue;
          const target = indexValue(record, index.keyPath);
          if (!isIndexable(target)) continue;
          for (const [candidateKey, candidate] of getStore(storeName)) {
            if (candidateKey === serializedKey) continue;
            if (sameIndexValue(indexValue(candidate, index.keyPath), target)) {
              const constraint = new Error(\`Unique index violation: \${storeName}.\${index.name}\`);
              constraint.name = "ConstraintError";
              throw constraint;
            }
          }
        }
        getStore(storeName).set(serializedKey, clonePracticeValue(record));
        return clonePracticeValue(record);
      },`);

// ---------------------------------------------------------------------------
// RETENTION
// ---------------------------------------------------------------------------
replaceOnce("js/practiceLab/practiceRetention.js",
`    const key = \`${record.profileId}:\\0${record.entityType}:\\0${record.entityKey}\`;`,
`    const key = \`${record.profileId}:\\0${record.contextId}:\\0${record.entityType}:\\0${record.entityKey}\`;`);

// ---------------------------------------------------------------------------
// REPOSITORY
// ---------------------------------------------------------------------------
write("js/practiceLab/practiceRepository.js", `import {
  PRACTICE_LIMITS,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_NAMES,
} from "./practiceConstants.js";
import { createDefaultPracticeProfile } from "./practiceDefaults.js";
import {
  createDefaultPracticeContext,
  createPracticeContextRecord,
} from "./practiceContext.js";
import { migratePracticeRecord } from "./practiceMigrations.js";
import {
  createDefaultPracticeContextId,
  createPracticeContextId,
  createPracticeQuarantineId,
  createSkillStatId,
} from "./practiceIds.js";
import { buildPracticeRetentionPlan } from "./practiceRetention.js";
import {
  PRACTICE_STORAGE_ERROR_CODES,
  clonePracticeValue,
  getPracticeStoreKey,
  isQuotaExceededError,
  practiceStorageError,
} from "./practiceStorageContract.js";
import {
  validateCheckpoint,
  validateCustomText,
  validatePracticeContext,
  validatePracticeProfile,
  validatePracticeSettings,
  validatePreset,
  validateReviewItem,
  validateSessionSummary,
  validateSkillStat,
} from "./practiceValidation.js";
import { toPracticeUtcIso } from "./practiceTime.js";

const CONTEXT_BACKFILL_META_KEY = "pl5ContextIdentity";
const CONTEXT_BACKFILL_VERSION = 1;
const activeReviewStates = new Set(["new", "due", "learning", "improving", "stable"]);

const validators = Object.freeze({
  profiles: validatePracticeProfile,
  contexts: validatePracticeContext,
  skillStats: validateSkillStat,
  sessionSummaries: validateSessionSummary,
  reviewItems: validateReviewItem,
  customTexts: validateCustomText,
  presets: validatePreset,
  activeSessionCheckpoints: validateCheckpoint,
});
const recordTypesByStore = Object.freeze({
  profiles: "profile",
  contexts: "context",
  skillStats: "skillStat",
  sessionSummaries: "sessionSummary",
  reviewItems: "reviewItem",
  customTexts: "customText",
  presets: "preset",
  activeSessionCheckpoints: "checkpoint",
});

function recordId(record) {
  return record?.contextId || record?.sessionId || record?.profileId || record?.statId || record?.reviewItemId || record?.customTextId || record?.presetId || null;
}

function validationError(storeName, record, validation, operation = "save") {
  return practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, \`Practice \${storeName} record failed validation\`, {
    operation, storeName, recordId: recordId(record), recoverable: true, cause: validation.errors,
  });
}

function equivalent(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createPracticeRepository({ dataStore, manifestStore, now = Date.now } = {}) {
  if (!dataStore || !manifestStore) throw new TypeError("Practice repository requires explicit data and manifest stores");
  let manifest = null;

  const ensureManifest = () => {
    if (!manifest) manifest = manifestStore.load().manifest;
    return manifest;
  };
  const validate = (storeName, record) => {
    const outcome = validators[storeName]?.(record);
    if (outcome && !outcome.valid) throw validationError(storeName, record, outcome);
    return record;
  };
  const saveManifestPatch = (patch) => {
    const current = ensureManifest();
    const next = { ...current, ...patch, updatedAt: toPracticeUtcIso(now) };
    const result = manifestStore.save(next);
    manifest = result.manifest;
    return manifest;
  };
  const makeQuarantineEntry = (storeName, record, reason) => {
    const detectedAt = toPracticeUtcIso(now);
    return {
      quarantineId: createPracticeQuarantineId(),
      recordVersion: PRACTICE_RECORD_VERSIONS.quarantine,
      createdAt: detectedAt,
      updatedAt: detectedAt,
      sourceStore: storeName,
      sourceKey: String(recordId(record) || "unknown"),
      reason: String(reason).slice(0, 300),
      detectedAt,
      originalRecord: record,
    };
  };
  const quarantine = async (storeName, record, reason) => {
    const entry = makeQuarantineEntry(storeName, record, reason);
    await dataStore.put("quarantine", entry);
    return entry;
  };

  const persistMigratedRead = async (storeName, requestedKey, migrated) => {
    const nextKey = getPracticeStoreKey(storeName, migrated);
    if (JSON.stringify(nextKey) === JSON.stringify(requestedKey)) {
      await dataStore.put(storeName, migrated);
      return migrated;
    }
    await dataStore.runTransaction([storeName, "quarantine"], "readwrite", async (transaction) => {
      const existing = await transaction.get(storeName, nextKey);
      if (!existing) await transaction.put(storeName, migrated);
      else if (!equivalent(existing, migrated)) await transaction.put("quarantine", makeQuarantineEntry(storeName, migrated, "migration-primary-key-conflict"));
      await transaction.delete(storeName, requestedKey);
    });
    return migrated;
  };

  const readValidated = async (storeName, key) => {
    const record = await dataStore.get(storeName, key);
    if (!record) return null;
    const recordType = recordTypesByStore[storeName];
    const migration = recordType ? migratePracticeRecord(recordType, record) : null;
    if (migration?.ok) {
      if (migration.migrated) await persistMigratedRead(storeName, key, migration.value);
      return migration.value;
    }
    const outcome = validators[storeName]?.(record);
    if (!migration && (!outcome || outcome.valid)) return record;
    await quarantine(storeName, record, "record-validation-failed");
    await dataStore.delete(storeName, key);
    if (migration?.error) throw migration.error;
    throw validationError(storeName, record, outcome, "read");
  };

  const assertContextOwnership = async (profileId, contextId, { transaction = null, operation = "context-ownership" } = {}) => {
    const context = transaction
      ? await transaction.get("contexts", contextId)
      : await readValidated("contexts", contextId);
    if (!context) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, "Practice context does not exist", { operation, storeName: "contexts", recordId: contextId, recoverable: true });
    const validation = validatePracticeContext(context);
    if (!validation.valid) throw validationError("contexts", context, validation, operation);
    if (context.profileId !== profileId) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice context belongs to another profile", { operation, storeName: "contexts", recordId: contextId, recoverable: true });
    return context;
  };

  const reconcileContextIdentity = async () => {
    const stores = ["profiles", "contexts", "skillStats", "sessionSummaries", "reviewItems", "activeSessionCheckpoints", "quarantine", "meta"];
    const outcome = await dataStore.runTransaction(stores, "readwrite", async (transaction) => {
      const marker = await transaction.get("meta", CONTEXT_BACKFILL_META_KEY);
      if (marker?.status === "complete" && marker?.version === CONTEXT_BACKFILL_VERSION) return { reconciled: false, marker };

      const rawProfiles = await transaction.list("profiles");
      if (!rawProfiles.some((candidate) => candidate?.profileId === ensureManifest().profileId)) {
        const profile = createDefaultPracticeProfile({ profileId: ensureManifest().profileId, now, keyboardLayout: ensureManifest().settings.keyboardLayout });
        const context = createDefaultPracticeContext({ profileId: profile.profileId, dataLocale: profile.dataLocale, keyboardLayout: profile.keyboardLayout, now });
        await transaction.put("profiles", profile);
        await transaction.put("contexts", context);
        rawProfiles.push(profile);
      }

      const profiles = new Map();
      const contexts = new Map();
      for (const raw of rawProfiles) {
        const migration = migratePracticeRecord("profile", raw);
        if (!migration.ok) {
          await transaction.put("quarantine", makeQuarantineEntry("profiles", raw, "profile-migration-failed"));
          await transaction.delete("profiles", raw.profileId);
          continue;
        }
        const profile = migration.value;
        await transaction.put("profiles", profile);
        profiles.set(profile.profileId, profile);
      }

      const rawContexts = await transaction.list("contexts");
      const invalidActiveContextIds = new Set();
      for (const raw of rawContexts) {
        const migration = migratePracticeRecord("context", raw);
        if (!migration.ok) {
          await transaction.put("quarantine", makeQuarantineEntry("contexts", raw, "context-validation-failed"));
          if ([...profiles.values()].some((profile) => profile.activeContextId === raw.contextId)) invalidActiveContextIds.add(raw.contextId);
          continue;
        }
        const context = migration.value;
        if (!profiles.has(context.profileId)) {
          await transaction.put("quarantine", makeQuarantineEntry("contexts", raw, "context-owner-missing"));
          continue;
        }
        contexts.set(context.contextId, context);
        await transaction.put("contexts", context);
      }

      if (invalidActiveContextIds.size) return { reconciled: false, fatal: "active-context-invalid", ids: [...invalidActiveContextIds] };

      for (const profile of profiles.values()) {
        let context = contexts.get(profile.activeContextId);
        if (!context) {
          const defaultContextId = createDefaultPracticeContextId(profile.profileId);
          if (profile.activeContextId !== defaultContextId) return { reconciled: false, fatal: "active-context-missing", ids: [profile.activeContextId] };
          context = createDefaultPracticeContext({ profileId: profile.profileId, dataLocale: profile.dataLocale, keyboardLayout: profile.keyboardLayout, now });
          await transaction.put("contexts", context);
          contexts.set(context.contextId, context);
        }
        if (context.profileId !== profile.profileId) return { reconciled: false, fatal: "active-context-owner-mismatch", ids: [context.contextId] };
      }

      const migrateStore = async (storeName, recordType) => {
        const records = await transaction.list(storeName);
        for (const raw of records) {
          const migration = migratePracticeRecord(recordType, raw);
          if (!migration.ok) {
            await transaction.put("quarantine", makeQuarantineEntry(storeName, raw, "record-migration-failed"));
            await transaction.delete(storeName, getPracticeStoreKey(storeName, raw));
            continue;
          }
          const migrated = migration.value;
          const context = contexts.get(migrated.contextId);
          if (!context || context.profileId !== migrated.profileId) {
            await transaction.put("quarantine", makeQuarantineEntry(storeName, raw, "context-ownership-invalid"));
            await transaction.delete(storeName, getPracticeStoreKey(storeName, raw));
            continue;
          }
          const oldKey = getPracticeStoreKey(storeName, raw);
          const newKey = getPracticeStoreKey(storeName, migrated);
          if (storeName === "skillStats" && oldKey !== newKey) {
            const canonical = await transaction.get(storeName, newKey);
            if (!canonical) await transaction.put(storeName, migrated);
            else if (!equivalent(canonical, migrated)) await transaction.put("quarantine", makeQuarantineEntry(storeName, raw, "legacy-skill-stat-conflict"));
            await transaction.delete(storeName, oldKey);
          } else {
            await transaction.put(storeName, migrated);
          }
        }
      };

      await migrateStore("skillStats", "skillStat");
      await migrateStore("sessionSummaries", "sessionSummary");
      await migrateStore("reviewItems", "reviewItem");
      await migrateStore("activeSessionCheckpoints", "checkpoint");

      const timestamp = toPracticeUtcIso(now);
      const markerValue = { key: CONTEXT_BACKFILL_META_KEY, version: CONTEXT_BACKFILL_VERSION, status: "complete", createdAt: timestamp, updatedAt: timestamp };
      await transaction.put("meta", markerValue);
      await transaction.put("meta", { key: "schemaVersion", value: 2, createdAt: ensureManifest().createdAt, updatedAt: timestamp });
      return { reconciled: true, marker: markerValue };
    });
    if (outcome.fatal) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECOVERY_REQUIRED, "Practice context reconciliation requires recovery", { operation: "pl5-context-reconciliation", storeName: "contexts", recordId: outcome.ids?.[0] ?? null, recoverable: true });
    return outcome;
  };

  const runRetention = async () => {
    const [checkpoints, sessionSummaries, skillStats, reviewItems, quarantineRecords] = await Promise.all([
      dataStore.list("activeSessionCheckpoints"), dataStore.list("sessionSummaries"), dataStore.list("skillStats"), dataStore.list("reviewItems"), dataStore.list("quarantine"),
    ]);
    const plan = buildPracticeRetentionPlan({ now, checkpoints, sessionSummaries, skillStats, reviewItems, quarantine: quarantineRecords });
    const deletions = [["activeSessionCheckpoints", plan.activeSessionCheckpoints], ["sessionSummaries", plan.sessionSummaries], ["reviewItems", plan.reviewItems], ["skillStats", plan.skillStats], ["quarantine", plan.quarantine]];
    await dataStore.runTransaction(deletions.map(([store]) => store), "readwrite", async (transaction) => {
      for (const [storeName, ids] of deletions) for (const id of ids) await transaction.delete(storeName, id);
    });
    return plan;
  };

  const writeWithQuotaRecovery = async (operation, write) => {
    try { return await write(); } catch (firstError) {
      if (!isQuotaExceededError(firstError)) throw firstError;
      await runRetention();
      try { return await write(); } catch (secondError) {
        if (!isQuotaExceededError(secondError)) throw secondError;
        try { saveManifestPatch({ storageHealth: "quota-exceeded" }); } catch {}
        throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.QUOTA_EXCEEDED, "Practice storage quota remained exceeded after one recovery attempt", { operation, recoverable: true, cause: secondError });
      }
    }
  };
  const putValidated = (storeName, record) => {
    validate(storeName, record);
    return writeWithQuotaRecovery(\`put:\${storeName}\`, () => dataStore.put(storeName, record));
  };
  const resolveContextId = async (profileId, contextId = null) => {
    if (contextId) { await assertContextOwnership(profileId, contextId); return contextId; }
    const profile = await readValidated("profiles", profileId);
    if (!profile) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, "Practice profile does not exist", { operation: "resolve-context", storeName: "profiles", recordId: profileId, recoverable: true });
    await assertContextOwnership(profileId, profile.activeContextId);
    return profile.activeContextId;
  };

  const repository = {
    async initializePracticeStorage() {
      const manifestResult = manifestStore.load();
      manifest = manifestResult.manifest;
      await dataStore.open();
      const reconciliation = await reconcileContextIdentity();
      const profile = await readValidated("profiles", manifest.profileId);
      if (!profile) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECOVERY_REQUIRED, "Practice profile could not be initialized", { operation: "initialize", storeName: "profiles", recordId: manifest.profileId, recoverable: true });
      const context = await assertContextOwnership(profile.profileId, profile.activeContextId, { operation: "initialize" });
      if (manifest.databaseVersion !== 2) saveManifestPatch({ databaseVersion: 2 });
      return { manifest: ensureManifest(), profile, context, recovery: manifestResult.recovery, backend: dataStore.kind, reconciliation };
    },

    getPracticeProfile() { return readValidated("profiles", ensureManifest().profileId); },
    async savePracticeProfile(profile) {
      if (profile.profileId !== ensureManifest().profileId) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice profile does not match the active manifest profile", { operation: "save-profile", storeName: "profiles", recordId: profile.profileId });
      validate("profiles", profile);
      await assertContextOwnership(profile.profileId, profile.activeContextId, { operation: "save-profile" });
      return putValidated("profiles", profile);
    },

    getPracticeSettings() { return clonePracticeValue(ensureManifest().settings); },
    savePracticeSettings(settings) {
      const outcome = validatePracticeSettings(settings);
      if (!outcome.valid) throw validationError("manifest.settings", settings, outcome);
      return saveManifestPatch({ settings: clonePracticeValue(settings) }).settings;
    },

    getPracticeContext(contextId) { return readValidated("contexts", contextId); },
    async listPracticeContexts(profileId = ensureManifest().profileId) {
      const records = await dataStore.query("contexts", "profileId", profileId);
      return records.filter((record) => validatePracticeContext(record).valid);
    },
    async savePracticeContext(context) {
      validate("contexts", context);
      const profile = await readValidated("profiles", context.profileId);
      if (!profile) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, "Practice context owner does not exist", { operation: "save-context", storeName: "profiles", recordId: context.profileId, recoverable: true });
      const duplicates = await dataStore.query("contexts", "profileFingerprint", [context.profileId, context.fingerprint]);
      const conflict = duplicates.find((candidate) => candidate.contextId !== context.contextId);
      if (conflict) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "Equivalent Practice context already exists for this profile", { operation: "save-context", storeName: "contexts", recordId: context.contextId, recoverable: true });
      return putValidated("contexts", context);
    },
    async createPracticeContext({ profileId = ensureManifest().profileId, contextId = createPracticeContextId(), dataLocale, keyboardLayout, inputMethod = "unknown", hardwareProfileId = null } = {}) {
      const profile = await readValidated("profiles", profileId);
      if (!profile) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, "Practice profile does not exist", { operation: "create-context", storeName: "profiles", recordId: profileId, recoverable: true });
      const context = createPracticeContextRecord({ contextId, profileId, dataLocale: dataLocale ?? profile.dataLocale, keyboardLayout: keyboardLayout ?? profile.keyboardLayout, inputMethod, hardwareProfileId, now });
      const existing = await dataStore.query("contexts", "profileFingerprint", [profileId, context.fingerprint]);
      if (existing.length) return { created: false, reused: true, context: existing[0] };
      await putValidated("contexts", context);
      return { created: true, reused: false, context };
    },
    async getActivePracticeContext(profileId = ensureManifest().profileId) {
      const profile = await readValidated("profiles", profileId);
      if (!profile) return null;
      return assertContextOwnership(profileId, profile.activeContextId, { operation: "get-active-context" });
    },
    async setActivePracticeContext(profileId, contextId) {
      const timestamp = toPracticeUtcIso(now);
      return dataStore.runTransaction(["profiles", "contexts"], "readwrite", async (transaction) => {
        const profile = await transaction.get("profiles", profileId);
        if (!profile) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, "Practice profile does not exist", { operation: "set-active-context", storeName: "profiles", recordId: profileId, recoverable: true });
        validate("profiles", profile);
        const context = await assertContextOwnership(profileId, contextId, { transaction, operation: "set-active-context" });
        const nextProfile = { ...profile, activeContextId: contextId, updatedAt: timestamp };
        const nextContext = { ...context, lastUsedAt: timestamp, updatedAt: timestamp };
        validate("profiles", nextProfile);
        validate("contexts", nextContext);
        await transaction.put("profiles", nextProfile);
        await transaction.put("contexts", nextContext);
        return { profile: nextProfile, context: nextContext };
      });
    },

    getSkillStat(profileId, contextId, entityType, entityKey) {
      return readValidated("skillStats", createSkillStatId(profileId, contextId, entityType, entityKey));
    },
    async saveSkillStat(stat) {
      validate("skillStats", stat);
      await assertContextOwnership(stat.profileId, stat.contextId, { operation: "save-skill-stat" });
      return putValidated("skillStats", stat);
    },
    async listSkillStats(profileId = ensureManifest().profileId, contextId = null) {
      const resolved = await resolveContextId(profileId, contextId);
      const records = await dataStore.query("skillStats", "contextId", resolved);
      return records.filter((record) => record.profileId === profileId && validateSkillStat(record).valid);
    },
    async listSkillStatsAcrossContexts(profileId = ensureManifest().profileId) {
      const records = await dataStore.query("skillStats", "profileId", profileId);
      return records.filter((record) => validateSkillStat(record).valid);
    },

    async saveSessionSummary(summary) {
      validate("sessionSummaries", summary);
      await assertContextOwnership(summary.profileId, summary.contextId, { operation: "save-session" });
      const previous = await dataStore.get("sessionSummaries", summary.sessionId);
      if (previous) {
        if (equivalent(previous, summary)) return { saved: false, idempotent: true, summary: previous };
        throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "A different Practice session summary already uses this sessionId", { operation: "save-session", storeName: "sessionSummaries", recordId: summary.sessionId });
      }
      await putValidated("sessionSummaries", summary);
      return { saved: true, idempotent: false, summary };
    },
    getSessionSummary(sessionId) { return readValidated("sessionSummaries", sessionId); },
    async listSessionSummaries(profileId = ensureManifest().profileId, { contextId = null } = {}) {
      const records = contextId
        ? await dataStore.query("sessionSummaries", "contextId", contextId)
        : await dataStore.query("sessionSummaries", "profileId", profileId);
      return records.filter((record) => record.profileId === profileId && (!contextId || record.contextId === contextId));
    },

    async saveReviewItem(item) {
      validate("reviewItems", item);
      await assertContextOwnership(item.profileId, item.contextId, { operation: "save-review-item" });
      const existing = await dataStore.query("reviewItems", "profileContextEntity", [item.profileId, item.contextId, item.entityType, item.entityKey]);
      const conflict = existing.find((record) => record.reviewItemId !== item.reviewItemId && activeReviewStates.has(record.state) && activeReviewStates.has(item.state));
      if (conflict) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "An active Practice review item already exists for this context/entity", { operation: "save-review-item", storeName: "reviewItems", recordId: item.reviewItemId });
      return putValidated("reviewItems", item);
    },
    getReviewItem(reviewItemId) { return readValidated("reviewItems", reviewItemId); },
    async listDueReviewItems(profileId = ensureManifest().profileId, contextId = null, dueAtUtc = toPracticeUtcIso(now)) {
      const resolved = await resolveContextId(profileId, contextId);
      const records = await dataStore.query("reviewItems", "contextId", resolved);
      return records.filter((record) => record.profileId === profileId && activeReviewStates.has(record.state) && record.dueAtUtc <= dueAtUtc)
        .sort((a, b) => a.dueAtUtc.localeCompare(b.dueAtUtc) || b.priority - a.priority);
    },
    async listReviewItemsAcrossContexts(profileId = ensureManifest().profileId) { return dataStore.query("reviewItems", "profileId", profileId); },

    async saveCustomText(record) {
      validate("customTexts", record);
      const records = await dataStore.query("customTexts", "profileId", record.profileId);
      const existing = records.find((candidate) => candidate.customTextId === record.customTextId);
      if (!existing && records.length >= PRACTICE_LIMITS.customTextCount) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.LIMIT_REACHED, "Practice custom-text limit reached", { operation: "save-custom-text", storeName: "customTexts", recordId: record.customTextId });
      const total = records.reduce((sum, candidate) => sum + (candidate.customTextId === record.customTextId ? 0 : candidate.characterCount), record.characterCount);
      if (total > PRACTICE_LIMITS.customTextTotalCharacters) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.LIMIT_REACHED, "Practice total custom-text character limit reached", { operation: "save-custom-text", storeName: "customTexts", recordId: record.customTextId });
      return putValidated("customTexts", record);
    },
    getCustomText(customTextId) { return readValidated("customTexts", customTextId); },
    listCustomTexts(profileId = ensureManifest().profileId) { return dataStore.query("customTexts", "profileId", profileId); },
    deleteCustomText(customTextId) { return dataStore.delete("customTexts", customTextId); },

    async savePreset(record) {
      validate("presets", record);
      const records = await dataStore.query("presets", "profileId", record.profileId);
      if (!records.some((candidate) => candidate.presetId === record.presetId) && records.length >= PRACTICE_LIMITS.presetCount) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.LIMIT_REACHED, "Practice preset limit reached", { operation: "save-preset", storeName: "presets", recordId: record.presetId });
      return putValidated("presets", record);
    },
    listPresets(profileId = ensureManifest().profileId) { return dataStore.query("presets", "profileId", profileId); },
    deletePreset(presetId) { return dataStore.delete("presets", presetId); },

    async saveActiveCheckpoint(record) {
      validate("activeSessionCheckpoints", record);
      await assertContextOwnership(record.profileId, record.contextId, { operation: "save-checkpoint" });
      return putValidated("activeSessionCheckpoints", record);
    },
    async getActiveCheckpoint(profileId = ensureManifest().profileId) {
      const checkpoint = await readValidated("activeSessionCheckpoints", profileId);
      if (!checkpoint) return null;
      try { await assertContextOwnership(checkpoint.profileId, checkpoint.contextId, { operation: "restore-checkpoint" }); }
      catch (cause) { throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECOVERY_REQUIRED, "Practice checkpoint context is missing or invalid", { operation: "restore-checkpoint", storeName: "activeSessionCheckpoints", recordId: profileId, recoverable: true, cause }); }
      return checkpoint;
    },
    clearActiveCheckpoint(profileId = ensureManifest().profileId) { return dataStore.delete("activeSessionCheckpoints", profileId); },

    getStorageHealth() { return { status: ensureManifest().storageHealth, backend: dataStore.kind, databaseOpen: dataStore.isOpen }; },
    runPracticeRetention: runRetention,

    async commitCompletedPracticeSession({ sessionSummary, updatedSkillStats = [], reviewItemChanges = [], updatedProfileSummary = null, clearCheckpoint = true }) {
      validate("sessionSummaries", sessionSummary);
      updatedSkillStats.forEach((record) => validate("skillStats", record));
      reviewItemChanges.filter((change) => change?.action !== "delete").forEach((record) => validate("reviewItems", record));
      if (updatedProfileSummary) validate("profiles", updatedProfileSummary);
      const activeProfileId = ensureManifest().profileId;
      const mismatch = sessionSummary.profileId !== activeProfileId
        || updatedSkillStats.some((record) => record.profileId !== sessionSummary.profileId || record.contextId !== sessionSummary.contextId)
        || reviewItemChanges.some((change) => change?.action !== "delete" && (change.profileId !== sessionSummary.profileId || change.contextId !== sessionSummary.contextId))
        || (updatedProfileSummary && updatedProfileSummary.profileId !== sessionSummary.profileId);
      if (mismatch) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice completion records must belong to the session profile/context", { operation: "commit-session", storeName: "profiles", recordId: sessionSummary.profileId });
      await assertContextOwnership(sessionSummary.profileId, sessionSummary.contextId, { operation: "commit-session" });

      const stores = ["contexts", "sessionSummaries", "skillStats", "reviewItems", "profiles", "activeSessionCheckpoints", "meta"];
      const transactionResult = await writeWithQuotaRecovery("commit-session", () => dataStore.runTransaction(stores, "readwrite", async (transaction) => {
        await assertContextOwnership(sessionSummary.profileId, sessionSummary.contextId, { transaction, operation: "commit-session" });
        const existing = await transaction.get("sessionSummaries", sessionSummary.sessionId);
        if (existing) {
          if (equivalent(existing, sessionSummary)) return { committed: false, idempotent: true, profileSummary: await transaction.get("profiles", sessionSummary.profileId) };
          throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "A different completed Practice session already uses this sessionId", { operation: "commit-session", storeName: "sessionSummaries", recordId: sessionSummary.sessionId });
        }
        const checkpoint = await transaction.get("activeSessionCheckpoints", sessionSummary.profileId);
        if (checkpoint && (checkpoint.profileId !== sessionSummary.profileId || checkpoint.contextId !== sessionSummary.contextId)) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice checkpoint does not match the completing session context", { operation: "commit-session", storeName: "activeSessionCheckpoints", recordId: sessionSummary.profileId, recoverable: true });
        if (updatedProfileSummary) await assertContextOwnership(updatedProfileSummary.profileId, updatedProfileSummary.activeContextId, { transaction, operation: "commit-session-profile" });
        for (const change of reviewItemChanges) if (change?.action === "delete") {
          const existingReview = await transaction.get("reviewItems", change.reviewItemId);
          if (existingReview && (existingReview.profileId !== sessionSummary.profileId || existingReview.contextId !== sessionSummary.contextId)) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Deleted review does not belong to the completing session context", { operation: "commit-session", storeName: "reviewItems", recordId: change.reviewItemId, recoverable: true });
        }
        await transaction.put("sessionSummaries", sessionSummary);
        for (const stat of updatedSkillStats) await transaction.put("skillStats", stat);
        for (const change of reviewItemChanges) {
          if (change?.action === "delete") await transaction.delete("reviewItems", change.reviewItemId);
          else await transaction.put("reviewItems", change);
        }
        if (updatedProfileSummary) await transaction.put("profiles", updatedProfileSummary);
        if (clearCheckpoint) await transaction.delete("activeSessionCheckpoints", sessionSummary.profileId);
        await transaction.put("meta", { key: "manifestReconciliation", status: "pending", sessionId: sessionSummary.sessionId, createdAt: toPracticeUtcIso(now), updatedAt: toPracticeUtcIso(now) });
        return { committed: true, idempotent: false };
      }));
      try {
        const reconciliationProfile = transactionResult.profileSummary ?? updatedProfileSummary;
        saveManifestPatch({
          lastCompletedSessionAt: sessionSummary.status === "completed" ? sessionSummary.completedAtUtc : ensureManifest().lastCompletedSessionAt,
          dashboardSummary: reconciliationProfile?.dashboardSummary ?? ensureManifest().dashboardSummary,
          storageHealth: "healthy",
        });
        await dataStore.put("meta", { key: "manifestReconciliation", status: "resolved", sessionId: sessionSummary.sessionId, createdAt: sessionSummary.completedAtUtc, updatedAt: toPracticeUtcIso(now) });
        const { profileSummary: _profileSummary, ...publicResult } = transactionResult;
        return { ...publicResult, manifestUpdated: true };
      } catch (cause) {
        const { profileSummary: _profileSummary, ...publicResult } = transactionResult;
        return { ...publicResult, manifestUpdated: false, recoveryRequired: true, error: practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECOVERY_REQUIRED, "Session committed, but the Practice manifest requires reconciliation", { operation: "commit-session-manifest", recoverable: true, cause }) };
      }
    },

    async resetPracticeData() {
      for (const storeName of PRACTICE_STORE_NAMES) await dataStore.clearStore(storeName);
      manifestStore.clear();
      manifest = null;
      return true;
    },
  };
  return Object.freeze(repository);
}
`);

// ---------------------------------------------------------------------------
// CHECKPOINT + SESSION RESULT + ENGINE IDENTITY
// ---------------------------------------------------------------------------
replaceOnce("js/practiceLab/practiceCheckpoint.js",
`export function buildPracticeCheckpoint({
  profileId,
  sessionId,`,
`export function buildPracticeCheckpoint({
  profileId,
  contextId,
  sessionId,`);
replaceOnce("js/practiceLab/practiceCheckpoint.js",
`  const checkpoint = createDefaultCheckpoint({
    profileId,
    sessionId,`,
`  const checkpoint = createDefaultCheckpoint({
    profileId,
    contextId,
    sessionId,`);
replaceOnce("js/practiceLab/practiceCheckpoint.js",
`export function validatePracticeCheckpointRestore({
  checkpoint,
  experiment,
  profileId = checkpoint?.profileId,`,
`export function validatePracticeCheckpointRestore({
  checkpoint,
  experiment,
  profileId = checkpoint?.profileId,
  contextId = checkpoint?.contextId,`);
replaceOnce("js/practiceLab/practiceCheckpoint.js",
`  if (checkpoint?.profileId !== profileId) errors.push({ path: "profileId", code: "PROFILE_MISMATCH", message: "checkpoint profile does not match" });`,
`  if (checkpoint?.profileId !== profileId) errors.push({ path: "profileId", code: "PROFILE_MISMATCH", message: "checkpoint profile does not match" });
  if (checkpoint?.contextId !== contextId) errors.push({ path: "contextId", code: "CONTEXT_MISMATCH", message: "checkpoint context does not match" });`);

replaceOnce("js/practiceLab/practiceSessionResult.js",
`export function buildPracticeSessionResult({
  sessionId,
  profileId,
  experiment,`,
`export function buildPracticeSessionResult({
  sessionId,
  profileId,
  contextId,
  experiment,`);
replaceOnce("js/practiceLab/practiceSessionResult.js",
`  const summary = createDefaultSessionSummary({
    sessionId,
    profileId,
    experimentId:`,
`  const summary = createDefaultSessionSummary({
    sessionId,
    profileId,
    contextId,
    experimentId:`);

replaceOnce("js/practiceLab/practiceSessionEngine.js",
`  sessionId = createPracticeSessionId(),
  profileId,
  clock`,
`  sessionId = createPracticeSessionId(),
  profileId,
  contextId,
  clock`);
replaceOnce("js/practiceLab/practiceSessionEngine.js",
`  if (typeof profileId !== "string") throw new TypeError("Practice engine requires a profileId");`,
`  if (typeof profileId !== "string") throw new TypeError("Practice engine requires a profileId");
  if (typeof contextId !== "string") throw new TypeError("Practice engine requires a resolved contextId");`);
replaceOnce("js/practiceLab/practiceSessionEngine.js",
`      sessionId,
      profileId,
      experimentId:`,
`      sessionId,
      profileId,
      contextId,
      experimentId:`);
replaceOnce("js/practiceLab/practiceSessionEngine.js",
`    const checkpoint = buildPracticeCheckpoint({
      profileId,
      sessionId,`,
`    const checkpoint = buildPracticeCheckpoint({
      profileId,
      contextId,
      sessionId,`);
replaceOnce("js/practiceLab/practiceSessionEngine.js",
`      sessionId,
      profileId,
      experiment,
      configuration,`,
`      sessionId,
      profileId,
      contextId,
      experiment,
      configuration,`);
replaceOnce("js/practiceLab/practiceSessionEngine.js",
`      sessionId,
      lifecycleState,
      snapshotVersion,`,
`      sessionId,
      profileId,
      contextId,
      lifecycleState,
      snapshotVersion,`);
replaceOnce("js/practiceLab/practiceSessionEngine.js",
`  const validation = validatePracticeCheckpointRestore({
    checkpoint,
    experiment: experimentDescriptor,
    profileId: checkpoint?.profileId,
    wallClock,`,
`  const validation = validatePracticeCheckpointRestore({
    checkpoint,
    experiment: experimentDescriptor,
    profileId: checkpoint?.profileId,
    contextId: checkpoint?.contextId,
    wallClock,`);
replaceOnce("js/practiceLab/practiceSessionEngine.js",
`  const existing = await repository.getSessionSummary(checkpoint.sessionId);`,
`  try {
    const context = await repository.getPracticeContext(checkpoint.contextId);
    if (!context || context.profileId !== checkpoint.profileId) throw new Error("checkpoint context is missing or belongs to another profile");
  } catch (cause) {
    throw practiceSessionError(
      PRACTICE_SESSION_ERROR_CODES.RESTORE_FAILED,
      "Practice checkpoint context cannot be resolved",
      { operation: "restore", sessionId: checkpoint?.sessionId ?? null, lifecycleState: "created", recoverable: true, cause },
    );
  }
  const existing = await repository.getSessionSummary(checkpoint.sessionId);`);
replaceOnce("js/practiceLab/practiceSessionEngine.js",
`    sessionId: checkpoint.sessionId,
    profileId: checkpoint.profileId,
    clock,`,
`    sessionId: checkpoint.sessionId,
    profileId: checkpoint.profileId,
    contextId: checkpoint.contextId,
    clock,`);

// ---------------------------------------------------------------------------
// TEST FIXTURES: resolved context is explicit at session-engine construction.
// ---------------------------------------------------------------------------
replaceOnce("tests/practiceSessionFixtures.js",
`  await repository.initializePracticeStorage();
  const experiment`,
`  const initialized = await repository.initializePracticeStorage();
  const contextId = initialized.profile.activeContextId;
  const experiment`);
replaceOnce("tests/practiceSessionFixtures.js",
`    profileId,
    sessionId,
    repository,`,
`    profileId,
    contextId,
    sessionId,
    repository,`);

for (const name of fs.readdirSync(path.join(root, "tests"))) {
  if (!name.startsWith("practice-") || !name.endsWith(".test.js")) continue;
  const file = path.join("tests", name);
  let source = read(file);
  source = source.replace(/(profileId:\s*([A-Za-z_$][\\w$]*)\.profileId,\n)(?!\s*contextId:)/g, "$1    contextId: $2.contextId,\n");
  write(file, source);
}

// ---------------------------------------------------------------------------
// PL5 FOCUSED TESTS
// ---------------------------------------------------------------------------
write("tests/practice-context-identity.test.js", `import assert from "node:assert/strict";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_DEFINITIONS,
} from "../js/practiceLab/practiceConstants.js";
import {
  createDefaultPracticeContext,
  createPracticeContextFingerprint,
  createPracticeContextRecord,
  normalizePracticeDataLocale,
  normalizePracticeKeyboardLayout,
} from "../js/practiceLab/practiceContext.js";
import {
  createDefaultPracticeContextId,
  createPracticeId,
  createSkillStatId,
  isPracticeId,
} from "../js/practiceLab/practiceIds.js";
import {
  createDefaultCheckpoint,
  createDefaultPracticeManifest,
  createDefaultPracticeProfile,
  createDefaultReviewItem,
  createDefaultSessionSummary,
  createDefaultSkillStat,
} from "../js/practiceLab/practiceDefaults.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { createPracticeManifestStore } from "../js/practiceLab/practiceManifestStore.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { createPracticeRepository } from "../js/practiceLab/practiceRepository.js";
import {
  validateCheckpoint,
  validatePracticeContext,
  validatePracticeProfile,
  validateReviewItem,
  validateSessionSummary,
  validateSkillStat,
} from "../js/practiceLab/practiceValidation.js";
import { buildPracticeRetentionPlan } from "../js/practiceLab/practiceRetention.js";

const now = () => new Date("2026-09-03T18:00:00.000Z");
const profileA = createPracticeId("profile", { uuid: () => "pl5-profile-a-12345678" });
const profileB = createPracticeId("profile", { uuid: () => "pl5-profile-b-12345678" });
const defaultA = createDefaultPracticeContextId(profileA);
assert.equal(defaultA, createDefaultPracticeContextId(profileA));
assert.notEqual(defaultA, createDefaultPracticeContextId(profileB));
assert.equal(isPracticeId(defaultA, "context"), true);
assert.equal(normalizePracticeDataLocale(" de_DE "), "de-DE");
assert.equal(normalizePracticeDataLocale("not a locale !!!"), null);
assert.equal(normalizePracticeKeyboardLayout(" QWERTZ "), "qwertz");
assert.equal(createPracticeContextFingerprint({ dataLocale: "en", keyboardLayout: "QWERTY", inputMethod: "unknown", hardwareProfileId: null }), createPracticeContextFingerprint({ dataLocale: " en ", keyboardLayout: "qwerty", inputMethod: "UNKNOWN", hardwareProfileId: null }));
assert.notEqual(createPracticeContextFingerprint({ dataLocale: "en", keyboardLayout: "qwerty", inputMethod: "physical", hardwareProfileId: null }), createPracticeContextFingerprint({ dataLocale: "en", keyboardLayout: "qwerty", inputMethod: "software", hardwareProfileId: null }));

const defaultContext = createDefaultPracticeContext({ profileId: profileA, dataLocale: "en", keyboardLayout: "qwerty", now });
assert.equal(defaultContext.contextId, defaultA);
assert.equal(defaultContext.recordVersion, 1);
assert.equal(defaultContext.inputMethod, "unknown");
assert.equal(defaultContext.hardwareProfileId, null);
assert.equal(validatePracticeContext(defaultContext).valid, true);
for (const bad of [
  { ...defaultContext, dataLocale: "" },
  { ...defaultContext, keyboardLayout: "" },
  { ...defaultContext, inputMethod: "touchish" },
  { ...defaultContext, contextId: "bad" },
  { ...defaultContext, fingerprint: "v1|wrong" },
  { ...defaultContext, recordVersion: 2 },
]) assert.equal(validatePracticeContext(bad).valid, false);

const profile = createDefaultPracticeProfile({ profileId: profileA, now });
assert.equal(profile.recordVersion, 3);
assert.equal(profile.activeContextId, defaultA);
assert.equal(validatePracticeProfile(profile).valid, true);
const stat = createDefaultSkillStat({ profileId: profileA, contextId: defaultA, entityType: "bigram", entityKey: "er", now });
assert.equal(stat.recordVersion, 2);
assert.equal(stat.statId, createSkillStatId(profileA, defaultA, "bigram", "er"));
assert.equal(validateSkillStat(stat).valid, true);
assert.equal(validateSkillStat({ ...stat, contextId: undefined }).valid, false);
assert.equal(validateSkillStat({ ...stat, statId: createSkillStatId(profileA, createDefaultPracticeContextId(profileB), "bigram", "er") }).valid, false);
assert.throws(() => createSkillStatId(profileA, "bigram", "er"), /requires profileId/);
assert.equal(validateReviewItem(createDefaultReviewItem({ profileId: profileA, contextId: defaultA, now })).valid, true);
assert.equal(validateSessionSummary(createDefaultSessionSummary({ profileId: profileA, contextId: defaultA, now })).valid, true);
assert.equal(validateCheckpoint(createDefaultCheckpoint({ profileId: profileA, contextId: defaultA, now })).valid, true);

const legacyProfile = { ...profile, recordVersion: 2 };
delete legacyProfile.activeContextId;
const migratedProfile = migratePracticeRecord("profile", legacyProfile);
assert.equal(migratedProfile.ok, true);
assert.deepEqual(migratedProfile.steps, ["profile:2->3"]);
assert.equal(migratedProfile.value.activeContextId, defaultA);
assert.equal(legacyProfile.activeContextId, undefined);
const legacyStat = { ...stat, recordVersion: 1, statId: `legacy-${stat.statId}` };
delete legacyStat.contextId;
const migratedStat = migratePracticeRecord("skillStat", legacyStat);
assert.equal(migratedStat.ok, true);
assert.deepEqual(migratedStat.steps, ["skillStat:1->2"]);
assert.equal(migratedStat.value.contextId, defaultA);
assert.equal(migratedStat.value.statId, createSkillStatId(profileA, defaultA, "bigram", "er"));
assert.equal(migratedStat.value.sampleCount, stat.sampleCount);
assert.equal(migratePracticeRecord("skillStat", migratedStat.value).migrated, false);
assert.equal(migratePracticeRecord("skillStat", { ...migratedStat.value, recordVersion: 99 }).error.code, "PRACTICE_STORAGE_UNSUPPORTED_VERSION");
for (const [type, current] of [
  ["reviewItem", createDefaultReviewItem({ profileId: profileA, contextId: defaultA, now })],
  ["sessionSummary", createDefaultSessionSummary({ profileId: profileA, contextId: defaultA, now })],
  ["checkpoint", createDefaultCheckpoint({ profileId: profileA, contextId: defaultA, now })],
]) {
  const old = { ...current, recordVersion: 1 };
  delete old.contextId;
  const migrated = migratePracticeRecord(type, old);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.value.contextId, defaultA);
}

assert.equal(PRACTICE_DATABASE_VERSION, 2);
assert.equal(PRACTICE_RECORD_VERSIONS.profile, 3);
assert.equal(PRACTICE_RECORD_VERSIONS.context, 1);
assert.equal(PRACTICE_RECORD_VERSIONS.skillStat, 2);
assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 2);
assert.equal(PRACTICE_RECORD_VERSIONS.reviewItem, 2);
assert.equal(PRACTICE_RECORD_VERSIONS.checkpoint, 2);
assert.equal(PRACTICE_STORE_DEFINITIONS.skillStats.indexes.some((index) => index.name === "profileEntity"), false);
assert.equal(PRACTICE_STORE_DEFINITIONS.reviewItems.indexes.some((index) => index.name === "profileEntity"), false);

const values = new Map();
const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
const manifestStore = createPracticeManifestStore({
  storage: localStorage,
  createDefault: (options) => createDefaultPracticeManifest({ profileId: profileA, now, ...options }),
  defaultOptions: { profileId: profileA, now },
});
const dataStore = createPracticeMemoryStore();
const repository = createPracticeRepository({ dataStore, manifestStore, now });
const initialized = await repository.initializePracticeStorage();
assert.equal(initialized.profile.activeContextId, defaultA);
assert.equal((await repository.getActivePracticeContext()).contextId, defaultA);
assert.equal((await repository.initializePracticeStorage()).reconciliation.reconciled, false);

const contextB = createPracticeContextRecord({
  contextId: createPracticeId("context", { uuid: () => "german-qwertz-12345678" }),
  profileId: profileA,
  dataLocale: "de-DE",
  keyboardLayout: "qwertz",
  inputMethod: "physical",
  now,
});
await repository.savePracticeContext(contextB);
const sameLogical = await repository.createPracticeContext({ profileId: profileA, dataLocale: "de_de", keyboardLayout: "QWERTZ", inputMethod: "physical" });
assert.equal(sameLogical.created, false);
assert.equal(sameLogical.context.contextId, contextB.contextId);

const aStat = createDefaultSkillStat({ profileId: profileA, contextId: defaultA, entityType: "bigram", entityKey: "er", now });
const bStat = createDefaultSkillStat({ profileId: profileA, contextId: contextB.contextId, entityType: "bigram", entityKey: "er", now });
await repository.saveSkillStat(aStat);
await repository.saveSkillStat(bStat);
assert.notEqual(aStat.statId, bStat.statId);
assert.equal((await repository.listSkillStats(profileA, defaultA)).length, 1);
assert.equal((await repository.listSkillStats(profileA, contextB.contextId)).length, 1);
const aReview = createDefaultReviewItem({ reviewItemId: createPracticeId("review", { uuid: () => "review-a-12345678" }), profileId: profileA, contextId: defaultA, entityType: "bigram", entityKey: "er", now });
const bReview = createDefaultReviewItem({ reviewItemId: createPracticeId("review", { uuid: () => "review-b-12345678" }), profileId: profileA, contextId: contextB.contextId, entityType: "bigram", entityKey: "er", now });
await repository.saveReviewItem(aReview);
await repository.saveReviewItem(bReview);
assert.equal((await repository.listDueReviewItems(profileA, defaultA)).length, 1);
assert.equal((await repository.listDueReviewItems(profileA, contextB.contextId)).length, 1);

const oldSession = createDefaultSessionSummary({ sessionId: createPracticeId("session", { uuid: () => "history-a-12345678" }), profileId: profileA, contextId: defaultA, now });
await repository.saveSessionSummary(oldSession);
const oldCheckpoint = createDefaultCheckpoint({ profileId: profileA, contextId: defaultA, sessionId: createPracticeId("session", { uuid: () => "checkpoint-a-12345678" }), now });
await repository.saveActiveCheckpoint(oldCheckpoint);
await repository.setActivePracticeContext(profileA, contextB.contextId);
assert.equal((await repository.getPracticeProfile()).activeContextId, contextB.contextId);
assert.equal((await repository.getSessionSummary(oldSession.sessionId)).contextId, defaultA);
assert.equal((await repository.getActiveCheckpoint()).contextId, defaultA);

const foreignContext = createDefaultPracticeContext({ profileId: profileB, now });
await dataStore.put("profiles", createDefaultPracticeProfile({ profileId: profileB, now }));
await dataStore.put("contexts", foreignContext);
await assert.rejects(repository.saveSkillStat(createDefaultSkillStat({ profileId: profileA, contextId: foreignContext.contextId, now })), (error) => error.code === "PRACTICE_STORAGE_VALIDATION_FAILED");
await assert.rejects(repository.setActivePracticeContext(profileA, foreignContext.contextId), (error) => error.code === "PRACTICE_STORAGE_VALIDATION_FAILED");

const mixedSummary = createDefaultSessionSummary({ sessionId: createPracticeId("session", { uuid: () => "mixed-session-12345678" }), profileId: profileA, contextId: contextB.contextId, now });
const wrongContextStat = createDefaultSkillStat({ profileId: profileA, contextId: defaultA, now });
await assert.rejects(repository.commitCompletedPracticeSession({ sessionSummary: mixedSummary, updatedSkillStats: [wrongContextStat], clearCheckpoint: false }), (error) => error.code === "PRACTICE_STORAGE_VALIDATION_FAILED");
assert.equal(await repository.getSessionSummary(mixedSummary.sessionId), null);

const retention = buildPracticeRetentionPlan({ reviewItems: [aReview, bReview], now });
assert.equal(retention.reviewItems.length, 0);

await repository.resetPracticeData();
assert.equal((await dataStore.list("contexts")).length, 0);
console.log("PL5 context identity, migrations, ownership, isolation, history, checkpoint, commit, retention, and reset passed.");
`);

write("tests/practice-database-v2-upgrade.test.js", `import assert from "node:assert/strict";
import {
  PRACTICE_STORE_DEFINITIONS,
  PRACTICE_STORE_NAMES,
} from "../js/practiceLab/practiceConstants.js";
import { applyPracticeDatabaseUpgrade } from "../js/practiceLab/practiceIndexedDbStore.js";

function makeStore(keyPath, indexDefinitions = []) {
  const indexes = new Map(indexDefinitions.map((index) => [index.name, { ...index }]));
  return {
    keyPath,
    indexNames: { contains: (name) => indexes.has(name), [Symbol.iterator]: function* () { yield* indexes.keys(); } },
    createIndex(name, nextKeyPath, options = {}) { indexes.set(name, { name, keyPath: nextKeyPath, options }); },
    deleteIndex(name) { indexes.delete(name); },
    snapshot() { return [...indexes.values()]; },
  };
}
function makeDatabase(initialStores = new Map()) {
  const stores = initialStores;
  return {
    objectStoreNames: { contains: (name) => stores.has(name), [Symbol.iterator]: function* () { yield* stores.keys(); } },
    createObjectStore(name, { keyPath }) { const store = makeStore(keyPath); stores.set(name, store); return store; },
    stores,
  };
}
const v1Stores = new Map();
for (const [name, definition] of Object.entries(PRACTICE_STORE_DEFINITIONS)) {
  if (name === "contexts") continue;
  const legacyIndexes = definition.indexes
    .filter((index) => !["contextId", "profileContextEntity", "profileFingerprint"].includes(index.name))
    .map((index) => ({ name: index.name, keyPath: index.keyPath, options: index.options || {} }));
  if (name === "skillStats" || name === "reviewItems") legacyIndexes.push({ name: "profileEntity", keyPath: ["profileId", "entityType", "entityKey"], options: { unique: true } });
  v1Stores.set(name, makeStore(definition.keyPath, legacyIndexes));
}
const upgraded = makeDatabase(v1Stores);
applyPracticeDatabaseUpgrade(upgraded, { objectStore: (name) => upgraded.stores.get(name) });
assert.equal(upgraded.stores.has("contexts"), true);
for (const storeName of ["skillStats", "reviewItems"]) {
  const indexes = upgraded.stores.get(storeName).snapshot();
  assert.equal(indexes.some((index) => index.name === "profileEntity"), false);
  assert.equal(indexes.some((index) => index.name === "contextId"), true);
  assert.equal(indexes.find((index) => index.name === "profileContextEntity")?.options?.unique, true);
}
assert.equal(upgraded.stores.get("sessionSummaries").snapshot().some((index) => index.name === "contextId"), true);

const fresh = makeDatabase();
applyPracticeDatabaseUpgrade(fresh);
assert.deepEqual([...fresh.stores.keys()], PRACTICE_STORE_NAMES);
for (const [name, definition] of Object.entries(PRACTICE_STORE_DEFINITIONS)) {
  const actual = fresh.stores.get(name).snapshot().map((index) => ({ name: index.name, keyPath: index.keyPath, options: index.options || {} }));
  const expected = definition.indexes.map((index) => ({ name: index.name, keyPath: index.keyPath, options: index.options || {} }));
  assert.deepEqual(actual, expected);
}
console.log("PL5 exact v1-to-v2 IndexedDB reconciliation and fresh-v2 convergence passed.");
`);

// Extend the old structure fixture to support deleteIndex on an existing store.
replaceOnce("tests/practice-indexeddb-structure.test.js",
`const existingProfiles = {
  indexNames: { contains: () => false },
  createIndex(name, keyPath, options) { addedExistingIndexes.push({ name, keyPath, options }); },
};`,
`const existingProfiles = {
  indexNames: { contains: () => false },
  createIndex(name, keyPath, options) { addedExistingIndexes.push({ name, keyPath, options }); },
  deleteIndex() {},
};`);

// ---------------------------------------------------------------------------
// DOCUMENTATION
// ---------------------------------------------------------------------------
write("docs/PRACTICE_LAB_CONTEXT_IDENTITY.md", `# Practice Lab Context Identity — PL5

## Canonical boundary

PL5 changes the identity hierarchy for adaptive Practice evidence from **profile → entity** to **profile → context → evidence**. Fine-grained skill, review, session, and checkpoint evidence is never aggregated across contexts by default.

## Context schema

A context is a local-only IndexedDB record with: \`contextId\`, \`profileId\`, \`recordVersion\`, timestamps, \`dataLocale\`, \`keyboardLayout\`, \`inputMethod\`, nullable \`hardwareProfileId\`, and deterministic \`fingerprint\`.

\`inputMethod\` is limited to \`unknown\`, \`physical\`, or \`software\`. Historical data is always migrated as \`unknown\`; PL5 does not infer input method from user agent, touch support, screen dimensions, or any other heuristic.

## Fingerprint

Fingerprint semantics are explicitly versioned by \`PRACTICE_CONTEXT_FINGERPRINT_VERSION = 1\`. Components are conservatively normalized and encoded into a deterministic versioned fingerprint. Mutable display labels are not identity.

A profile owns at most one context for each \`profileId + fingerprint\` pair through the unique \`contexts.profileFingerprint\` index.

## Default context

Every profile has a deterministic default context ID derived only from its \`profileId\`. The default context uses the profile's existing \`dataLocale\` and \`keyboardLayout\` preferences, plus \`inputMethod: unknown\` and \`hardwareProfileId: null\`. It does not depend on the clock or browser locale.

\`profile.dataLocale\`, \`profile.keyboardLayout\`, and \`settings.keyboardLayout\` remain defaults/preferences. They are **not** the identity of persisted evidence. Persisted context-sensitive evidence uses \`contextId\`.

## Versions

- IndexedDB structural version: 2
- context: 1
- profile: 3
- skillStat: 2
- sessionSummary: 2
- reviewItem: 2
- checkpoint: 2
- customText, preset, quarantine: unchanged

## Database v2

The new \`contexts\` store is keyed by \`contextId\` and indexed by \`profileId\`, \`updatedAt\`, \`lastUsedAt\`, and unique \`[profileId, fingerprint]\`.

The obsolete unique \`profileEntity\` indexes are removed from \`skillStats\` and \`reviewItems\`. They are replaced by non-unique \`contextId\` and unique \`profileContextEntity = [profileId, contextId, entityType, entityKey]\`. \`sessionSummaries\` gains a \`contextId\` index. Unknown stores are not removed during version upgrade.

## Migration and backfill

Record migration is sequential and validation-backed. Profile v2 receives its deterministic \`activeContextId\`. Contextless skill, session, review, and checkpoint records receive that default context. Skill-stat primary keys are recomputed from \`profileId + contextId + entityType + entityKey\`.

Storage initialization performs a bounded PL5 reconciliation before declaring migration complete. It ensures every profile has a valid active context, creates a missing deterministic default context from profile defaults, migrates bounded context-sensitive stores, verifies ownership, replaces old skill-stat keys, and writes the completion marker only after successful reconciliation.

If both a legacy skill record and a canonical v2 record resolve to the same new key, equivalent duplicates collapse to the canonical record. If they contain independent evidence that PL5 cannot safely combine, the legacy record is quarantined and the canonical record is preserved. PL5 does not invent timing/counter merge formulas.

## Ownership and session propagation

A context belongs to exactly one profile. Repository writes reject profile/context mismatches. Active-context switching changes only future selection and never rewrites historical records or a resumable checkpoint.

A Practice session receives a resolved \`profileId\` and \`contextId\` at construction. Both are immutable session identity. The context is propagated to checkpoints, summaries, analyzer skill updates, and review updates. Atomic completion rejects mixed-context writes and verifies the checkpoint context before clearing it.

Checkpoint restore uses the checkpoint's historical context. Missing/corrupt context identity produces a recoverable restore failure; restore never substitutes today's active context.

## Privacy and isolation

Contexts and all Practice evidence remain local-only. PL5 does not connect Practice to \`wordstrike_save\`, ranked Typing Test, Campaign, Endless, Daily Strike, leaderboards, authentication, access tokens, Supabase, or cloud sync.

## Future context creation

PL5 exposes internal repository APIs for deliberate context creation and active-context switching. Equivalent normalized context definitions reuse one canonical record. PL5 never creates contexts per page load, browser session, keyboard event, locale event, or user-agent change.

A future setup/input adapter may deliberately create \`physical\` or \`software\` contexts and may later introduce explicit hardware profiles. Those features must use the existing \`contextId\` boundary rather than changing historical identity.

## Explicit non-goals

PL5 does not implement physical/software auto-detection, a context selector, hardware keyboard profiles, multilingual corpora, weakness/ability models, Coach logic, adaptive experiments, assessment UI, advanced telemetry, leaderboards, or cloud sync.
`);

for (const name of fs.readdirSync(path.join(root, "docs"))) {
  if (!/^PRACTICE.*\\.md$/i.test(name) || name === "PRACTICE_LAB_CONTEXT_IDENTITY.md") continue;
  const file = path.join("docs", name);
  let source = read(file);
  source = source.replace(/profile\s*\+\s*entityType\s*\+\s*entityKey/gi, "profileId + contextId + entityType + entityKey");
  source = source.replace(/profile\s*\/\s*entity/gi, "profile / context / entity");
  if (/ARCHITECTURE|DATA|SESSION|STORAGE/i.test(name) && !source.includes("PL5 context identity")) {
    source += `\n\n## PL5 context identity\n\nContext-sensitive Practice evidence now follows **profile → context → evidence**. Profile/settings locale and keyboard fields are defaults only; canonical historical identity is the record's immutable \`contextId\`. See \`PRACTICE_LAB_CONTEXT_IDENTITY.md\` for schema, migration, ownership, and session-propagation contracts.\n`;
  }
  write(file, source);
}

console.log("PL5 patch applied.");
