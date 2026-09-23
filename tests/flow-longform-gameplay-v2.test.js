import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createPublicFlowRunPlan,
  FLOW_PUBLIC_LONGFORM_PROFILES,
} from "../js/flow/flowRunPlan.js";

const expected = Object.freeze({
  quick: Object.freeze({ sections: 3, documents: 1, minutes: 3, minWords: 200 }),
  standard: Object.freeze({ sections: 5, documents: 1, minutes: 6, minWords: 400 }),
  long: Object.freeze({ sections: 10, documents: 2, minutes: 10, minWords: 800 }),
});

for (const [length, contract] of Object.entries(expected)) {
  const plan = createPublicFlowRunPlan({ sessionLength: length, seed: "phase2-contract" });
  assert.equal(plan.gameplayVersion, 2);
  assert.equal(plan.structure, "continuous-longform");
  assert.equal(plan.sessionLength, length);
  assert.equal(plan.continuous, true);
  assert.equal(plan.coherent, true);
  assert.equal(plan.modifiers.length, 0);
  assert.equal(plan.adaptive.enabled, false);
  assert.equal(plan.passageCount, contract.sections);
  assert.equal(plan.paragraphCount, contract.sections);
  assert.equal(plan.documentCount, contract.documents);
  assert.equal(plan.targetMinutes, contract.minutes);
  assert.ok(plan.wordCount >= contract.minWords, `${length} should be a genuinely long typing run`);
  assert.equal(new Set(plan.segments.map(({ passageId }) => passageId)).size, plan.segments.length);
  assert.equal(plan.cadenceExcludedAfterIndexes.length, 0);

  const rebuilt = plan.segments.map((segment) => (
    segment.separatorIndex == null ? segment.text : `${segment.text} `
  )).join("");
  assert.equal(plan.fullText, rebuilt);

  for (let index = 0; index < plan.segments.length; index += 1) {
    const segment = plan.segments[index];
    assert.equal(plan.fullText.slice(segment.startIndex, segment.endIndex + 1), segment.text);
    if (index < plan.segments.length - 1) {
      assert.equal(segment.separatorIndex, segment.endIndex + 1);
      assert.equal(plan.fullText[segment.separatorIndex], " ");
      assert.equal(plan.segments[index + 1].startIndex, segment.separatorIndex + 1);
    } else {
      assert.equal(segment.separatorIndex, null);
    }
  }

  if (length === "long") {
    assert.equal(new Set(plan.seriesIds).size, 2, "Long must use two distinct source texts");
  } else {
    assert.equal(plan.seriesIds.length, 1);
  }
}

assert.deepEqual(FLOW_PUBLIC_LONGFORM_PROFILES.quick, { sectionCount: 3, documentCount: 1, targetMinutes: 3 });
assert.deepEqual(FLOW_PUBLIC_LONGFORM_PROFILES.standard, { sectionCount: 5, documentCount: 1, targetMinutes: 6 });
assert.deepEqual(FLOW_PUBLIC_LONGFORM_PROFILES.long, { sectionCount: 10, documentCount: 2, targetMinutes: 10 });

const first = createPublicFlowRunPlan({ sessionLength: "standard", seed: "deterministic-seed" });
const second = createPublicFlowRunPlan({ sessionLength: "standard", seed: "deterministic-seed" });
assert.equal(first.id, second.id);
assert.equal(first.fullText, second.fullText);
assert.deepEqual(first.seriesIds, second.seriesIds);

const phase1 = await readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8");
const gameCss = await readFile(new URL("../styles/screens/flow-game-mode-v2.css", import.meta.url), "utf8");
const gameMode = await readFile(new URL("../js/flow/flowGameModeV2.js", import.meta.url), "utf8");

assert.match(phase1, /data-flow-longform="true"/);
assert.match(phase1, /publicLongformMarkup/);
assert.match(phase1, /syncPublicSegmentIndex/);
assert.match(phase1, /if \(isPublicLongformRun\(\)\) syncPublicSegmentIndex\(\);\s*else if \(maybeAdvanceRunPlan\(\)\) return;/s);
assert.match(phase1, /<span>Score<\/span>/);
assert.match(phase1, /<span>WPM<\/span>/);
assert.match(phase1, /<span>Accuracy<\/span>/);
assert.match(phase1, /<span>Progress<\/span>/);
assert.match(
  phase1,
  /if \(hud\.meter && hud\.meter\.dataset\.flowBand !== flowBand\(gameplay\.flowValue\)\)/,
  "public HUD may omit the legacy Flow meter without throwing during live updates",
);
assert.match(gameCss, /flow-game-v2-hud/);
assert.match(gameCss, /flow-longform-paragraph/);
assert.match(gameCss, /data-flow-paragraph-break/);
assert.match(gameMode, /quick: Object\.freeze\(\{ label: "Quick", detail: "~3 min" \}\)/);
assert.match(gameMode, /standard: Object\.freeze\(\{ label: "Standard", detail: "~6 min" \}\)/);
assert.match(gameMode, /long: Object\.freeze\(\{ label: "Long", detail: "~10 min" \}\)/);

console.log("Flow V2 Phase 2 contracts passed: deterministic 3/5/10-paragraph public runs, uninterrupted longform rendering, compact HUD, and explicit paragraph boundaries.");
