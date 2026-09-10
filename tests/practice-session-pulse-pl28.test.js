import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeSessionPulse } from "../js/practiceLab/practiceSessionPulse.js";
import { mountPracticePaceLadderSession } from "../js/practiceLab/practicePaceLadderSessionHost.js";
import { mountPracticeBurstSprintsSession } from "../js/practiceLab/practiceBurstSprintsSessionHost.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function timers() {
  let nextId = 0;
  const pending = new Map();
  return {
    pending,
    setTimer(callback, delay) { const id = nextId++; pending.set(id, { callback, delay }); return id; },
    clearTimer(id) { pending.delete(id); },
    next() {
      const [id, entry] = pending.entries().next().value ?? [];
      assert.ok(entry, "a scheduled pulse is required");
      pending.delete(id);
      return entry.callback();
    },
  };
}

test("session pulse stays inert until start and starts only once", async () => {
  const clock = timers(); let calls = 0;
  const loop = createPracticeSessionPulse({ ...clock, run: () => { calls++; }, intervalMs: 50 });
  assert.equal(clock.pending.size, 0);
  loop.start(); loop.start();
  assert.equal(clock.pending.size, 1);
  assert.equal([...clock.pending.values()][0].delay, 50);
  await clock.next();
  assert.equal(calls, 1);
  assert.equal(clock.pending.size, 1);
  loop.stop(); loop.stop(); loop.start();
  assert.equal(clock.pending.size, 0, "stop is terminal, including timer handle zero");
});

test("session pulse cancels its first timeout even when its handle is zero", () => {
  const clock = timers();
  const loop = createPracticeSessionPulse({ ...clock, run() {}, intervalMs: 50 });
  loop.start();
  assert.equal(clock.pending.has(0), true);
  loop.stop();
  assert.equal(clock.pending.size, 0);
});

test("session pulse cannot overlap slow work or rearm after in-flight cancellation", async () => {
  const clock = timers(); const work = deferred(); let calls = 0;
  const loop = createPracticeSessionPulse({ ...clock, intervalMs: 50, run: () => { calls++; return work.promise; } });
  loop.start();
  const running = clock.next();
  assert.equal(clock.pending.size, 0, "no timeout exists while work is pending");
  loop.start();
  assert.equal(clock.pending.size, 0);
  loop.stop(); work.resolve(); await running;
  assert.equal(calls, 1);
  assert.equal(clock.pending.size, 0);
});

test("session pulse fails closed after a rejected task or error reporter", async () => {
  const clock = timers(); const failure = new Error("tick failed"); const reported = [];
  const loop = createPracticeSessionPulse({
    ...clock, intervalMs: 50,
    async run() { throw failure; },
    async onError(error) { reported.push(error); throw new Error("report failed"); },
  });
  loop.start(); await clock.next();
  assert.deepEqual(reported, [failure]);
  assert.equal(clock.pending.size, 0);
});

test("inactive or stopped sessions do not schedule pulses", () => {
  const clock = timers();
  const inactive = createPracticeSessionPulse({ ...clock, intervalMs: 50, run() {}, isActive: () => false });
  inactive.start();
  const stopped = createPracticeSessionPulse({ ...clock, intervalMs: 50, run() {} });
  stopped.stop(); stopped.start();
  assert.equal(clock.pending.size, 0);
  assert.throws(() => createPracticeSessionPulse({ run() {}, intervalMs: 0 }), TypeError);
});

function hostFixture(t, kind, overrides = {}) {
  const clock = timers();
  const rootListeners = new Map(); const documentListeners = new Map();
  const root = {
    innerHTML: "", focusCount: 0,
    addEventListener(name, handler) { rootListeners.set(name, handler); },
    removeEventListener(name) { rootListeners.delete(name); },
    querySelector() { return { focus() { root.focusCount++; } }; },
    contains() { return true; },
  };
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = {
    visibilityState: "visible",
    addEventListener(name, handler) { documentListeners.set(name, handler); },
    removeEventListener(name) { documentListeners.delete(name); },
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete globalThis.document;
  });
  const snapshot = { lifecycleState: "active", cursorIndex: 0, timing: { activeDurationMs: 0 } };
  let listener = null; let destroyed = 0; let closed = 0; let exited = 0; let ticks = 0; let completes = 0; let interrupts = 0;
  const engine = {
    getSnapshot: () => snapshot,
    async prepare() {}, async start() { return snapshot; },
    subscribe(handler) { listener = handler; return () => { listener = null; }; },
    async tick() { ticks++; return { completed: false, snapshot }; },
    async complete() { completes++; return { summary: { trainingQuality: { status: "complete" } } }; },
    async interrupt() { interrupts++; snapshot.lifecycleState = "interrupted"; },
    async pause() { snapshot.lifecycleState = "paused"; return snapshot; },
    async resume() { snapshot.lifecycleState = "active"; return snapshot; },
    async destroy() { destroyed++; },
    ...overrides,
  };
  const accumulator = { markInterrupted() {}, finalize: () => ({ status: "interrupted", stages: [], sprints: [] }), getCurrentStage: () => null };
  const session = {
    sessionId: "session", profileId: "profile", contextId: "context",
    contentPlan: { text: "the quick brown fox" }, configuration: {},
    plan: { totalActiveDurationMs: kind === "pace" ? 190_000 : 60_000, anchor: {} },
    experiment: { paceAccumulator: accumulator, burstAccumulator: accumulator },
  };
  const mount = () => (kind === "pace" ? mountPracticePaceLadderSession : mountPracticeBurstSprintsSession)({
    root, session, onExit() { exited++; },
    dependencies: {
      dataStore: { close() { closed++; } }, repository: {},
      initialized: { profile: { profileId: "profile" }, context: { contextId: "context" } },
      engineFactory: () => engine, pulseTimers: clock,
    },
  });
  return { clock, root, snapshot, session, engine, mount, document,
    emit(event) { listener?.(snapshot, event); },
    counts: () => ({ destroyed, closed, exited, ticks, completes, interrupts, listeners: rootListeners.size + documentListeners.size }),
  };
}

