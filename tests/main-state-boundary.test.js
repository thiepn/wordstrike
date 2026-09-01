import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getStateOwner } from "../js/state.js";

test("main.js may only write declared state properties", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const writes = [...source.matchAll(/appState\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map((match) => match[1]);
  assert.ok(writes.length > 0, "expected the legacy orchestration layer to contain state writes during migration");
  const unowned = [...new Set(writes)].filter((property) => !getStateOwner(property));
  assert.deepEqual(unowned, [], `main.js contains undeclared state writes: ${unowned.join(", ")}`);
});

test("new state ownership is defined outside main.js and state.js", async () => {
  const [main, state, domains] = await Promise.all([
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../js/state.js", import.meta.url), "utf8"),
    readFile(new URL("../js/appStateDomains.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(main, /const\s+appState\s*=\s*\{/);
  assert.doesNotMatch(state, /const\s+appState\s*=\s*\{/);
  assert.match(domains, /export const appState = Object\.preventExtensions\(facade\)/);
  assert.match(domains, /export const stateDomains/);
});
