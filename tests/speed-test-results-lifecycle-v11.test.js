import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

assert.equal(fs.existsSync(path.join(root, "js/speedTestResultsObserverHub.js")), false,
  "V13 must retire the V11/V12 virtual observer compatibility bridge");

const feature = read("js/speedTestResultsFeature.js");
const runtime = read("js/typingResultsRuntime.js");
const modules = [
  "js/speedTestPerformanceV1.js",
  "js/speedTestPerformanceV2.js",
  "js/speedTestPerformanceV3.js",
  "js/speedTestPerformanceV4.js",
  "js/speedTestPerformanceV5.js",
  "js/speedTestResultsV6b.js",
  "js/speedTestResultsV7.js",
];

for (const file of modules) {
  const source = read(file);
  assert.doesNotMatch(source, /new MutationObserver\(/, `${file} must not self-observe in V13`);
  assert.doesNotMatch(source, /DOMContentLoaded/, `${file} must not self-install in V13`);
}

const order = [
  "speedTestPerformanceV1.js",
  "speedTestPerformanceV2.js",
  "speedTestPerformanceV3.js",
  "speedTestPerformanceV4.js",
  "speedTestPerformanceV5.js",
  "speedTestResultsV6b.js",
  "speedTestResultsV7.js",
];
let cursor = -1;
for (const token of order) {
  const index = feature.indexOf(token);
  assert.ok(index > cursor, `native feature import order must preserve ${token}`);
  cursor = index;
}
assert.match(feature, /runSpeedTestResultsFeatures/);
assert.match(feature, /handleSpeedTestResultsDocumentClick/);
assert.match(feature, /closeSpeedTestResultsTransientFeatures/);
assert.match(runtime, /runSpeedTestResultsFeatures/);
assert.match(runtime, /new Observer\(queueSync\)/);

console.log("V11/V12 observer compatibility ownership is fully superseded by the V13 native Typing Results pipeline.");
