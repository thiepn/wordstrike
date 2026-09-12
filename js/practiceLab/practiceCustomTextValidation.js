import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { splitGraphemes } from "./practiceTextSegmentation.js";
import { PRACTICE_CUSTOM_TEXT_DEFAULT_TITLE, PRACTICE_CUSTOM_TEXT_ERROR_CODES, PRACTICE_CUSTOM_TEXT_MAX_BYTES, PRACTICE_CUSTOM_TEXT_MAX_GRAPHEMES, PRACTICE_CUSTOM_TEXT_MAX_TITLE_LENGTH, PRACTICE_CUSTOM_TEXT_PROJECTION_VERSION } from "./practiceCustomTextConstants.js";
import { isPracticeCustomTextSha256, practiceCustomTextUtf8Bytes } from "./practiceCustomTextHash.js";

export class PracticeCustomTextError extends Error { constructor(code, message, details = {}) { super(message); this.name = "PracticeCustomTextError"; this.code = code; this.details = details; } }
export const customTextError = (code, message, details = {}) => new PracticeCustomTextError(code, message, details);
export function normalizePracticeCustomTextSource(value) { return String(value ?? "").replace(/\r\n?/g, "\n").normalize("NFC"); }
export function normalizePracticeCustomTextTitle(value) { const title = String(value ?? "").normalize("NFC").trim(); return title || PRACTICE_CUSTOM_TEXT_DEFAULT_TITLE; }
function firstInvalidControl(text) { for (let index = 0; index < text.length; index += 1) { const code = text.charCodeAt(index); if (code <= 0x1f && code !== 0x0a && code !== 0x09) return index; } return -1; }
function firstUnpairedSurrogate(text) { for (let index = 0; index < text.length; index += 1) { const code = text.charCodeAt(index); if (code >= 0xd800 && code <= 0xdbff) { const next = text.charCodeAt(index + 1); if (!(next >= 0xdc00 && next <= 0xdfff)) return index; index += 1; } else if (code >= 0xdc00 && code <= 0xdfff) return index; } return -1; }
export function inspectPracticeCustomTextSource(value) {
  const sourceText = normalizePracticeCustomTextSource(value); const byteLength = practiceCustomTextUtf8Bytes(sourceText).byteLength; const graphemeCount = splitGraphemes(sourceText).length;
  const controlIndex = firstInvalidControl(sourceText); if (controlIndex >= 0) throw customTextError(PRACTICE_CUSTOM_TEXT_ERROR_CODES.INVALID_CONTROL_CHARACTER, "Custom Text contains an unsupported control character", { position: controlIndex });
  const surrogateIndex = firstUnpairedSurrogate(sourceText); if (surrogateIndex >= 0) throw customTextError(PRACTICE_CUSTOM_TEXT_ERROR_CODES.UNSUPPORTED_GRAPHEME, "Custom Text contains an unsupported Unicode sequence", { position: surrogateIndex, count: 1 });
  if (byteLength > PRACTICE_CUSTOM_TEXT_MAX_BYTES || graphemeCount > PRACTICE_CUSTOM_TEXT_MAX_GRAPHEMES) throw customTextError(PRACTICE_CUSTOM_TEXT_ERROR_CODES.TOO_LARGE, "Custom Text exceeds the local item limit", { byteLength, graphemeCount });
  return Object.freeze({ sourceText, byteLength, graphemeCount });
}
export function validatePracticeCustomTextRecord(record) {
  const errors = []; if (!record || typeof record !== "object" || Array.isArray(record)) return { valid: false, errors: [{ path: "record", code: "INVALID_TYPE" }] };
  if (typeof record.customTextId !== "string" || !record.customTextId) errors.push({ path: "customTextId", code: "INVALID_ID" }); if (typeof record.profileId !== "string" || !record.profileId) errors.push({ path: "profileId", code: "INVALID_ID" });
  if (record.recordVersion !== PRACTICE_RECORD_VERSIONS.customText) errors.push({ path: "recordVersion", code: "INVALID_VERSION" }); if (!Number.isInteger(record.revision) || record.revision < 1) errors.push({ path: "revision", code: "INVALID_REVISION" });
  if (typeof record.title !== "string" || !record.title || record.title.length > PRACTICE_CUSTOM_TEXT_MAX_TITLE_LENGTH) errors.push({ path: "title", code: "INVALID_TITLE" }); if (typeof record.sourceText !== "string") errors.push({ path: "sourceText", code: "INVALID_SOURCE" });
  if (!isPracticeCustomTextSha256(record.sourceHash)) errors.push({ path: "sourceHash", code: "INVALID_HASH" }); if (typeof record.dataLocale !== "string" || !record.dataLocale.trim() || record.dataLocale.length > 64) errors.push({ path: "dataLocale", code: "INVALID_LOCALE" });
  if (!Number.isInteger(record.sourceByteLength) || record.sourceByteLength < 0 || record.sourceByteLength > PRACTICE_CUSTOM_TEXT_MAX_BYTES) errors.push({ path: "sourceByteLength", code: "INVALID_SIZE" }); if (!Number.isInteger(record.sourceGraphemeCount) || record.sourceGraphemeCount < 0 || record.sourceGraphemeCount > PRACTICE_CUSTOM_TEXT_MAX_GRAPHEMES) errors.push({ path: "sourceGraphemeCount", code: "INVALID_SIZE" });
  if (record.typingProjectionVersion !== PRACTICE_CUSTOM_TEXT_PROJECTION_VERSION) errors.push({ path: "typingProjectionVersion", code: "INVALID_VERSION" }); for (const key of ["createdAt", "updatedAt"]) if (!Number.isFinite(Date.parse(record[key] ?? ""))) errors.push({ path: key, code: "INVALID_TIMESTAMP" }); if (record.lastPractisedAt != null && !Number.isFinite(Date.parse(record.lastPractisedAt))) errors.push({ path: "lastPractisedAt", code: "INVALID_TIMESTAMP" });
  return { valid: errors.length === 0, errors };
}
