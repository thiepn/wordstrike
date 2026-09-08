import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ONBOARDING_TUTORIALS } from "../js/onboardingContent.js";

const [ui, mobileInput, css, html, manifest, vocabularySource, vocabularyAudit, profileDoc, typingDoc] = await Promise.all([
  readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
  readFile(new URL("../js/mobileInputAdapter.js", import.meta.url), "utf8"),
  readFile(new URL("../style.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"),
  readFile(new URL("../data/VOCABULARY_SOURCE.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/VOCABULARY_QUALITY_AUDIT.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/PLAYER_PROFILE_AND_STATISTICS.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/TYPING_TEST.md", import.meta.url), "utf8"),
]);

const settingsTutorials = [...ui.matchAll(/\["([^"]+)",\s*"[A-Z ]+GUIDE"\]/g)].map((match) => match[1]);
for (const id of settingsTutorials) {
  assert.ok(ONBOARDING_TUTORIALS[id], `Settings tutorial ${id} must resolve to real onboarding content`);
}
assert.equal(settingsTutorials.includes("daily"), false);
assert.doesNotMatch(ui, /DAILY STRIKE GUIDE/i);
assert.equal(Object.hasOwn(ONBOARDING_TUTORIALS, "daily"), false);

assert.doesNotMatch(mobileInput, /\.daily-screen/);
assert.match(mobileInput, /\.arcade-rush-gameplay/);
assert.doesNotMatch(css, /\.daily-(?:screen|hud)\b/);
assert.doesNotMatch(html, /Daily Strike/i);
assert.doesNotMatch(manifest, /daily challenges|Daily Strike/i);
assert.match(html, /Arcade Rush/i);
assert.match(manifest, /score attacks/i);
assert.doesNotMatch(vocabularySource, /Daily Strike/);
assert.doesNotMatch(vocabularyAudit, /Daily Strike/);
assert.doesNotMatch(profileDoc, /Daily Strike and Endless|Daily streak|Daily detailed dates|forced-date Daily/i);
assert.match(profileDoc, /Arcade Rush/);
assert.match(typingDoc, /10, 25, 50, and 100 words/);
assert.doesNotMatch(typingDoc, /Daily Strike/);

console.log("Retired Daily Strike has no active UI, mobile-layout, metadata, or current-product documentation residue; Arcade Rush owns the shared mobile input path.");
