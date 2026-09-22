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


const legacyManualOnly = [
  "assessment-input.yml",
  "pl28-artifacts.yml",
  "pl29-artifacts.yml",
  "pl30-artifacts.yml",
  "pl31-custom-text.yml",
  "pl32-treatment-response.yml",
  "pl33-coach-personalization.yml",
  "pl34-read-ahead.yml",
  "pl35-metronome-typing.yml",
  "pl36-physical-keyboard-telemetry.yml",
  "pl37-weakness-boss.yml",
  "pl38-research-ab.yml",
  "pl39-privacy-security-integrity.yml",
  "pl40-final-release-certification.yml",
  "practice-completion.yml",
  "practice-identity.yml",
  "practice-playability.yml",
  "practice-storage-integrity.yml",
  "practice-workshop.yml",
];

test("Phase 4 historical Practice workflows are manual diagnostics only", async () => {
  for (const name of legacyManualOnly) {
    const source = await readFile(workflowUrl(name), "utf8");
    assert.match(source, /^on:\n  workflow_dispatch:\s*$/m, name);
    assert.doesNotMatch(source, /^  pull_request:/m, name);
    assert.doesNotMatch(source, /^  push:/m, name);
  }
});

test("Phase 4 keeps full-suite and production ownership singular", async () => {
  const globalTests = await readFile(workflowUrl("test.yml"), "utf8");
  const production = await readFile(workflowUrl("practice-live-smoke.yml"), "utf8");
  assert.match(globalTests, /\bnpm test\b/);
  assert.match(production, /practice_live_smoke\.mjs/);
  const matrix = await readFile(workflowUrl("practice-certification.yml"), "utf8");
  assert.doesNotMatch(matrix, /\bnpm test\b/);
  assert.doesNotMatch(matrix, /practice_live_smoke\.mjs/);
});
