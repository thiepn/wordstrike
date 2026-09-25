import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsRoot = path.join(root, "js");
const allowedDirectStorageOwners = new Set([
  "browserStorage.js",
]);

function collectJsFiles(directory, relative = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const nextRelative = path.join(relative, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (nextRelative.replaceAll("\\", "/").startsWith("practiceLab/")) continue;
      files.push(...collectJsFiles(absolute, nextRelative));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(nextRelative.replaceAll("\\", "/"));
    }
  }
  return files;
}

test("non-Practice runtime centralizes direct Web Storage access", () => {
  const violations = [];
  for (const relative of collectJsFiles(jsRoot)) {
    if (allowedDirectStorageOwners.has(relative)) continue;
    const source = fs.readFileSync(path.join(jsRoot, relative), "utf8");
    if (/\b(?:globalThis|window)\.(?:localStorage|sessionStorage)\b/.test(source)) {
      violations.push(relative);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Direct Web Storage access bypasses Firefox fallback: ${violations.join(", ")}`,
  );
});

test("offline shell precaches the resilient storage runtime", () => {
  const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(
    serviceWorker.includes('"./js/browserStorage.js"'),
    "browserStorage.js must be available to offline module imports",
  );
});

console.log("Firefox compatibility contract centralizes Web Storage and keeps the fallback runtime offline-safe.");
