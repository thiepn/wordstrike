import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 8 production entry uses the canonical Practice controller", async () => {
  const entry = await source("js/practiceLab/practiceLabController.js");
  assert.match(entry, /practiceLabControllerCurrent\.js/);
  assert.doesNotMatch(entry, /practiceLabControllerRuntimeV\d+\.js/);
});

test("Phase 8 canonical controller and renderer have no version-wrapper imports", async () => {
  const [controller, renderer] = await Promise.all([
    source("js/practiceLab/practiceLabControllerCurrent.js"),
    source("js/practiceLab/practiceLabRendererCurrent.js"),
  ]);
  assert.doesNotMatch(controller, /from\s+["'][^"']*practiceLabControllerRuntimeV\d+\.js/);
  assert.doesNotMatch(controller, /from\s+["'][^"']*practiceLabRendererV\d+\.js/);
  assert.doesNotMatch(renderer, /from\s+["'][^"']*practiceLabRendererV\d+\.js/);
  assert.match(controller, /createPracticeLabControllerCurrent/);
  assert.match(renderer, /renderPracticeLabCurrent/);
});

test("Phase 8 catalog and Daily Coach each have one production owner", async () => {
  const [catalog, coach] = await Promise.all([
    source("js/practiceLab/practiceExperimentCatalog.js"),
    source("js/practiceLab/practiceCoachService.js"),
  ]);
  assert.doesNotMatch(catalog, /from\s+["'][^"']*practiceExperimentCatalogV30\.js/);
  assert.doesNotMatch(coach, /from\s+["'][^"']*practiceCoachServiceBaseV25\.js/);
});

test("Phase 8 PWA precaches canonical Practice architecture only", async () => {
  const sw = await source("sw.js");
  assert.match(sw, /practiceLabControllerCurrent\.js/);
  assert.match(sw, /practiceLabRendererCurrent\.js/);
  assert.doesNotMatch(sw, /practiceLabControllerRuntimeV\d+\.js/);
  assert.doesNotMatch(sw, /practiceLabRendererV\d+\.js/);
  assert.doesNotMatch(sw, /practiceCoachServiceBaseV25\.js/);
  assert.doesNotMatch(sw, /practiceExperimentCatalogV30\.js/);
  assert.match(sw, /v63-practice-architecture/);
});
