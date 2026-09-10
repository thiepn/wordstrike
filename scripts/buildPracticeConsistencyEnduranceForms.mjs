import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPracticeReferenceFrequencyProvider } from "../js/practiceLab/practiceReferenceFrequency.js";
import { createPracticeSegmenter } from "../js/practiceLab/practiceTextSegmentation.js";
import { extractPracticeTextDifficultyFeatures } from "../js/practiceLab/practiceTextDifficultyFeatures.js";
import { scorePracticeTextTypability } from "../js/practiceLab/practiceTypabilityModel.js";
import { PRACTICE_TYPABILITY_RUNTIME_ARTIFACTS } from "../js/practiceLab/generated/practiceTypabilityRuntimeData.js";
import { PRACTICE_CONSISTENCY_FORM_SCHEMA_VERSION, PRACTICE_CONSISTENCY_FORM_SET_ID, PRACTICE_CONSISTENCY_FORM_SET_VERSION, PRACTICE_CONSISTENCY_FORM_GENERATOR_VERSION } from "../js/practiceLab/practiceConsistencyConstants.js";
import { PRACTICE_CONSISTENCY_POLICY_V1 } from "../js/practiceLab/practiceConsistencyPolicy.js";
import { PRACTICE_ENDURANCE_CHECK_FORM_SET_ID, PRACTICE_ENDURANCE_FORM_SCHEMA_VERSION, PRACTICE_ENDURANCE_FORM_SET_VERSION, PRACTICE_ENDURANCE_FORM_GENERATOR_VERSION, PRACTICE_ENDURANCE_TRAINING_FORM_SET_ID } from "../js/practiceLab/practiceEnduranceConstants.js";
import { PRACTICE_ENDURANCE_POLICY_V1 } from "../js/practiceLab/practiceEndurancePolicy.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const validateOnly = process.argv.includes("--validate");
const unknown = process.argv.slice(2).filter((value) => value !== "--validate");
if (unknown.length) throw new Error(`Unknown PL29 form build argument: ${unknown[0]}`);
const sha256 = (value) => `sha256-${createHash("sha256").update(value).digest("hex")}`;
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const segment = createPracticeSegmenter();
const rel = (file) => path.relative(root, file).replaceAll(path.sep, "/");

const SOURCE_SPECS = [
  { kind: "consistency", sourcePath: "data/practice/consistency/en-v1/source.json", outputDir: "data/practice/consistency/en-v1", formSetId: PRACTICE_CONSISTENCY_FORM_SET_ID, partition: "training", count: 6, targetGraphemes: 24_000, minReady: 4, windowSize: 600, stride: 300, spreadMax: 0.50, windowMinPct: 15, windowMaxPct: 85, minLen: 22_000, maxLen: 30_000 },
  { kind: "endurance-practice", sourcePath: "data/practice/endurance/en-v1/practice-source.json", outputDir: "data/practice/endurance/en-v1", formSetId: PRACTICE_ENDURANCE_TRAINING_FORM_SET_ID, partition: "training", count: 4, targetGraphemes: 52_000, minReady: 2, windowSize: 800, stride: 400, spreadMax: 0.55, windowMinPct: 15, windowMaxPct: 85, minLen: 44_000, maxLen: 60_000 },
  { kind: "endurance-check", sourcePath: "data/practice/endurance/en-v1/check-source.json", outputDir: "data/practice/endurance/en-v1", formSetId: PRACTICE_ENDURANCE_CHECK_FORM_SET_ID, partition: "diagnostic", count: 6, targetGraphemes: 24_000, minReady: 4, windowSize: 800, stride: 400, spreadMax: 0.40, windowMinPct: 20, windowMaxPct: 80, minLen: 22_000, maxLen: 30_000 },
];

const [registry, frequency, modelManifest] = await Promise.all([
  json(path.join(root, "data/practice/provenance/sources.json")),
  json(path.join(root, "data/practice/provenance/frequency/en-v1.frequency.json")),
  json(path.join(root, "data/practice/models/en-v1/manifest.json")),
]);
const reference = PRACTICE_TYPABILITY_RUNTIME_ARTIFACTS?.en?.reference;
if (!reference || reference.referenceVersion !== modelManifest.referenceVersion || reference.frequencyReferenceChecksum !== frequency.checksum || reference.corpusChecksum !== modelManifest.corpusChecksum || reference.indexChecksum !== modelManifest.indexChecksum) throw new Error("PL29 PL10 runtime binding is stale");
const frequencyProvider = createPracticeReferenceFrequencyProvider(frequency);

