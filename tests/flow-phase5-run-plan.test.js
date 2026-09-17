import assert from "node:assert/strict";
import { createFlowTypingRun, insertFlowText, getFlowTypingSnapshot } from "../js/flow/flowEngine.js";
import { createFlowRunPlan, resolveFlowRunPlan } from "../js/flow/flowRunPlan.js";

const rank = { smooth: 0, natural: 1, advanced: 2, expert: 3 };

function passageIds(plan) {
  return plan.segments.map(({ passageId }) => passageId);
}

const quick = createFlowRunPlan({
  category: "mixed",
  difficulty: "advanced",
  sessionLength: "quick",
  seed: "phase5-quick",
});
assert.equal(quick.targetMinutes, 3);
assert.equal(quick.chapterCount, 3);
assert.equal(quick.passageCount, 6);
assert.deepEqual(quick.chapters.map(({ title }) => title), ["Settle In", "Precision", "Final Flow"]);
assert.equal(quick.cadenceExcludedAfterIndexes.length, 5);
assert.equal(quick.fullText, quick.segments.map(({ text }) => text).join(""));
assert.ok(quick.wordCount > 100, quick.wordCount);

const standard = createFlowRunPlan({
  category: "professional",
  difficulty: "advanced",
  sessionLength: "standard",
  seed: "phase5-standard",
});
assert.equal(standard.targetMinutes, 6);
assert.equal(standard.chapterCount, 6);
assert.equal(standard.passageCount, 12);
assert.deepEqual(standard.chapters.map(({ title }) => title), [
  "Settle In", "Momentum", "Precision", "Complexity", "Pressure", "Final Flow",
]);
assert.ok(standard.segments.filter(({ passageId }) => passageId.startsWith("professional-")).length >= 4);

const long = createFlowRunPlan({
  category: "mixed",
  difficulty: "natural",
  sessionLength: "long",
  seed: "phase5-long",
});
assert.equal(long.targetMinutes, 10);
assert.equal(long.chapterCount, 6);
assert.equal(long.passageCount, 24);
assert.ok(long.wordCount > standard.wordCount);
for (let index = 1; index < long.segments.length; index += 1) {
  assert.notEqual(long.segments[index - 1].passageId, long.segments[index].passageId, "planner must avoid immediate repeats");
}
for (const chapter of long.chapters) {
  for (const passage of chapter.passages) {
    assert.ok(rank[passage.difficulty] <= rank[chapter.difficulty], `${passage.id} exceeds ${chapter.difficulty}`);
  }
}

const sameAgain = createFlowRunPlan({
  category: "professional",
  difficulty: "advanced",
  sessionLength: "standard",
  seed: "phase5-standard",
});
assert.deepEqual(passageIds(standard), passageIds(sameAgain), "same seed/options must reproduce the same run");

for (let index = 0; index < standard.segments.length; index += 1) {
  const segment = standard.segments[index];
  assert.equal(standard.fullText.slice(segment.startIndex, segment.endIndex + 1), segment.text);
  if (index > 0) assert.equal(segment.startIndex, standard.segments[index - 1].endIndex + 1);
}

const resolved = resolveFlowRunPlan("flowRun=1&flowLength=quick&flowCategory=dialogue&flowDifficulty=expert&flowSeed=url-seed");
assert.equal(resolved.sessionLength, "quick");
assert.equal(resolved.category, "dialogue");
assert.equal(resolved.difficulty, "expert");
assert.equal(resolved.seed, "url-seed");
assert.equal(resolveFlowRunPlan("flowLength=quick"), null);

// Cadence and WPM must ignore a long deliberate chapter transition.
const boundaryRun = createFlowTypingRun(quick.fullText, {
  category: quick.category,
  difficulty: quick.difficulty,
  sessionLength: quick.sessionLength,
});
boundaryRun.cadenceExcludedAfterIndexes = [...quick.cadenceExcludedAfterIndexes];
const first = quick.segments[0];
const second = quick.segments[1];
let at = 1000;
for (const char of first.text) {
  insertFlowText(boundaryRun, char, at);
  at += 100;
}
const pauseStart = at;
at += 5000;
const pauseEnd = at;
boundaryRun.pauses.push({ reason: "chapter-transition", startAt: pauseStart, endAt: pauseEnd });
for (const char of second.text.slice(0, 12)) {
  insertFlowText(boundaryRun, char, at);
  at += 100;
}
const boundarySnapshot = getFlowTypingSnapshot(boundaryRun);
assert.equal(boundarySnapshot.cadence.pauseCount, 0, "chapter transition must not become a cadence pause");
assert.ok(boundarySnapshot.cadence.finalWpm > 80, boundarySnapshot.cadence.finalWpm);

console.log("Flow Phase 5 run-plan contracts passed: duration profiles, chapter escalation, deterministic selection, repeat controls, and cadence-safe transitions.");
