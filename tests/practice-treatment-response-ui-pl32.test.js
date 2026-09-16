import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPracticeTreatmentResponseViewModel } from "../js/practiceLab/practiceTreatmentResponseViewModel.js";
import { renderPracticeTreatmentResponseProgress } from "../js/practiceLab/practiceLabRendererV32.js";

const state = Object.freeze({
  treatmentResponseStateId: "response-1",
  profileId: "profile-1",
  contextId: "context-1",
  responseModelVersion: 1,
  treatmentFamilyKey: "weak-keys:family",
  targetEntityType: "key",
  outcomeKey: "same-protocol-retest",
  delayBucket: "next-day",
  responseUnit: "quality-points",
  updatedAt: "2026-09-10T12:00:00.000Z",
  summary: Object.freeze({
    count: 5,
    median: 6.5,
    mad: 1.2,
    positiveCount: 4,
    negativeCount: 0,
    deadbandCount: 1,
    distinctDays: 4,
    distinctTargets: 2,
    manualCount: 3,
    coachCount: 2,
    contaminatedEpisodeCount: 1,
    responsePattern: "positive-signal",
    evidenceDepth: "medium",
    practicalThreshold: 5,
    hybridOnly: false,
  }),
});

const episode = Object.freeze({
  treatmentEpisodeId: "episode-1",
  profileId: "profile-1",
  contextId: "context-1",
  assignmentKind: "manual",
  status: "closed",
  createdAt: "2026-09-08T10:00:00.000Z",
  updatedAt: "2026-09-10T12:00:00.000Z",
  treatment: Object.freeze({
    treatmentFamilyKey: "weak-keys:family",
    experimentId: "weak-keys",
    protocolVariant: "one-dose",
    targetEntityType: "key",
    targetEntityKey: "e",
    completedAt: "2026-09-08T10:10:00.000Z",
  }),
  outcomes: Object.freeze([
    Object.freeze({ outcomeKey: "same-protocol-retest", status: "observed" }),
    Object.freeze({ outcomeKey: "retention-review", status: "contaminated" }),
    Object.freeze({ outcomeKey: "cold-transfer", status: "expired" }),
  ]),
});

test("Treatment Response progress view uses observational wording and exposes evidence provenance", () => {
  const view = buildPracticeTreatmentResponseViewModel({ states: [state], episodes: [episode] });
  assert.equal(view.kind, "treatment-response-progress");
  assert.equal(view.hasEvidence, true);
  assert.match(view.doctrine, /does not prove/i);
  assert.match(view.doctrine, /outside WordStrike is not observed/i);
  assert.equal(view.cards.length, 1);
  assert.equal(view.cards[0].patternLabel, "Positive observed signal");
  assert.equal(view.cards[0].medianLabel, "+6.5 quality pts");
  assert.equal(view.cards[0].evidenceDepthLabel, "Medium");
  assert.equal(view.cards[0].manualCount, 3);
  assert.equal(view.cards[0].coachCount, 2);
  assert.equal(view.cards[0].contaminatedEpisodeCount, 1);
  assert.equal(view.recentEpisodes[0].contaminated, 1);
});

test("pending treatment episodes explain why Treatment Response can be empty", () => {
  const pending = { ...episode, treatmentEpisodeId: "episode-pending", status: "tracking", outcomes: episode.outcomes.map((outcome) => ({ ...outcome, status: "pending" })) };
  const view = buildPracticeTreatmentResponseViewModel({ states: [], episodes: [pending] });
  assert.equal(view.hasEvidence, false);
  assert.equal(view.trackingCount, 1);
  assert.match(view.emptyDescription, /waiting for a compatible later observation/i);
  assert.match(view.emptyDescription, /Same-session Check results are intentionally not counted/i);
});

test("Treatment Response renderer keeps the non-causal doctrine visible", () => {
  const view = buildPracticeTreatmentResponseViewModel({ states: [state], episodes: [episode] });
  const root = {
    innerHTML: "",
    querySelector() { return null; },
  };
  assert.equal(renderPracticeTreatmentResponseProgress(root, view), true);
  assert.match(root.innerHTML, /Treatment Response/);
  assert.match(root.innerHTML, /does not prove that a treatment caused/i);
  assert.match(root.innerHTML, /Positive observed signal/);
  assert.doesNotMatch(root.innerHTML, /proven effective|non-responder|responder classification/i);
});

test("V32 controller route-lazy-loads Treatment Response persistence", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceLabControllerRuntimeV32.js", import.meta.url), "utf8");
  assert.match(source, /import\("\.\/practiceTreatmentResponseRuntime\.js"\)/);
  assert.doesNotMatch(source, /^import .*practiceTreatmentResponseRuntime\.js/m);
  assert.match(source, /PRACTICE_LAB_ROUTES\.PROGRESS/);
});
