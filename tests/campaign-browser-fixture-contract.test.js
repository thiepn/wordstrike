import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const browserDir = new URL("./browser/", import.meta.url);
const uiFixtures = readdirSync(browserDir)
  .filter((name) => /^ui.*\.py$/i.test(name));

for (const name of uiFixtures) {
  const source = readFileSync(new URL(name, browserDir), "utf8");
  assert.equal(
    source.includes("campaign:1"),
    false,
    `${name} must seed the current Campaign onboarding version instead of stale v1`,
  );
}

const ui4 = readFileSync(new URL("ui4_campaign_progression.py", browserDir), "utf8");
assert.match(
  ui4,
  /for \(let level = 1; level <= 16; level \+= 1\)/,
  "UI4 must model real sequential Campaign completion through Level 16 before testing Level 17",
);

for (const name of ["ui7_boss_gameplay.py", "ui7_boss_visual.py"]) {
  const source = readFileSync(new URL(name, browserDir), "utf8");
  assert.match(
    source,
    /Array\.from\(\{length:9\}/,
    `${name} must model genuine completion through Levels 1-9 before testing Level 10`,
  );
}

console.log("Campaign browser fixture version and progression contracts passed.");
