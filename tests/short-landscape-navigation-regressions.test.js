import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../style.css", import.meta.url), "utf8");
const shortLandscape = css.match(/@media \(orientation: landscape\) and \(max-height: 520px\) \{([\s\S]*?)\n\}/)?.[1] || "";

assert.match(shortLandscape, /\.menu-screen,\s*\.mode-screen,\s*\.results-screen,\s*\.settings-screen,\s*\.leaderboards-screen\s*\{[\s\S]*?place-items:\s*start center;[\s\S]*?overflow-y:\s*auto;/);

console.log("Short landscape navigation screens anchor content at the top and remain vertically scrollable.");
