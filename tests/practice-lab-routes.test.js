import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeFeatureGate } from "../js/practiceLab/practiceFeatureGate.js";
import { createPracticeLabRoute, normalizePracticeLabRoute, PRACTICE_LAB_ROUTES } from "../js/practiceLab/practiceLabRoutes.js";

const devGate = createPracticeFeatureGate({ developerMode: true });

test("Practice routes normalize known routes and preserve controlled unknown experiment detail", () => {
  assert.equal(normalizePracticeLabRoute(createPracticeLabRoute(PRACTICE_LAB_ROUTES.SKILL_MAP), { featureGate: devGate }).name, "skill-map");
  const missing = normalizePracticeLabRoute(createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "missing" }), { featureGate: devGate });
  assert.equal(missing.name, "experiment-detail");
  assert.equal(missing.params.notFound, true);
});

test("unknown and reserved routes fall back home while a public gate cannot be bypassed", () => {
  assert.equal(normalizePracticeLabRoute({ name: "wat" }, { featureGate: devGate }).name, "home");
  assert.equal(normalizePracticeLabRoute(createPracticeLabRoute(PRACTICE_LAB_ROUTES.ACTIVE_SESSION), { featureGate: devGate }).name, "home");
  assert.equal(normalizePracticeLabRoute(createPracticeLabRoute(PRACTICE_LAB_ROUTES.SKILL_MAP), { featureGate: createPracticeFeatureGate() }).name, "unavailable");
});
