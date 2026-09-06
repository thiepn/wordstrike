import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

for (const script of ["scripts/buildPracticeBenchmarkSuite.mjs", "scripts/buildPracticeTransferPool.mjs"]) {
  test(`PL18 ${script} validates the checked-in deterministic protected artifact`, () => {
    const result = spawnSync(process.execPath, [script, "--validate"], { cwd: new URL("../", import.meta.url), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /artifact valid: draft, 0/);
  });
}
