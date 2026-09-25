import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildFlowReleaseUrl } from "../js/flow/flowRuntimeLoader.js";

const [gameMode, loader, phase1, index, css, modes] = await Promise.all([
  readFile(new URL("../js/flow/flowGameModeV2.js", import.meta.url), "utf8"),
  readFile(new URL("../js/flow/flowRuntimeLoader.js", import.meta.url), "utf8"),
  readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/flow-game-mode-v2.css", import.meta.url), "utf8"),
  readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
]);

const release = new URL(buildFlowReleaseUrl({
  href: "https://wordstrike.test/?flowCategory=academic&flowDifficulty=expert&flowModifierIds=sprint&flowWeaknesses=old",
  search: "?flowCategory=academic&flowDifficulty=expert&flowModifierIds=sprint&flowWeaknesses=old",
}));

assert.equal(release.searchParams.get("flowRelease"), "1");
assert.equal(release.searchParams.get("flowRun"), "1");
assert.equal(release.searchParams.get("flowModifiers"), "0");
assert.equal(release.searchParams.get("flowAdaptive"), "0");
assert.equal(release.searchParams.get("flowLength"), "standard");

const staleThemeRelease = new URL(buildFlowReleaseUrl({
  href: "https://wordstrike.test/?flowTheme=future-theme",
  search: "?flowTheme=future-theme",
}));
assert.equal(staleThemeRelease.searchParams.get("flowTheme"), "mixed");

for (const key of ["flowCategory", "flowDifficulty", "flowModifierIds", "flowWeaknesses", "flowResumeAdaptive", "flowUiStart", "flowCatalog", "flowPassage"]) {
  assert.equal(release.searchParams.has(key), false, `public Flow must strip legacy practice option ${key}`);
}

// The old game-mode decorator remains loadable for CSS/legacy developer compatibility,
// but the public controller no longer exposes its Ready/setup screen.
assert.match(gameMode, /function decorateRun/);
assert.match(phase1, /function isPublicStreamRun/);
assert.match(phase1, /if \(isPublicStreamRun\(\)\) \{\s*startRun\(\);/);
assert.match(phase1, /event\.key === "Tab"/);
assert.match(phase1, /skipPublicStreamText/);
assert.match(phase1, /data-flow-theme-select/);
assert.match(phase1, /data-flow-session-preset/);
assert.match(phase1, /data-flow-session-remaining/);
assert.match(phase1, /TAB · NEXT TEXT/);
assert.match(phase1, /calculateFlowScoreV3/);
assert.match(phase1, /recordFlowResultV3/);
assert.match(phase1, /createLeaderboardSubmissionService/);

assert.match(loader, /flowGameModeV2\.js\?v=20260923c/);
assert.match(loader, /flowStreamPlanV3\.js\?v=20260923b/);
assert.match(loader, /flowScoreV3\.js\?v=20260923a/);
assert.match(loader, /flowRecordsV3\.js\?v=20260923a/);
assert.match(loader, /flowTheme/);
assert.match(loader, /normalizeStoredFlowTheme/);

assert.match(index, /flow-game-mode-v2\.css\?v=20260925d/);
assert.match(index, /flowRuntimeLoader\.js\?v=20260925d/);
assert.match(css, /FLOW V3: instant-play stream controls/);
assert.match(css, /flow-v3-run-tools/);
assert.match(css, /flow-v3-tab-hint/);

assert.match(modes, /id: MODE_IDS\.FLOW/);
assert.match(modes, /route: "flow-release"/);

console.log("Flow public product contract passed: click-to-type 3-minute stream, in-run Tab skip, session selector, text filter, and V3 scoring runtime.");
