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
import { createPracticeSourceIndex, getPracticeSourceUsageEligibility, resolvePracticeCorpusSource } from "./practiceCorpusProvenance.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const countBands = (words) => Object.fromEntries(PRACTICE_COMMON_WORD_BANDS.map((band) => [band, words.filter((word) => word.band === band).length]));
const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/;
const canonicalWordId = (lexicalKey) => `word:${lexicalKey}`;
const REQUIRED_BINDING_VERSION_KEYS = Object.freeze([
  "corpusVersion",
  "indexSchemaVersion",
  "indexGeneratorVersion",
  "typabilityModelVersion",
  "typabilityReferenceVersion",
  "frequencyReferenceVersion",
  "builderVersion",
  "sourceRegistryVersion",
]);
const REQUIRED_BINDING_CHECKSUM_KEYS = Object.freeze([
  "corpusChecksum",
  "indexChecksum",
  "typabilityReferenceChecksum",
  "frequencyReferenceChecksum",
  "sourceRegistryChecksum",
  "statisticalSourceChecksum",
  "sourceSnapshotChecksum",
]);

function validateBindingShape(bindings, { requireCommonReference = false } = {}) {
  const reasons = [];
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) return ["bindings-missing"];
  if (typeof bindings.corpusId !== "string" || !bindings.corpusId) reasons.push("binding-corpus-id");
  if (typeof bindings.statisticalSourceId !== "string" || !bindings.statisticalSourceId) reasons.push("binding-statistical-source-id");
  for (const key of REQUIRED_BINDING_VERSION_KEYS) if (!Number.isInteger(bindings[key]) || bindings[key] < 1) reasons.push(`binding-${key}`);
  for (const key of REQUIRED_BINDING_CHECKSUM_KEYS) if (!SHA256_PATTERN.test(bindings[key] ?? "")) reasons.push(`binding-${key}`);
  if (requireCommonReference) {
    if (bindings.commonWordReferenceId !== PRACTICE_COMMON_WORD_REFERENCE_ID) reasons.push("binding-common-reference-id");
    if (bindings.commonWordReferenceVersion !== PRACTICE_COMMON_WORD_REFERENCE_VERSION) reasons.push("binding-common-reference-version");
    if (!SHA256_PATTERN.test(bindings.commonWordReferenceChecksum ?? "")) reasons.push("binding-common-reference-checksum");
    if (!SHA256_PATTERN.test(bindings.sourceChecksum ?? "")) reasons.push("binding-source-checksum");
    if (typeof bindings.displaySourceId !== "string" || !bindings.displaySourceId) reasons.push("binding-display-source-id");
    if (!SHA256_PATTERN.test(bindings.displaySourceChecksum ?? "")) reasons.push("binding-display-source-checksum");
    if (!SHA256_PATTERN.test(bindings.displaySourceRegistryChecksum ?? "")) reasons.push("binding-display-source-registry-checksum");
  }
  return reasons;
}

function validateCanonicalWordIdentity(word, reasons, prefix = "word") {
  if (!isPracticeCommonWordEnglishV1LexicalKey(word?.lexicalKey)) reasons.push(`${prefix}-invalid-lexical-key`);
  if (word?.wordId !== canonicalWordId(word?.lexicalKey)) reasons.push(`${prefix}-invalid-word-id`);
}

