import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const modeRegistry=fs.readFileSync(new URL("../js/modes.js",import.meta.url),"utf8");
test("PL18 does not add public Benchmark or Cold Transfer mode cards",()=>{
  assert.equal(modeRegistry.includes("WS-BENCH-EN-1"),false);
  assert.equal(modeRegistry.includes("WS-TRANSFER-EN-1"),false);
});
