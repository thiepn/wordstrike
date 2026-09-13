import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const controllerUrl = new URL("../js/practiceLab/practiceLabControllerRuntimeV38.js", import.meta.url);
const shellUrl = new URL("../js/practiceLab/practiceLabController.js", import.meta.url);

test("PL38 shell loads V38 while Research orchestration remains lazy", async () => {
  const [controllerSource, shellSource] = await Promise.all([
    readFile(controllerUrl, "utf8"),
    readFile(shellUrl, "utf8"),
  ]);
  assert.match(shellSource, /practiceLabControllerRuntimeV38\.js/);
  assert.match(controllerSource, /createPracticeLabControllerV37/);
  assert.match(controllerSource, /PRACTICE_LAB_ROUTES\.RESEARCH/);
  assert.match(controllerSource, /import\("\.\/practiceResearchRuntime\.js"\)/);
  assert.match(controllerSource, /import\("\.\/practiceResearchProbeSessionHost\.js"\)/);
  assert.match(controllerSource, /import\("\.\/practiceWeakKeysSessionHost\.js"\)/);
  assert.match(controllerSource, /import\("\.\/practiceCombinationRepairSessionHost\.js"\)/);
  assert.match(controllerSource, /import\("\.\/practiceProblemWordsSessionHost\.js"\)/);
  assert.match(controllerSource, /import\("\.\/practiceWeaknessBossSessionHost\.js"\)/);
  assert.match(controllerSource, /title: "Research"/);
  assert.doesNotMatch(shellSource, /practiceResearchRuntime\.js/);
});

test("PL38 controller explicitly consumes abandoned probes and prevents randomized repeat doses", async () => {
  const source = await readFile(controllerUrl, "utf8");
  assert.match(source, /A started baseline\/follow-up measurement consumes this assignment outcome/);
  assert.match(source, /onRepeat: finish/);
  assert.doesNotMatch(source, /onRepeat\(\)[\s\S]{0,180}startTreatment\(/);
  assert.match(source, /declined randomized assignment[\s\S]*not be rerolled/i);
});
