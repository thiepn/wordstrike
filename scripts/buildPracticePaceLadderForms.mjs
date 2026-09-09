import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPracticeReferenceFrequencyProvider } from "../js/practiceLab/practiceReferenceFrequency.js";
import { createPracticeSegmenter } from "../js/practiceLab/practiceTextSegmentation.js";
import { extractPracticeTextDifficultyFeatures } from "../js/practiceLab/practiceTextDifficultyFeatures.js";
import { scorePracticeTextTypability } from "../js/practiceLab/practiceTypabilityModel.js";
import { PRACTICE_TYPABILITY_RUNTIME_ARTIFACTS } from "../js/practiceLab/generated/practiceTypabilityRuntimeData.js";
import {
  PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION,
  PRACTICE_PACE_LADDER_FORM_SET_ID,
  PRACTICE_PACE_LADDER_FORM_SET_VERSION,
  PRACTICE_PACE_LADDER_GENERATOR_VERSION,
} from "../js/practiceLab/practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "../js/practiceLab/practicePaceLadderPolicy.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const validateOnly = process.argv.includes("--validate");
const unknown = process.argv.slice(2).filter((value) => value !== "--validate");
if (unknown.length) throw new Error(`Unknown Pace Ladder form build argument: ${unknown[0]}`);

const SOURCE = path.join(root, "data/practice/pace-ladder/en-v1/source.json");
const SOURCES = path.join(root, "data/practice/provenance/sources.json");
const FREQUENCY = path.join(root, "data/practice/provenance/frequency/en-v1.frequency.json");
const MODEL_MANIFEST = path.join(root, "data/practice/models/en-v1/manifest.json");
const OUTPUT_DIR = path.join(root, "data/practice/pace-ladder/en-v1");
const FORMS_FILE = path.join(OUTPUT_DIR, `${PRACTICE_PACE_LADDER_FORM_SET_ID}.forms.json`);
const MANIFEST_FILE = path.join(OUTPUT_DIR, `${PRACTICE_PACE_LADDER_FORM_SET_ID}.manifest.json`);

const sha256 = (value) => `sha256-${createHash("sha256").update(value).digest("hex")}`;
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const segment = createPracticeSegmenter();
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const relative = (file) => path.relative(root, file).replaceAll(path.sep, "/");

function renderSentence(subject, verb, ending, variant) {
  if (variant === "comma-link") return `${subject} ${verb}, then checks the next line, ${ending}`;
  if (variant === "ordinary-practice-link") return `${subject}, ${verb} during ordinary practice, ${ending}`;
  return `${subject}, ${verb}, ${ending}`;
}

function buildSentencePool(source) {
  const rows = [];
  for (const subject of source.generation.subjects) {
    for (const verb of source.generation.verbs) {
      for (const ending of source.generation.endings) {
        for (const variant of source.generation.variants) {
          const text = renderSentence(subject, verb, ending, variant);
          rows.push({ text, rank: sha256(`${subject}\u0000${verb}\u0000${ending}\u0000${variant}`) });
        }
      }
    }
  }
  rows.sort((a, b) => a.rank.localeCompare(b.rank) || a.text.localeCompare(b.text));
  return rows.slice(0, source.generation.sentenceCount).map((row) => row.text);
}

function buildPassages(sentences, count) {
  const passages = Array.from({ length: count }, (_, ordinal) => ({
    familyId: `pace-en-family-${String(ordinal + 1).padStart(2, "0")}`,
    sentences: [],
  }));
  sentences.forEach((sentence, index) => passages[index % count].sentences.push(sentence));
  return passages.map((passage) => ({
    familyId: passage.familyId,
    text: passage.sentences.join(" "),
  }));
}

const FORM_PERMUTATIONS = Object.freeze([
  [1, 3], [3, 13], [7, 14], [9, 10], [11, 8], [13, 5], [17, 2], [19, 14],
]);
function permutePassages(passages, step, offset) {
  const selected = [];
  for (let index = 0; index < passages.length; index += 1) selected.push(passages[(offset + index * step) % passages.length]);
  if (new Set(selected.map((item) => item.familyId)).size !== passages.length) throw new Error("Pace Ladder form permutation repeated a family");
  return selected;
}

function scoreText(text, reference, frequencyProvider) {
  const features = extractPracticeTextDifficultyFeatures({ text, language: "en", frequencyProvider });
  const textDifficulty = scorePracticeTextTypability({ features, reference, language: "en" });
  return { features, textDifficulty };
}

function buildWindows(text, reference, frequencyProvider) {
  const graphemes = segment(text);
  const windows = [];
  for (let startIndex = 0; startIndex < graphemes.length; startIndex += PRACTICE_PACE_LADDER_POLICY_V1.slidingWindowStrideGraphemes) {
    const endIndex = Math.min(graphemes.length, startIndex + PRACTICE_PACE_LADDER_POLICY_V1.slidingWindowGraphemes);
    if (endIndex - startIndex < Math.min(300, PRACTICE_PACE_LADDER_POLICY_V1.slidingWindowGraphemes / 2)) break;
    const scored = scoreText(graphemes.slice(startIndex, endIndex).join(""), reference, frequencyProvider);
    windows.push({ startIndex, endIndex, textDifficulty: scored.textDifficulty });
    if (endIndex === graphemes.length) break;
  }
  return windows;
}

