import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createPracticeAssessmentDiagnosticRegistry } from "../js/practiceLab/practiceAssessmentDiagnostics.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifactPath = fileURLToPath(new URL("../data/practice/assessment/en-v1/diagnostic-forms-v1.manifest.json", import.meta.url));

test("PL19 diagnostic builder reproduces the checked-in artifact without rewriting", () => {
  const output = execFileSync(process.execPath, ["scripts/buildPracticeAssessmentDiagnostics.mjs", "--validate"], { cwd: root, encoding: "utf8" });
  assert.match(output, /PL19 assessment diagnostics valid: draft, 2 source items/);
});

test("PL19 current English diagnostic artifact remains an honest draft with zero ready form sets", async () => {
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const registry = createPracticeAssessmentDiagnosticRegistry({ artifacts: [artifact] });
  assert.equal(artifact.status, "draft");
  assert.equal(artifact.partition, "diagnostic");
  assert.equal(artifact.sourceInventory.approvedDiagnosticItems, 2);
  assert.equal(artifact.sourceInventory.totalSourceGraphemes, 30);
  assert.ok(artifact.formSets.every((set) => set.status === "draft" && set.forms.length === 0));
  assert.equal(registry.getArtifact("en").status, "draft");
  assert.equal(registry.isBlockReady("en", "diagnostic-core-keys"), false);
  assert.ok(artifact.reasons.some((reason) => reason.includes("2200/3300/4400")));
});
