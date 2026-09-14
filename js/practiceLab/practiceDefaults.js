export * from "./practiceDefaultsLegacy.js";

import {
  createDefaultCustomText as createDefaultCustomTextLegacy,
  createDefaultSessionSummary as createDefaultSessionSummaryV17,
} from "./practiceDefaultsLegacy.js";
import { splitGraphemes } from "./practiceTextSegmentation.js";
import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { PRACTICE_CUSTOM_TEXT_PROJECTION_VERSION } from "./practiceCustomTextConstants.js";

export function createDefaultSessionSummary(options = {}) {
  const summary = createDefaultSessionSummaryV17(options);
  return {
    ...summary,
    evaluationSummary: summary.evaluationSummary ?? null,
    assessmentBinding: summary.assessmentBinding ?? null,
    coachBinding: summary.coachBinding ?? null,
  };
}

export function createDefaultCustomText(options = {}) {
  const legacy = createDefaultCustomTextLegacy(options);
  const sourceText = String(options.sourceText ?? options.text ?? legacy.text ?? "").replace(/\r\n?/g, "\n").normalize("NFC");
  const title = String(options.title ?? legacy.title ?? "Untitled text").normalize("NFC").trim() || "Untitled text";
  return {
    customTextId: options.customTextId ?? legacy.customTextId,
    profileId: options.profileId ?? legacy.profileId,
    recordVersion: PRACTICE_RECORD_VERSIONS.customText,
    revision: Number.isInteger(options.revision) && options.revision > 0 ? options.revision : 1,
    title,
    sourceText,
    sourceHash: options.sourceHash ?? "0".repeat(64),
    dataLocale: String(options.dataLocale ?? options.language ?? "und"),
    sourceByteLength: new TextEncoder().encode(sourceText).byteLength,
    sourceGraphemeCount: splitGraphemes(sourceText).length,
    typingProjectionVersion: PRACTICE_CUSTOM_TEXT_PROJECTION_VERSION,
    createdAt: options.createdAt ?? legacy.createdAt,
    updatedAt: options.updatedAt ?? legacy.updatedAt,
    lastPractisedAt: options.lastPractisedAt ?? null,
    ...(options.overrides ? JSON.parse(JSON.stringify(options.overrides)) : {}),
  };
}
