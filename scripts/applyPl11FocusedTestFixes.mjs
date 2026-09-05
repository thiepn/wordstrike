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

source = source.replace(
`  await typeText(engine, harness, "ab");
  engine.handleInput(harness.input("backspace", ""));
  engine.handleInput(harness.input("character", "b"));
  const appended = engine.appendContent({ text: "cd" });
  assert.equal(appended.content.expectedLength, 4);
  engine.handleInput(harness.input("character", "c"));
  engine.handleInput(harness.input("character", "d"));`,
`  engine.handleInput(harness.input("character", "a"));
  engine.handleInput(harness.input("backspace", ""));
  engine.handleInput(harness.input("character", "a"));
  const appended = engine.appendContent({ text: "cd" });
  assert.equal(appended.content.expectedLength, 4);
  engine.handleInput(harness.input("character", "b"));
  engine.handleInput(harness.input("character", "c"));
  engine.handleInput(harness.input("character", "d"));`
);

const expected = [
  'assert.equal(appended.content.expectedLength, 4);',
  'engine.handleInput(harness.input("character", "a"));\n  engine.handleInput(harness.input("backspace", ""));\n  engine.handleInput(harness.input("character", "a"));',
];
if (source === before && expected.some((needle) => !source.includes(needle))) {
  throw new Error("PL11 focused test fix anchor not found");
}
fs.writeFileSync(file, source);
console.log("PL11 focused test correction applied");
