/** A mount-owned pulse: one pending timeout or one in-flight task, never both. */
export function createPracticeSessionPulse({
  run,
  intervalMs,
  isActive = () => true,
  onError = () => {},
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  if (typeof run !== "function" || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new TypeError("A session pulse requires a task and a positive interval");
  }
  let started = false;
  let stopped = false;
  let timer = null;

  function schedule() {
    if (!started || stopped || timer !== null || !isActive()) return;
    timer = setTimer(async () => {
      timer = null;
      if (stopped || !isActive()) return;
      try {
        await run();
      } catch (error) {
        stopped = true;
        // A reporting failure must not create an unhandled timer rejection.
        try { await onError(error); } catch {}
      } finally {
        schedule();
      }
    }, intervalMs);
  }

  return Object.freeze({
    start() {
      if (started || stopped) return;
      started = true;
      schedule();
    },
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  });
}
