import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8");

assert.match(source, /const LIVE_CADENCE_INTERVAL_MS = 180;/);
assert.match(source, /let mountedCharacterNodes = new Map\(\);/);
assert.match(source, /let mountedRunHud = null;/);
assert.match(source, /function mountRunHud\(/);
assert.match(source, /function updateCharacterRange\(/);
assert.match(source, /function scheduleCadenceHud\(/);
assert.match(source, /getPerformanceStats: \(\) => \(\{ \.\.\.performanceStats \}\)/);

const updateRunView = source.match(/function updateRunView\([\s\S]*?\n}\n\nfunction renderHesitationAnalysis/);
assert.ok(updateRunView, "Flow updateRunView implementation is missing");
assert.doesNotMatch(updateRunView[0], /visibleCharacterView\(\)/, "live typing must not rebuild the full visible character view");
assert.doesNotMatch(updateRunView[0], /getFlowTypingSnapshot\(run\)/, "live typing must not clone the full Flow snapshot per keypress");
assert.doesNotMatch(updateRunView[0], /querySelector\(`\[data-flow-char=/, "live typing must use the mounted character-node cache");
assert.match(updateRunView[0], /updateCharacterRange\(startIndex, endIndex\)/);
assert.match(updateRunView[0], /scheduleCadenceHud\(\)/);
assert.doesNotMatch(updateRunView[0], /querySelector/, "live update path should use mounted HUD and character caches");

const inputHandlers = source.match(/function deleteBackward\([\s\S]*?\n}\n\nfunction tryLaunchDeveloperFlow/);
assert.ok(inputHandlers, "Flow input handlers are missing");
assert.match(inputHandlers[0], /updateRunView\(run\.currentIndex, beforeIndex\)/);
assert.match(inputHandlers[0], /updateRunView\(Math\.max\(0, beforeIndex - 1\), run\.currentIndex\)/);

console.log("Flow performance hot-path contracts passed: incremental character DOM updates, no full live snapshot, and throttled cadence analysis.");
