import assert from "node:assert/strict";
import { createModeLifecycle } from "../js/modeLifecycle.js";

const routes = [
  ["campaign", "level-select"],
  ["speed-test", "speed-test"],
  ["endless", "endless-ready"],
  ["flow", "flow-release"],
  ["practice", "practice-lab"],
];
const modes = Object.fromEntries(routes.map(([id, route]) => [id, { id, route, enabled: true }]));
modes.retired = { id: "retired", route: null, enabled: false };
const called = [];
const handlers = Object.fromEntries(routes.map(([, route]) => [
  route,
  () => { called.push(route); return true; },
]));
const lifecycle = createModeLifecycle({
  resolveMode: (modeId) => modes[modeId] || null,
  handlers,
});
for (const [id, route] of routes) {
  assert.equal(lifecycle.enter(id), true, `${id} must enter through shared host ownership`);
  assert.equal(lifecycle.getSnapshot().modeId, id);
  assert.equal(called.at(-1), route);
  assert.equal(lifecycle.leave(), true);
  assert.equal(lifecycle.getSnapshot().modeId, null);
}
assert.equal(lifecycle.leave(), false, "idle lifecycle cannot exit twice");
assert.equal(lifecycle.enter("retired"), false, "retired modes remain unreachable");
assert.equal(lifecycle.enter("unknown"), false, "unknown modes remain unreachable");
assert.equal(lifecycle.getSnapshot().modeId, null);
assert.throws(() => createModeLifecycle(), TypeError);
const blocked = createModeLifecycle({
  resolveMode: () => ({ id: "flow", route: "flow-release", enabled: true }),
  handlers: { "flow-release": () => false },
});
assert.equal(blocked.enter("flow"), false, "failed activation must not claim ownership");
assert.deepEqual(blocked.getSnapshot(), { modeId: null, generation: 0 });
console.log("P1 mode lifecycle contracts passed: five entries, exit, disabled modes and rejected handoffs.");
