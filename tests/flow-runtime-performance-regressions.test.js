import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  loader: "../js/flow/flowRuntimeLoader.js",
  phase1: "../js/flow/flowPhase1.js",
  gameCss: "../styles/screens/flow-game-mode-v2.css",
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
assert.match(source.loader, /cache\.match\(url\)/, "Flow cache warmup must test its dedicated cache, not another cache namespace");
assert.match(source.loader, /FLOW_OFFLINE_CACHE_BATCH_SIZE = 16/);
assert.match(source.loader, /cacheFlowAssetsInBatches\(cache, missing\)/);
assert.doesNotMatch(source.loader, /cache\.addAll\(missing\)/);
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
assert.match(source.ux8, /keepStreamCaretInTypingViewport/, "public Flow must keep caret motion inside its own bounded typing viewport");
assert.match(source.ux8, /viewport\.scrollTop = targetScrollTop/, "public Flow line movement must scroll the typing viewport, not the page");
assert.match(source.phase1, /refreshPublicStreamPassage/, "paragraph rollover must refresh only the passage content");
assert.match(source.ux8, /positionStreamCaret/, "public Flow must position a dedicated live caret independently from text");
assert.match(source.ux8, /measureCaretExtraWidth/, "public Flow caret must advance through extra letters without moving text");
assert.match(source.ux8, /streamScrollTarget/, "public Flow line shift must keep one explicit target");
assert.match(source.ux8, /cancelAnimationFrame\(streamScrollFrame\)/, "public Flow line shift must cancel superseded animation frames");
assert.match(source.ux8, /const durationMs = 85/, "public Flow line shift must stay short and bounded");
assert.doesNotMatch(source.ux8, /scrollIntoView\([\s\S]*behavior:\s*"smooth"[\s\S]*data-flow-stream-v3/, "public Flow stream must not queue browser smooth-scroll operations");
assert.match(source.phase1, /typedPublicStreamDocumentIndexes/, "Flow progression must derive document credit from typed input");
assert.match(source.phase1, /const nativeControl = target\?\.matches/, "Flow gameplay keys must ignore native run controls");
assert.match(source.phase1, /event\.inputType !== "insertText"/, "Flow must reject paste/drop/replacement beforeinput paths");
assert.match(source.phase1, /addEventListener\("paste", \(event\) => event\.preventDefault\(\)\)/, "Flow capture must block paste explicitly");
assert.match(source.phase1, /if \(isPublicStreamRun\(\)\) \{\s*clearPublicSessionTimer\(\);\s*clearCadenceRefresh\(\);/s, "public timed Flow must not convert hidden time into a pause");
assert.doesNotMatch(source.phase1, /publicSessionDeadlineAt\s*\+=/, "public Flow visibility changes must never extend the session deadline");
assert.match(source.phase1, /const completedAt = timedDeadlineReached \? publicSessionDeadlineAt : currentAt/, "timed Flow completion must stamp the exact deadline");
assert.match(source.ux8, /screen\.addEventListener\("pointerdown"/, "non-interactive run clicks must restore typing focus");
assert.match(source.ux8, /screen\.addEventListener\("focusin"/, "Flow focus state must follow the whole run surface");
assert.match(source.uxCss, /\.flow-ux-focus-hint\s*\{[\s\S]*position:\s*absolute/, "focus recovery hint must not move typing layout");
assert.match(source.phase1, /event\?\.type !== "insert"/, "Tab skip events must not count as typed corpus exposure");
assert.match(source.phase1, /class="flow-word"/, "public Flow must group characters into unbreakable word units");
assert.match(source.gameCss, /font-family:\s*var\(--flow-data-face\)/, "public Flow typing surface must use typing-oriented monospace geometry");
assert.match(source.gameCss, /data-flow-actual/, "substitution typos must render from overlay data without changing glyph geometry");
assert.match(source.phase1, /data-flow-live-caret/, "public Flow must mount a dedicated live caret");
assert.match(source.phase1, /insertAdjacentHTML\("beforeend", publicStreamSegmentMarkup\(segment\)\)/, "paragraph rollover should append look-ahead text instead of replacing the passage");
assert.doesNotMatch(source.phase1, /passage\.innerHTML = publicLongformMarkup\(\)/, "live paragraph rollover must never replace the passage DOM");
assert.match(source.gameCss, /\.flow-v3-live-caret/, "public Flow must style the dedicated live caret");
assert.doesNotMatch(
  source.phase1,
  /if \(isPublicStreamRun\(\) && activeSegmentIndex !== beforeSegment\) \{\s*renderRun\(\)/,
  "public Flow must not rebuild the full run screen at paragraph boundaries",
);
assert.match(source.gameCss, /data-flow-stream-v3="true"/, "public Flow requires the stable stream viewport styles");

assert.doesNotMatch(source.visualCss, /mix-blend-mode:\s*soft-light/, "full-screen blend compositing is too expensive during typing");
assert.doesNotMatch(source.uxCss, /backdrop-filter:\s*blur\(/, "fixed Flow setup dock must avoid continuous backdrop blur compositing");
assert.match(source.visualCss, /@keyframes flow-signal-breathe \{[\s\S]*opacity:/, "meter animation should use compositor-friendly opacity/transform");

console.log("Flow runtime performance regressions protected: same-document entry, idle cache warming, bounded observers, cached HUD, and cheaper compositing.");
