import { PRACTICE_SESSION_LIMITS } from "./practiceSessionConstants.js";
import { clonePracticeValue } from "./practiceStorageContract.js";

export function createPracticeEventBuffer({
  capacity = PRACTICE_SESSION_LIMITS.eventBuffer,
} = {}) {
  if (!Number.isInteger(capacity) || capacity < 1) throw new TypeError("Event-buffer capacity must be positive");
  const events = [];
  let totalEventCount = 0;
  let truncated = false;
  return Object.freeze({
    push(event) {
      totalEventCount += 1;
      events.push(Object.freeze(clonePracticeValue(event)));
      if (events.length > capacity) {
        events.splice(0, events.length - capacity);
        truncated = true;
      }
      return totalEventCount;
    },
    getTrace() {
      return Object.freeze(events.map((event) => Object.freeze(clonePracticeValue(event))));
    },
    getTail(count) {
      return Object.freeze(events.slice(-Math.max(0, count)).map((event) => Object.freeze(clonePracticeValue(event))));
    },
    clear() {
      events.length = 0;
    },
    get size() { return events.length; },
    get totalEventCount() { return totalEventCount; },
    get truncated() { return truncated; },
  });
}

