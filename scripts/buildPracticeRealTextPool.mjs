import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPracticeRealTextPool } from "../js/practiceLab/practiceRealTextPool.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const outputPath = resolve(root, "data/practice/real-text/en-v1/WS-REALTEXT-EN-1.manifest.json");
const [trainingCorpus, corpusManifest, indexContent, indexManifest, typabilityArtifact, typabilityManifest, sourceRegistry] = await Promise.all([
  readJson("data/practice/training/en-v1.json"),
  readJson("data/practice/manifests/en-v1.manifest.json"),
  readJson("data/practice/indexes/en-v1/training/content.json"),
  readJson("data/practice/indexes/en-v1/manifest.json"),
  readJson("data/practice/models/en-v1/training.json"),
  readJson("data/practice/models/en-v1/manifest.json"),
  readJson("data/practice/provenance/sources.json"),
]);
const pool = buildPracticeRealTextPool({ trainingCorpus, corpusManifest, indexContent, indexManifest, typabilityArtifact, typabilityManifest, sourceRegistry });
const serialized = `${JSON.stringify(pool, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== serialized) {
    console.error("Real Text pool artifact is stale. Run node scripts/buildPracticeRealTextPool.mjs");
    process.exitCode = 1;
  } else console.log(`Real Text pool verified: ${pool.poolId} (${pool.status}, ${pool.units.length} units)`);
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized);
  console.log(`Wrote ${pool.poolId}: ${pool.status}, ${pool.units.length} units, ${pool.checksum}`);
}