function sentencePool(source) {
  const rows = [];
  for (const subject of source.generation.subjects) for (const verb of source.generation.verbs) for (const object of source.generation.objects) for (const ending of source.generation.endings) {
    const text = `${subject} ${verb} ${object} near a familiar community neighborhood ${ending}`;
    rows.push({ text, rank: sha256(`${source.generation.salt}\0${subject}\0${verb}\0${object}\0${ending}`) });
  }
  rows.sort((a, b) => a.rank.localeCompare(b.rank) || a.text.localeCompare(b.text));
  return rows.slice(0, 480).map((row) => row.text);
}
function formText(sentences, formOrdinal, targetGraphemes) {
  const ordered = sentences.slice().sort((a, b) => sha256(`${formOrdinal}\0${a}`).localeCompare(sha256(`${formOrdinal}\0${b}`)));
  const paragraphs = [];
  let current = [];
  let cursor = 0;
  let cycle = 0;
  while (segment(paragraphs.join("\n\n")).length < targetGraphemes) {
    const sentence = ordered[(cursor * 37 + cycle * 101 + formOrdinal * 17) % ordered.length];
    current.push(sentence);
    cursor += 1;
    if (current.length === 6) { paragraphs.push(current.join(" ")); current = []; }
    if (cursor % ordered.length === 0) cycle += 1;
  }
  if (current.length) paragraphs.push(current.join(" "));
  return paragraphs.join("\n\n");
}
function score(text) {
  const features = extractPracticeTextDifficultyFeatures({ text, language: "en", frequencyProvider });
  const textDifficulty = scorePracticeTextTypability({ features, reference, language: "en" });
  return { features, textDifficulty };
}
function slidingWindows(text, spec) {
  const gs = segment(text); const out = [];
  for (let start = 0; start < gs.length; start += spec.stride) {
    const end = Math.min(gs.length, start + spec.windowSize);
    if (end - start < spec.windowSize / 2) break;
    const { textDifficulty } = score(gs.slice(start, end).join(""));
    out.push({ startIndex: start, endIndex: end, textDifficulty });
    if (end === gs.length) break;
  }
  return out;
}
function validate(form, spec) {
  const reasons = [];
  const warnings = [];
  if (form.partition !== spec.partition) reasons.push("partition");
  if (form.graphemeCount < spec.minLen || form.graphemeCount > spec.maxLen) reasons.push("length");
  if (form.typability.availableModelWeight < 0.90) reasons.push("typability-coverage");
  const pct = form.typability.relativeDifficultyPercentile;
  if (!Number.isFinite(pct) || pct < 20 || pct > 80) reasons.push("difficulty-percentile");
  if (form.features.digitRatio > 0.02) reasons.push("digit-ratio");
  if (form.features.symbolRatio > 0.01) reasons.push("symbol-ratio");
  if (!form.windows.length || form.windows.some((w) => w.textDifficulty.availableModelWeight < 0.90)) reasons.push("window-coverage");
  if (form.windows.some((w) => !Number.isFinite(w.textDifficulty.relativeDifficultyPercentile) || w.textDifficulty.relativeDifficultyPercentile < spec.windowMinPct || w.textDifficulty.relativeDifficultyPercentile > spec.windowMaxPct)) warnings.push("window-percentile-advisory");
  const ds = form.windows.map((w) => w.textDifficulty.difficultyIndex).filter(Number.isFinite);
  const spread = ds.length ? Math.max(...ds) - Math.min(...ds) : Infinity;
  if (spread > spec.spreadMax) reasons.push("window-difficulty-spread");
  return { valid: reasons.length === 0, reasons, warnings, windowDifficultySpread: spread };
}

