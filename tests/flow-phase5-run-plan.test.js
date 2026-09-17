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
assert.equal(quick.targetMinutes, 2);
assert.equal(quick.chapterCount, 1);
assert.equal(quick.passageCount, 1);
assert.deepEqual(quick.chapters.map(({ title }) => title), ["Settle In"]);
assert.equal(quick.cadenceExcludedAfterIndexes.length, 0);
assert.equal(quick.fullText, quick.segments.map(({ text }) => text).join(""));
assert.ok(quick.wordCount >= 10, quick.wordCount);

const standard = createFlowRunPlan({
  category: "professional",
  difficulty: "advanced",
  sessionLength: "standard",
  seed: "phase5-standard",
});
assert.equal(standard.targetMinutes, 5);
assert.equal(standard.chapterCount, 3);
assert.equal(standard.passageCount, 3);
assert.deepEqual(standard.chapters.map(({ title }) => title), [
  "Settle In", "Momentum", "Final Flow",
]);
assert.ok(standard.segments.filter(({ passageId }) => passageId.startsWith("professional-")).length >= 2);

const long = createFlowRunPlan({
  category: "mixed",
  difficulty: "natural",
  sessionLength: "long",
  seed: "phase5-long",
});
assert.equal(long.targetMinutes, 8);
assert.equal(long.chapterCount, 1);
assert.equal(long.passageCount, 5);
assert.equal(long.coherent, true);
assert.equal(long.continuous, true);
assert.ok(long.seriesId);
assert.ok(long.seriesTitle);
assert.ok(long.wordCount > 450, long.wordCount);
assert.equal(long.segments.every(({ passageId }) => passageId.startsWith(`longform-${long.seriesId}-`)), true);
assert.equal(long.segments.every(({ text }) => text.length >= 400), true);
assert.equal(long.segments.every(({ text }) => !text.includes('"')), true, "default longform should not force quotation-mark practice");
for (let index = 1; index < long.segments.length; index += 1) {
  assert.notEqual(long.segments[index - 1].passageId, long.segments[index].passageId, "planner must avoid immediate repeats");
}
for (const chapter of standard.chapters) {
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

const sameLongformAgain = createFlowRunPlan({
  category: "mixed",
  difficulty: "natural",
  sessionLength: "long",
  seed: "phase5-long",
});
assert.deepEqual(passageIds(long), passageIds(sameLongformAgain), "same default seed must reproduce the same coherent story");

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
const boundaryRun = createFlowTypingRun(standard.fullText, {
  category: standard.category,
  difficulty: standard.difficulty,
  sessionLength: standard.sessionLength,
});
boundaryRun.cadenceExcludedAfterIndexes = [...standard.cadenceExcludedAfterIndexes];
const first = standard.segments[0];
const second = standard.segments[1];
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

console.log("Flow Phase 5 run-plan contracts passed: shorter duration profiles, coherent default longform, deterministic selection, repeat controls, and cadence-safe transitions.");
