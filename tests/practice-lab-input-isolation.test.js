import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Practice shell owns no document/window keyboard listener, hidden input, storage, or session runtime", async () => {
  const files = [
    "practiceFeatureGate.js", "practiceExperimentCatalog.js", "practiceExperimentRegistry.js",
    "practiceLabRoutes.js", "practiceLabViewModel.js", "practiceLabRenderer.js", "practiceLabController.js",
  ];
  const source = (await Promise.all(files.map((file) => readFile(new URL(`../js/practiceLab/${file}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /document\.addEventListener|window\.addEventListener/);
  assert.doesNotMatch(source, /keydown|keyup|beforeinput/);
  assert.doesNotMatch(source, /<input|<textarea|contenteditable/i);
  assert.doesNotMatch(source, /indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /createPracticeSessionEngine\s*\(/);
});

test("app keyboard controller recognizes Practice as a non-gameplay screen and production metadata stays unavailable", async () => {
  const [main, keyboard, modes] = await Promise.all([
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../js/appKeyboardController.js", import.meta.url), "utf8"),
    readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
  ]);
  assert.match(keyboard, /state\.screen === Screens\.PRACTICE_LAB/);
  assert.match(keyboard, /if \(event\.key === "Escape"\) backPracticeLab\?\.\(\)/);
  assert.match(main, /backPracticeLab:\s*\(\) => practiceLabController\?\.back\(\)/);
  assert.match(modes, /id: MODE_IDS\.PRACTICE,[\s\S]*?enabled: false,[\s\S]*?status: "coming-soon"/);
});

test("Practice renderer uses native buttons, labels disabled controls, and provides landmark structure", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceLabRenderer.js", import.meta.url), "utf8");
  assert.match(source, /<header/);
  assert.match(source, /<main>/);
  assert.match(source, /<section/);
  assert.match(source, /<button type="button"/);
  assert.match(source, /disabled aria-disabled="true"/);
  assert.match(source, /aria-labelledby/);
});
