import assert from "node:assert/strict";
import { ONBOARDING_TUTORIALS } from "../js/onboardingContent.js";
import { createOnboardingController } from "../js/onboarding.js";
import { resetAllOnboarding, isTutorialSeen } from "../js/onboardingStorage.js";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
resetAllOnboarding();

assert.equal(ONBOARDING_TUTORIALS.general.steps.length, 4);
assert.equal(ONBOARDING_TUTORIALS.campaign.steps.length, 3);
assert.equal(ONBOARDING_TUTORIALS.typing.steps.length, 3);
assert.equal(ONBOARDING_TUTORIALS.endless.steps.length, 2);
assert.equal(ONBOARDING_TUTORIALS.daily, undefined);
assert.equal(ONBOARDING_TUTORIALS.boss.steps.length, 2);
assert.equal(ONBOARDING_TUTORIALS.leaderboards.steps.length, 1);

const controller = createOnboardingController();
const states = [];
controller.subscribe((state) => states.push(state));
assert.equal(controller.open("invalid"), false);
assert.equal(controller.open("daily"), false);
assert.equal(controller.open("campaign", { source: "automatic" }), true);
assert.equal(controller.open("typing"), false);
assert.equal(controller.getState().currentStep, 0);
controller.previous();
assert.equal(controller.getState().currentStep, 0);
controller.next();
controller.last();
assert.equal(controller.getState().currentStep, 2);
controller.first();
assert.equal(controller.getState().currentStep, 0);
controller.skip();
assert.equal(controller.getState(), null);
assert.equal(isTutorialSeen("campaign"), true);
assert.equal(controller.shouldOpenAutomatically("campaign"), false);

assert.equal(controller.open("campaign", { source: "help", primaryLabel: "CONTINUE" }), true);
controller.last();
assert.equal(controller.getState().primaryLabel, "CONTINUE");
controller.close();

let completion = null;
assert.equal(controller.open("typing", { source: "automatic", onComplete: (choice) => { completion = choice; } }), true);
controller.last();
controller.choose("primary");
assert.equal(completion, "primary");
assert.equal(isTutorialSeen("typing"), true);

resetAllOnboarding();
controller.open("boss", { source: "settings" });
controller.last();
controller.choose("primary");
assert.equal(isTutorialSeen("boss"), false, "manual replay must not consume unseen automatic state");
assert.ok(states.length > 5);

console.log("Onboarding state supports navigation, completion, replay semantics, and rejects the retired Daily tutorial ID.");