export function validatePracticeCommonWordReference(reference) {
  const reasons = [];
  if (reference?.referenceId !== PRACTICE_COMMON_WORD_REFERENCE_ID || reference?.referenceVersion !== PRACTICE_COMMON_WORD_REFERENCE_VERSION) reasons.push("reference-identity");
  if (reference?.language !== "en") reasons.push("reference-language");
  if (!Array.isArray(reference?.words) || reference.words.length !== PRACTICE_COMMON_WORD_REFERENCE_SIZE) reasons.push("reference-size");
  const lexical = new Set(); const wordIds = new Set(); const ranks = new Set();
  for (const word of reference?.words ?? []) {
    validateCanonicalWordIdentity(word, reasons, "reference-word");
    if (!Number.isInteger(word?.rank) || word.rank < 1 || word.rank > PRACTICE_COMMON_WORD_REFERENCE_SIZE) reasons.push("invalid-rank");
    if (lexical.has(word?.lexicalKey)) reasons.push("duplicate-lexical-key");
    if (wordIds.has(word?.wordId)) reasons.push("duplicate-word-id");
    if (ranks.has(word?.rank)) reasons.push("duplicate-rank");
    lexical.add(word?.lexicalKey); wordIds.add(word?.wordId); ranks.add(word?.rank);
    if (word?.band !== practiceCommonWordBandForRank(word?.rank)) reasons.push("invalid-band");
  }
  for (let rank = 1; rank <= PRACTICE_COMMON_WORD_REFERENCE_SIZE; rank += 1) if (!ranks.has(rank)) reasons.push("rank-sequence");
  for (const band of PRACTICE_COMMON_WORD_BANDS) if (countBands(reference?.words ?? [])[band] !== PRACTICE_COMMON_WORD_BAND_RANGES[band].size) reasons.push(`band-size-${band}`);
  if (reference?.rankingSource?.sourceType !== "statistical-reference" || reference?.rankingSource?.usageApproval !== "statistical-only") reasons.push("ranking-provenance");
  if (reference?.rankingSource?.sourceId !== reference?.bindings?.statisticalSourceId) reasons.push("ranking-source-binding");
  if (reference?.rankingSource?.sourceChecksum !== reference?.bindings?.statisticalSourceChecksum) reasons.push("ranking-source-checksum-binding");
  if (!SHA256_PATTERN.test(reference?.checksum ?? "")) reasons.push("reference-checksum");
  return Object.freeze({ valid: reasons.length === 0, reasons: [...new Set(reasons)] });
}

