import { readFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPracticeAssessmentDiagnosticRegistry } from "../js/practiceLab/practiceAssessmentDiagnostics.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const validateOnly = process.argv.includes("--validate");
const unknown = process.argv.slice(2).filter((arg) => arg !== "--validate");
if (unknown.length) throw new Error(`Unknown assessment diagnostic build argument: ${unknown[0]}`);

const corpusFile = path.join(root, "data/practice/diagnostic/en-v1.json");
const corpusManifestFile = path.join(root, "data/practice/manifests/en-v1.manifest.json");
const modelManifestFile = path.join(root, "data/practice/models/en-v1/manifest.json");
const modelFile = path.join(root, "data/practice/models/en-v1/diagnostic.json");
const outputFile = path.join(root, "data/practice/assessment/en-v1/diagnostic-forms-v1.manifest.json");

const [corpus, corpusManifest, modelManifest, model] = await Promise.all([
  corpusFile, corpusManifestFile, modelManifestFile, modelFile,
].map(async (file) => JSON.parse(await readFile(file, "utf8"))));

if (corpus.partition !== "diagnostic" || model.partition !== "diagnostic") throw new Error("PL19 diagnostic builder accepts diagnostic partition only");
if (corpus.items.some((item) => item.reviewStatus !== "approved" || item.partition !== "diagnostic")) throw new Error("PL19 diagnostic builder requires approved diagnostic-only content");
if (model.corpusChecksum !== corpusManifest.buildChecksum || model.indexChecksum !== modelManifest.indexChecksum) throw new Error("PL19 diagnostic model bindings are stale");
const modelChecksum = modelManifest.artifactChecksums.find((entry) => entry.path === "diagnostic.json")?.sha256 ?? null;
if (!modelChecksum) throw new Error("PL19 diagnostic typability checksum is missing");
const referenceChecksum = modelManifest.referenceChecksum;
if (!referenceChecksum) throw new Error("PL19 typability reference checksum is missing");

const totalSourceGraphemes = corpus.items.reduce((sum, item) => sum + [...item.text].length, 0);
const maximumSourceItemGraphemes = Math.max(0, ...corpus.items.map((item) => [...item.text].length));
const familyCount = new Set(corpus.items.map((item) => item.familyId)).size;
const diagnosticBlockIds = [
  "diagnostic-core-keys",
  "diagnostic-word-launch",
  "diagnostic-combinations",
  "diagnostic-punctuation-capitals",
  "diagnostic-numbers-symbols",
  "diagnostic-lexical-extended",
  "diagnostic-combinations-extended",
  "diagnostic-mixed",
];

// The current foundation corpus cannot form even one capacity-safe block without
// artificial repetition. PL19 deliberately emits an honest draft artifact rather
// than turning the two probes into synthetic pseudo-natural assessment passages.
const artifact = {
  artifactVersion: 1,
  blueprintVersion: 1,
  formVersion: 1,
  matchPolicyVersion: 1,
  language: corpus.language,
  partition: "diagnostic",
  status: "draft",
  bindings: {
    corpusId: corpus.corpusId,
    corpusVersion: corpus.corpusVersion,
    corpusChecksum: corpusManifest.buildChecksum,
    indexChecksum: model.indexChecksum,
    typabilityModelVersion: model.modelVersion,
    typabilityFeatureVersion: model.featureVersion,
    typabilityReferenceVersion: model.referenceVersion,
    typabilityReferenceChecksum: referenceChecksum,
    diagnosticTypabilityChecksum: modelChecksum,
  },
  sourceInventory: {
    approvedDiagnosticItems: corpus.items.length,
    families: familyCount,
    maximumSourceItemGraphemes,
    totalSourceGraphemes,
  },
  reasons: [
    "Diagnostic corpus has only two 15-grapheme approved probes from one family.",
    "No form can satisfy the 2200/3300/4400-grapheme capacity floors without artificial repetition.",
    "The corpus cannot satisfy a-z, lexical, combination, punctuation, number, or symbol coverage requirements.",
    "No diagnostic block has the minimum two valid matched variants required for ready status.",
  ],
  formSets: diagnosticBlockIds.map((blockId) => ({ blockId, status: "draft", forms: [], reasons: ["coverage-and-capacity-insufficient"] })),
};

createPracticeAssessmentDiagnosticRegistry({ artifacts: [artifact] });
const next = `${JSON.stringify(artifact, null, 2)}\n`;
if (validateOnly) {
  const current = await readFile(outputFile, "utf8");
  if (current !== next) throw new Error("PL19 assessment diagnostic artifact is stale; rebuild required");
  console.log(`PL19 assessment diagnostics valid: ${artifact.status}, ${artifact.sourceInventory.approvedDiagnosticItems} source items`);
} else {
  await mkdir(path.dirname(outputFile), { recursive: true });
  const temp = `${outputFile}.tmp-${process.pid}`;
  await writeFile(temp, next, "utf8");
  await rename(temp, outputFile);
  await rm(temp, { force: true });
  console.log(`PL19 assessment diagnostics built: ${artifact.status}, ${artifact.sourceInventory.approvedDiagnosticItems} source items`);
}
