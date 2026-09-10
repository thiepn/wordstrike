import {
  canonicalizePracticeSpecialDomainAnnotations,
  validatePracticeSpecialDomainAnnotations,
} from "./practiceSpecialDomainAnnotations.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const encoder = new TextEncoder();

export async function sha256PracticeSpecialDomain(value) {
  if (!globalThis.crypto?.subtle?.digest) throw Object.assign(new Error("Cryptographic integrity verification is unavailable"), { code: "PRACTICE_SPECIAL_DOMAIN_CRYPTO_UNAVAILABLE" });
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(value));
  return `sha256-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
async function loadText(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response?.ok) throw Object.assign(new Error(`PL30 asset unavailable: ${url}`), { code: "PRACTICE_SPECIAL_DOMAIN_ASSET_UNAVAILABLE" });
  return response.text();
}
async function loadJson(fetchImpl, url) { return JSON.parse(await loadText(fetchImpl, url)); }
const canonicalJson = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());

export async function hashPracticeSpecialDomainAnnotations(annotations) {
  const canonical = canonicalizePracticeSpecialDomainAnnotations(annotations);
  return sha256PracticeSpecialDomain(JSON.stringify(canonical));
}

export async function loadPracticeSpecialDomainFormSet({
  fetchImpl = globalThis.fetch,
  baseUrl = "data/practice",
  folder,
  formSetId,
  expectedPartition,
  minimumReadyForms,
  requiredDomain,
} = {}) {
  if (typeof fetchImpl !== "function" || !folder || !formSetId || !requiredDomain) throw new TypeError("PL30 form loader requires fetch, folder, formSetId and domain");
  const prefix = `${baseUrl}/${folder}/en-v1`;
  const [manifestText, formsText, modelManifest, provenanceRegistry] = await Promise.all([
    loadText(fetchImpl, `${prefix}/${formSetId}.manifest.json`),
    loadText(fetchImpl, `${prefix}/${formSetId}.forms.json`),
    loadJson(fetchImpl, `${baseUrl}/models/en-v1/manifest.json`),
    loadJson(fetchImpl, `${baseUrl}/provenance/sources.json`),
  ]);
  const manifest = JSON.parse(manifestText);
  const artifact = JSON.parse(formsText);
  if (manifest.formSetId !== formSetId || artifact.formSetId !== formSetId || manifest.status !== "ready" || artifact.status !== "ready") throw Object.assign(new Error("PL30 form set is not ready"), { code: "PRACTICE_SPECIAL_DOMAIN_FORMS_NOT_READY" });
  if (manifest.domain !== requiredDomain || artifact.domain !== requiredDomain) throw Object.assign(new Error("PL30 form domain mismatch"), { code: "PRACTICE_SPECIAL_DOMAIN_DOMAIN_MISMATCH" });
  if (manifest.partition !== expectedPartition || artifact.partition !== expectedPartition) throw Object.assign(new Error("PL30 form partition mismatch"), { code: "PRACTICE_SPECIAL_DOMAIN_PARTITION_MISMATCH" });
  if ((manifest.readyFormCount ?? 0) < minimumReadyForms) throw Object.assign(new Error("PL30 ready-form minimum is not met"), { code: "PRACTICE_SPECIAL_DOMAIN_FORMS_NOT_READY" });
  if (await sha256PracticeSpecialDomain(formsText) !== manifest.formsChecksum) throw Object.assign(new Error("PL30 form artifact checksum mismatch"), { code: "PRACTICE_SPECIAL_DOMAIN_FORMS_STALE" });

  const bindings = [
    ["corpusId", modelManifest.corpusId], ["corpusVersion", modelManifest.corpusVersion], ["corpusChecksum", modelManifest.corpusChecksum],
    ["indexSchemaVersion", modelManifest.indexSchemaVersion], ["indexChecksum", modelManifest.indexChecksum],
    ["typabilityModelVersion", modelManifest.modelVersion], ["typabilityFeatureVersion", modelManifest.featureVersion],
    ["typabilityReferenceVersion", modelManifest.referenceVersion], ["typabilityReferenceChecksum", modelManifest.referenceChecksum],
    ["frequencyReferenceVersion", modelManifest.frequencyReferenceVersion], ["frequencyReferenceId", modelManifest.frequencyReferenceId],
    ["frequencyReferenceChecksum", modelManifest.frequencyReferenceChecksum],
  ];
  if (bindings.some(([key, value]) => manifest.bindings?.[key] !== value)) throw Object.assign(new Error("PL30 form bindings are stale"), { code: "PRACTICE_SPECIAL_DOMAIN_BINDING_STALE" });

  const provenance = provenanceRegistry.sources?.find((entry) => entry.sourceId === manifest.source?.sourceId);
  if (!provenance || provenance.usageApproval !== "practice-display-approved" || provenance.sourceChecksum !== manifest.source?.sourceChecksum || !provenance.snapshotPath) throw Object.assign(new Error("PL30 source provenance rejected"), { code: "PRACTICE_SPECIAL_DOMAIN_PROVENANCE_REJECTED" });
  const sourceText = await loadText(fetchImpl, `${baseUrl}/${provenance.snapshotPath}`);
  if (await sha256PracticeSpecialDomain(sourceText) !== manifest.source.sourceChecksum) throw Object.assign(new Error("PL30 source checksum mismatch"), { code: "PRACTICE_SPECIAL_DOMAIN_SOURCE_STALE" });

  const readyIds = new Set((manifest.forms ?? []).filter((entry) => entry.ready).map((entry) => entry.formId));
  const forms = [];
  for (const form of artifact.forms ?? []) {
    if (!readyIds.has(form.formId)) continue;
    const graphemeCount = Array.from(form.text ?? "").length;
    if (form.partition !== expectedPartition || form.reviewStatus !== "approved") throw Object.assign(new Error("PL30 form review/partition rejected"), { code: "PRACTICE_SPECIAL_DOMAIN_FORM_INTEGRITY" });
    if (await sha256PracticeSpecialDomain(form.text) !== form.formHash) throw Object.assign(new Error("PL30 form text hash mismatch"), { code: "PRACTICE_SPECIAL_DOMAIN_FORM_INTEGRITY" });
    const validation = validatePracticeSpecialDomainAnnotations({ annotations: form.annotations, domain: requiredDomain, graphemeCount });
    if (!validation.valid || form.annotations.formHash !== form.formHash) throw Object.assign(new Error("PL30 annotation structure rejected"), { code: "PRACTICE_SPECIAL_DOMAIN_ANNOTATION_INVALID" });
    if (await hashPracticeSpecialDomainAnnotations(form.annotations) !== form.annotations.annotationHash) throw Object.assign(new Error("PL30 annotation hash mismatch"), { code: "PRACTICE_SPECIAL_DOMAIN_ANNOTATION_STALE" });
    forms.push(form);
  }
  if (forms.length < minimumReadyForms) throw Object.assign(new Error("PL30 ready forms failed runtime integrity"), { code: "PRACTICE_SPECIAL_DOMAIN_FORMS_NOT_READY" });
  return freezeDeep({ manifest, artifact: { ...artifact, forms }, forms });
}
