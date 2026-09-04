import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRACTICE_CORPUS_PARTITIONS } from "../js/practiceLab/practiceCorpusConstants.js";
import {
  buildPracticeIndexesFromCorpus,
  finalizePracticeIndexManifest,
} from "./lib/practiceIndexBuildCore.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const practiceRoot = path.join(root, "data", "practice");
const manifestsRoot = path.join(practiceRoot, "manifests");
const indexesRoot = path.join(practiceRoot, "indexes");
const validateOnly = process.argv.includes("--validate");
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--validate");
if (unknownArgs.length) throw new Error(`Unknown Practice index build argument: ${unknownArgs[0]}`);

const hashText = (value) => `sha256-${createHash("sha256").update(String(value), "utf8").digest("hex")}`;
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function listJsonFiles(directory, prefix = "") {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listJsonFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(relative);
  }
  return files;
}

async function validateCheckedIn(directory, files) {
  const expectedPaths = [...files.keys()].sort();
  const actualPaths = await listJsonFiles(directory);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    const error = new Error(`Practice index artifact set is stale for ${path.relative(root, directory)}`);
    error.code = "INDEX_NOT_FOUND";
    error.details = { expectedPaths, actualPaths };
    throw error;
  }
  for (const [relative, expected] of files) {
    const actual = await readFile(path.join(directory, relative), "utf8");
    if (actual !== expected) {
      const error = new Error(`Practice index artifact is stale or corrupted: ${path.relative(root, path.join(directory, relative))}`);
      error.code = relative === "manifest.json" ? "CORPUS_MISMATCH" : "ARTIFACT_CHECKSUM_MISMATCH";
      throw error;
    }
  }
}

async function replaceDirectorySafely(directory, files) {
  const temp = `${directory}.tmp-${process.pid}`;
  const backup = `${directory}.bak-${process.pid}`;
  await rm(temp, { recursive: true, force: true });
  await rm(backup, { recursive: true, force: true });
  try {
    for (const [relative, content] of files) {
      const file = path.join(temp, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content, "utf8");
    }
    await mkdir(path.dirname(directory), { recursive: true });
    const hadPrior = await exists(directory);
    if (hadPrior) await rename(directory, backup);
    try {
      await rename(temp, directory);
      await rm(backup, { recursive: true, force: true });
    } catch (cause) {
      await rm(directory, { recursive: true, force: true });
      if (hadPrior && await exists(backup)) await rename(backup, directory);
      throw cause;
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
  }
}

// PL6 remains authoritative. Its full validation includes source checksums and deterministic corpus artifacts.
execFileSync(process.execPath, [path.join(root, "scripts", "buildPracticeCorpus.mjs"), "--validate"], { stdio: "ignore" });

const manifestNames = (await readdir(manifestsRoot)).filter((name) => name.endsWith(".manifest.json")).sort();
if (!manifestNames.length) throw new Error("No PL6 Practice corpus manifests are available for PL7 indexing");

for (const manifestName of manifestNames) {
  const corpusManifest = JSON.parse(await readFile(path.join(manifestsRoot, manifestName), "utf8"));
  const versionStem = `${corpusManifest.language}-v${corpusManifest.corpusVersion}`;
  const partitionArtifacts = {};
  for (const partition of PRACTICE_CORPUS_PARTITIONS) partitionArtifacts[partition] = JSON.parse(await readFile(path.join(practiceRoot, partition, `${versionStem}.json`), "utf8"));

  const build = buildPracticeIndexesFromCorpus({ corpusManifest, partitionArtifacts, hashText });
  const artifactTexts = new Map();
  for (const [relative, artifact] of [...build.files.entries()].sort(([a], [b]) => a.localeCompare(b))) artifactTexts.set(relative, {
    text: jsonText(artifact),
    indexType: artifact.indexType,
    partition: artifact.partition,
    shardId: artifact.shardId ?? null,
  });
  const indexManifest = finalizePracticeIndexManifest({ manifestBase: build.manifestBase, artifactTexts, hashText });
  const outputFiles = new Map([...artifactTexts.entries()].map(([relative, value]) => [relative, value.text]));
  outputFiles.set("manifest.json", jsonText(indexManifest));
  const corpusIndexRoot = path.join(indexesRoot, versionStem);
  if (validateOnly) await validateCheckedIn(corpusIndexRoot, outputFiles);
  else await replaceDirectorySafely(corpusIndexRoot, outputFiles);

  const partitionSummary = PRACTICE_CORPUS_PARTITIONS.map((partition) => {
    const value = indexManifest.counts[partition];
    return `${partition}: content=${value.contentItems}, families=${value.families}, graphemes=${value.graphemes}, words=${value.wordOccurrences}, keys=${value.uniqueKeys}, bigrams=${value.uniqueBigrams}, trigrams=${value.uniqueTrigrams}`;
  });
  console.log(`Practice indexes ${validateOnly ? "validated" : "built"}: ${corpusManifest.corpusId} v${corpusManifest.corpusVersion}`);
  console.log(`  indexSchema=${indexManifest.indexSchemaVersion} generator=${indexManifest.indexGeneratorVersion} segmentation=${indexManifest.segmentationVersion} tokenization=${indexManifest.tokenizationVersion} shardPolicy=${indexManifest.shardPolicyVersion}`);
  partitionSummary.forEach((line) => console.log(`  ${line}`));
  console.log(`  trainingReverseShards=${indexManifest.generatedPartitions.training.targetShards.length} diagnosticReverseShards=${indexManifest.generatedPartitions.diagnostic.targetShards.length}`);
  console.log(`  coverageWarnings=${indexManifest.coverageWarnings.length} totalBytes=${indexManifest.sizeSummary.totalGeneratedBytes} largestArtifactBytes=${indexManifest.sizeSummary.largestArtifactBytes} medianArtifactBytes=${indexManifest.sizeSummary.medianArtifactBytes}`);
  console.log(`  corpusChecksum=${indexManifest.corpusChecksum}`);
  console.log(`  indexChecksum=${indexManifest.indexChecksum}`);
}
