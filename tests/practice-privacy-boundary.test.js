import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  createDefaultCheckpoint,
  createDefaultCustomText,
  createDefaultSessionSummary,
} from "../js/practiceLab/practiceDefaults.js";

const root = new URL("../js/practiceLab/", import.meta.url);
const files = readdirSync(root).filter((file) => file.endsWith(".js"));
const source = files.map((file) => readFileSync(new URL(file, root), "utf8")).join("\n");
assert.doesNotMatch(source, /from\s+["'][^"']*(supabase|leaderboard|pendingResult|modeStorage|storage\.js)/i);
assert.doesNotMatch(source, /localStorage\.clear\s*\(/);

const customText = createDefaultCustomText();
assert.equal(customText.privacy, "local-only");
assert.equal("syncEnabled" in customText, false);
assert.equal("authId" in customText, false);

const summary = createDefaultSessionSummary();
for (const field of ["leaderboardEligible", "submissionPayload", "boardKey", "accessToken", "rawEvents", "eventTrace"]) {
  assert.equal(field in summary, false, `${field} must not exist in persisted Practice summaries`);
}
const checkpoint = createDefaultCheckpoint();
for (const field of ["rawEvents", "eventTrace", "latencySamples"]) {
  assert.equal(field in checkpoint, false, `${field} must not exist in checkpoints`);
}

const main = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
assert.doesNotMatch(main, /practice(?:IndexedDbStore|Repository|ManifestStore|MemoryStore|SessionEngine)\.js/);

console.log("Practice modules remain local-only, unranked, raw-trace-free, Supabase-free, and shell imports do not initialize storage.");
