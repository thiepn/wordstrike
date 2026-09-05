import test from "node:test";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

test("diagnose PL13 ineligible engine commit", async () => {
  const harness = await createPracticeSessionHarness({
    suffix: "pl13-diagnostic",
    text: "a".repeat(100),
    completion: { mode: "manual", value: null },
    experimentOverrides: { abilityChannel: "common-words" },
  });
  const engine = createPracticeSessionEngine({
    repository: harness.repository,
    sessionId: harness.sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await engine.prepare({ experiment: harness.experiment, configuration: { correctionBehavior: "allow" }, contentPlan: harness.contentPlan });
  await engine.start();
  for (let i = 0; i < harness.contentPlan.text.length; i += 1) {
    if (i) await harness.time.advance(160, { runTimers: false });
    engine.handleInput(harness.input("character", "a"));
  }
  try {
    await engine.complete("manual-stop");
  } catch (error) {
    console.error("PL13_DIAGNOSTIC", JSON.stringify({
      outer: { code: error?.code, message: error?.message },
      cause: { code: error?.cause?.code, message: error?.cause?.message, details: error?.cause?.details, cause: error?.cause?.cause },
    }, null, 2));
  }
});
