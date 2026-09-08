import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [legacyCss, modeCss, ui, index] = await Promise.all([
  readFile(new URL("../style.css", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/mode-select.css", import.meta.url), "utf8"),
  readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
]);

assert.match(index, /styles\/screens\/title\.css[\s\S]*styles\/screens\/mode-select\.css/);
assert.match(modeCss, /\.mode-select-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.23fr\) minmax\(330px, 0\.77fr\)/s);
assert.match(modeCss, /\.mode-option\s*\{[^}]*min-height:\s*82px/s);
assert.match(modeCss, /@media \(max-width: 980px\)[\s\S]*\.mode-select-layout\s*\{[^}]*grid-template-columns:\s*1fr/s);
assert.match(modeCss, /@media \(max-width: 620px\)[\s\S]*\.mode-options-list\s*\{[^}]*grid-template-columns:\s*1fr/s);
assert.match(modeCss, /@media \(max-width: 620px\)[\s\S]*\.mode-option\s*\{[^}]*min-height:\s*76px/s);
assert.match(modeCss, /@media \(min-width: 981px\) and \(max-height: 680px\)/);
assert.match(modeCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(ui, /class="mode-option available/);
assert.match(ui, /class="mode-option coming-soon/);
assert.match(ui, /data-mode-home-index/);
assert.doesNotMatch(legacyCss, /\.mode-card\s*\{/);
assert.doesNotMatch(legacyCss, /\.mode-grid\s*\{/);
assert.doesNotMatch(legacyCss, /\.mode-description\s*\{/);

console.log("UI3 Mode Select owns desktop, tablet, mobile, short-height, and reduced-motion density outside legacy CSS.");