for (const kind of ["pace", "burst"]) {
  test(`${kind} host owns and releases its timeout/listeners exactly once`, async (t) => {
    const f = hostFixture(t, kind); const host = await f.mount();
    assert.equal(f.clock.pending.size, 1);
    assert.equal([...f.clock.pending.values()][0].delay, kind === "pace" ? 200 : 50);
    assert.equal(f.counts().listeners, 4);
    await host.exit(); await host.exit();
    assert.equal(f.clock.pending.size, 0);
    assert.equal(f.counts().listeners, 0);
    assert.equal(f.counts().destroyed, 1);
    assert.equal(f.counts().closed, 1);
    assert.equal(f.counts().exited, 1);
  });

  for (const step of ["prepare", "start"]) {
    test(`${kind} host cleans up after ${step} rejects`, async (t) => {
      const failure = new Error("initialization failed");
      const f = hostFixture(t, kind, { async [step]() { throw failure; } });
      await assert.rejects(f.mount(), failure);
      assert.equal(f.counts().listeners, 0);
      assert.equal(f.clock.pending.size, 0);
      assert.equal(f.counts().destroyed, 1);
      assert.equal(f.counts().closed, 1);
      assert.equal(f.counts().exited, 0);
    });
  }

  test(`${kind} host stops ticking immediately on completion and never paints after exit`, async (t) => {
    const completion = deferred(); const f = hostFixture(t, kind, { complete: () => completion.promise });
    const host = await f.mount();
    f.emit("completed");
    assert.equal(f.clock.pending.size, 0);
    await host.exit();
    f.root.innerHTML = "new screen";
    completion.resolve({ summary: { trainingQuality: {} } });
    await completion.promise; await Promise.resolve();
    assert.equal(f.root.innerHTML, "new screen");
    assert.equal(f.clock.pending.size, 0);
  });

  test(`${kind} host interruption is single-flight and cancels the timer`, async (t) => {
    const f = hostFixture(t, kind); const host = await f.mount();
    await Promise.all([host.interrupt("manual-stop"), host.interrupt("visibility-hidden")]);
    assert.equal(f.counts().interrupts, 1);
    assert.equal(f.clock.pending.size, 0);
    assert.match(f.root.innerHTML, /Incomplete/);
    await host.exit();
  });

  test(`${kind} host late interruption cannot overwrite another screen`, async (t) => {
    const interruption = deferred(); const f = hostFixture(t, kind, { interrupt: () => interruption.promise });
    const host = await f.mount(); const pending = host.interrupt("manual-stop");
    await host.exit(); f.root.innerHTML = "new screen";
    interruption.resolve(); await pending;
    assert.equal(f.root.innerHTML, "new screen");
    assert.equal(f.clock.pending.size, 0);
  });
}

test("Pace Ladder cannot repaint or rearm when a slow tick resolves after exit", async (t) => {
  const tick = deferred(); const f = hostFixture(t, "pace", { tick: () => tick.promise });
  const host = await f.mount(); const pending = f.clock.next();
  assert.equal(f.clock.pending.size, 0);
  await host.exit(); f.root.innerHTML = "new screen";
  tick.resolve({ completed: false, snapshot: f.snapshot }); await pending;
  assert.equal(f.root.innerHTML, "new screen");
  assert.equal(f.clock.pending.size, 0);
});

test("Burst Sprints cannot enter recovery after an in-flight pause is cancelled", async (t) => {
  const pause = deferred(); const f = hostFixture(t, "burst", { pause: () => pause.promise });
  const host = await f.mount(); f.snapshot.timing.activeDurationMs = 10_000;
  const pending = f.clock.next();
  assert.equal(f.clock.pending.size, 0);
  await host.exit(); f.root.innerHTML = "new screen";
  pause.resolve(); await pending;
  assert.equal(f.root.innerHTML, "new screen");
  assert.equal(f.clock.pending.size, 0);
});

test("Burst Sprints preserves all six bouts and five full recovery intervals", async (t) => {
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  const f = hostFixture(t, "burst"); const host = await f.mount();
  for (let ordinal = 1; ordinal <= 5; ordinal++) {
    f.snapshot.timing.activeDurationMs = ordinal * 10_000;
    await f.clock.next();
    assert.equal(host.getSnapshot().phase, "recovery");
    assert.equal(host.getSnapshot().recoveryRemainingMs, 15_000);
    now += 14_999; await f.clock.next();
    assert.equal(host.getSnapshot().phase, "recovery");
    assert.equal(host.getSnapshot().sprintOrdinal, ordinal);
    now++; await f.clock.next();
    assert.equal(host.getSnapshot().phase, "sprint");
    assert.equal(host.getSnapshot().sprintOrdinal, ordinal + 1);
  }
  f.snapshot.timing.activeDurationMs = 60_000;
  await f.clock.next();
  assert.equal(f.counts().ticks, 1);
  f.emit("completed"); await Promise.resolve();
  assert.equal(f.clock.pending.size, 0);
  assert.equal(f.counts().completes, 1);
  assert.equal(host.getSnapshot().phase, "result");
  await host.exit();
});
