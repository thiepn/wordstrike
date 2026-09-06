import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const benchmark = JSON.parse(fs.readFileSync(new URL("../data/practice/evaluation/en-v1/benchmark/WS-BENCH-EN-1.manifest.json", import.meta.url), "utf8"));
const transfer = JSON.parse(fs.readFileSync(new URL("../data/practice/evaluation/en-v1/transfer/WS-TRANSFER-EN-1.manifest.json", import.meta.url), "utf8"));

test("PL18 current English protected artifacts remain honest drafts when release gates fail", () => {
  assert.equal(benchmark.suiteId, "WS-BENCH-EN-1");
  assert.equal(benchmark.status, "draft");
  assert.equal(benchmark.forms.length, 0);
  assert.deepEqual(benchmark.matchReport.releaseBlockers, ["minimum-ready-form-count:0/6", "insufficient-protected-form-length", "typability-coverage-below-0.90"]);
  assert.equal(benchmark.comparabilityClass, "engineering-matched");
  assert.equal(benchmark.calibration, null);
  assert.equal(transfer.poolId, "WS-TRANSFER-EN-1");
  assert.equal(transfer.status, "draft");
  assert.equal(transfer.units.length, 0);
  assert.deepEqual(transfer.releaseReport.releaseBlockers, ["minimum-ready-unit-count:0/16", "insufficient-protected-unit-length"]);
});
