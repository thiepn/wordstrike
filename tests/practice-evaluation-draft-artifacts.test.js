import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const benchmark = JSON.parse(fs.readFileSync(new URL("../data/practice/evaluation/en-v1/benchmark/WS-BENCH-EN-1.manifest.json", import.meta.url), "utf8"));
const transfer = JSON.parse(fs.readFileSync(new URL("../data/practice/evaluation/en-v1/transfer/WS-TRANSFER-EN-1.manifest.json", import.meta.url), "utf8"));

test("PL18 current English protected artifacts meet release gates with governed protected content", () => {
  assert.equal(benchmark.suiteId, "WS-BENCH-EN-1");
  assert.equal(benchmark.status, "ready");
  assert.equal(benchmark.forms.length, 6);
  assert.deepEqual(benchmark.matchReport.releaseBlockers, []);
  assert.equal(benchmark.comparabilityClass, "engineering-matched");
  assert.equal(benchmark.calibration, null);
  assert.equal(transfer.poolId, "WS-TRANSFER-EN-1");
  assert.equal(transfer.status, "ready");
  assert.equal(transfer.units.length, 16);
  assert.deepEqual(transfer.releaseReport.releaseBlockers, []);
});
