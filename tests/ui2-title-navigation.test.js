import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const ui = read("js/ui.js");
const css = read("styles/screens/title.css");
const index = read("index.html");
const legacyCss = read("style.css");
const uiSystem = read("styles/ui-system.css");
const doc = read("docs/UI2_TITLE_NAVIGATION.md");

const titleStart = ui.indexOf("export function renderTitle");
const titleEnd = ui.indexOf("export function renderModeSelect");
const titleSource = ui.slice(titleStart, titleEnd);

test("UI2 Title stylesheet loads after the UI1 system", () => {
  const uiSystemIndex = index.indexOf('href="styles/ui-system.css"');
  const titleIndex = index.indexOf('href="styles/screens/title.css"');
  assert.ok(uiSystemIndex >= 0, "UI1 design system link missing");
  assert.ok(titleIndex > uiSystemIndex, "UI2 Title stylesheet must load after UI1");
});

test("UI2 Title uses the new composition and removes terminal-era decorations", () => {
  for (const required of [
    'class="screen menu-screen title-screen"',
    'class="title-shell"',
    'class="title-hero"',
    'class="title-global-nav"',
    'aria-label="Global navigation"',
    'class="title-start-button',
    'data-title-index="0"',
  ]) {
    assert.ok(titleSource.includes(required), `missing UI2 Title contract: ${required}`);
  }
  for (const retired of ["ambient-word", "title-panel", "menu-list", "System online // defend the core"]) {
    assert.ok(!titleSource.includes(retired), `retired Title treatment remains: ${retired}`);
  }
});

test("UI2 preserves the exact four top-level action routes and ordering", () => {
  const routes = [...titleSource.matchAll(/data-title-index="(\d)"[\s\S]*?data-action="([^"]+)"/g)]
    .map((match) => [Number(match[1]), match[2]]);
  assert.deepEqual(routes, [
    [0, "modes"],
    [1, "open-leaderboards"],
    [2, "profile"],
    [3, "settings"],
  ]);
  assert.match(titleSource, />START</);
});

test("UI2 uses semantic navigation, native actions and one coherent line-icon language", () => {
  assert.match(titleSource, /<nav class="title-global-nav" aria-label="Global navigation">/);
  assert.equal((titleSource.match(/<button/g) || []).length, 4);
  assert.ok(!/[😀-🙏🌀-🫿]/u.test(titleSource), "emoji must not be used as Title icons");
  assert.match(titleSource, /<svg class="ui-icon" viewBox="0 0 24 24"/);
  assert.match(titleSource, /stroke="currentColor"/);
});

test("UI2 Title action targets and focus states meet the foundation contract", () => {
  assert.match(css, /\.title-start-button\s*\{[\s\S]*?min-height:\s*68px/);
  assert.match(css, /\.title-nav-action\s*\{[\s\S]*?min-height:\s*70px/);
  assert.match(css, /\.title-nav-action:focus-visible[\s\S]*?--focus-ring/);
  assert.match(css, /\.title-start-button:focus-visible[\s\S]*?--focus-ring/);
});

test("UI2 responsive CSS explicitly covers mobile, short desktop and reduced motion", () => {
  assert.match(css, /@media\s*\(max-width:\s*820px\)/);
  assert.match(css, /@media\s*\(max-width:\s*520px\)/);
  assert.match(css, /@media\s*\(max-height:\s*650px\) and \(min-width:\s*821px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /overflow-y:\s*auto/);
});

test("UI2 directly retires legacy Title-only construction styles", () => {
  assert.ok(!legacyCss.includes(".ambient-word {"), "legacy ambient-word animation should be retired");
  assert.ok(!legacyCss.includes(".menu-list {"), "legacy Title menu-list should be retired");
  assert.ok(!legacyCss.includes(".title-panel {"), "legacy Title panel block should be retired");
  assert.ok(!/\n\s*\.title-panel,\n\s*\.mode-panel/.test(legacyCss), "legacy shared panel selector still owns Title");
  assert.ok(!/\n\s*\.title-panel,\n\s*\.mode-panel/.test(uiSystem), "UI1 compatibility selector still owns Title");
});

test("UI2 documentation freezes scope and Practice Lab exclusion", () => {
  for (const phrase of [
    "Title screen composition",
    "Global navigation rail",
    "Practice Lab remains explicitly excluded",
    "UI3 should begin from this merged Title-screen state",
  ]) {
    assert.ok(doc.includes(phrase), `UI2 documentation missing: ${phrase}`);
  }
});

console.log("UI2 Title screen, global navigation, responsive, accessibility and migration contracts passed.");
