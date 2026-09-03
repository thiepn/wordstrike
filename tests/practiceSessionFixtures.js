import { createDefaultPracticeManifest } from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeManifestStore } from "../js/practiceLab/practiceManifestStore.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { createPracticeRepository } from "../js/practiceLab/practiceRepository.js";
import {
  createGenericPracticeExperimentDescriptor,
  createPracticeContentPlan,
} from "../js/practiceLab/practiceSessionContract.js";

export function createFakeTime() {
  let monotonic = 0;
  let wall = Date.parse("2026-07-05T18:42:13.000Z");
  let nextTimer = 1;
  const timers = new Map();
  const runDue = async () => {
    const due = [...timers.entries()].filter(([, timer]) => timer.due <= monotonic);
    for (const [id, timer] of due) {
      timers.delete(id);
      await timer.callback();
    }
  };
  return {
    clock: () => monotonic,
    wallClock: () => new Date(wall),
    scheduler: {
      setTimeout(callback, delay) {
        const id = nextTimer++;
        timers.set(id, { callback, due: monotonic + delay });
        return id;
      },
      clearTimeout(id) { timers.delete(id); },
    },
    async advance(milliseconds, { runTimers = true } = {}) {
      monotonic += milliseconds;
      wall += milliseconds;
      if (runTimers) await runDue();
    },
    get monotonic() { return monotonic; },
    get wallIso() { return new Date(wall).toISOString(); },
    get timerCount() { return timers.size; },
    async runTimers() { await runDue(); },
  };
}

export async function createPracticeSessionHarness({
  suffix = "fixture",
  experimentOverrides = {},
  text = "alpha beta",
  completion = { mode: "manual", value: null },
  configuration = {},
} = {}) {
  const time = createFakeTime();
  const profileId = createPracticeId("profile", { uuid: () => `${suffix}-profile-12345678` });
  const sessionId = createPracticeId("session", { uuid: () => `${suffix}-session-12345678` });
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  const manifestStore = createPracticeManifestStore({
    storage,
    createDefault: (options) => createDefaultPracticeManifest({
      profileId,
      now: time.wallClock,
      ...options,
    }),
    defaultOptions: { profileId, now: time.wallClock },
  });
  const dataStore = createPracticeMemoryStore();
  const repository = createPracticeRepository({
    dataStore,
    manifestStore,
    now: time.wallClock,
  });
  const initialized = await repository.initializePracticeStorage();
  const contextId = initialized.profile.activeContextId;
  const experiment = createGenericPracticeExperimentDescriptor(experimentOverrides);
  const contentPlan = createPracticeContentPlan({
    contentId: `practice-content_${suffix}`,
    text,
    completion,
    metadata: { sourceType: "generated", language: "en" },
  });
  const input = (type, value = type === "space" ? " " : "") => ({
    type,
    value,
    source: "test",
    monotonicTimestampMs: time.monotonic,
    wallTimestampUtc: time.wallIso,
    modifiers: { ctrl: false, meta: false, alt: false, shift: false },
  });
  return {
    time,
    profileId,
    contextId,
    sessionId,
    repository,
    dataStore,
    experiment,
    contentPlan,
    configuration,
    input,
  };
}
