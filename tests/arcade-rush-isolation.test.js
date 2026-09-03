import assert from "node:assert/strict";
import fs from "node:fs/promises";

const MODULE_FILES = Object.freeze([
  "arcadeRushContract.js",
  "arcadeRushConfig.js",
  "arcadeRushGenerator.js",
  "arcadeRushScoring.js",
  "arcadeRushResult.js",
  "arcadeRushBoss.js",
  "arcadeRushRuntime.js",
  "arcadeRushUi.js",
  "index.js",
]);

const PURE_FILES = new Set([
  "arcadeRushContract.js",
  "arcadeRushConfig.js",
  "arcadeRushGenerator.js",
  "arcadeRushScoring.js",
  "arcadeRushResult.js",
  "arcadeRushBoss.js",
]);

const FORBIDDEN_IMPORT_FRAGMENTS = Object.freeze([
  "../main.js",
  "../state.js",
  "../appStateDomains.js",
  "../modeStorage.js",
  "../leaderboardService.js",
  "../supabaseClient.js",
  "../daily",
  "../../supabase",
]);

for (const file of MODULE_FILES) {
  const source = await fs.readFile(new URL(`../js/arcadeRush/${file}`, import.meta.url), "utf8");
  for (const fragment of FORBIDDEN_IMPORT_FRAGMENTS) {
    assert.equal(source.includes(fragment), false, `${file} must not import ${fragment}`);
  }
  if (PURE_FILES.has(file)) {
    for (const token of [
      "document.",
      "window.",
      "localStorage",
      "sessionStorage",
      "addEventListener(",
      "requestAnimationFrame(",
      "setInterval(",
      "setTimeout(",
      "fetch(",
    ]) {
      assert.equal(source.includes(token), false, `${file} pure boundary contains side-effect token ${token}`);
    }
  }
}

const guardedGlobals = ["document", "window", "localStorage", "sessionStorage"];
const previousDescriptors = new Map(guardedGlobals.map((key) => [
  key,
  Object.getOwnPropertyDescriptor(globalThis, key),
]));
for (const key of guardedGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    get() {
      throw new Error(`Arcade Rush import touched global ${key}`);
    },
  });
}
const previousFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("Arcade Rush import attempted a network request");
};

try {
  for (const file of MODULE_FILES) {
    await import(`../js/arcadeRush/${file}?ar7-isolation=${encodeURIComponent(file)}`);
  }
} finally {
  for (const [key, descriptor] of previousDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  globalThis.fetch = previousFetch;
}

const mainSource = await fs.readFile(new URL("../js/main.js", import.meta.url), "utf8");
const modesSource = await fs.readFile(new URL("../js/modes.js", import.meta.url), "utf8");
const adapterSource = await fs.readFile(new URL("../js/arcadeRushAppController.js", import.meta.url), "utf8");
assert.equal(
  mainSource.includes("./arcadeRush/"),
  false,
  "main.js must integrate Arcade Rush only through the app adapter boundary",
);
assert.ok(
  mainSource.includes('./arcadeRushAppController.js'),
  "AR7 must wire the dedicated Arcade Rush app adapter",
);
assert.ok(
  adapterSource.includes('./arcadeRush/index.js'),
  "the app adapter is the explicit browser integration boundary",
);
assert.ok(modesSource.includes("ARCADE_RUSH"), "Arcade Rush stays registered for the shared session lifecycle");
assert.match(
  modesSource,
  /id: MODE_IDS\.ARCADE_RUSH[\s\S]*?visible: true/,
  "Arcade Rush must remain public after the production cutover",
);
assert.equal(modesSource.includes("Daily Strike"), false, "AR16 removes Daily Strike from the app registry");

console.log("Arcade Rush pure-subsystem isolation and current app-boundary tests passed.");
