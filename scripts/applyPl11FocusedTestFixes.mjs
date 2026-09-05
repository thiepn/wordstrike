import fs from "node:fs";
const file = "tests/practice-skill-evidence-session-repository.test.js";
let source = fs.readFileSync(file, "utf8");
const before = source;
source = source.replace(
`  const appended = engine.appendContent({ text: "cd" });
  assert.equal(appended.appended, true);
  restored: {
    engine.handleInput(harness.input("character", "c"));
    engine.handleInput(harness.input("character", "d"));
  }`,
`  const appended = engine.appendContent({ text: "cd" });
  assert.equal(appended.content.expectedLength, 4);
  engine.handleInput(harness.input("character", "c"));
  engine.handleInput(harness.input("character", "d"));`
);
if (source === before && !source.includes("assert.equal(appended.content.expectedLength, 4);")) throw new Error("PL11 focused test fix anchor not found");
fs.writeFileSync(file, source);
console.log("PL11 focused test correction applied");
