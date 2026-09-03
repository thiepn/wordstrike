import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
const onboardingModules = await Promise.all([
  "onboarding.js", "onboardingContent.js", "onboardingStorage.js", "onboardingView.js",
].map((file) => readFile(new URL(`../js/${file}`, import.meta.url), "utf8")));

assert.match(main, /renderCurrentScreen\(\);\s*openAutomaticTutorial\("general"/);
assert.match(main, /openAutomaticTutorial\("campaign"/);
assert.match(main, /openAutomaticTutorial\("typing"[\s\S]*resetSpeedTestAttempt\("mode-select"\)/);
assert.match(main, /openAutomaticTutorial\("endless"/);
assert.doesNotMatch(main, /openAutomaticTutorial\("daily"/);
assert.match(main, /openAutomaticTutorial\("boss"/);
assert.match(main, /openAutomaticTutorial\("leaderboards"/);
assert.match(main, /safeLevel % 10 === 0[\s\S]*openAutomaticTutorial\("boss"[\s\S]*return;/);
assert.match(main, /typedBuffer === getSpeedTestCurrentWord\(speedState\)/);
assert.match(main, /window\.wordstrikeOnboarding = Object\.freeze/);
assert.match(main, /openAutomaticTutorial\("general", \(choice\) =>/);
assert.doesNotMatch(main, /openAutomaticTutorial\("general"[\s\S]{0,300}openLevelSelect/);
assert.doesNotMatch(onboardingModules.join("\n"), /beginSession|startSpeedTest|prepareResultSubmission|submitCurrentResult|recordCompletedSession/);
assert.doesNotMatch(onboardingModules.join("\n"), /Daily Strike|\bdaily\b/i);

console.log("Current first-title, mode, boss, and leaderboard tutorial triggers are one-shot and retired Daily has no onboarding trigger.");