function validateForm(form) {
  const errors = [];
  if (form.partition !== "diagnostic") errors.push("partition");
  if (form.graphemeCount < PRACTICE_PACE_LADDER_POLICY_V1.formMinimumGraphemes || form.graphemeCount > PRACTICE_PACE_LADDER_POLICY_V1.formMaximumGraphemes) errors.push("length");
  if (new Set(form.familyIds).size !== form.familyIds.length) errors.push("family-uniqueness");
  if (form.typability.availableModelWeight < PRACTICE_PACE_LADDER_POLICY_V1.formMinimumAvailableModelWeight) errors.push("typability-coverage");
  if (!Number.isFinite(form.typability.relativeDifficultyPercentile) || form.typability.relativeDifficultyPercentile < 20 || form.typability.relativeDifficultyPercentile > 80) errors.push("difficulty-percentile");
  if (form.features.digitRatio > PRACTICE_PACE_LADDER_POLICY_V1.maximumDigitRatio) errors.push("digit-ratio");
  if (form.features.symbolRatio > PRACTICE_PACE_LADDER_POLICY_V1.maximumSymbolRatio) errors.push("symbol-ratio");
  if (!form.windows.length || form.windows.some((window) => window.textDifficulty.availableModelWeight < PRACTICE_PACE_LADDER_POLICY_V1.formMinimumAvailableModelWeight)) errors.push("window-coverage");
  if (form.windows.some((window) => !Number.isFinite(window.textDifficulty.relativeDifficultyPercentile) || window.textDifficulty.relativeDifficultyPercentile < PRACTICE_PACE_LADDER_POLICY_V1.minimumWindowDifficultyPercentile || window.textDifficulty.relativeDifficultyPercentile > PRACTICE_PACE_LADDER_POLICY_V1.maximumWindowDifficultyPercentile)) errors.push("window-percentile");
  const difficulties = form.windows.map((window) => window.textDifficulty.difficultyIndex).filter(Number.isFinite);
  const spread = difficulties.length ? Math.max(...difficulties) - Math.min(...difficulties) : Infinity;
  if (spread > PRACTICE_PACE_LADDER_POLICY_V1.maximumWindowDifficultySpread) errors.push("window-difficulty-spread");
  return { valid: errors.length === 0, errors, spread };
}

const [sourceBytes, source, registry, frequency, modelManifest] = await Promise.all([
  readFile(SOURCE, "utf8"), json(SOURCE), json(SOURCES), json(FREQUENCY), json(MODEL_MANIFEST),
]);
if (source.sourceArtifactVersion !== 1 || source.sourceId !== "ws-original-en-pace-ladder-v1" || source.partition !== "diagnostic" || source.reviewStatus !== "approved" || source.language !== "en") throw new Error("Pace Ladder source artifact is incompatible");
const provenance = registry.sources?.find((item) => item.sourceId === source.sourceId);
if (!provenance || provenance.usageApproval !== "practice-display-approved" || provenance.snapshotPath !== "pace-ladder/en-v1/source.json") throw new Error("Pace Ladder source is not provenance-approved");
const sourceChecksum = sha256(sourceBytes);
if (provenance.sourceChecksum !== sourceChecksum) throw new Error("Pace Ladder source provenance checksum is stale");
if (frequency.checksum !== modelManifest.frequencyReferenceChecksum || frequency.referenceVersion !== modelManifest.frequencyReferenceVersion || frequency.referenceId !== modelManifest.frequencyReferenceId) throw new Error("Pace Ladder frequency/model binding is stale");
const reference = PRACTICE_TYPABILITY_RUNTIME_ARTIFACTS?.en?.reference;
if (!reference || reference.referenceVersion !== modelManifest.referenceVersion || reference.frequencyReferenceChecksum !== frequency.checksum || reference.corpusChecksum !== modelManifest.corpusChecksum || reference.indexChecksum !== modelManifest.indexChecksum) throw new Error("Pace Ladder PL10 runtime binding is stale");
const frequencyProvider = createPracticeReferenceFrequencyProvider(frequency);
const sentences = buildSentencePool(source);
const passages = buildPassages(sentences, source.generation.passageCount);
if (passages.length !== 20 || passages.some((passage) => !passage.text)) throw new Error("Pace Ladder passage construction failed");