for (const spec of SOURCE_SPECS) {
  const sourceFile = path.join(root, spec.sourcePath);
  const sourceBytes = await readFile(sourceFile, "utf8"); const source = JSON.parse(sourceBytes);
  if (source.partition !== spec.partition || source.reviewStatus !== "approved" || source.language !== "en") throw new Error(`${spec.kind} source invalid`);
  const provenance = registry.sources?.find((item) => item.sourceId === source.sourceId);
  if (!provenance || provenance.usageApproval !== "practice-display-approved" || provenance.snapshotPath !== spec.sourcePath.replace(/^data\/practice\//, "") || provenance.sourceChecksum !== sha256(sourceBytes)) throw new Error(`${spec.kind} source provenance stale`);
  const sentences = sentencePool(source);
  const forms = Array.from({ length: spec.count }, (_, i) => {
    const text = formText(sentences, i + 1, spec.targetGraphemes);
    const { features, textDifficulty } = score(text); const windows = slidingWindows(text, spec);
    const base = { formSchemaVersion: 1, generatorVersion: 1, formSetId: spec.formSetId, formSetVersion: 1, formId: `${spec.kind}-en-${String(i + 1).padStart(2,"0")}`, partition: spec.partition, sourceId: source.sourceId, reviewStatus: "approved", text, graphemeCount: segment(text).length, features, typability: textDifficulty, windows };
    const releaseValidation = validate(base, spec);
    return { ...base, formHash: sha256(text), releaseValidation };
  });
  const ready = forms.filter((form) => form.releaseValidation.valid);
  const status = ready.length >= spec.minReady ? "ready" : "draft";
  const artifact = { artifactVersion: 1, formSchemaVersion: 1, generatorVersion: 1, formSetId: spec.formSetId, formSetVersion: 1, language: "en", partition: spec.partition, status, forms };
  const artifactText = stableJson(artifact); const artifactChecksum = sha256(artifactText);
  const outputDir = path.join(root, spec.outputDir); const formsFile = path.join(outputDir, `${spec.formSetId}.forms.json`); const manifestFile = path.join(outputDir, `${spec.formSetId}.manifest.json`);
  const manifest = { manifestVersion: 1, formSchemaVersion: 1, generatorVersion: 1, formSetId: spec.formSetId, formSetVersion: 1, language: "en", partition: spec.partition, status, formCount: forms.length, readyFormCount: ready.length, minimumReadyFormCount: spec.minReady, source: { sourceId: source.sourceId, sourceChecksum: sha256(sourceBytes), reviewStatus: source.reviewStatus }, bindings: { corpusId: modelManifest.corpusId, corpusVersion: modelManifest.corpusVersion, corpusChecksum: modelManifest.corpusChecksum, indexSchemaVersion: modelManifest.indexSchemaVersion, indexChecksum: modelManifest.indexChecksum, typabilityModelVersion: modelManifest.modelVersion, typabilityFeatureVersion: modelManifest.featureVersion, typabilityReferenceVersion: modelManifest.referenceVersion, typabilityReferenceChecksum: modelManifest.referenceChecksum, frequencyReferenceVersion: modelManifest.frequencyReferenceVersion, frequencyReferenceId: modelManifest.frequencyReferenceId, frequencyReferenceChecksum: modelManifest.frequencyReferenceChecksum }, slidingWindow: { size: spec.windowSize, stride: spec.stride, maximumDifficultySpread: spec.spreadMax }, formsPath: rel(formsFile), formsChecksum: artifactChecksum, forms: forms.map((f)=>({ formId:f.formId, formHash:f.formHash, graphemeCount:f.graphemeCount, ready:f.releaseValidation.valid, reasons:f.releaseValidation.reasons, warnings:f.releaseValidation.warnings, availableModelWeight:f.typability.availableModelWeight, relativeDifficultyPercentile:f.typability.relativeDifficultyPercentile, windowDifficultySpread:f.releaseValidation.windowDifficultySpread })) };
  const manifestText = stableJson(manifest);
  if (validateOnly) {
    const [currentArtifact,currentManifest]=await Promise.all([readFile(formsFile,"utf8"),readFile(manifestFile,"utf8")]);
    if (currentArtifact!==artifactText || currentManifest!==manifestText) throw new Error(`${spec.kind} artifact stale`);
    if (status!=="ready") throw new Error(`${spec.kind} not ready: ${ready.length}/${forms.length}`);
  } else {
    await mkdir(outputDir,{recursive:true}); await Promise.all([writeFile(formsFile,artifactText),writeFile(manifestFile,manifestText)]);
  }
  console.log(`PL29 ${spec.kind}: ${ready.length}/${forms.length} ready, ${artifactChecksum}`);
}
