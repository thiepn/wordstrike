import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ONBOARDING_VERSIONS, getOnboardingTutorial } from "../js/onboardingContent.js";
import { renderSettings } from "../js/ui.js";

const app = {
  html: "",
  set innerHTML(value) { this.html = value; },
  querySelector() { return { onclick: null }; },
  querySelectorAll() { return []; },
};
globalThis.document = { querySelector: (selector) => selector === "#app" ? app : null };
renderSettings({ settings: { strictMode: false, particles: true, screenShake: true } }, 0, {});
assert.doesNotMatch(app.html, /DAILY STRIKE GUIDE|data-tutorial-id="daily"/);
assert.doesNotMatch(app.html, /ARCADE RUSH GUIDE|data-tutorial-id="arcade-rush"/);
assert.equal(ONBOARDING_VERSIONS["arcade-rush"], undefined);
assert.equal(getOnboardingTutorial("arcade-rush"), null);

const [indexHtml, manifest, css, mobile] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"),
  readFile(new URL("../style.css", import.meta.url), "utf8"),
  readFile(new URL("../js/mobileInputAdapter.js", import.meta.url), "utf8"),
]);
assert.doesNotMatch(indexHtml, /Daily Strike/);
assert.doesNotMatch(manifest, /daily challenges/i);
assert.doesNotMatch(css, /\.daily-(?:hud|screen)/);
assert.doesNotMatch(mobile, /\.daily-screen/);
console.log("Retired Daily Strike and Arcade Rush onboarding no longer leak into active Settings, metadata, shared CSS, or mobile input routing.");
