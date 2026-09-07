import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const testsDir = path.join(root, "tests");
const docsDir = path.join(root, "docs");

function advanceWrapper(text) {
  let next = text;
  next = next.replace(/assert\.equal\(PRACTICE_DATABASE_VERSION,\s*6\)/g, "assert.equal(PRACTICE_DATABASE_VERSION, 7)");
  next = next.replace(/assert\.equal\(PRACTICE_RECORD_VERSIONS\.sessionSummary,\s*11\)/g, "assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 12)");
  next = next.replace(/assert\.equal\(PRACTICE_FOUNDATION_ANALYSIS_VERSION,\s*9\)/g, "assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10)");
  next = next.replace(/(foundation(?:Seen)?\.version,\s*)9\b/g, "$110");
  next = next.replace(/(foundationAnalysis\.version,\s*)9\b/g, "$110");
  next = next.replace(/((?:result\.)?summary\.recordVersion,\s*)11\b/g, "$112");
  next = next.replace(/(migration\.value\.recordVersion,\s*)11\b/g, "$112");
  next = next.replace(/(migrated\.value\.recordVersion,\s*)11\b/g, "$112");
  next = next.replace(/("sessionSummary:10->11")(\s*)(?=\])/g, '$1, "sessionSummary:11->12"$2');
  next = next.replace(/('sessionSummary:10->11')(\s*)(?=\])/g, "$1, 'sessionSummary:11->12'$2");
  next = next.replace(/"evaluationStates",\s*"sessionSummaries"/g, '"evaluationStates", "assessmentRuns", "sessionSummaries"');
  next = next.replace(/"evaluationStates",\s*\n(\s*)"sessionSummaries"/g, '"evaluationStates",\n$1"assessmentRuns",\n$1"sessionSummaries"');
  next = next.replace(/assert\.equal\(PRACTICE_STORE_NAMES\.length,\s*14\)/g, "assert.equal(PRACTICE_STORE_NAMES.length, 15)");
  next = next.replace(/assert\.equal\(Object\.keys\(PRACTICE_STORE_DEFINITIONS\)\.length,\s*14\)/g, "assert.equal(Object.keys(PRACTICE_STORE_DEFINITIONS).length, 15)");
  return next;
}

const testFiles = (await readdir(testsDir)).filter((name) => /^practice-.*\.test\.js$/.test(name) && !name.startsWith("practice-assessment-"));
let changedTests = 0;
for (const name of testFiles) {
  const file = path.join(testsDir, name);
  const current = await readFile(file, "utf8");
  const next = advanceWrapper(current);
  if (next !== current) {
    await writeFile(file, next, "utf8");
    changedTests += 1;
  }
}

const docNames = await readdir(docsDir);
const docRules = [
  { match: /BENCHMARK.*TRANSFER/i, text: "PL19 Full Assessment reserves the benchmark form during frozen-plan creation and, for Deep, precommits the cold-transfer unit before Block 1. Reservation never reveals content; PL18 claim-before-reveal, freshness, exposure, and integrity rules remain authoritative. A repeated benchmark remains nonstandard and a claimed interrupted transfer remains consumed." },
  { match: /ABILITY/i, text: "PL19 Full Assessment Block 1 may contribute exactly one `cold-natural-text` PL13 ability observation when PL18 admits a fresh valid benchmark. The Deep cold-transfer block deliberately has `abilityChannel = null`, preventing two correlated ability observations from one assessment battery." },
  { match: /LEARNING.*SATURATION/i, text: "PL19 fixed diagnostic blocks are diagnostic evidence with `targetEntities: []` and contribute zero PL16 acquisition dose. Benchmark also contributes zero acquisition dose. A valid Deep cold-transfer block may add PL16 transfer observations for already tracked entities through PL18 admission." },
  { match: /MASTERY|AUTOMATICITY/i, text: "PL19 never assigns mastery stages. Full Assessment may strengthen the PL11 evidence later consumed by PL15, and its final historical report stores only bounded mastery/automaticity distribution counts from the canonical PL15 snapshot." },
  { match: /REVIEW|RETENTION/i, text: "PL19 assessment child sessions are never PL17 retention reviews. The parent assessment run is separate from review scheduling; active assessment child summaries receive temporary retention protection only while their parent run is active." },
  { match: /DATA.*ARCHITECTURE|STORAGE.*ARCHITECTURE/i, text: "PL19 advances Practice IndexedDB to v7 with `assessmentRuns` (assessmentRun v1), sessionSummary v12 with nullable `assessmentBinding`, and foundationAnalysis v10 with explicit `assessment`. Historical v11 sessions migrate with `assessmentBinding = null` and are never retroactively certified as assessment blocks." },
];
let changedDocs = 0;
for (const name of docNames.filter((name) => name.endsWith(".md") && name !== "PRACTICE_LAB_FULL_ASSESSMENT.md")) {
  const rule = docRules.find((entry) => entry.match.test(name));
  if (!rule) continue;
  const file = path.join(docsDir, name);
  const current = await readFile(file, "utf8");
  if (current.includes("## PL19 Full Assessment integration")) continue;
  const next = `${current.replace(/\s*$/, "")}\n\n## PL19 Full Assessment integration\n\n${rule.text}\n`;
  await writeFile(file, next, "utf8");
  changedDocs += 1;
}

await rm(path.join(root, ".github/workflows/pl19-compat-sweep.yml"), { force: true });
await rm(path.join(root, "scripts/pl19CompatibilitySweep.mjs"), { force: true });
console.log(JSON.stringify({ changedTests, changedDocs }));
