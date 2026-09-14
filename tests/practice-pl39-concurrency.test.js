import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

test("PL39 concurrent completion is idempotent", async () => {
  const h = await createPracticeSessionHarness({ suffix: "pl39-concurrent", text: "abc" });
  const engine = createPracticeSessionEngine({ repository: h.repository, sessionId: h.sessionId, profileId: h.profileId, contextId: h.contextId, clock: h.time.clock, wallClock: h.time.wallClock, scheduler: h.time.scheduler, physicalTelemetryDataStore: h.dataStore });
  await engine.prepare({ experiment: h.experiment, configuration: { timingMode: "on-start", correctionBehavior: "allow" }, contentPlan: h.contentPlan });
  engine.start();
  engine.handleInput(h.input("character", "a"));
  const result = await Promise.allSettled([engine.complete("manual-stop"), engine.complete("manual-stop")]);
  assert.ok(result.some((entry) => entry.status === "fulfilled"));
  assert.equal((await h.repository.listSessionSummaries()).length, 1);
  assert.equal((await h.repository.getPracticeProfile()).totalCompletedSessions, 1);
});

test("PL39 concurrent Custom Text updates use revision compare-and-swap", async () => {
  const h = await createPracticeSessionHarness({ suffix: "pl39-custom-concurrent" });
  const initial = await h.repository.createCustomText({ profileId: h.profileId, title: "Draft", sourceText: "initial text", dataLocale: "en" });
  const update = (sourceText) => h.repository.updateCustomText({ customTextId: initial.customTextId, profileId: h.profileId, expectedRevision: initial.revision, sourceText });
  const result = await Promise.allSettled([update("candidate alpha"), update("candidate beta")]);
  assert.equal(result.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(result.filter((entry) => entry.status === "rejected").length, 1);
  const rejected = result.find((entry) => entry.status === "rejected");
  assert.match(String(rejected.reason?.code ?? rejected.reason?.message), /CONFLICT/i);
  const stored = await h.repository.getCustomText(initial.customTextId);
  assert.equal(stored.revision, 2);
  assert.ok(["candidate alpha", "candidate beta"].includes(stored.sourceText));
});
