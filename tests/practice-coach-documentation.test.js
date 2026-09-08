import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");

async function missing(path) {
  try {
    await access(new URL(path, ROOT), fsConstants.F_OK);
    return false;
  } catch {
    return true;
  }
}

test("PL25 permanent Daily Coach architecture and canonical ownership addenda are present", async () => {
  const primary = await read("docs/PRACTICE_LAB_DAILY_COACH.md");
  assert.match(primary, /Daily Coach/i);
  assert.match(primary, /frozen/i);
  assert.match(primary, /5.*8.*12.*15/s);

  const addenda = [
    "docs/PRACTICE_LAB_REVIEW_VALUE_AND_RETENTION_SCHEDULER.md",
    "docs/PRACTICE_LAB_LEARNING_CURVES_AND_SATURATION.md",
    "docs/PRACTICE_LAB_SESSION_ENGINE.md",
    "docs/PRACTICE_LAB_LIMITER_IMPACT_MODEL.md",
    "docs/PRACTICE_LAB_MASTERY_AUTOMATICITY_MODEL.md",
    "docs/PRACTICE_LAB_PERFORMANCE_STATE_AND_FRONTIER.md",
    "docs/PRACTICE_LAB_DATA_ARCHITECTURE.md",
  ];
  for (const path of addenda) {
    const text = await read(path);
    assert.match(text, /## PL25 Daily Coach (?:persistence )?addendum/, path);
  }
});

test("PL25 final tree contains no temporary patch/finalizer workflow or documentation script", async () => {
  for (const path of [
    ".github/workflows/pl25-listener-fix.yml",
    ".github/workflows/pl25-doc-addenda.yml",
    ".github/workflows/pl25-doc-finalize.yml",
    ".github/workflows/pl25-envelope-fix.yml",
    "scripts/applyPl25DocAddenda.py",
  ]) assert.equal(await missing(path), true, path);
});