function validateDisplayBank(manifest, { id, partition, minimums }) {
  const reasons = [];
  if (manifest?.bankId !== id || manifest?.bankVersion !== PRACTICE_COMMON_WORD_BANK_VERSION || manifest?.referenceId !== PRACTICE_COMMON_WORD_REFERENCE_ID || manifest?.referenceVersion !== PRACTICE_COMMON_WORD_REFERENCE_VERSION) reasons.push("bank-identity");
  if (manifest?.partition !== partition) reasons.push("wrong-partition");
  if (manifest?.displayProvenance?.partition !== partition) reasons.push("provenance-partition");
  if (manifest?.displayProvenance?.usageApproval !== "practice-display-approved") reasons.push("display-not-approved");
  if (manifest?.displayProvenance?.sourceType === "statistical-reference") reasons.push("statistical-only-display");
  if (manifest?.displayProvenance?.sourceId !== manifest?.bindings?.displaySourceId) reasons.push("display-source-binding");
  if (manifest?.displayProvenance?.sourceChecksum !== manifest?.bindings?.displaySourceChecksum) reasons.push("display-source-checksum-binding");
  if (manifest?.displayProvenance?.sourceRegistryChecksum !== manifest?.bindings?.displaySourceRegistryChecksum) reasons.push("display-source-registry-binding");
  const words = Array.isArray(manifest?.words) ? manifest.words : [];
  const seen = new Set(); const seenIds = new Set();
  for (const word of words) {
    validateCanonicalWordIdentity(word, reasons, "display-word");
    if (!PRACTICE_COMMON_WORD_BANDS.includes(word?.band)) reasons.push("invalid-word-band");
    if (seen.has(word?.lexicalKey)) reasons.push("duplicate-word");
    if (seenIds.has(word?.wordId)) reasons.push("duplicate-word-id");
    seen.add(word?.lexicalKey); seenIds.add(word?.wordId);
  }
  const counts = countBands(words);
  for (const band of PRACTICE_COMMON_WORD_BANDS) if (counts[band] < minimums[band]) reasons.push(`coverage-${band}`);
  if (!SHA256_PATTERN.test(manifest?.checksum ?? "")) reasons.push("bank-checksum");
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
    const ids = new Set(form.words?.map((word) => word.wordId));
    if (keys.size !== PRACTICE_COMMON_WORD_CHECK_WORD_COUNT || ids.size !== PRACTICE_COMMON_WORD_CHECK_WORD_COUNT) reasons.push("form-duplicate");
    for (const word of form.words ?? []) validateCanonicalWordIdentity(word, reasons, "form-word");
    if (!SHA256_PATTERN.test(form?.formHash ?? "")) reasons.push("form-hash");
    if (!SHA256_PATTERN.test(form?.textHash ?? "")) reasons.push("text-hash");
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

function withoutChecksum(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy = { ...value };
  delete copy.checksum;
  return copy;
}

async function sha256(value, cryptoObject = globalThis.crypto) {
  if (!cryptoObject?.subtle?.digest) return null;
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
  const digest = await cryptoObject.subtle.digest("SHA-256", bytes);
  return `sha256-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function referenceWordMap(reference) {
  return new Map((reference?.words ?? []).map((word) => [word.lexicalKey, word]));
}

function validateWordsAgainstReference(words, referenceWords, prefix) {
  const reasons = [];
  for (const word of words ?? []) {
    const canonical = referenceWords.get(word?.lexicalKey);
    if (!canonical) reasons.push(`${prefix}-unknown-word`);
    else {
      if (canonical.wordId !== word.wordId) reasons.push(`${prefix}-word-id-mismatch`);
      if (canonical.rank !== word.rank || canonical.band !== word.band) reasons.push(`${prefix}-rank-band-mismatch`);
    }
  }
  return reasons;
}

function sharedBindingReasons(bindings, referenceBindings, prefix) {
  const reasons = [];
  const keys = ["corpusId", "statisticalSourceId", ...REQUIRED_BINDING_VERSION_KEYS, ...REQUIRED_BINDING_CHECKSUM_KEYS];
  for (const key of keys) if (bindings?.[key] !== referenceBindings?.[key]) reasons.push(`${prefix}-binding-${key}`);
  return reasons;
}

function validateSourceSnapshotShape(sourceSnapshot, reference, practiceBank, checkFormSet) {
  const referenceReasons = []; const practiceReasons = []; const checkReasons = [];
  if (sourceSnapshot?.language !== "en" || sourceSnapshot?.schemaVersion !== 1) referenceReasons.push("source-snapshot-identity");
  if (sourceSnapshot?.sourceRegistryVersion !== reference?.bindings?.sourceRegistryVersion) referenceReasons.push("source-snapshot-registry-version");
  if (sourceSnapshot?.sourceRegistryChecksum !== reference?.bindings?.sourceRegistryChecksum) referenceReasons.push("source-snapshot-registry-checksum");
  if (sourceSnapshot?.statisticalSourceId !== reference?.bindings?.statisticalSourceId || sourceSnapshot?.statisticalSourceChecksum !== reference?.bindings?.statisticalSourceChecksum) referenceReasons.push("source-snapshot-statistical-source");
  if (sourceSnapshot?.trainingSourceId !== practiceBank?.bindings?.displaySourceId || sourceSnapshot?.trainingSourceChecksum !== practiceBank?.bindings?.displaySourceChecksum) practiceReasons.push("source-snapshot-training-source");
  if (sourceSnapshot?.trainingSourceRegistryChecksum !== practiceBank?.bindings?.displaySourceRegistryChecksum) practiceReasons.push("source-snapshot-training-registry-checksum");
  if (sourceSnapshot?.diagnosticSourceId !== checkFormSet?.bindings?.displaySourceId || sourceSnapshot?.diagnosticSourceChecksum !== checkFormSet?.bindings?.displaySourceChecksum) checkReasons.push("source-snapshot-diagnostic-source");
  if (sourceSnapshot?.diagnosticSourceRegistryChecksum !== checkFormSet?.bindings?.displaySourceRegistryChecksum) checkReasons.push("source-snapshot-diagnostic-registry-checksum");
  if (!Array.isArray(sourceSnapshot?.words) || sourceSnapshot.words.length !== PRACTICE_COMMON_WORD_REFERENCE_SIZE) referenceReasons.push("source-snapshot-size");
  const referenceWords = referenceWordMap(reference);
  const seen = new Set();
  for (const word of sourceSnapshot?.words ?? []) {
    if (word?.wordId !== canonicalWordId(word?.lexicalKey)) referenceReasons.push("source-snapshot-word-id");
    if (seen.has(word?.lexicalKey)) referenceReasons.push("source-snapshot-duplicate");
    seen.add(word?.lexicalKey);
    const canonical = referenceWords.get(word?.lexicalKey);
    if (!canonical || canonical.wordId !== word.wordId || canonical.sourceRank !== word.sourceRank) referenceReasons.push("source-snapshot-reference-mismatch");
  }
  if (!SHA256_PATTERN.test(sourceSnapshot?.checksum ?? "")) referenceReasons.push("source-snapshot-checksum");
  return { referenceReasons, practiceReasons, checkReasons };
}

function sourceRegistryReasons({ sourceRegistry, reference, practiceBank, checkFormSet }) {
  const referenceReasons = []; const practiceReasons = []; const checkReasons = [];
  let index;
  try { index = createPracticeSourceIndex(sourceRegistry); }
  catch { return { referenceReasons: ["source-registry-invalid"], practiceReasons: ["source-registry-invalid"], checkReasons: ["source-registry-invalid"] }; }
  if (sourceRegistry?.registryVersion !== reference?.bindings?.sourceRegistryVersion) referenceReasons.push("source-registry-version");
  const statistical = resolvePracticeCorpusSource(reference?.bindings?.statisticalSourceId, index);
  const statisticalEligibility = statistical ? getPracticeSourceUsageEligibility(statistical, "statistical-reference") : { allowed: false };
  if (!statistical || !statisticalEligibility.allowed) referenceReasons.push("statistical-source-not-approved");
  else if (statistical.sourceChecksum !== reference?.bindings?.statisticalSourceChecksum || statistical.sourceChecksum !== reference?.rankingSource?.sourceChecksum) referenceReasons.push("statistical-source-checksum");

  const trainingId = practiceBank?.bindings?.displaySourceId;
  const training = resolvePracticeCorpusSource(trainingId, index);
  const trainingEligibility = training ? getPracticeSourceUsageEligibility(training, "production-display") : { allowed: false };
  if (!training || !trainingEligibility.allowed) practiceReasons.push("display-source-not-approved");
  else if (training.sourceChecksum !== practiceBank?.bindings?.displaySourceChecksum || training.sourceChecksum !== practiceBank?.displayProvenance?.sourceChecksum) practiceReasons.push("display-source-checksum");
  if (practiceBank?.displayProvenance?.sourceId !== trainingId) practiceReasons.push("display-source-id");

  const diagnosticId = checkFormSet?.bindings?.displaySourceId;
  const diagnostic = resolvePracticeCorpusSource(diagnosticId, index);
  const diagnosticEligibility = diagnostic ? getPracticeSourceUsageEligibility(diagnostic, "production-display") : { allowed: false };
  if (!diagnostic || !diagnosticEligibility.allowed) checkReasons.push("display-source-not-approved");
  else if (diagnostic.sourceChecksum !== checkFormSet?.bindings?.displaySourceChecksum || diagnostic.sourceChecksum !== checkFormSet?.displayProvenance?.sourceChecksum) checkReasons.push("display-source-checksum");
  if (checkFormSet?.displayProvenance?.sourceId !== diagnosticId) checkReasons.push("display-source-id");
  if (trainingId && diagnosticId && trainingId === diagnosticId) { practiceReasons.push("display-source-not-independent"); checkReasons.push("display-source-not-independent"); }

  return { referenceReasons, practiceReasons, checkReasons, index, statistical, training, diagnostic };
}

export async function verifyPracticeCommonWordArtifactIntegrity({
  reference,
  practiceBank,
  checkFormSet,
  sourceRegistry,
  sourceSnapshot,
  cryptoObject = globalThis.crypto,
} = {}) {
  const referenceReasons = [...validateBindingShape(reference?.bindings), ...validatePracticeCommonWordReference(reference).reasons];
  const practiceReasons = [...validateBindingShape(practiceBank?.bindings, { requireCommonReference: true }), ...validatePracticeCommonWordPracticeBank(practiceBank).reasons];
  const checkReasons = [...validateBindingShape(checkFormSet?.bindings, { requireCommonReference: true }), ...validatePracticeCommonWordCheckFormSet(checkFormSet).reasons];
  const registry = sourceRegistryReasons({ sourceRegistry, reference, practiceBank, checkFormSet });
  referenceReasons.push(...registry.referenceReasons);
  practiceReasons.push(...registry.practiceReasons);
  checkReasons.push(...registry.checkReasons);
  const cryptoAvailable = Boolean(cryptoObject?.subtle?.digest);
  if (!cryptoAvailable) {
    referenceReasons.push("checksum-verification-unavailable");
    practiceReasons.push("checksum-verification-unavailable");
    checkReasons.push("checksum-verification-unavailable");
  } else {
    const [referenceChecksum, practiceChecksum, checkChecksum, snapshotChecksum, statisticalRegistryChecksum, trainingRegistryChecksum, diagnosticRegistryChecksum] = await Promise.all([
      sha256(withoutChecksum(reference), cryptoObject),
      sha256(withoutChecksum(practiceBank), cryptoObject),
      sha256(withoutChecksum(checkFormSet), cryptoObject),
      sha256(withoutChecksum(sourceSnapshot), cryptoObject),
      registry.statistical ? sha256({ registryVersion: sourceRegistry?.registryVersion, statisticalSource: registry.statistical }, cryptoObject) : null,
      registry.training ? sha256({ registryVersion: sourceRegistry?.registryVersion, displaySource: registry.training }, cryptoObject) : null,
      registry.diagnostic ? sha256({ registryVersion: sourceRegistry?.registryVersion, displaySource: registry.diagnostic }, cryptoObject) : null,
    ]);
    if (referenceChecksum !== reference?.checksum) referenceReasons.push("checksum-mismatch");
    if (practiceChecksum !== practiceBank?.checksum) practiceReasons.push("checksum-mismatch");
    if (checkChecksum !== checkFormSet?.checksum) checkReasons.push("checksum-mismatch");
    if (snapshotChecksum !== sourceSnapshot?.checksum || snapshotChecksum !== reference?.bindings?.sourceSnapshotChecksum) referenceReasons.push("source-snapshot-checksum-mismatch");
    if (statisticalRegistryChecksum !== reference?.bindings?.sourceRegistryChecksum) referenceReasons.push("source-registry-checksum-mismatch");
    if (statisticalRegistryChecksum !== practiceBank?.bindings?.sourceRegistryChecksum) practiceReasons.push("source-registry-checksum-mismatch");
    if (statisticalRegistryChecksum !== checkFormSet?.bindings?.sourceRegistryChecksum) checkReasons.push("source-registry-checksum-mismatch");
    if (trainingRegistryChecksum !== practiceBank?.bindings?.displaySourceRegistryChecksum || trainingRegistryChecksum !== practiceBank?.displayProvenance?.sourceRegistryChecksum) practiceReasons.push("display-source-registry-checksum-mismatch");
    if (diagnosticRegistryChecksum !== checkFormSet?.bindings?.displaySourceRegistryChecksum || diagnosticRegistryChecksum !== checkFormSet?.displayProvenance?.sourceRegistryChecksum) checkReasons.push("display-source-registry-checksum-mismatch");

    const readyForms = (checkFormSet?.forms ?? []).filter((form) => form?.status === "ready");
    for (const form of readyForms) {
      const exactOrder = (form.words ?? []).map((word) => ({ wordId: word.wordId, lexicalKey: word.lexicalKey, rank: word.rank, band: word.band }));
      const formHash = await sha256({
        wordIds: exactOrder.map((word) => word.wordId),
        lexicalKeys: exactOrder.map((word) => word.lexicalKey),
        exactOrder,
        separator: form.separator ?? " ",
        formVersion: form.formVersion,
        referenceVersion: checkFormSet?.referenceVersion,
      }, cryptoObject);
      const textHash = await sha256((form.words ?? []).map((word) => word.lexicalKey).join(form.separator ?? " "), cryptoObject);
      if (formHash !== form.formHash) checkReasons.push("form-hash-mismatch");
      if (textHash !== form.textHash) checkReasons.push("text-hash-mismatch");
    }
  }

  const snapshotShape = validateSourceSnapshotShape(sourceSnapshot, reference, practiceBank, checkFormSet);
  referenceReasons.push(...snapshotShape.referenceReasons);
  practiceReasons.push(...snapshotShape.practiceReasons);
  checkReasons.push(...snapshotShape.checkReasons);
  const referenceWords = referenceWordMap(reference);
  practiceReasons.push(...sharedBindingReasons(practiceBank?.bindings, reference?.bindings, "reference"));
  checkReasons.push(...sharedBindingReasons(checkFormSet?.bindings, reference?.bindings, "reference"));
  if (practiceBank?.bindings?.commonWordReferenceId !== reference?.referenceId || practiceBank?.bindings?.commonWordReferenceVersion !== reference?.referenceVersion || practiceBank?.bindings?.commonWordReferenceChecksum !== reference?.checksum || practiceBank?.bindings?.sourceChecksum !== reference?.checksum) practiceReasons.push("common-reference-binding");
  if (checkFormSet?.bindings?.commonWordReferenceId !== reference?.referenceId || checkFormSet?.bindings?.commonWordReferenceVersion !== reference?.referenceVersion || checkFormSet?.bindings?.commonWordReferenceChecksum !== reference?.checksum || checkFormSet?.bindings?.sourceChecksum !== reference?.checksum) checkReasons.push("common-reference-binding");
  practiceReasons.push(...validateWordsAgainstReference(practiceBank?.words, referenceWords, "practice"));
  checkReasons.push(...validateWordsAgainstReference(checkFormSet?.diagnosticPool, referenceWords, "diagnostic-pool"));
  for (const form of checkFormSet?.forms ?? []) checkReasons.push(...validateWordsAgainstReference(form?.words, referenceWords, "form"));

  const pack = (reasons) => freezeDeep({ valid: reasons.length === 0, reasons: [...new Set(reasons)] });
  return freezeDeep({
    reference: pack(referenceReasons),
    practice: pack(practiceReasons),
    check: pack(checkReasons),
  });
}

async function loadJson(url, fetchImpl) {
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response?.ok) throw Object.assign(new Error(`Common Words artifact load failed: ${response?.status ?? "unknown"}`), { code: "COMMON_WORDS_ARTIFACT_LOAD_FAILED" });
  return response.json();
}

export async function loadPracticeCommonWordArtifacts({ fetchImpl = globalThis.fetch, cryptoObject = globalThis.crypto } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Common Words artifact loader requires fetch");
  const root = new URL("../../data/practice/common-words/en-v1/", import.meta.url);
  const sourceRegistryUrl = new URL("../../data/practice/provenance/sources.json", import.meta.url);
  const [reference, practiceBank, checkFormSet, sourceSnapshot, sourceRegistry] = await Promise.all([
    loadJson(new URL("WS-COMMON-EN-1.reference.json", root), fetchImpl),
    loadJson(new URL("WS-COMMON-PRACTICE-EN-1.manifest.json", root), fetchImpl),
    loadJson(new URL("WS-COMMON-CHECK-EN-1.manifest.json", root), fetchImpl),
    loadJson(new URL("WS-COMMON-SOURCE-EN-1.snapshot.json", root), fetchImpl),
    loadJson(sourceRegistryUrl, fetchImpl),
  ]);
  const integrity = await verifyPracticeCommonWordArtifactIntegrity({ reference, practiceBank, checkFormSet, sourceRegistry, sourceSnapshot, cryptoObject });
  return freezeDeep({ reference, practiceBank, checkFormSet, sourceRegistry, sourceSnapshot, integrity });
}