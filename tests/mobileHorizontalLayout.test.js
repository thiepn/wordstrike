import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getHorizontalOverflow } from "../js/layoutDiagnostics.js";

assert.deepEqual(getHorizontalOverflow({
  documentElement: { scrollWidth: 390, clientWidth: 390 },
}), { scrollWidth: 390, clientWidth: 390, overflowPixels: 0, hasOverflow: false });
assert.deepEqual(getHorizontalOverflow({
  documentElement: { scrollWidth: 412, clientWidth: 390 },
}), { scrollWidth: 412, clientWidth: 390, overflowPixels: 22, hasOverflow: true });

const [css, campaignCss] = await Promise.all([
  readFile(new URL("../style.css", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/campaign-progression.css", import.meta.url), "utf8"),
]);
const mobile = css.slice(css.indexOf("@media (max-width: 760px)"), css.indexOf("@media (hover: none)"));
assert.match(css, /\*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing:\s*border-box/s);
assert.match(css, /html,\s*body\s*\{[^}]*max-width:\s*100%/s);
assert.match(css, /#app\s*\{[^}]*max-width:\s*100%[^}]*min-width:\s*0/s);
assert.match(css, /\.screen\s*\{[^}]*max-width:\s*100%[^}]*min-width:\s*0/s);
assert.match(mobile, /--mobile-screen-gutter:\s*12px/);
assert.match(mobile, /padding-left:\s*max\(var\(--mobile-screen-gutter\), env\(safe-area-inset-left\)\)/);
assert.match(mobile, /padding-right:\s*max\(var\(--mobile-screen-gutter\), env\(safe-area-inset-right\)\)/);
assert.doesNotMatch(css, /\.level-grid\s*\{/);
assert.match(campaignCss, /\.campaign-progress-screen\{[^}]*max-width:100%[^}]*min-width:0/);
assert.match(campaignCss, /@media\(max-width:720px\)[\s\S]*\.campaign-sector-track\{[^}]*grid-template-columns:repeat\(5/);
assert.match(campaignCss, /\.campaign-node\{[^}]*min-width:44px[^}]*min-height:58px/);
assert.equal((css.match(/left:\s*var\(--game-viewport-offset-left\)/g) || []).length, 1);

console.log("Mobile width foundations, safe gutters, UI4 Campaign route containment, and single viewport offset application passed.");
