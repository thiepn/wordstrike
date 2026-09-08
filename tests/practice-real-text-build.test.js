import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("PL24 checked-in Real Text pool rebuild is deterministic and current", () => {
  const result = spawnSync(process.execPath, ["scripts/buildPracticeRealTextPool.mjs", "--check"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /WS-REALTEXT-EN-1/);
  assert.match(result.stdout, /draft/);
});
