import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeFeatureGate } from "../js/practiceLab/practiceFeatureGate.js";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistry.js";
import { registerPracticeWeakKeysExperiment } from "../js/practiceLab/practiceWeakKeysExperiment.js";
import { buildPracticeLabViewModelV21 } from "../js/practiceLab/practiceLabViewModelV21.js";
import { renderPracticeLabV21 } from "../js/practiceLab/practiceLabRendererV21.js";
import {
  renderPracticeWeakKeysResult,
  renderPracticeWeakKeysSessionSnapshot,
} from "../js/practiceLab/practiceWeakKeysSessionHost.js";
import { createPracticeLabRoute, PRACTICE_LAB_ROUTES } from "../js/practiceLab/practiceLabRoutes.js";

const root = () => ({ innerHTML: "", querySelector: () => null });
const renderedPhaseText = (html) => [...String(html).matchAll(/data-char-index="\d+">([^<]*)<\/span>/g)]
  .map((match) => match[1].replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"))
  .join("");

function setup() {
  const gate = createPracticeFeatureGate({ developerMode: true });
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  registerPracticeWeakKeysExperiment(registry, { runtime: { prepare() { throw new Error("not used"); }, inspectTarget() { throw new Error("not used"); } } });
  const route = createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "weak-keys" });
  return { gate, registry, route };
}

test("Weak Keys detail exposes recommendations, one-letter manual input, fixed phases, and restrained claims", () => {
  const { gate, registry, route } = setup();
  const view = buildPracticeLabViewModelV21({
    route,
    registry,
    featureGate: gate,
    weakKeysState: {
      targetValue: "r",
      selectedSource: "manual",
      status: "ready",
      recommendationStatus: "ready",
      recommendations: [{
        statId: "key-r",
        entityKey: "r",
        limiterPhenotype: "slow",
        limiterStatus: "likely",
        evidenceConfidenceScore: 82,
        downstreamExplainedCount: 3,
        saturationDeemphasized: false,
      }],
    },
  });
  assert.equal(view.kind, "weak-keys-detail");
  assert.equal(view.totalOpportunityCount, 80);
  assert.deepEqual(view.phases.map((phase) => phase.opportunityQuota), [8, 24, 20, 20, 8]);
  assert.equal(view.canStart, true);
  const target = root();
  renderPracticeLabV21(target, view);
  assert.match(target.innerHTML, /Recommended keys/);
  assert.match(target.innerHTML, /Manual key/);
  assert.match(target.innerHTML, /START WEAK KEYS/);
  assert.match(target.innerHTML, /Also appears in 3 higher-level limiter explanations/);
  assert.match(target.innerHTML, /does not prescribe a finger/i);
  assert.match(target.innerHTML, /Unknown layouts remain valid and are never treated as QWERTY/i);
  assert.match(target.innerHTML, /Baseline/);
  assert.match(target.innerHTML, /Focus/);
  assert.match(target.innerHTML, /Context/);
  assert.match(target.innerHTML, /Mix/);
  assert.match(target.innerHTML, /Check/);
  assert.match(target.innerHTML, /final Check is not transfer/i);
});

test("Weak Keys empty recommendation state keeps manual practice available", () => {
  const { gate, registry, route } = setup();
  const view = buildPracticeLabViewModelV21({ route, registry, featureGate: gate, weakKeysState: { recommendationStatus: "no-evidence", status: "idle" } });
  const target = root();
  renderPracticeLabV21(target, view);
  assert.match(target.innerHTML, /No weak key is currently well-established/);
  assert.match(target.innerHTML, /Manual practice remains possible/);
});

test("Weak Keys limited content fails closed instead of weakening the protocol", () => {
  const { gate, registry, route } = setup();
  const view = buildPracticeLabViewModelV21({
    route,
    registry,
    featureGate: gate,
    weakKeysState: { targetValue: "q", status: "limited-content", reasonCode: "INSUFFICIENT_PROBE_MATCH", recommendationStatus: "idle" },
  });
  const target = root();
  renderPracticeLabV21(target, view);
  assert.match(target.innerHTML, /Limited training content/);
  assert.match(target.innerHTML, /No responsible family-disjoint matched Baseline\/Check pair/);
  assert.match(target.innerHTML, /No weaker protocol or protected-text fallback/);
  assert.match(target.innerHTML, /data-practice-action="start-weak-keys" disabled>START WEAK KEYS/);
});

