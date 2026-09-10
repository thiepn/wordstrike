import { createPracticeReferenceFrequencyProvider } from "./practiceReferenceFrequency.js";
import { extractPracticeTextDifficultyFeatures } from "./practiceTextDifficultyFeatures.js";
import { scorePracticeTextTypability } from "./practiceTypabilityModel.js";
import { PRACTICE_TYPABILITY_RUNTIME_ARTIFACTS } from "./generated/practiceTypabilityRuntimeData.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const textEncoder = new TextEncoder();
async function sha256(value) {
  if (!globalThis.crypto?.subtle?.digest) throw Object.assign(new Error("Cryptographic integrity verification is unavailable"), { code: "PRACTICE_SUSTAINED_CRYPTO_UNAVAILABLE" });
  const digest = await globalThis.crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return `sha256-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
async function loadText(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response?.ok) throw Object.assign(new Error(`PL29 asset unavailable: ${url}`), { code: "PRACTICE_SUSTAINED_ASSET_UNAVAILABLE" });
  return response.text();
}
async function loadJson(fetchImpl, url) { return JSON.parse(await loadText(fetchImpl, url)); }

export async function loadPracticeSustainedFormSet({ fetchImpl = globalThis.fetch, baseUrl = "data/practice", folder, formSetId, expectedPartition, minimumReadyForms } = {}) {
  if (typeof fetchImpl !== "function" || !folder || !formSetId) throw new TypeError("Sustained form loader requires fetch, folder and formSetId");
  const prefix = `${baseUrl}/${folder}/en-v1`;
  const [manifestText, formsText, modelManifest, provenanceRegistry] = await Promise.all([
    loadText(fetchImpl, `${prefix}/${formSetId}.manifest.json`),
    loadText(fetchImpl, `${prefix}/${formSetId}.forms.json`),
    loadJson(fetchImpl, `${baseUrl}/models/en-v1/manifest.json`),
    loadJson(fetchImpl, `${baseUrl}/provenance/sources.json`),
  ]);
  const manifest = JSON.parse(manifestText); const artifact = JSON.parse(formsText);
  if (manifest.formSetId !== formSetId || artifact.formSetId !== formSetId || manifest.status !== "ready" || artifact.status !== "ready") throw Object.assign(new Error("PL29 form set is not ready"), { code: "PRACTICE_SUSTAINED_FORMS_NOT_READY" });
  if (manifest.partition !== expectedPartition || artifact.partition !== expectedPartition) throw Object.assign(new Error("PL29 form partition mismatch"), { code: "PRACTICE_SUSTAINED_PARTITION_MISMATCH" });
  if ((manifest.readyFormCount ?? 0) < minimumReadyForms) throw Object.assign(new Error("PL29 ready-form minimum is not met"), { code: "PRACTICE_SUSTAINED_FORMS_NOT_READY" });
  if (await sha256(formsText) !== manifest.formsChecksum) throw Object.assign(new Error("PL29 form artifact checksum mismatch"), { code: "PRACTICE_SUSTAINED_FORMS_STALE" });
  const bindingPairs = [
    ["corpusId", modelManifest.corpusId], ["corpusVersion", modelManifest.corpusVersion], ["corpusChecksum", modelManifest.corpusChecksum],
    ["indexSchemaVersion", modelManifest.indexSchemaVersion], ["indexChecksum", modelManifest.indexChecksum],
    ["typabilityModelVersion", modelManifest.modelVersion], ["typabilityFeatureVersion", modelManifest.featureVersion], ["typabilityReferenceVersion", modelManifest.referenceVersion], ["typabilityReferenceChecksum", modelManifest.referenceChecksum],
    ["frequencyReferenceVersion", modelManifest.frequencyReferenceVersion], ["frequencyReferenceId", modelManifest.frequencyReferenceId], ["frequencyReferenceChecksum", modelManifest.frequencyReferenceChecksum],
  ];
  if (bindingPairs.some(([key, value]) => manifest.bindings?.[key] !== value)) throw Object.assign(new Error("PL29 form bindings are stale"), { code: "PRACTICE_SUSTAINED_BINDING_STALE" });
  const provenance = provenanceRegistry.sources?.find((entry) => entry.sourceId === manifest.source?.sourceId);
  if (!provenance || provenance.usageApproval !== "practice-display-approved" || provenance.sourceChecksum !== manifest.source?.sourceChecksum || !provenance.snapshotPath) throw Object.assign(new Error("PL29 source provenance is not display-approved"), { code: "PRACTICE_SUSTAINED_PROVENANCE_REJECTED" });
  const sourceText = await loadText(fetchImpl, `${baseUrl}/${provenance.snapshotPath}`);
  if (await sha256(sourceText) !== manifest.source.sourceChecksum) throw Object.assign(new Error("PL29 source checksum mismatch"), { code: "PRACTICE_SUSTAINED_SOURCE_STALE" });
  const readyIds = new Set((manifest.forms ?? []).filter((entry) => entry.ready).map((entry) => entry.formId));
  const forms = [];
  for (const form of artifact.forms ?? []) {
    if (!readyIds.has(form.formId)) continue;
    if (form.partition !== expectedPartition || form.reviewStatus !== "approved" || await sha256(form.text) !== form.formHash) throw Object.assign(new Error("PL29 form integrity rejected"), { code: "PRACTICE_SUSTAINED_FORM_INTEGRITY" });
    forms.push(form);
  }
  if (forms.length < minimumReadyForms) throw Object.assign(new Error("PL29 ready forms failed runtime integrity"), { code: "PRACTICE_SUSTAINED_FORMS_NOT_READY" });
  return freezeDeep({ manifest, artifact: { ...artifact, forms }, forms });
}

export async function createPracticeSustainedTypabilityScorer({ fetchImpl = globalThis.fetch, baseUrl = "data/practice" } = {}) {
  const frequency = await loadJson(fetchImpl, `${baseUrl}/provenance/frequency/en-v1.frequency.json`);
  const reference = PRACTICE_TYPABILITY_RUNTIME_ARTIFACTS?.en?.reference;
  if (!reference || reference.frequencyReferenceChecksum !== frequency.checksum) throw Object.assign(new Error("PL29 typability reference is stale"), { code: "PRACTICE_SUSTAINED_BINDING_STALE" });
  const frequencyProvider = createPracticeReferenceFrequencyProvider(frequency);
  return Object.freeze({
    score(text) {
      const features = extractPracticeTextDifficultyFeatures({ text, language: "en", frequencyProvider });
      return scorePracticeTextTypability({ features, reference, language: "en" });
    },
  });
}
