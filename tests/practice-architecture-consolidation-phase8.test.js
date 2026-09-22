import test from "node:test";
import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => readFile(path.join(root, relative), "utf8");

const legacyControllers = [
  "practiceLabControllerRuntime.js",
  ...[22,23,24,25,26,27,28,29,30,31,32,36,37,38,40].map((version) => `practiceLabControllerRuntimeV${version}.js`),
];
const legacyRenderers = [
  "practiceLabRenderer.js",
  ...[20,21,22,23,24,25,26,27,28,29,30,31,32,36,37,38].map((version) => `practiceLabRendererV${version}.js`),
];
const legacyFiles = [
  ...legacyControllers,
  ...legacyRenderers,
  "practiceExperimentCatalogV30.js",
  "practiceCoachServiceBaseV25.js",
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (/\.(?:js|mjs|py)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

test("Phase 8 production entry uses the canonical Practice controller", async () => {
  const entry = await source("js/practiceLab/practiceLabController.js");
  assert.match(entry, /practiceLabControllerCurrent\.js/);
  assert.doesNotMatch(entry, /practiceLabControllerRuntimeV\d+\.js/);
});

test("Phase 8 canonical controller and renderer have no wrapper-file imports", async () => {
  const [controller, renderer] = await Promise.all([
    source("js/practiceLab/practiceLabControllerCurrent.js"),
    source("js/practiceLab/practiceLabRendererCurrent.js"),
  ]);
  assert.doesNotMatch(controller, /from\s+["'][^"']*practiceLabControllerRuntime(?:V\d+)?\.js/);
  assert.doesNotMatch(controller, /from\s+["'][^"']*practiceLabRenderer(?:V\d+)?\.js/);
  assert.doesNotMatch(renderer, /from\s+["'][^"']*practiceLabRenderer(?:V\d+)?\.js/);
  assert.match(controller, /createPracticeLabControllerCurrent/);
  assert.match(renderer, /renderPracticeLabCurrent/);
});

test("Phase 8 obsolete wrapper files are physically removed", async () => {
  for (const name of legacyFiles) {
    const absolute = path.join(root, "js/practiceLab", name);
    await assert.rejects(access(absolute, fsConstants.F_OK), { code: "ENOENT" }, name);
  }
});

test("Phase 8 source and tests cannot depend on deleted compatibility files", async () => {
  const files = [
    ...await walk(path.join(root, "js")),
    ...await walk(path.join(root, "tests")),
    path.join(root, "sw.js"),
  ];
  const self = fileURLToPath(import.meta.url);
  const offenders = [];
  for (const file of files) {
    if (file === self) continue;
    const text = await readFile(file, "utf8");
    if (legacyFiles.some((name) => text.includes(name))) offenders.push(path.relative(root, file));
  }
  assert.deepEqual(offenders, []);
});

test("Phase 8 catalog and Daily Coach each have one production owner", async () => {
  const [catalog, coach] = await Promise.all([
    source("js/practiceLab/practiceExperimentCatalog.js"),
    source("js/practiceLab/practiceCoachService.js"),
  ]);
  assert.equal(catalog.includes("practiceExperimentCatalogV30.js"), false);
  assert.equal(coach.includes("practiceCoachServiceBaseV25.js"), false);
  assert.match(coach, /createPracticeCoachServiceBase/);
});

test("Phase 8 PWA precaches canonical Practice architecture only", async () => {
  const sw = await source("sw.js");
  assert.match(sw, /practiceLabControllerCurrent\.js/);
  assert.match(sw, /practiceLabRendererCurrent\.js/);
  for (const name of legacyFiles) assert.equal(sw.includes(name), false, name);
  assert.match(sw, /v63-practice-architecture/);
});