test("active Weak Keys renders only the current phase and no live aggregate WPM or accuracy", () => {
  const target = root();
  const contentPlan = {
    text: "BASERFOCUSRSECRET",
    metadata: {
      weakKeys: {
        target: { entityType: "key", entityKey: "r" },
        phaseRanges: [
          { id: "entry-probe", ordinal: 1, label: "Baseline", cue: "none", startIndex: 0, endIndex: 5, opportunityQuota: 8, targetPositions: [4] },
          { id: "focus", ordinal: 2, label: "Focus", cue: "strong", startIndex: 5, endIndex: 11, opportunityQuota: 24, targetPositions: [10] },
          { id: "context", ordinal: 3, label: "Context", cue: "subtle", startIndex: 11, endIndex: 11, opportunityQuota: 20, targetPositions: [] },
          { id: "interleave", ordinal: 4, label: "Mix", cue: "none", startIndex: 11, endIndex: 11, opportunityQuota: 20, targetPositions: [] },
          { id: "exit-probe", ordinal: 5, label: "Check", cue: "none", startIndex: 11, endIndex: 18, opportunityQuota: 8, targetPositions: [17] },
        ],
      },
    },
  };
  renderPracticeWeakKeysSessionSnapshot(target, {
    contentPlan,
    snapshot: { lifecycleState: "active", cursorIndex: 0, errorPositions: [], content: { expectedLength: contentPlan.text.length }, metrics: { wpm: 99, accuracy: 100 } },
  });
  assert.equal(renderedPhaseText(target.innerHTML), "BASER");
  assert.doesNotMatch(target.innerHTML, /FOCUSRSECRET/);
  assert.doesNotMatch(target.innerHTML, />WPM</i);
  assert.doesNotMatch(target.innerHTML, />Accuracy</i);
});

test("Weak Keys Focus cue is non-color-only and Context cue fades", () => {
  const target = root();
  const contentPlan = {
    text: "rain road",
    metadata: {
      weakKeys: {
        target: { entityType: "key", entityKey: "r" },
        phaseRanges: [
          { id: "focus", ordinal: 2, label: "Focus", cue: "strong", startIndex: 0, endIndex: 4, opportunityQuota: 24, targetPositions: [0] },
          { id: "context", ordinal: 3, label: "Context", cue: "subtle", startIndex: 5, endIndex: 9, opportunityQuota: 20, targetPositions: [5] },
        ],
      },
    },
  };
  renderPracticeWeakKeysSessionSnapshot(target, { contentPlan, snapshot: { lifecycleState: "active", cursorIndex: 0, errorPositions: [], content: { expectedLength: 9 } } });
  assert.match(target.innerHTML, /is-target-strong/);
  renderPracticeWeakKeysSessionSnapshot(target, { contentPlan, snapshot: { lifecycleState: "active", cursorIndex: 5, errorPositions: [], content: { expectedLength: 9 } } });
  assert.match(target.innerHTML, /is-target-subtle/);
  assert.doesNotMatch(target.innerHTML, /is-target-strong/);
});

test("Weak Keys results report same-session probe comparison without mastery, retention, transfer, or causal claims", () => {
  const target = root();
  renderPracticeWeakKeysResult(target, {
    summary: {
      configuration: { target: { entityType: "key", entityKey: "r" } },
      beforeMetrics: { quality: 70, firstPassAccuracy: 0.9, normalizedResidualMedianMs: 22, disfluencyRate: 0.15 },
      afterMetrics: { quality: 78, firstPassAccuracy: 0.95, normalizedResidualMedianMs: 12, disfluencyRate: 0.08 },
      trainingQuality: { kind: "weak-keys", immediateProbeDelta: 8, contextVariety: "Broad", targetOpportunityCount: 80, doseUnits: 1 },
    },
  });
  assert.match(target.innerHTML, /Check probe was \+8 quality points relative to the Baseline probe/);
  assert.match(target.innerHTML, /1\.0 · 80 direct key opportunities/);
  assert.match(target.innerHTML, /Long-term improvement requires later sessions and transfer evidence/);
  assert.doesNotMatch(target.innerHTML, /Mastered|Retained|Transferred|fixed forever/i);
  assert.doesNotMatch(target.innerHTML, /Weak Keys improved/i);
});

test("Weak Keys remains behind the existing public Practice feature gate", () => {
  const gate = createPracticeFeatureGate({ developerMode: false });
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  registerPracticeWeakKeysExperiment(registry, { runtime: { prepare() { throw new Error("not used"); } } });
  const resolved = registry.getResolvedExperiment("weak-keys");
  assert.equal(resolved.featureAllowed, false);
  assert.equal(resolved.runnable, false);
  assert.equal(resolved.availability, "gated");
});
