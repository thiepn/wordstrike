import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRACTICE_CORPUS_PARTITIONS } from "../js/practiceLab/practiceCorpusConstants.js";
import { validatePracticeCorpusSourceRegistry } from "../js/practiceLab/practiceCorpusValidation.js";
import { buildPracticeCorpusFromInputs } from "./lib/practiceCorpusBuildCore.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const practiceRoot = path.join(root, "data", "practice");
const authoringRoot = path.join(practiceRoot, "authoring");
const sourceRegistryPath = path.join(practiceRoot, "provenance", "sources.json");
const validateOnly = process.argv.includes("--validate");
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--validate");
if (unknownArgs.length) throw new Error(`Unknown Practice corpus build argument: ${unknownArgs[0]}`);

const hashBytes = (value) => `sha256-${createHash("sha256").update(value).digest("hex")}`;
const hashText = (value) => hashBytes(Buffer.from(String(value), "utf8"));
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

function safeSnapshotPath(relativePath) {
  const resolved = path.resolve(practiceRoot, relativePath);
  const rootWithSeparator = `${path.resolve(practiceRoot)}${path.sep}`;
  if (!resolved.startsWith(rootWithSeparator)) throw new Error(`Practice source snapshot escapes data/practice: ${relativePath}`);
  return resolved;
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function verifySourceChecksums(registry) {
  for (const source of registry.sources) {
    if (!source.snapshotPath) continue;
    if (!source.sourceChecksum) throw new Error(`Source ${source.sourceId} declares snapshotPath without sourceChecksum`);
    const bytes = await readFile(safeSnapshotPath(source.snapshotPath));
    const actual = hashBytes(bytes);
    if (actual !== source.sourceChecksum) throw new Error(`Source checksum mismatch for ${source.sourceId}: reviewed snapshot changed`);
  }
}

function releaseKey(document) {
  return `${document.corpusId}|${document.language}|${document.corpusVersion}`;
}

function outputFilesFor(build) {
  const { manifest, artifacts } = build;
  const versionStem = `${manifest.language}-v${manifest.corpusVersion}`;
  const files = new Map();
  files.set(path.join(practiceRoot, "manifests", `${versionStem}.manifest.json`), jsonText(manifest));
  for (const partition of PRACTICE_CORPUS_PARTITIONS) {
    files.set(path.join(practiceRoot, partition, `${versionStem}.json`), jsonText(artifacts[partition]));
  }
  return files;
}

async function enforceReleasedCorpusImmutability(build) {
  const manifest = build.manifest;
  const versionStem = `${manifest.language}-v${manifest.corpusVersion}`;
  const manifestPath = path.join(practiceRoot, "manifests", `${versionStem}.manifest.json`);
  if (!(await exists(manifestPath))) return;
  const previous = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!["ready", "retired"].includes(previous.status)) return;
  if (previous.corpusId !== manifest.corpusId || previous.corpusVersion !== manifest.corpusVersion) return;
  if (previous.buildChecksum !== manifest.buildChecksum) {
    const error = new Error(`Released Practice corpus ${manifest.corpusId} cannot change under corpusVersion ${manifest.corpusVersion}; create a new version`);
    error.code = "PRACTICE_CORPUS_RELEASE_IMMUTABLE";
    throw error;
  }
}

async function validateCheckedIn(files) {
  for (const [file, expected] of files) {
    if (!(await exists(file))) throw new Error(`Missing generated Practice corpus artifact: ${path.relative(root, file)}`);
    const actual = await readFile(file, "utf8");
    if (actual !== expected) throw new Error(`Practice corpus artifact is stale or non-deterministic: ${path.relative(root, file)}`);
  }
}

async function replaceFilesSafely(files) {
  const tempRoot = path.join(practiceRoot, `.build-tmp-${process.pid}`);
  const snapshots = new Map();
  const replacements = [];
  await rm(tempRoot, { recursive: true, force: true });
  try {
    for (const [file, content] of files) {
      snapshots.set(file, await exists(file) ? await readFile(file) : null);
      const relative = path.relative(practiceRoot, file);
      const tempFile = path.join(tempRoot, relative);
      await mkdir(path.dirname(tempFile), { recursive: true });
      await writeFile(tempFile, content, "utf8");
      replacements.push([tempFile, file]);
    }
    for (const [, file] of replacements) await mkdir(path.dirname(file), { recursive: true });
    const completed = [];
    try {
      for (const [tempFile, file] of replacements) {
        await rename(tempFile, file);
        completed.push(file);
      }
    } catch (cause) {
      for (const file of completed.reverse()) {
        const prior = snapshots.get(file);
        if (prior == null) await rm(file, { force: true });
        else await writeFile(file, prior);
      }
      throw cause;
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const registry = JSON.parse(await readFile(sourceRegistryPath, "utf8"));
const registryValidation = validatePracticeCorpusSourceRegistry(registry);
if (!registryValidation.valid) {
  const error = new Error("Practice corpus source registry is invalid");
  error.details = registryValidation.errors;
  throw error;
}
await verifySourceChecksums(registry);

const names = (await readdir(authoringRoot)).filter((name) => name.endsWith(".source.json")).sort();
if (!names.length) throw new Error("No Practice corpus authoring sources found");
const documents = await Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(authoringRoot, name), "utf8"))));
const groups = new Map();
for (const document of documents) {
  const key = releaseKey(document);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(document);
}

const allFiles = new Map();
const summaries = [];
for (const [key, groupDocuments] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const build = buildPracticeCorpusFromInputs({ sourceRegistry: registry, authoringDocuments: groupDocuments, hashText, mode: "production" });
  await enforceReleasedCorpusImmutability(build);
  for (const [file, content] of outputFilesFor(build)) {
    if (allFiles.has(file)) throw new Error(`Duplicate Practice corpus output path: ${path.relative(root, file)}`);
    allFiles.set(file, content);
  }
  summaries.push({ key, diagnostics: build.diagnostics });
}

if (validateOnly) await validateCheckedIn(allFiles);
else await replaceFilesSafely(allFiles);

for (const { key, diagnostics } of summaries) {
  const counts = PRACTICE_CORPUS_PARTITIONS.map((partition) => `${partition}=${diagnostics.partitionCounts[partition]}`).join(", ");
  console.log(`Practice corpus ${validateOnly ? "validated" : "built"}: ${key}`);
  console.log(`  sources=${diagnostics.sourceCount} families=${diagnostics.familyCount} items=${diagnostics.itemCount}`);
  console.log(`  partitions: ${counts}`);
  console.log(`  exactDuplicates=${diagnostics.exactDuplicateCount} hardNearDuplicates=${diagnostics.hardNearDuplicateCount} warnings=${diagnostics.warnings.length}`);
  console.log(`  manifestChecksum=${diagnostics.buildChecksum}`);
}
