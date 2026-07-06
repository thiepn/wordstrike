import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../js/practiceLab/", import.meta.url);
const sessionFiles = readdirSync(root).filter((name) => /^practice(Session|Input|Metrics|Event|Checkpoint)/.test(name));
const source = sessionFiles.map((name) => readFileSync(new URL(name, root), "utf8")).join("\n");

assert.doesNotMatch(source, /from\s+["'][^"']*(supabase|leaderboard|authService|modeStorage|speedTest|storage\.js)/i);
assert.doesNotMatch(source, /addEventListener|document\.|window\.|indexedDB|localStorage/);
assert.doesNotMatch(source, /setInterval\s*\(/);

const main = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
assert.doesNotMatch(main, /practiceSessionEngine/);

console.log("Practice Session Engine has no DOM, global listener, browser storage, ranked, auth, Supabase, or production-entry dependency; only the headless shell is integrated.");
