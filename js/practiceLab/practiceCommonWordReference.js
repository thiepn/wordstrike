import {
  PRACTICE_COMMON_WORD_REFERENCE_ID,
  PRACTICE_COMMON_WORD_REFERENCE_SIZE,
  PRACTICE_COMMON_WORD_REFERENCE_VERSION,
  PRACTICE_COMMON_WORD_BANK_VERSION,
  PRACTICE_COMMON_WORD_CHECK_FORM_SET_ID,
  PRACTICE_COMMON_WORD_PRACTICE_BANK_ID,
  PRACTICE_COMMON_WORD_BANDS,
  PRACTICE_COMMON_WORD_BAND_RANGES,
  PRACTICE_COMMON_WORD_PRACTICE_READY_MINIMUMS,
  PRACTICE_COMMON_WORD_CHECK_READY_MINIMUMS,
  PRACTICE_COMMON_WORD_CHECK_WORD_COUNT,
  PRACTICE_COMMON_WORD_CHECK_WORDS_PER_BAND,
  PRACTICE_COMMON_WORD_CHECK_MIN_READY_FORMS,
} from "./practiceCommonWordsConstants.js";
import { isPracticeCommonWordEnglishV1LexicalKey, practiceCommonWordBandForRank } from "./practiceCommonWordsPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const countBands = (words) => Object.fromEntries(PRACTICE_COMMON_WORD_BANDS.map((band) => [band, words.filter((word) => word.band === band).length]));

export function validatePracticeCommonWordReference(reference) {
  const reasons = [];
  if (reference?.referenceId !== PRACTICE_COMMON_WORD_REFERENCE_ID || reference?.referenceVersion !== PRACTICE_COMMON_WORD_REFERENCE_VERSION) reasons.push("reference-identity");
  if (reference?.language !== "en") reasons.push("reference-language");
  if (!Array.isArray(reference?.words) || reference.words.length !== PRACTICE_COMMON_WORD_REFERENCE_SIZE) reasons.push("reference-size");
  const lexical = new Set(); const ranks = new Set();
  for (const word of reference?.words ?? []) {
    if (!isPracticeCommonWordEnglishV1LexicalKey(word?.lexicalKey)) reasons.push("invalid-lexical-key");
    if (!Number.isInteger(word?.rank) || word.rank < 1 || word.rank > PRACTICE_COMMON_WORD_REFERENCE_SIZE) reasons.push("invalid-rank");
    if (lexical.has(word?.lexicalKey)) reasons.push("duplicate-lexical-key");
    if (ranks.has(word?.rank)) reasons.push("duplicate-rank");
    lexical.add(word?.lexicalKey); ranks.add(word?.rank);
    if (word?.band !== practiceCommonWordBandForRank(word?.rank)) reasons.push("invalid-band");
  }
  for (let rank = 1; rank <= PRACTICE_COMMON_WORD_REFERENCE_SIZE; rank += 1) if (!ranks.has(rank)) reasons.push("rank-sequence");
  for (const band of PRACTICE_COMMON_WORD_BANDS) if (countBands(reference?.words ?? [])[band] !== PRACTICE_COMMON_WORD_BAND_RANGES[band].size) reasons.push(`band-size-${band}`);
  if (reference?.rankingSource?.sourceType !== "statistical-reference" || reference?.rankingSource?.usageApproval !== "statistical-only") reasons.push("ranking-provenance");
  if (typeof reference?.checksum !== "string" || !reference.checksum.startsWith("sha256-")) reasons.push("reference-checksum");
  return Object.freeze({ valid: reasons.length === 0, reasons: [...new Set(reasons)] });
}

