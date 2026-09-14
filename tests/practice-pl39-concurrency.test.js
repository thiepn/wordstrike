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
