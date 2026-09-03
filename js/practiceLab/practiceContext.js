import {
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
    if (/^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part)) return part.toUpperCase();
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
    : `id:${component(normalized.hardwareProfileId)}`;
  return [
    `v${PRACTICE_CONTEXT_FINGERPRINT_VERSION}`,
    `locale:${component(normalized.dataLocale)}`,
    `layout:${component(normalized.keyboardLayout)}`,
    `input:${normalized.inputMethod}`,
    `hardware:${hardware}`,
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
