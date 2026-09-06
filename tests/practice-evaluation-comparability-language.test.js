import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeBenchmarkRegistry } from "../js/practiceLab/practiceBenchmarkRegistry.js";
import { createPracticeTransferRegistry } from "../js/practiceLab/practiceTransferRegistry.js";

test("PL18 registries expose only explicitly ready artifacts; draft English artifacts stay unavailable for runtime selection",()=>{
  const bench=createPracticeBenchmarkRegistry({suites:[{suiteId:"draft",suiteSchemaVersion:1,status:"draft",comparabilityClass:"engineering-matched",calibration:null,forms:[]}]});
  const transfer=createPracticeTransferRegistry({pools:[{poolId:"draft",poolSchemaVersion:1,status:"draft",units:[]}]});
  assert.deepEqual(bench.listReadySuites(),[]);
  assert.deepEqual(transfer.listReadyPools(),[]);
});
