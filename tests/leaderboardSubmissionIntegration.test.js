import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { beginSession, clearSession } from "../js/sessionManager.js";
import { MODE_IDS } from "../js/modes.js";
import { buildSessionResult } from "../js/sessionResult.js";

clearSession();
const first = beginSession({ modeId: MODE_IDS.ENDLESS, source: "mode-select" });
assert.ok(first.id);
const result = buildSessionResult({ sessionId: first.id, sessionSource: first.source, modeId: MODE_IDS.ENDLESS });
assert.equal(result.sessionId, first.id);
assert.equal(result.sessionSource, "mode-select");
clearSession();
const second = beginSession({ modeId: MODE_IDS.ENDLESS, source: "retry" });
assert.notEqual(second.id, first.id);
clearSession();
const rush = beginSession({ modeId: MODE_IDS.ARCADE_RUSH, source: "arcade-rush-ready", seed: 123 });
assert.ok(rush.id);
assert.equal(rush.modeId, MODE_IDS.ARCADE_RUSH);
assert.notEqual(rush.id, second.id);
clearSession();

const endlessMode = await readFile(new URL("../js/endlessMode.js", import.meta.url), "utf8");
const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
assert.ok(endlessMode.indexOf("recordCompletedSession(result)") < endlessMode.indexOf("callbacks.onComplete?.(game, result)"));
assert.match(main, /function finishEndless[\s\S]*prepareAutomaticResultSubmission\("endless", result/);
assert.match(main, /function finishArcadeRush[\s\S]*recordCompletedSession\(result\)[\s\S]*prepareAutomaticResultSubmission\("arcade-rush", result/);
assert.doesNotMatch(main, /function finishDaily|prepareAutomaticResultSubmission\("daily"/);

console.log("Endless and Arcade Rush session identities remain isolated, locally persisted before submission, and separate runs receive separate IDs.");
