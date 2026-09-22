import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderPracticeCoach } from "../js/practiceLab/practiceLabRendererCurrent.js";
import { renderPracticePhysicalKeyboardPage } from "../js/practiceLab/practiceLabRendererCurrent.js";
import { renderPracticeWeaknessBossDetail } from "../js/practiceLab/practiceWeaknessBossUi.js";
import { renderPracticeCustomTextDetail } from "../js/practiceLab/practiceLabRendererCurrent.js";

const root = () => ({ innerHTML: "", querySelector() { return null; } });

test("Phase 3 Daily Training errors offer explicit retry and do not auto-loop from error", async () => {
  const target = root();
  renderPracticeCoach(target, { title:"Daily Training", subtitle:"", status:"error", requestedMinutes:12, durationChoices:[], plan:null, canCreate:true, errorCode:"PRACTICE_COACH_UNAVAILABLE", errorDetail:null, preview:false });
  assert.match(target.innerHTML, /data-practice-action="reload-coach"/);
  const source = await readFile(new URL("../js/practiceLab/practiceLabControllerCurrent.js", import.meta.url), "utf8");
  assert.match(source, /coachState\.status !== "idle"/);
  assert.doesNotMatch(source, /\["idle", "error"\]\.includes\(coachState\.status\)/);
});

test("Phase 3 advanced read failures have in-place recovery actions", () => {
  const physical = root();
  renderPracticePhysicalKeyboardPage(physical, { status:"unavailable", errorCode:"PHYSICAL_TELEMETRY_UNAVAILABLE" });
  assert.match(physical.innerHTML, /data-practice-action="physical-retry"/);

  const boss = root();
  renderPracticeWeaknessBossDetail(boss, { status:"unavailable", candidates:[], recommendedCandidate:null, errorCode:"PRACTICE_WEAKNESS_BOSS_UNAVAILABLE" });
  assert.match(boss.innerHTML, /data-practice-action="weakness-boss-refresh"/);

  const custom = root();
  renderPracticeCustomTextDetail(custom, {
    status:"unavailable", texts:[], contextDataLocale:"en",
    editor:{ customTextId:null, title:"", sourceText:"" }, sessionMode:"full-text",
    timedDurationMs:60000, timedAvailability:[], sourceGraphemeCount:0,
    validationErrorCode:null, localeMismatch:false, dirty:false, saving:false, starting:false, errorCode:"CUSTOM_TEXT_UNAVAILABLE",
  });
  assert.match(custom.innerHTML, /data-practice-action="custom-retry"/);
});

test("Phase 3 Full Assessment read failure exposes an in-place retry action", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceLabControllerCurrent.js", import.meta.url), "utf8");
  assert.match(source, /retry\.dataset\.practiceAction='assessment-refresh'/);
  assert.match(source, /action==='assessment-refresh'/);
  assert.doesNotMatch(source, /Assessment could not load\. Return to Practice Lab and try again\./);
});

test("Phase 3 Escape navigation ignores editing and active typing captures", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceLabControllerCurrent.js", import.meta.url), "utf8");
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /input,textarea,select/);
  assert.match(source, /data-practice-session-capture/);
  assert.match(source, /root\.addEventListener\("keydown", keydown\)/);
  assert.match(source, /root\.removeEventListener\("keydown", keydown\)/);
});

test("Phase 3 destructive Daily Training abandonment requires confirmation", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceLabControllerCurrent.js", import.meta.url), "utf8");
  assert.match(source, /End today’s Daily Training plan\?/);
  assert.match(source, /Completed blocks stay saved/);
});

test("Phase 3 mobile Practice navigation remains reachable on long screens", async () => {
  const css = await readFile(new URL("../practiceLabIdentity.css", import.meta.url), "utf8");
  assert.match(css, /@media\(max-width:700px\).*\.pl-navigation\{position:sticky;top:0;z-index:6/s);
});


test("Phase 3 empty evidence and Boss states offer a concrete next step", async () => {
  const evidence = await readFile(new URL("../js/practiceLab/practiceEvidenceViews.js", import.meta.url), "utf8");
  assert.ok((evidence.match(/data-route="daily-training"/g) ?? []).length >= 3);

  const boss = root();
  renderPracticeWeaknessBossDetail(boss, { status:"ready", candidates:[], recommendedCandidate:null, errorCode:null });
  assert.match(boss.innerHTML, /data-practice-action="navigate" data-route="daily-training"/);
});

test("Phase 3 Daily Training error copy matches in-place retry behavior", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceLabRendererCurrent.js", import.meta.url), "utf8");
  assert.match(source, /PRACTICE_COACH_UNAVAILABLE: "Daily Training could not load its local Practice data\. Try again\."/);
  assert.doesNotMatch(source, /PRACTICE_COACH_UNAVAILABLE: .*Reload WordStrike and try again/);
});
