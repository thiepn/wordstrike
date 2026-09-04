import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeEventBuffer } from "../js/practiceLab/practiceEventBuffer.js";

test("PL8 event-buffer metadata is bounded, immutable, and content-free", () => {
  const buffer = createPracticeEventBuffer({ capacity: 3 });
  assert.deepEqual(buffer.getMetadata(), {
    capacity: 3,
    retainedEventCount: 0,
    totalEventCount: 0,
    truncated: false,
  });
  buffer.push({ eventIndex: 1, expected: "secret-a", entered: "a" });
  buffer.push({ eventIndex: 2, expected: "secret-b", entered: "b" });
  const partial = buffer.getMetadata();
  assert.equal(Object.isFrozen(partial), true);
  assert.deepEqual(Object.keys(partial).sort(), ["capacity", "retainedEventCount", "totalEventCount", "truncated"].sort());
  assert.equal(JSON.stringify(partial).includes("secret"), false);
  assert.equal(partial.retainedEventCount, 2);
  assert.equal(partial.truncated, false);

  buffer.push({ eventIndex: 3 });
  buffer.push({ eventIndex: 4 });
  assert.deepEqual(buffer.getMetadata(), {
    capacity: 3,
    retainedEventCount: 3,
    totalEventCount: 4,
    truncated: true,
  });
});

test("PL8 event buffer can restore checkpoint-tail coverage without pretending completeness", () => {
  const buffer = createPracticeEventBuffer({ capacity: 4 });
  buffer.restore([{ eventIndex: 7 }, { eventIndex: 8 }], { totalEventCount: 8, truncated: true });
  assert.deepEqual(buffer.getMetadata(), {
    capacity: 4,
    retainedEventCount: 2,
    totalEventCount: 8,
    truncated: true,
  });
  assert.equal(buffer.push({ eventIndex: 9 }), 9);
  assert.equal(buffer.getMetadata().totalEventCount, 9);
});
