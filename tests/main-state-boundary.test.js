import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getStateOwner } from "../js/state.js";

function undeclaredWrites(source, objectName) {
  const pattern = new RegExp(`${objectName}\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)`, "g");
  const writes = [...source.matchAll(pattern)].map((match) => match[1]);
  return {
    writes,
    unowned: [...new Set(writes)].filter((property) => !getStateOwner(property)),
  };
}

test("orchestration modules may only write declared state properties", async () => {
  const [main, keyboard] = await Promise.all([
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../js/appKeyboardController.js", import.meta.url), "utf8"),
  ]);
  const mainWrites = undeclaredWrites(main, "appState");
  const keyboardWrites = undeclaredWrites(keyboard, "state");
  assert.ok(mainWrites.writes.length > 0, "expected main orchestration to retain state writes during migration");
  assert.ok(keyboardWrites.writes.length > 0, "expected keyboard controller to own navigation state writes");
  assert.deepEqual(mainWrites.unowned, [], `main.js contains undeclared state writes: ${mainWrites.unowned.join(", ")}`);
  assert.deepEqual(keyboardWrites.unowned, [], `keyboard controller contains undeclared state writes: ${keyboardWrites.unowned.join(", ")}`);
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
