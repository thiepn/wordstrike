import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runPracticeDataAction } from "../js/practiceLab/practiceDataManagement.js";

function runtimeHarness({ fail = false } = {}) {
  const calls = [];
  let closed = false;
  return {
    calls,
    get closed() { return closed; },
    async factory() {
      return {
        repository: {
          async initializePracticeStorage() { calls.push(["initialize"]); },
          async resetPracticeData(options) {
            calls.push(["reset", options]);
            if (fail) throw Object.assign(new Error("write failed"), { code: "PRACTICE_STORAGE_WRITE_FAILED" });
            return true;
          },
        },
        close() { closed = true; },
      };
    },
  };
}

test("Practice data reset preserves user content through the repository contract", async () => {
  const harness = runtimeHarness();
  const result = await runPracticeDataAction("reset", { confirm: () => true, runtimeFactory: () => harness.factory() });
  assert.equal(result.status, "success");
  assert.deepEqual(harness.calls, [["initialize"], ["reset", {}]]);
  assert.equal(harness.closed, true);
  assert.match(result.message, /Custom Text was kept/);
});

test("Practice full wipe explicitly requests user-content deletion", async () => {
  const harness = runtimeHarness();
  const result = await runPracticeDataAction("wipe", { confirm: () => true, runtimeFactory: () => harness.factory() });
  assert.equal(result.status, "success");
  assert.deepEqual(harness.calls, [["initialize"], ["reset", { deleteUserContent: true }]]);
  assert.equal(harness.closed, true);
});

test("Practice data action cancellation never opens storage", async () => {
  let opened = false;
  const result = await runPracticeDataAction("wipe", { confirm: () => false, runtimeFactory: async () => { opened = true; } });
  assert.equal(result.status, "cancelled");
  assert.equal(opened, false);
});

test("Practice data failures remain explicit and close their runtime", async () => {
  const harness = runtimeHarness({ fail: true });
  const result = await runPracticeDataAction("reset", { confirm: () => true, runtimeFactory: () => harness.factory() });
  assert.equal(result.status, "error");
  assert.equal(result.code, "PRACTICE_STORAGE_WRITE_FAILED");
  assert.equal(harness.closed, true);
});

test("Settings exposes Practice help replay and the two bounded data actions", async () => {
  const [ui, main, sw] = await Promise.all([
    readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /data-tutorial-id="\$\{id\}"/);
  assert.match(ui, /\["practice", "PRACTICE LAB GUIDE"\]/);
  assert.match(ui, /data-practice-data-action="reset"/);
  assert.match(ui, /data-practice-data-action="wipe"/);
  assert.match(ui, /handlers\.practiceData/);
  assert.match(main, /practiceData:\s*managePracticeData/);
  assert.match(main, /runPracticeDataAction/);
  assert.match(main, /manageData:\s*openPracticeDataSettings/);
  assert.match(main, /\.settings-practice-data/);
  assert.match(sw, /practiceDataManagement\.js/);
});
