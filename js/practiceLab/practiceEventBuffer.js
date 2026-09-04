import { PRACTICE_SESSION_LIMITS } from "./practiceSessionConstants.js";
import { clonePracticeValue } from "./practiceStorageContract.js";

const freezeMetadata = ({ capacity, retainedEventCount, totalEventCount, truncated }) => Object.freeze({
  capacity,
  retainedEventCount,
  totalEventCount,
  truncated,
});

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
    restore(restoredEvents = [], metadata = {}) {
      if (!Array.isArray(restoredEvents)) throw new TypeError("Restored Practice event trace must be an array");
      events.length = 0;
      const retained = restoredEvents.slice(-capacity).map((event) => Object.freeze(clonePracticeValue(event)));
      events.push(...retained);
      const suppliedTotal = Number.isInteger(metadata.totalEventCount) && metadata.totalEventCount >= 0
        ? metadata.totalEventCount
        : retained.length;
      totalEventCount = Math.max(suppliedTotal, retained.length);
      truncated = Boolean(metadata.truncated || restoredEvents.length > capacity || totalEventCount > retained.length);
      return freezeMetadata({ capacity, retainedEventCount: events.length, totalEventCount, truncated });
    },
    getTrace() {
      return Object.freeze(events.map((event) => Object.freeze(clonePracticeValue(event))));
    },
    getTail(count) {
      return Object.freeze(events.slice(-Math.max(0, count)).map((event) => Object.freeze(clonePracticeValue(event))));
    },
    getMetadata() {
      return freezeMetadata({
        capacity,
        retainedEventCount: events.length,
        totalEventCount,
        truncated,
      });
    },
    clear() {
      events.length = 0;
    },
    get size() { return events.length; },
    get totalEventCount() { return totalEventCount; },
    get truncated() { return truncated; },
  });
}