function validateDisplayBank(manifest, { id, partition, minimums }) {
  const reasons = [];
  if (manifest?.bankId !== id || manifest?.bankVersion !== PRACTICE_COMMON_WORD_BANK_VERSION || manifest?.referenceId !== PRACTICE_COMMON_WORD_REFERENCE_ID || manifest?.referenceVersion !== PRACTICE_COMMON_WORD_REFERENCE_VERSION) reasons.push("bank-identity");
  if (manifest?.partition !== partition) reasons.push("wrong-partition");
  if (manifest?.displayProvenance?.usageApproval !== "practice-display-approved") reasons.push("display-not-approved");
  if (manifest?.displayProvenance?.sourceType === "statistical-reference") reasons.push("statistical-only-display");
  const words = Array.isArray(manifest?.words) ? manifest.words : [];
  const seen = new Set();
  for (const word of words) {
    if (!isPracticeCommonWordEnglishV1LexicalKey(word?.lexicalKey) || !PRACTICE_COMMON_WORD_BANDS.includes(word?.band)) reasons.push("invalid-word");
    if (seen.has(word?.lexicalKey)) reasons.push("duplicate-word");
    seen.add(word?.lexicalKey);
  }
  const counts = countBands(words);
  for (const band of PRACTICE_COMMON_WORD_BANDS) if (counts[band] < minimums[band]) reasons.push(`coverage-${band}`);
  if (typeof manifest?.checksum !== "string" || !manifest.checksum.startsWith("sha256-")) reasons.push("bank-checksum");
  return Object.freeze({ valid: reasons.length === 0, reasons: [...new Set(reasons)], counts: Object.freeze(counts) });
}

export function validatePracticeCommonWordPracticeBank(manifest) {
  return validateDisplayBank(manifest, { id: PRACTICE_COMMON_WORD_PRACTICE_BANK_ID, partition: "training", minimums: PRACTICE_COMMON_WORD_PRACTICE_READY_MINIMUMS });
}

export function validatePracticeCommonWordCheckFormSet(manifest) {
  const base = validateDisplayBank({
    ...manifest,
    bankId: PRACTICE_COMMON_WORD_CHECK_FORM_SET_ID,
    bankVersion: PRACTICE_COMMON_WORD_BANK_VERSION,
    words: manifest?.diagnosticPool ?? [],
  }, { id: PRACTICE_COMMON_WORD_CHECK_FORM_SET_ID, partition: "diagnostic", minimums: PRACTICE_COMMON_WORD_CHECK_READY_MINIMUMS });
  const reasons = [...base.reasons];
  const readyForms = (manifest?.forms ?? []).filter((form) => form?.status === "ready");
  if (readyForms.length < PRACTICE_COMMON_WORD_CHECK_MIN_READY_FORMS) reasons.push("insufficient-ready-forms");
  for (const form of readyForms) {
    if (!Array.isArray(form.words) || form.words.length !== PRACTICE_COMMON_WORD_CHECK_WORD_COUNT) reasons.push("form-size");
    const keys = new Set(form.words?.map((word) => word.lexicalKey));
    if (keys.size !== PRACTICE_COMMON_WORD_CHECK_WORD_COUNT) reasons.push("form-duplicate");
    const counts = countBands(form.words ?? []);
    if (PRACTICE_COMMON_WORD_BANDS.some((band) => counts[band] !== PRACTICE_COMMON_WORD_CHECK_WORDS_PER_BAND)) reasons.push("form-band-balance");
    for (let offset = 0; offset < (form.words?.length ?? 0); offset += 20) {
      const block = form.words.slice(offset, offset + 20); const blockCounts = countBands(block);
      if (PRACTICE_COMMON_WORD_BANDS.some((band) => blockCounts[band] !== 5)) reasons.push("form-microblock-balance");
      let run = 1;
      for (let index = 1; index < block.length; index += 1) { run = block[index].band === block[index - 1].band ? run + 1 : 1; if (run > 2) reasons.push("form-band-run"); }
    }
  }
  return Object.freeze({ valid: reasons.length === 0, reasons: [...new Set(reasons)], readyFormCount: readyForms.length, counts: base.counts });
}

async function loadJson(url, fetchImpl) {
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response?.ok) throw Object.assign(new Error(`Common Words artifact load failed: ${response?.status ?? "unknown"}`), { code: "COMMON_WORDS_ARTIFACT_LOAD_FAILED" });
  return response.json();
}

export async function loadPracticeCommonWordArtifacts({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Common Words artifact loader requires fetch");
  const root = new URL("../../data/practice/common-words/en-v1/", import.meta.url);
  const [reference, practiceBank, checkFormSet] = await Promise.all([
    loadJson(new URL("WS-COMMON-EN-1.reference.json", root), fetchImpl),
    loadJson(new URL("WS-COMMON-PRACTICE-EN-1.manifest.json", root), fetchImpl),
    loadJson(new URL("WS-COMMON-CHECK-EN-1.manifest.json", root), fetchImpl),
  ]);
  return freezeDeep({ reference, practiceBank, checkFormSet });
}
