import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const [name,file] of [
  ["Problem Words","practiceProblemWordsSessionHost.js"],
  ["Accuracy & Recovery","practiceAccuracyRecoverySessionHost.js"],
]) {
  test(`Phase 7 ${name} pauses ordinary practice on background without auto-resume`, async () => {
    const source=await readFile(new URL(`../js/practiceLab/${file}`,import.meta.url),"utf8");
    assert.match(source,/visibilitychange/);
    assert.match(source,/engine\.handleVisibilityState\(state\)/);
    assert.match(source,/state === "hidden" \|\| state === "visible"/);
    assert.match(source,/removeEventListener\?\.\("visibilitychange"|removeEventListener\("visibilitychange"/);
    assert.doesNotMatch(source,/visibilityState === "visible"\) void engine\.resume/);
  });
}

test("Phase 7 Custom Text excludes background time while preserving automatic return continuity", async () => {
  const source=await readFile(new URL("../js/practiceLab/practiceCustomTextSessionHost.js",import.meta.url),"utf8");
  assert.match(source,/visibilityState === "hidden"\) void engine\.pause/);
  assert.match(source,/visibilityState === "visible"\) void engine\.resume/);
});

test("Phase 7 structured timed/protected protocols keep conservative background invalidation", async () => {
  const [preview,sustained,realText]=await Promise.all([
    readFile(new URL("../js/practiceLab/practicePreviewProtocolSessionHost.js",import.meta.url),"utf8"),
    readFile(new URL("../js/practiceLab/practiceSustainedSessionHost.js",import.meta.url),"utf8"),
    readFile(new URL("../js/practiceLab/practiceRealTextSessionHost.js",import.meta.url),"utf8"),
  ]);
  assert.match(preview,/visibilityState==='hidden'/);
  assert.match(preview,/void exit\(\)/);
  assert.match(sustained,/visibility-hidden/);
  assert.match(realText,/visibility-hidden/);
});
