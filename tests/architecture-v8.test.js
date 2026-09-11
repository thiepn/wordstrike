import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [index, appBootstrap, resultsFeature, presentationBootstrap, appCss, practiceCss] = await Promise.all([
  read("index.html"),
  read("js/appBootstrap.js"),
  read("js/speedTestResultsFeature.js"),
  read("js/presentationBootstrap.js"),
  read("styles/app.css"),
  read("styles/practice-lab.css"),
]);

assert.equal(
  [...index.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*>/g)].length,
  1,
  "index.html should expose one local application stylesheet entrypoint",
);
assert.match(index, /href="styles\/app\.css\?v=20260911v8"/);
assert.match(index, /src="js\/appBootstrap\.js\?v=20260911v8"/);

for (const legacyBootToken of [
  "speedTestPerformanceV1.js",
  "speedTestPerformanceV2.js",
  "speedTestPerformanceV3.js",
  "speedTestPerformanceV4.js",
  "speedTestPerformanceV5.js",
  "speedTestResultsV6.js",
  "speedTestResultsV7.js",
  "practiceLabV20.css",
  "practiceLabV21.css",
  "practiceLabV25.css",
  "campaignGameplayPresentation.js",
  "endlessGameplayPresentation.js",
  "bossGameplayPresentation.js",
  "arcadeRushGameplayPresentation.js",
]) {
  assert.equal(index.includes(legacyBootToken), false, `${legacyBootToken} must not leak into index.html`);
}

const appImportOrder = [
  'import "./main.js";',
  'import "./speedTestResultsFeature.js";',
  'import "./presentationBootstrap.js";',
];
let previousIndex = -1;
for (const token of appImportOrder) {
  const currentIndex = appBootstrap.indexOf(token);
  assert.ok(currentIndex > previousIndex, `application bootstrap order is invalid at ${token}`);
  previousIndex = currentIndex;
}

const resultsImportOrder = [
  "speedTestPerformanceV1.js",
  "speedTestPerformanceV2.js",
  "speedTestPerformanceV3.js",
  "speedTestPerformanceV4.js",
  "speedTestPerformanceV5.js",
  "speedTestResultsV6b.js",
  "speedTestResultsV7.js",
];
previousIndex = -1;
for (const token of resultsImportOrder) {
  const currentIndex = resultsFeature.indexOf(token);
  assert.ok(currentIndex > previousIndex, `Typing Test result enhancement order is invalid at ${token}`);
  previousIndex = currentIndex;
}
assert.equal(resultsFeature.includes('import "./speedTestResultsV6.js";'), false, "V8 must bypass the redundant V6 wrapper");

const presentationImportOrder = [
  "campaignGameplayPresentation.js",
  "endlessGameplayPresentation.js",
  "bossGameplayPresentation.js",
  "arcadeRushGameplayPresentation.js",
  "profileLeaderboardsSettingsPresentation.js",
  "ui12GlobalPresentation.js",
];
previousIndex = -1;
for (const token of presentationImportOrder) {
  const currentIndex = presentationBootstrap.indexOf(token);
  assert.ok(currentIndex > previousIndex, `presentation bootstrap order is invalid at ${token}`);
  previousIndex = currentIndex;
}

assert.match(appCss, /@import url\("\.\/practice-lab\.css\?v=20260911v8"\);/);
const practiceImportOrder = ["practiceLabV20.css", "practiceLabV21.css", "practiceLabV25.css"];
previousIndex = -1;
for (const token of practiceImportOrder) {
  const currentIndex = practiceCss.indexOf(token);
  assert.ok(currentIndex > previousIndex, `Practice Lab cascade order is invalid at ${token}`);
  previousIndex = currentIndex;
}

console.log("WORDSTRIKE V8 architecture invariants passed.");
