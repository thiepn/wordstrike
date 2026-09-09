import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAllSpeedTestConfigs, SPEED_TEST_TYPES } from "../js/speedTestConfig.js";
import { CURRENT_GAME_VERSION } from "../js/gameVersion.js";

const [packageSource, readme, typingDoc, designSystem] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/TYPING_TEST.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/UI_DESIGN_SYSTEM.md", import.meta.url), "utf8"),
]);

const packageJson = JSON.parse(packageSource);
assert.equal(packageJson.version, CURRENT_GAME_VERSION, "package and runtime game versions must stay aligned");

const configs = getAllSpeedTestConfigs();
const timeDurations = configs
  .filter((config) => config.testType === SPEED_TEST_TYPES.TIME)
  .map((config) => config.durationSeconds);
const wordCounts = configs
  .filter((config) => config.testType === SPEED_TEST_TYPES.WORDS)
  .map((config) => config.wordCount);

assert.deepEqual(timeDurations, [15, 30, 60, 120]);
assert.deepEqual(wordCounts, [10, 25, 50, 100]);
assert.match(readme, /timed tests:\s*\*\*15 \/ 30 \/ 60 \/ 120 seconds\*\*/);
assert.match(readme, /word-count tests:\s*\*\*10 \/ 25 \/ 50 \/ 100 words\*\*/);
assert.match(typingDoc, /Time configurations are 15, 30, 60, and 120 seconds\./);
assert.match(typingDoc, /Word configurations are 10, 25, 50, and 100 words\./);
assert.match(typingDoc, /Daily Strike is retired and has no current production mode/);
assert.doesNotMatch(typingDoc, /Daily Strike retain(?:s|ed)? their existing vocabulary behavior/i);
assert.match(designSystem, /Finalized source of truth for the completed UI1–UI12 redesign/);
assert.match(designSystem, /UI2–UI12 have now completed them/);

console.log("Release finalization contracts passed: version identity, Typing Test configuration docs, retired-mode wording, and UI1–UI12 completion status are current.");
