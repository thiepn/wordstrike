import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = async (relative) => fs.readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("PL28 primary documentation covers the required architecture and reporting contracts", async () => {
  const doc = await read("docs/practice-lab/PL28-COMMON-WORDS.md");
  for (const required of [
    "Typing breadth measures WordStrike's typing evidence across the common-word reference. It does not estimate how many English words the user knows.",
    "WS-COMMON-EN-1",
    "1,200",
    "statistical-only",
    "practice-display-approved",
    "Coverage-first Practice selection",
    "No weakness-based selection",
    "80 words = 20 per band",
    "160 words = 40 per band",
    "240 words = 60 per band",
    "200 words",
    "50 words per band",
    "10 × 20-word balanced microblocks",
    "PL10 available model weight: `≥ 0.90`",
    "pairwise lexical overlap ratio: `≤ 0.30`",
    "One completed valid Breadth Check produces exactly one trusted PL13 `common-words` diagnostic observation.",
    "PL28 does not create a universal Vocabulary Breadth Score.",
    "Stale Practice data disables Practice only; stale Check data disables Check only; stale shared reference data disables both.",
    "public Practice release",
    "PL29",
    "PL32",
    "PL33",
  ]) assert.ok(doc.includes(required), `missing PL28 documentation contract: ${required}`);
});

test("PL28 cross-phase documentation records required PL13/15/16/22/24/25 boundaries", async () => {
  const doc = await read("docs/practice-lab/PL28-CROSS-PHASE-INTEGRATION.md");
  for (const required of [
    "PL13 — Ability Estimation",
    "common-words ability ≠ cold-natural-text ability",
    "PL15 — Mastery / Automaticity",
    "PL16 — Learning / Ability Trajectories",
    "PL22 — Problem Words",
    "Problem Words** = targeted intervention",
    "PL24 — Real Text",
    "Real Text** = natural prose",
    "PL25 — Daily Coach",
    "Common Words now exists, but Daily Coach v1 still uses Real Text as its broad integration block.",
  ]) assert.ok(doc.includes(required), `missing cross-phase documentation contract: ${required}`);
});
