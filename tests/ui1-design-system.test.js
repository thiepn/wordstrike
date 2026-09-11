import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const css = read("styles/ui-system.css");
const index = read("index.html");
const appCss = read("styles/app.css");
const designDoc = read("docs/UI_DESIGN_SYSTEM.md");
const migrationDoc = read("docs/UI1_MIGRATION.md");

const requiredTokens = [
  "--font-ui", "--font-game", "--text-display", "--text-stat", "--color-bg",
  "--color-surface-1", "--color-surface-2", "--color-text-primary", "--color-text-muted",
  "--color-border-subtle", "--color-accent", "--color-special", "--color-danger",
  "--color-success", "--space-1", "--space-8", "--radius-md", "--shadow-elevation-medium",
  "--bloom-accent-sm", "--motion-fast", "--motion-cinematic", "--focus-ring",
];
const requiredPrimitives = [
  ".ui-surface", ".ui-button", ".ui-button--primary", ".ui-button--secondary", ".ui-button--ghost",
  ".ui-button--danger", ".ui-icon-button", ".ui-icon", ".ui-field", ".ui-input", ".ui-select",
  ".ui-toggle", ".ui-check", ".ui-segmented", ".ui-tabs", ".ui-metric", ".ui-badge",
  ".ui-backdrop", ".ui-modal", ".ui-hint", ".ui-tooltip", ".ui-hud", ".ui-hud-group", ".ui-hud-surface",
];

test("UI1 stylesheet loads after legacy CSS so staged migration is deterministic", () => {
  assert.match(index, /href="styles\/app\.css\?v=20260911v8"/,
    "V8 index must expose the semantic stylesheet boundary");
  const legacy = appCss.indexOf('@import url("../style.css")');
  const uiSystem = appCss.indexOf('@import url("./ui-system.css")');
  assert.ok(legacy >= 0, "legacy stylesheet import is missing from styles/app.css");
  assert.ok(uiSystem > legacy, "UI system must load after legacy style.css inside styles/app.css");
  assert.doesNotMatch(index, /href="style\.css"|href="styles\/ui-system\.css"/,
    "V8 must not restore pre-boundary top-level stylesheet links");
});

test("UI1 exposes semantic typography, color, spacing, effect and motion tokens", () => {
  for (const token of requiredTokens) assert.ok(css.includes(token), `missing design token ${token}`);
  assert.match(css, /--font-ui:\s*Inter,\s*ui-sans-serif/);
  assert.match(css, /--font-game:\s*"JetBrains Mono"/);
});

test("UI1 separates ordinary interface typography from gameplay/data typography", () => {
  assert.match(css, /body\s*\{[\s\S]*?font-family:\s*var\(--font-ui\)/);
  for (const gameplaySelector of [".word-visual", ".speed-test-word", ".hud-value", ".boss-timer", ".boss-phrase", ".arcade-rush-hud-stat strong"]) {
    assert.ok(css.includes(gameplaySelector), `game/data font contract missing ${gameplaySelector}`);
  }
  assert.match(css, /font-family:\s*var\(--font-game\)/);
});

test("UI1 preserves Practice Lab presentation while removing scanlines elsewhere", () => {
  assert.match(css, /\.practice-lab-screen[\s\S]*?font-family:\s*var\(--font-game\)/);
  assert.match(css, /\.screen:not\(\.practice-lab-screen\)::after\s*\{\s*display:\s*none/);
  assert.ok(designDoc.includes("Practice Lab boundary"));
  assert.ok(migrationDoc.includes("Practice Lab exclusion"));
});

test("UI1 includes the reusable primitive families needed by UI2–UI12", () => {
  for (const primitive of requiredPrimitives) assert.ok(css.includes(primitive), `missing reusable primitive ${primitive}`);
});

test("action interactions are stable, accessible and avoid legacy sideways motion", () => {
  assert.ok(!css.includes("translateX(3px)"), "UI1 must not restore sideways hover motion");
  assert.ok(!/transition\s*:\s*all/i.test(css), "core design system must not use transition: all");
  assert.match(css, /transform:\s*translateY\(-1px\)/);
  assert.match(css, /:focus-visible[\s\S]*?--focus-ring/);
  assert.match(css, /min-height:\s*44px/);
});

test("UI1 has an explicit reduced-motion contract", () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /transition-duration:\s*0\.001ms/);
});

test("UI1 uses an offline-safe font strategy and no design-system network imports", () => {
  assert.ok(!/@import\s+url/i.test(css));
  assert.ok(!/fonts\.googleapis\.com/i.test(css));
  assert.ok(designDoc.includes("No external font request is required"));
});

test("UI1 documentation freezes the neon semantic budget and later phase ownership", () => {
  for (const phrase of ["Neon communicates state", "80–90% neutral", "UI2 — Title + global navigation", "UI12 — final motion/audio/responsive/accessibility polish"]) {
    assert.ok(designDoc.includes(phrase), `design source of truth missing: ${phrase}`);
  }
});

console.log("UI1 design-system tokens, semantic cascade, primitives, typography, accessibility and Practice Lab boundary passed.");
