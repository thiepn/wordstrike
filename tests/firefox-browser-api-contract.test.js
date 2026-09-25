import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("non-Practice runtime avoids engine-prefixed and UA-sniffed browser APIs", () => {
  const jsRoot = path.join(root, "js");
  const violations = [];

  const visit = (directory, relative = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const nextRelative = path.join(relative, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (nextRelative.replaceAll("\\", "/").startsWith("practiceLab/")) continue;
        visit(absolute, nextRelative);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
      const source = fs.readFileSync(absolute, "utf8");
      const checks = [
        [/navigator\.userAgent\b/, "UA sniffing"],
        [/\bevent\.path\b/, "Chromium-only event.path"],
        [/\.srcElement\b/, "legacy srcElement"],
        [/webkitRequestFullscreen|webkitEnterFullscreen|mozRequestFullScreen|msRequestFullscreen/, "prefixed fullscreen API"],
        [/\bwindow\.event\b/, "legacy window.event"],
      ];
      for (const [pattern, label] of checks) {
        if (pattern.test(source)) violations.push(`${nextRelative.replaceAll("\\", "/")}: ${label}`);
      }
    }
  };

  visit(jsRoot);
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("mobile input keeps Firefox-safe beforeinput, input and IME fallbacks", () => {
  const source = read("js/mobileInputAdapter.js");
  assert.match(source, /addEventListener\("beforeinput"/);
  assert.match(source, /addEventListener\("input"/);
  assert.match(source, /addEventListener\("compositionstart"/);
  assert.match(source, /addEventListener\("compositionend"/);
  assert.match(source, /event\.isComposing/);
});

test("Typing Test suppresses Firefox IME keydown 229 without consuming composition", () => {
  const source = read("js/main.js");
  assert.match(source, /event\.isComposing\s*\|\|\s*event\.keyCode\s*===\s*229/);
});

test("gameplay viewport works when VisualViewport is absent", () => {
  const source = read("js/gameplayViewport.js");
  assert.match(source, /visualViewport\?\.height/);
  assert.match(source, /innerHeight/);
  assert.match(source, /windowObject\?\.addEventListener\?\.\("resize"/);
  assert.match(source, /visualViewport\?\.addEventListener\?\.\("resize"/);
});

test("Flow idle warmup has a Firefox fallback when requestIdleCallback is absent", () => {
  const source = read("js/flow/flowRuntimeLoader.js");
  assert.match(source, /typeof globalThis\.requestIdleCallback === "function"/);
  assert.match(source, /globalThis\.setTimeout\?\.\(run,/);
});

test("copy interaction does not require Clipboard API support", () => {
  const source = read("js/speedTestPerformanceV5.js");
  assert.match(source, /navigator\?\.clipboard\?\.writeText/);
  assert.match(source, /document\.execCommand\?\.\("copy"\)/);
});

console.log("Firefox browser API contract passed.");
