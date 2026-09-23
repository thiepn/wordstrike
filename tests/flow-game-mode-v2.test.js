import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildFlowReleaseUrl } from "../js/flow/flowRuntimeLoader.js";

const [gameMode, loader, bootstrap, phase1, index, css, modes] = await Promise.all([
  readFile(new URL("../js/flow/flowGameModeV2.js", import.meta.url), "utf8"),
  readFile(new URL("../js/flow/flowRuntimeLoader.js", import.meta.url), "utf8"),
  readFile(new URL("../js/flow/flowIntegrationBootstrap.js", import.meta.url), "utf8"),
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
assert.equal(release.searchParams.get("flowModifiers"), "0");
assert.equal(release.searchParams.get("flowAdaptive"), "0");
for (const key of ["flowCategory", "flowDifficulty", "flowModifierIds", "flowWeaknesses", "flowResumeAdaptive", "flowUiStart", "flowCatalog", "flowPassage"]) {
  assert.equal(release.searchParams.has(key), false, `public Flow must strip legacy practice option ${key}`);
}

assert.match(gameMode, /LONGFORM SCORE ATTACK/);
assert.match(gameMode, /data-flow-game-length/);
assert.match(gameMode, /Quick/);
assert.match(gameMode, /Standard/);
assert.match(gameMode, /Long/);
assert.match(gameMode, /start\.textContent = "PLAY"/);
assert.match(gameMode, /restart\.textContent = "PLAY AGAIN"/);
assert.match(gameMode, /Text, topic, difficulty, and seed are chosen automatically/);
assert.match(gameMode, /data-flow-game-best/);
assert.match(gameMode, /data-flow-game-recent/);
assert.match(gameMode, /getFlowPersonalBestV2/);
assert.match(gameMode, /getFlowRecentRunsV2/);
assert.doesNotMatch(gameMode, /data-flow-choice-group="category"/);
assert.doesNotMatch(gameMode, /data-flow-choice-group="difficulty"/);
assert.doesNotMatch(gameMode, /data-flow-modifier-id/);
assert.match(gameMode, /history\?\.replaceState/);
assert.doesNotMatch(gameMode, /location\.(?:assign|replace)|location\.reload/);

assert.match(loader, /flowGameModeV2\.js\?v=20260923d/);
assert.match(loader, /flowModifiers", "0"/);
assert.match(loader, /flowAdaptive", "0"/);
assert.match(bootstrap, /const publicGameMode = url\.searchParams\.get\("flowRelease"\) === "1"/);
assert.match(bootstrap, /publicGameMode\s*\? \[\["flowLength", setup\.sessionLength\]\]/);
assert.match(bootstrap, /!publicGameMode &&\s*url\.searchParams\.get\("flowModifiers"\)/s);
assert.match(phase1, /refreshPlanFromLocation: refreshFlowPlanFromLocation/);
assert.match(phase1, /startCurrentRun: startCurrentFlowRun/);

assert.match(index, /flow-game-mode-v2\.css\?v=20260923c/);
assert.match(css, /flow-game-v2-lengths/);
assert.match(css, /flow-game-v2-play-button/);
assert.match(css, /flow-game-v2-record-summary/);
assert.match(css, /flow-v2-result-metrics/);
assert.match(modes, /shortLabel: "Longform"/);
assert.match(modes, /description: "Type long-form texts and chase a higher score\."/);

console.log("Flow V2 Phase 1 contracts passed: public Flow is a minimal longform game with length-only choice and automatic run configuration.");