const forms = FORM_PERMUTATIONS.map(([step, offset], index) => {
  const ordered = permutePassages(passages, step, offset);
  const text = ordered.map((item) => item.text).join("\n\n");
  const { features, textDifficulty } = scoreText(text, reference, frequencyProvider);
  const windows = buildWindows(text, reference, frequencyProvider);
  const base = {
    formSchemaVersion: PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION,
    generatorVersion: PRACTICE_PACE_LADDER_GENERATOR_VERSION,
    formSetId: PRACTICE_PACE_LADDER_FORM_SET_ID,
    formSetVersion: PRACTICE_PACE_LADDER_FORM_SET_VERSION,
    formId: `pace-en-${String(index + 1).padStart(2, "0")}`,
    partition: "diagnostic",
    sourceId: source.sourceId,
    familyIds: ordered.map((item) => item.familyId),
    text,
    graphemeCount: segment(text).length,
    features,
    typability: textDifficulty,
    windows,
  };
  const validation = validateForm(base);
  return { ...base, formHash: sha256(text), releaseValidation: validation };
});
const readyForms = forms.filter((form) => form.releaseValidation.valid);
const status = readyForms.length >= PRACTICE_PACE_LADDER_POLICY_V1.minimumReadyForms ? "ready" : "draft";
const formsArtifact = {
  artifactVersion: 1,
  formSchemaVersion: PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION,
  generatorVersion: PRACTICE_PACE_LADDER_GENERATOR_VERSION,
  formSetId: PRACTICE_PACE_LADDER_FORM_SET_ID,
  formSetVersion: PRACTICE_PACE_LADDER_FORM_SET_VERSION,
  language: "en",
  partition: "diagnostic",
  status,
  forms,
};
const formsText = stableJson(formsArtifact);
const formsChecksum = sha256(formsText);
const manifest = {
  manifestVersion: 1,
  formSchemaVersion: PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION,
  generatorVersion: PRACTICE_PACE_LADDER_GENERATOR_VERSION,
  formSetId: PRACTICE_PACE_LADDER_FORM_SET_ID,
  formSetVersion: PRACTICE_PACE_LADDER_FORM_SET_VERSION,
  language: "en",
  partition: "diagnostic",
  status,
  formCount: forms.length,
  readyFormCount: readyForms.length,
  minimumReadyFormCount: PRACTICE_PACE_LADDER_POLICY_V1.minimumReadyForms,
  formLengthBounds: { minimum: PRACTICE_PACE_LADDER_POLICY_V1.formMinimumGraphemes, maximum: PRACTICE_PACE_LADDER_POLICY_V1.formMaximumGraphemes },
  slidingWindow: { size: PRACTICE_PACE_LADDER_POLICY_V1.slidingWindowGraphemes, stride: PRACTICE_PACE_LADDER_POLICY_V1.slidingWindowStrideGraphemes, maximumDifficultySpread: PRACTICE_PACE_LADDER_POLICY_V1.maximumWindowDifficultySpread },
  minimumAvailableModelWeight: PRACTICE_PACE_LADDER_POLICY_V1.formMinimumAvailableModelWeight,
  source: { sourceId: source.sourceId, sourceChecksum, reviewStatus: source.reviewStatus },
  bindings: {
    corpusId: modelManifest.corpusId,
    corpusVersion: modelManifest.corpusVersion,
    corpusChecksum: modelManifest.corpusChecksum,
    indexSchemaVersion: modelManifest.indexSchemaVersion,
    indexChecksum: modelManifest.indexChecksum,
    typabilityModelVersion: modelManifest.modelVersion,
    typabilityFeatureVersion: modelManifest.featureVersion,
    typabilityReferenceVersion: modelManifest.referenceVersion,
    typabilityReferenceChecksum: modelManifest.referenceChecksum,
    frequencyReferenceVersion: modelManifest.frequencyReferenceVersion,
    frequencyReferenceId: modelManifest.frequencyReferenceId,
    frequencyReferenceChecksum: modelManifest.frequencyReferenceChecksum,
  },
  formsPath: relative(FORMS_FILE),
  formsChecksum,
  forms: forms.map((form) => ({
    formId: form.formId,
    formHash: form.formHash,
    graphemeCount: form.graphemeCount,
    availableModelWeight: form.typability.availableModelWeight,
    relativeDifficultyPercentile: form.typability.relativeDifficultyPercentile,
    windowCount: form.windows.length,
    windowDifficultySpread: form.releaseValidation.spread,
    ready: form.releaseValidation.valid,
    reasons: form.releaseValidation.errors,
  })),
};
const manifestText = stableJson(manifest);
if (validateOnly) {
  const [currentForms, currentManifest] = await Promise.all([readFile(FORMS_FILE, "utf8"), readFile(MANIFEST_FILE, "utf8")]);
  if (currentForms !== formsText || currentManifest !== manifestText) throw new Error("PL26 Pace Ladder form artifact is stale; rebuild required");
  if (status !== "ready") throw new Error(`PL26 Pace Ladder form set is not ready: ${readyForms.length}/${forms.length}`);
  console.log(`PL26 Pace Ladder forms valid: ${readyForms.length}/${forms.length} ready, ${formsChecksum}`);
} else {
  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const [file, content] of [[FORMS_FILE, formsText], [MANIFEST_FILE, manifestText]]) {
    const temp = `${file}.tmp-${process.pid}`;
    await writeFile(temp, content, "utf8");
    await rename(temp, file);
    await rm(temp, { force: true });
  }
  console.log(`PL26 Pace Ladder forms built: ${readyForms.length}/${forms.length} ready, ${formsChecksum}`);
}
