import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPracticeBenchmarkSuiteArtifact } from "../js/practiceLab/practiceEvaluationArtifacts.js";
import { extractPracticeTextDifficultyFeatures } from "../js/practiceLab/practiceTextDifficultyFeatures.js";
import { createUnavailablePracticeReferenceFrequencyProvider } from "../js/practiceLab/practiceReferenceFrequency.js";
import { scorePracticeTextTypability } from "../js/practiceLab/practiceTypabilityModel.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const validateOnly = process.argv.includes("--validate");
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--validate");
if (unknownArgs.length) throw new Error(`Unknown benchmark build argument: ${unknownArgs[0]}`);
const corpusFile = path.join(root, "data/practice/benchmark/en-v1.json");
const typabilityFile = path.join(root, "data/practice/models/en-v1/benchmark.json");
const referenceFile = path.join(root, "data/practice/models/en-v1/typability-v1.reference.json");
const outputFile = path.join(root, "data/practice/evaluation/en-v1/benchmark/WS-BENCH-EN-1.manifest.json");
const hashBytes = (value) => `sha256-${createHash("sha256").update(value).digest("hex")}`;
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const [corpusText, typabilityText, corpus, typabilityArtifact, reference] = await Promise.all([
  readFile(corpusFile, "utf8"), readFile(typabilityFile, "utf8"), readJson(corpusFile), readJson(typabilityFile), readJson(referenceFile),
]);
if (corpus.partition !== "benchmark" || typabilityArtifact.partition !== "benchmark") throw new Error("PL18 benchmark builder requires benchmark partition artifacts only");
const frequencyProvider = createUnavailablePracticeReferenceFrequencyProvider({ language: corpus.language });
const scoreComposite = (text) => {
  const features = extractPracticeTextDifficultyFeatures({ text, language: corpus.language, frequencyProvider });
  return { features, textDifficulty: scorePracticeTextTypability({ features, reference, language: corpus.language }) };
};
const artifact = buildPracticeBenchmarkSuiteArtifact({
  corpus,
  typabilityArtifact,
  scoreComposite,
  bindings: {
    corpusBinding: { corpusId: typabilityArtifact.corpusId, corpusVersion: typabilityArtifact.corpusVersion, corpusChecksum: typabilityArtifact.corpusChecksum, partitionArtifactChecksum: hashBytes(corpusText) },
    indexBinding: { indexChecksum: typabilityArtifact.indexChecksum },
    typabilityBinding: { modelVersion: typabilityArtifact.modelVersion, featureVersion: typabilityArtifact.featureVersion, referenceVersion: typabilityArtifact.referenceVersion, artifactChecksum: hashBytes(typabilityText) },
  },
});
const next = jsonText(artifact);
if (validateOnly) {
  if (!(await exists(outputFile))) throw new Error("PL18 benchmark artifact is missing");
  if ((await readFile(outputFile, "utf8")) !== next) throw new Error("PL18 benchmark artifact is stale; rebuild required");
  console.log(`PL18 benchmark artifact valid: ${artifact.status}, ${artifact.forms.length} forms`);
} else {
  await mkdir(path.dirname(outputFile), { recursive: true });
  const temp = `${outputFile}.tmp-${process.pid}`;
  await writeFile(temp, next, "utf8");
  await rename(temp, outputFile);
  await rm(temp, { force: true });
  console.log(`PL18 benchmark artifact built: ${artifact.status}, ${artifact.forms.length} forms`);
}
