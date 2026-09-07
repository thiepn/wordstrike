import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeFeatureGate } from "../js/practiceLab/practiceFeatureGate.js";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistry.js";
import { registerPracticeCombinationRepairExperiment } from "../js/practiceLab/practiceCombinationRepairExperiment.js";
import { buildExperimentDetailViewModel } from "../js/practiceLab/practiceLabViewModel.js";
import { renderPracticeLabV20 } from "../js/practiceLab/practiceLabRendererV20.js";
import {
  renderPracticeCombinationRepairResult,
  renderPracticeCombinationRepairSessionSnapshot,
} from "../js/practiceLab/practiceCombinationRepairSessionHost.js";
import { createPracticeLabRoute, PRACTICE_LAB_ROUTES } from "../js/practiceLab/practiceLabRoutes.js";

const root = () => ({ innerHTML: "", querySelector: () => null });
const renderedPhaseText = (html) => [...String(html).matchAll(/data-char-index="\d+">([^<]*)<\/span>/g)]
  .map((match) => match[1].replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"))
  .join("");

function setup() {
  const gate = createPracticeFeatureGate({ developerMode: true });
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  registerPracticeCombinationRepairExperiment(registry, { runtime: { prepare() { throw new Error("not used"); } } });
  const route = createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "combination-repair" });
  return { gate, registry, route };
}

function phaseFixture() {
  const text = "BASETHFOCUSTHCHECKSECRETTH";
  return {
    text,
    targetEntities: [{ entityType: "bigram", entityKey: "th", directTarget: true }],
    metadata: {
      language: "en",
      combinationRepair: {
        target: { entityType: "bigram", entityKey: "th" },
        phaseRanges: [
          { id: "entry-probe", ordinal: 1, label: "Baseline", cue: "none", startIndex: 0, endIndex: 6, opportunityQuota: 5 },
          { id: "acquire", ordinal: 2, label: "Focus", cue: "strong", startIndex: 6, endIndex: 13, opportunityQuota: 15 },
          { id: "integrate", ordinal: 3, label: "Context", cue: "subtle", startIndex: 13, endIndex: 13, opportunityQuota: 12 },
          { id: "interleave", ordinal: 4, label: "Mix", cue: "none", startIndex: 13, endIndex: 13, opportunityQuota: 13 },
          { id: "exit-probe", ordinal: 5, label: "Check", cue: "none", startIndex: 13, endIndex: text.length, opportunityQuota: 5 },
        ],
      },
    },
  };
}

test("Combination Repair developer preview exposes fixed dose, target selector, and all five phases", () => {
  const { registry, route } = setup();
  const view = buildExperimentDetailViewModel({ route, registry, combinationRepairState: { entityType: "bigram", targetValue: "th", status: "idle" } });
  assert.equal(view.kind, "combination-repair-detail");
  assert.equal(view.totalOpportunityCount, 50);
  assert.deepEqual(view.phases.map((phase) => phase.opportunityQuota), [5, 15, 12, 13, 5]);
  assert.equal(view.canPrepare, true);

  const target = root();
  renderPracticeLabV20(target, view);
  assert.match(target.innerHTML, /START COMBINATION REPAIR/);
  assert.match(target.innerHTML, /BIGRAM · 2/);
  assert.match(target.innerHTML, /Baseline/);
  assert.match(target.innerHTML, /Focus/);
  assert.match(target.innerHTML, /Context/);
  assert.match(target.innerHTML, /Mix/);
  assert.match(target.innerHTML, /Check/);
  assert.match(target.innerHTML, /does not establish mastery, retention, transfer, or causal improvement/i);
  assert.match(target.innerHTML, /training/);
});

test("Combination Repair trigram view switches to the 35-opportunity dose", () => {
  const { registry, route } = setup();
  const view = buildExperimentDetailViewModel({ route, registry, combinationRepairState: { entityType: "trigram", targetValue: "the", status: "idle" } });
  assert.equal(view.totalOpportunityCount, 35);
  assert.deepEqual(view.phases.map((phase) => phase.opportunityQuota), [4, 10, 9, 8, 4]);
});

test("Combination Repair shows fail-closed content limitations without substituting a weaker plan", () => {
  const { registry, route } = setup();
  const view = buildExperimentDetailViewModel({ route, registry, combinationRepairState: { entityType: "bigram", targetValue: "nt", status: "limited-content", reasonCode: "INSUFFICIENT_PROBE_MATCH" } });
  const target = root();
  renderPracticeLabV20(target, view);
  assert.match(target.innerHTML, /Limited training content/);
  assert.match(target.innerHTML, /family-disjoint matched Baseline and Check probes/);
  assert.match(target.innerHTML, /No weaker fallback plan will be substituted/);
});

test("active Combination Repair exposes only the current phase and no live aggregate WPM or accuracy", () => {
  const target = root();
  const contentPlan = phaseFixture();
  renderPracticeCombinationRepairSessionSnapshot(target, {
    contentPlan,
    snapshot: {
      lifecycleState: "active",
      cursorIndex: 0,
      errorPositions: [],
      content: { expectedLength: contentPlan.text.length },
      metrics: { wpm: 88, accuracy: 99.9 },
    },
  });
  assert.equal(renderedPhaseText(target.innerHTML), "BASETH");
  assert.doesNotMatch(target.innerHTML, /FOCUSTH/);
  assert.doesNotMatch(target.innerHTML, /CHECKSECRETTH/);
  assert.doesNotMatch(target.innerHTML, />WPM</i);
  assert.doesNotMatch(target.innerHTML, />Accuracy</i);
  assert.match(target.innerHTML, /0% complete/);
});

test("Combination Repair reveals aggregate metrics only from the persisted completed summary", () => {
  const target = root();
  renderPracticeCombinationRepairResult(target, {
    summary: {
      wpm: 72.5,
      accuracy: 98.4,
      trainingQuality: {
        phases: [{ label: "Baseline", opportunityCount: 5, expectedOpportunityCount: 5, quality: 80 }],
        sameSessionCheck: {
          entryQuality: 80,
          exitQuality: 84,
          immediateQualityChange: 4,
          immediateDirection: "higher-at-check",
          interpretation: { wording: "The check reflects immediate within-session performance only." },
        },
      },
    },
  });
  assert.match(target.innerHTML, /72.5/);
  assert.match(target.innerHTML, /98.4%/);
  assert.match(target.innerHTML, /higher-at-check/);
  assert.match(target.innerHTML, /Not established:/);
});

test("Combination Repair remains hidden behind the existing public Practice gate", () => {
  const gate = createPracticeFeatureGate({ developerMode: false });
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  registerPracticeCombinationRepairExperiment(registry, { runtime: { prepare() { throw new Error("not used"); } } });
  const resolved = registry.getResolvedExperiment("combination-repair");
  assert.equal(resolved.featureAllowed, false);
  assert.equal(resolved.runnable, false);
  assert.equal(resolved.availability, "gated");
});
