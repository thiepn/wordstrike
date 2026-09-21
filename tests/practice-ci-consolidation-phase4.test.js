import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowUrl = (name) => new URL(`../.github/workflows/${name}`, import.meta.url);

test("Phase 4 Practice CI has one consolidated automatic certification workflow", async () => {
  const source = await readFile(workflowUrl("practice-certification.yml"), "utf8");
  assert.match(source, /^name: Practice Certification Matrix/m);
  for (const job of ["focused-contracts", "deterministic-content", "data-integrity", "browser-core", "browser-compat", "browser-privacy", "performance", "release-gate"]) {
    assert.match(source, new RegExp(`^  ${job}:$`, "m"), job);
  }
  assert.match(source, /pull_request:/);
  assert.match(source, /branches: \[main\]/);
  assert.doesNotMatch(source, /\bnpm test\b/, "Practice matrix must not duplicate the global full Node suite");
});

test("Phase 4 release gate depends on every Practice certification area", async () => {
  const source = await readFile(workflowUrl("practice-certification.yml"), "utf8");
  for (const dependency of ["focused-contracts", "deterministic-content", "data-integrity", "browser-core", "browser-compat", "browser-privacy", "performance"]) {
    assert.match(source, new RegExp(`- ${dependency}`), dependency);
    assert.match(source, new RegExp(`needs\\.${dependency}\\.result`), dependency);
  }
});

test("Phase 4 keeps deployed Practice smoke separate from source certification", async () => {
  const source = await readFile(workflowUrl("practice-live-smoke.yml"), "utf8");
  assert.match(source, /branches: \[main\]/);
  assert.match(source, /practice_live_smoke\.mjs/);
});
