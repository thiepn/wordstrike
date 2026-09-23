import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [v6, v7] = await Promise.all([
  readFile(new URL("../js/speedTestResultsV6b.js", import.meta.url), "utf8"),
  readFile(new URL("../js/speedTestResultsV7.js", import.meta.url), "utf8"),
]);

assert.match(v6, /resultsObserver\.observe\(root, \{ childList: true \}\);/);
assert.doesNotMatch(v6, /resultsObserver\.observe\([^;]*subtree:\s*true/);
assert.match(v6, /practiceStructureObserver\.observe\(root, \{ childList: true \}\);/);
assert.match(v6, /practiceAttributeObserver\.observe\(root, \{[\s\S]*?attributeFilter:\s*\["disabled", "aria-disabled", "data-practice-view"\]/);
assert.match(v7, /rootObserver\.observe\(root, \{ childList: true \}\);/);
assert.match(v7, /bodyObserver\.observe\(document\.body, \{ childList: true \}\);/);
assert.match(v7, /practiceViewObserver\.observe\(overlay, \{[\s\S]*?attributes:\s*true,[\s\S]*?attributeFilter:\s*\["data-practice-view"\]/);
assert.doesNotMatch(v7, /observe\(document\.body, \{ childList: true, subtree: true/);
assert.match(v7, /document\.removeEventListener\("click", onDocumentClickCapture, true\)/);
assert.match(v7, /window\.addEventListener\("pageshow", install\)/);
console.log("Typing Results observers avoid broad subtree child-list hot paths and tear down/reinstall cleanly.");
