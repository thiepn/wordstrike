import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

assert.match(readme, /https:\/\/thiepn\.dev\/wordstrike\//);
assert.match(readme, /https:\/\/github\.com\/thiepn\/wordstrike/);
assert.match(readme, /Google sign-in/i);
assert.match(readme, /global leaderboards/i);
assert.match(readme, /Supabase/i);
assert.match(readme, /npm test/);
assert.match(readme, /actions\/workflows\/test\.yml\/badge\.svg/);
assert.doesNotMatch(readme, /thiepn\.github\.io\/WORDSTRIKE/);
assert.doesNotMatch(readme, /github\.com\/thiepn\/WORDSTRIKE/);
assert.doesNotMatch(readme, /no account system/i);
assert.doesNotMatch(readme, /No account or cloud connection/i);
assert.doesNotMatch(readme, /tests-46/);

console.log("README canonical URLs, current online architecture, and CI documentation passed.");
