import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistry.js";
import { PRACTICE_REGISTRY_ERROR_CODES } from "../js/practiceLab/practiceExperimentRegistry.js";

const catalog = Object.freeze([Object.freeze({ id: "fixture", category: "precision", status: "available" })]);
const descriptor = (overrides = {}) => ({ id: "fixture", version: 1, title: "Fixture", category: "precision", sessionSchemaVersion: 1, defaultCorrectionBehavior: "allow", supportedCompletionModes: ["content"], resumable: true, ...overrides });

test("registry validates a future session-engine-compatible descriptor and resolves availability", () => {
  const gate = { canAccess: () => true };
  const registry = createPracticeExperimentRegistry({ catalog, featureGate: gate });
  const events = [];
  registry.subscribe((event) => events.push(event));
  registry.register({ experimentId: "fixture", implementationVersion: 1, descriptorFactory: descriptor, sessionFactory() {} });
  assert.equal(registry.hasImplementation("fixture"), true);
  assert.equal(registry.getResolvedExperiment("fixture").runnable, true);
  assert.equal(events.length, 1);
  assert.equal(registry.unregister("fixture"), true);
  assert.equal(events.length, 2);
});

test("registry rejects unknown, duplicate, mismatched, and invalid descriptors", () => {
  const registry = createPracticeExperimentRegistry({ catalog });
  assert.throws(
    () => registry.register({ experimentId: "unknown", implementationVersion: 1, descriptorFactory: descriptor }),
    (error) => error.code === PRACTICE_REGISTRY_ERROR_CODES.UNKNOWN_EXPERIMENT,
  );
  assert.throws(() => registry.register({ experimentId: "fixture", implementationVersion: 0, descriptorFactory: descriptor }), /positive integer/);
  assert.throws(() => registry.register({ experimentId: "fixture", implementationVersion: 1, descriptorFactory: () => descriptor({ id: "other" }) }), /match/);
  assert.throws(() => registry.register({ experimentId: "fixture", implementationVersion: 1, descriptorFactory: () => descriptor({ category: "speed" }) }), /category/);
  assert.throws(() => registry.register({ experimentId: "fixture", implementationVersion: 1, descriptorFactory: () => descriptor({ defaultCorrectionBehavior: "bad" }) }), /Invalid/);
  registry.register({ experimentId: "fixture", implementationVersion: 1, descriptorFactory: descriptor });
  assert.equal(registry.getRegistration("fixture").descriptor.id, "fixture");
  assert.throws(() => registry.register({ experimentId: "fixture", implementationVersion: 1, descriptorFactory: descriptor }), /already registered/);
});

test("registry does not make planned catalog entries runnable and destroy clears lifecycle state", () => {
  const planned = [{ id: "fixture", category: "precision", status: "planned" }];
  const registry = createPracticeExperimentRegistry({ catalog: planned });
  registry.register({ experimentId: "fixture", implementationVersion: 1, descriptorFactory: descriptor });
  assert.equal(registry.getResolvedExperiment("fixture").runnable, false);
  assert.equal(registry.destroy(), true);
  assert.equal(registry.destroy(), false);
  assert.equal(registry.getRegistration("fixture"), null);
});
