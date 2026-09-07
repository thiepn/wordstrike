import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const testsDir = path.join(root, "tests");
for (const name of (await readdir(testsDir)).filter((name) => /^practice-.*\.test\.js$/.test(name) && !name.startsWith("practice-assessment-"))) {
  const file = path.join(testsDir, name);
  const current = await readFile(file, "utf8");
  let next = current;
  next = next.replace(/assert\.equal\(PRACTICE_DAILY_TRAINING\.requiresAssessment,\s*true\)/g, "assert.equal(PRACTICE_DAILY_TRAINING.requiresAssessment, false)");
  next = next.replace(/assert\.deepEqual\(([^\n]*fullAssessment[^\n]*estimatedDurationMinutes[^\n]*),\s*\{\s*minimum:\s*4,\s*recommended:\s*4,\s*maximum:\s*4\s*\}\)/g, "assert.deepEqual($1, { minimum: 4, recommended: 12, maximum: 12 })");
  if (next.includes("dailyTraining") || next.includes("PRACTICE_DAILY_TRAINING")) next = next.replace(/Assessment required/g, "Planned");
  if (next !== current) await writeFile(file, next, "utf8");
}
await rm(path.join(root, ".github/workflows/pl19-optionality-sweep.yml"), { force: true });
await rm(path.join(root, "scripts/pl19OptionalitySweep.mjs"), { force: true });
