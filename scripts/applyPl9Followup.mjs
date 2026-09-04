import fs from "node:fs";

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing follow-up anchor in ${path}: ${before}`);
  fs.writeFileSync(path, source.replace(before, after));
}

replaceExact(
  "tests/practice-latency-session-integration.test.js",
  "  assert.equal(result.summary.recordVersion, 3);",
  "  assert.equal(result.summary.recordVersion, 4);",
);

console.log("PL9 follow-up patches applied");
