import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Phase 7 CI includes offline, upgrade and mobile-device proxy journeys", async () => {
  const workflow=await readFile(new URL("../.github/workflows/practice-certification.yml",import.meta.url),"utf8");
  for(const file of [
    "practice_offline.mjs",
    "practice_pwa_upgrade.mjs",
    "practice_device_acceptance.mjs",
    "practice_storage_repair.mjs",
    "practice_quota_journey.mjs",
  ]) assert.match(workflow,new RegExp(file.replaceAll(".","\\.")));
  assert.match(workflow,/matrix\.browser == 'webkit'/);
  assert.match(workflow,/matrix\.width == 390/);
});

test("Phase 7 hardware checklist explicitly distinguishes emulation from physical sign-off", async () => {
  const doc=await readFile(new URL("../docs/PRACTICE_LAB_DEVICE_ACCEPTANCE.md",import.meta.url),"utf8");
  assert.match(doc,/Samsung Internet — physical Samsung phone/);
  assert.match(doc,/iOS Safari — physical iPhone/);
  assert.match(doc,/Android Chrome — physical phone/);
  assert.match(doc,/physical-device sign-off pending/i);
  assert.match(doc,/Automated proxy failures block merging/);
});
