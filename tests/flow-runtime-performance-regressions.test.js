import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  loader: "../js/flow/flowRuntimeLoader.js",
  migration: "../js/flow/flowMigrationPresentation.js",
  visual: "../js/flow/flowVisualPhase6.js",
  ui7: "../js/flow/flowUiPhase7.js",
  keyboard: "../js/flow/flowUiPhase7KeyboardGuard.js",
  ux8: "../js/flow/flowUxPhase8.js",
  modifiers: "../js/flow/flowModifiersPhase9.js",
  adaptive: "../js/flow/flowAdaptivePhase10.js",
  integration: "../js/flow/flowIntegrationPhase11.js",
  visualCss: "../styles/screens/flow-visual-phase6.css",
  uxCss: "../styles/screens/flow-ux-phase8.css",
};
const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(new URL(path, import.meta.url), "utf8")]));
const source = Object.fromEntries(entries);

assert.match(source.loader, /replaceUrl\(next\)/);
assert.doesNotMatch(source.loader, /location\.assign\(next\.href\)/);
assert.match(source.loader, /requestIdleCallback/);
assert.match(source.loader, /cache\.addAll\(missing\)/);
assert.match(source.loader, /await Promise\.all\(\[/);
assert.match(source.loader, /activateFromLocation/);
assert.match(source.loader, /integrationBootstrap\.applyFlowIntegrationDefaults\?\.\(\)/, "same-document re-entry must replay persisted Flow setup defaults");
assert.match(source.loader, /keyboardGuard\.refreshFlowUiGuard\?\.\(\)/, "Phase 7 setup must be explicitly refreshed after parallel module load");
assert.match(source.loader, /new MutationObserver\(bindPublicModeEntry\)\.observe\(app, \{ childList: true \}\)/);

for (const key of ["migration", "ui7", "keyboard", "modifiers", "adaptive", "integration"]) {
  assert.doesNotMatch(source[key], /observe\(app, \{ childList: true, subtree: true \}\)/, `${key} must not wake on every live Flow subtree mutation`);
}
assert.match(source.keyboard, /decorateStructure as refreshFlowUiGuard/, "root-only Phase 7 observer needs an explicit one-shot refresh API");
assert.match(source.ui7, /wordstrike:flow-ui7-decorated/, "screen lifecycle must explicitly signal nested UI decoration");
assert.match(source.keyboard, /wordstrike:flow-ui7-decorated/, "Phase 7 guard must refresh on explicit screen lifecycle signals");
assert.doesNotMatch(source.visual, /attributeFilter:\s*\["aria-valuenow"\]/, "visual layer must not observe the live Flow meter attribute");
assert.doesNotMatch(source.visual, /subtree:\s*true/, "visual decorator should only react to root screen replacement");
assert.doesNotMatch(source.ux8, /passageObserver/, "caret visibility must not rely on a live passage MutationObserver");
assert.doesNotMatch(source.ux8, /observe\(app, \{ childList: true, subtree: true \}\)/, "UX root decorator must not wake on every typed character");
assert.match(source.ux8, /scheduleCaretVisibility/, "caret visibility must use the direct frame scheduler");

assert.doesNotMatch(source.visualCss, /mix-blend-mode:\s*soft-light/, "full-screen blend compositing is too expensive during typing");
assert.doesNotMatch(source.uxCss, /backdrop-filter:\s*blur\(/, "fixed Flow setup dock must avoid continuous backdrop blur compositing");
assert.match(source.visualCss, /@keyframes flow-signal-breathe \{[\s\S]*opacity:/, "meter animation should use compositor-friendly opacity/transform");

console.log("Flow runtime performance regressions protected: same-document entry, idle cache warming, bounded observers, cached HUD, and cheaper compositing.");
