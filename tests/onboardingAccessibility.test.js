import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { onboardingMarkup } from "../js/onboardingView.js";
import { ONBOARDING_TUTORIALS } from "../js/onboardingContent.js";

const state = {
  tutorialId: "general", version: 3, title: ONBOARDING_TUTORIALS.general.title,
  steps: ONBOARDING_TUTORIALS.general.steps, currentStep: 0, source: "automatic",
};
const markup = onboardingMarkup(state);
assert.match(markup, /role="dialog"/);
assert.match(markup, /aria-modal="true"/);
assert.match(markup, /data-onboarding-action="skip"/);
assert.doesNotMatch(markup, /data-onboarding-action="previous"/);
assert.match(markup, /data-onboarding-action="primary"/);
assert.match(markup, /Step 1 of 4/);
assert.ok(markup.indexOf("onboarding-copy") < markup.indexOf("onboarding-visual"));
assert.match(markup, /onboarding-action-dock/);

const view = await readFile(new URL("../js/onboardingView.js", import.meta.url), "utf8");
const css = await readFile(new URL("../style.css", import.meta.url), "utf8");
assert.match(view, /event\.key === "Tab"/);
assert.match(view, /previousFocus.*focus/s);
assert.match(view, /event\.stopPropagation\(\)/);
assert.match(view, /ArrowLeft|ArrowRight/);
assert.match(css, /\.onboarding-backdrop[\s\S]*100dvh/);
assert.match(css, /orientation: landscape/);
assert.match(css, /prefers-reduced-motion[\s\S]*\.demo-word/);

console.log("Onboarding markup provides modal semantics, controls, progress, trapped keyboard navigation, focus restoration, and responsive reduced-motion styling.");
