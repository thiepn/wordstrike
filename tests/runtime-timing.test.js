import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  GAMEPLAY_MAX_FRAME_DELTA_MS,
  clampGameplayFrameDelta,
} from "../js/runtimeTiming.js";

assert.equal(GAMEPLAY_MAX_FRAME_DELTA_MS, 100);
assert.equal(clampGameplayFrameDelta(16, null), 0);
assert.equal(clampGameplayFrameDelta(Number.NaN, 10), 0);
assert.equal(clampGameplayFrameDelta(10, Number.NaN), 0);
assert.equal(clampGameplayFrameDelta(10, 20), 0);
assert.equal(clampGameplayFrameDelta(26, 10), 16);
assert.equal(clampGameplayFrameDelta(5_000, 10), 100);
assert.equal(clampGameplayFrameDelta(5_000, 10, 50), 50);

const [campaign, boss, endless, arcade] = await Promise.all([
  readFile(new URL("../js/gameLoop.js", import.meta.url), "utf8"),
  readFile(new URL("../js/bossLoop.js", import.meta.url), "utf8"),
  readFile(new URL("../js/endlessMode.js", import.meta.url), "utf8"),
  readFile(new URL("../js/arcadeRush/arcadeRushRuntime.js", import.meta.url), "utf8"),
]);
for (const [name, source] of Object.entries({ campaign, boss, endless, arcade })) {
  assert.match(source, /clampGameplayFrameDelta/, `${name} must use the shared frame-delta contract`);
}
console.log("Gameplay runtimes share a non-negative, 100 ms capped requestAnimationFrame delta contract.");
