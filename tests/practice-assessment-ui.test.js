import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExperimentDetailViewModel, buildPracticeLabViewModel } from "../js/practiceLab/practiceLabViewModel.js";
import { renderPracticeLab } from "../js/practiceLab/practiceLabRenderer.js";

const fullAssessment = Object.freeze({
  id: "full-assessment",
  title: "Full Assessment",
  category: "assessment",
  description: "Measure a structured baseline with protected natural text and fixed diagnostics.",
  longDescription: "Structured battery.",
  primarySkill: "structured typing measurement",
  estimatedDurationMinutes: { minimum: 4, recommended: 12, maximum: 12 },
  difficulty: "all-levels",
  requiresAssessment: false,
  requiresPracticeData: false,
  supportsPhysicalKeyboard: true,
  supportsSoftwareKeyboard: true,
  supportsMobile: true,
  status: "preview",
});
const registry = {
  getResolvedExperiment(id) {
    return id === "full-assessment" ? { catalogEntry: fullAssessment, availability: "preview", runnable: false } : null;
  },
};
const route = { name: "experiment-detail", params: { experimentId: "full-assessment" } };

function fakeRoot() {
  return {
    innerHTML: "",
    ownerDocument: { activeElement: null },
    querySelector() { return null; },
  };
}

test("PL19 Full Assessment detail renders exact depth durations and honest unavailable reasons", () => {
  const view = buildExperimentDetailViewModel({ route, registry });
  assert.equal(view.kind, "full-assessment-detail");
  assert.deepEqual(view.depths.map((item) => [item.depth, item.minutes, item.blockCount]), [
    ["quick", 4, 3],
    ["standard", 8, 6],
    ["deep", 12, 10],
  ]);
  assert.equal(view.depths.every((item) => item.available === false), true);
  assert.equal(view.recommendedDepth, null);

  const root = fakeRoot();
  renderPracticeLab(root, view);
  assert.match(root.innerHTML, /Quick/);
  assert.match(root.innerHTML, /~4 min/);
  assert.match(root.innerHTML, /Standard/);
  assert.match(root.innerHTML, /~8 min/);
  assert.match(root.innerHTML, /Deep/);
  assert.match(root.innerHTML, /~12 min/);
  assert.match(root.innerHTML, /Assessment is optional/);
  assert.match(root.innerHTML, /Diagnostic forms not ready/);
  assert.match(root.innerHTML, /Cold-transfer pool unavailable/);
  assert.equal(root.innerHTML.includes("Typing Score"), false);
  assert.equal(root.innerHTML.includes("overallScore"), false);
  assert.equal(root.innerHTML.includes("Combination Repair now"), false);
});

test("PL19 existing Practice feature gate remains the sole public gate", () => {
  const closedGate = { canAccess: () => false, getSnapshot: () => ({ reason: "public" }) };
  const view = buildPracticeLabViewModel({ route, registry, featureGate: closedGate });
  assert.equal(view.kind, "unavailable");
  const root = fakeRoot();
  renderPracticeLab(root, view);
  assert.match(root.innerHTML, /Practice Lab is coming soon/);
  assert.equal(root.innerHTML.includes("Quick"), false);
});

test("PL19 progress view shows neutral block position without intermediate diagnosis", () => {
  const availability = {
    recommendedDepth: "deep",
    depths: {
      quick: { available: true, reasons: [] },
      standard: { available: true, reasons: [] },
      deep: { available: true, reasons: [] },
    },
  };
  const run = {
    assessmentRunId: "practice-assessment_ui-12345678",
    depth: "standard",
    status: "active",
    progress: { currentBlockIndex: 1, completedBlockCount: 1, terminalBlockCount: 1 },
    blocks: [
      { blockId: "benchmark-natural", status: "completed" },
      { blockId: "diagnostic-core-keys", status: "pending" },
      { blockId: "diagnostic-word-launch", status: "pending" },
      { blockId: "diagnostic-combinations", status: "pending" },
      { blockId: "diagnostic-punctuation-capitals", status: "pending" },
      { blockId: "diagnostic-numbers-symbols", status: "pending" },
    ],
    plan: { blocks: [
      { displayName: "Natural Text" },
      { displayName: "Core Key Coverage" },
      { displayName: "Word Launch / Lexical Control" },
      { displayName: "Combination Coverage" },
      { displayName: "Punctuation + Capitals" },
      { displayName: "Numbers + Symbols" },
    ] },
  };
  const view = buildExperimentDetailViewModel({ route, registry, assessmentAvailability: availability, assessmentRun: run });
  const root = fakeRoot();
  renderPracticeLab(root, view);
  assert.match(root.innerHTML, /Block 2 of 6/);
  assert.match(root.innerHTML, /Core Key Coverage/);
  assert.match(root.innerHTML, /START NEXT BLOCK/);
  assert.equal(root.innerHTML.includes("weakest"), false);
  assert.equal(root.innerHTML.includes("limiter"), false);
});
