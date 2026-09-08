import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../style.css", import.meta.url), "utf8");

// These panels live inside screens that already own horizontal padding. Their
// responsive width must therefore be relative to the parent's content box, not
// the viewport, or tablet/landscape widths can exceed the screen by the padding.
for (const [selector, maximum] of [
  [".leaderboards-panel", "1040px"],
  [".settings-panel", "920px"],
  [".mode-panel", "920px"],
  [".endless-ready-panel,\\s*\\.endless-results-panel", "760px"],
  [".speed-results-panel", "860px"],
]) {
  const pattern = new RegExp(`${selector}\\s*\\{[^}]*width:\\s*min\\(${maximum},\\s*100%\\)`, "s");
  assert.match(css, pattern, `${selector} must size against its padded parent`);
}

assert.match(css, /\.title-panel,\s*\.mode-panel,\s*\.results-panel,\s*\.settings-panel\s*\{[^}]*width:\s*min\(620px,\s*100%\)/s);
assert.doesNotMatch(css, /(?:leaderboards-panel|settings-panel|mode-panel|endless-ready-panel|endless-results-panel|speed-results-panel)[^}]*width:\s*min\([^;]*vw/s);

console.log("Padded panels use parent-relative widths and cannot overflow tablet/landscape screens by their screen gutters.");
