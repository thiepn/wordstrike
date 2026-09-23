import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [renderer, campaignCss, endlessCss] = await Promise.all([
  readFile(new URL("../js/renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/campaign-gameplay.css", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/endless-gameplay.css", import.meta.url), "utf8"),
]);
assert.match(renderer, /current\.className = "current-letter"/);
assert.match(renderer, /text\.append\(typed, current, remaining\)/);
assert.match(renderer, /current\.textContent = word\.text\.slice\(displayTypedIndex, displayTypedIndex \+ 1\)/);
assert.match(renderer, /remaining\.textContent = word\.text\.slice\(displayTypedIndex \+ 1\)/);
assert.match(campaignCss, /\.word-visual\.active \.current-letter[\s\S]*background:\s*var\(--color-accent\)/);
assert.match(endlessCss, /\.word-visual\.active \.current-letter[\s\S]*background:\s*var\(--ui-accent\)/);
console.log("Campaign and Endless current-word/current-letter indicators are structurally protected.");
