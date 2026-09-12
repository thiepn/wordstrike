import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPracticeWeaknessBossDescriptor } from "../js/practiceLab/practiceWeaknessBossExperiment.js";
import { isPracticeWeaknessBossTargetKey } from "../js/practiceLab/practiceWeaknessBossSelection.js";
import { resolvePracticeTreatmentIdentity } from "../js/practiceLab/practiceTreatmentRegistry.js";
import { selectPracticeCoachResponseProfile } from "../js/practiceLab/practiceCoachPersonalizationEvidence.js";
import { renderPracticeWeaknessBossBattle, renderPracticeWeaknessBossResult } from "../js/practiceLab/practiceWeaknessBossUi.js";
import {
  PRACTICE_WEAKNESS_BOSS_GAMEPLAY_VERSION,
  PRACTICE_WEAKNESS_BOSS_GENERATOR_VERSION,
  PRACTICE_WEAKNESS_BOSS_POLICY_VERSION,
  PRACTICE_WEAKNESS_BOSS_PROBE_VERSION,
  PRACTICE_WEAKNESS_BOSS_VERSION,
} from "../js/practiceLab/practiceWeaknessBossConstants.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const practiceDir = path.join(here, "../js/practiceLab");
const bossFiles = fs.readdirSync(practiceDir).filter((name) => /^practiceWeaknessBoss.*\.js$/.test(name));
const bossSource = bossFiles.map((name) => fs.readFileSync(path.join(practiceDir, name), "utf8")).join("\n");

function treatment(entityType, entityKey) {
  return resolvePracticeTreatmentIdentity({
    experiment: { id: "weakness-boss", version: 1 },
    configuration: {
      weaknessBossVersion: PRACTICE_WEAKNESS_BOSS_VERSION,
      policyVersion: PRACTICE_WEAKNESS_BOSS_POLICY_VERSION,
      generatorVersion: PRACTICE_WEAKNESS_BOSS_GENERATOR_VERSION,
      probeVersion: PRACTICE_WEAKNESS_BOSS_PROBE_VERSION,
      gameplayVersion: PRACTICE_WEAKNESS_BOSS_GAMEPLAY_VERSION,
    },
    contentPlan: { targetEntities: [{ entityType, entityKey, directTarget: true }] },
  });
}

test("PL37 descriptor is non-resumable training content with no ability/performance/retention/evaluation channel", () => {
  const descriptor = createPracticeWeaknessBossDescriptor();
  assert.equal(descriptor.id, "weakness-boss");
  assert.equal(descriptor.resumable, false);
  assert.deepEqual(descriptor.supportedCompletionModes, ["content"]);
  assert.equal(descriptor.defaultCorrectionBehavior, "allow");
  assert.equal(descriptor.abilityChannel, null);
  assert.equal(descriptor.performanceMeasurementKind, null);
  assert.equal(descriptor.performanceReferenceChannel, null);
  assert.equal(descriptor.retentionMeasurementKind, null);
  assert.equal(descriptor.evaluationMeasurementKind, null);
});

test("PL37 target identity is exactly lowercase ASCII key/bigram/trigram/word", () => {
  assert.equal(isPracticeWeaknessBossTargetKey("key", "e"), true);
  assert.equal(isPracticeWeaknessBossTargetKey("key", "E"), false);
  assert.equal(isPracticeWeaknessBossTargetKey("key", ";"), false);
  assert.equal(isPracticeWeaknessBossTargetKey("bigram", "th"), true);
  assert.equal(isPracticeWeaknessBossTargetKey("bigram", "t-"), false);
  assert.equal(isPracticeWeaknessBossTargetKey("trigram", "ing"), true);
  assert.equal(isPracticeWeaknessBossTargetKey("trigram", "in3"), false);
  assert.equal(isPracticeWeaknessBossTargetKey("word", "there"), true);
  assert.equal(isPracticeWeaknessBossTargetKey("word", "a"), false);
  assert.equal(isPracticeWeaknessBossTargetKey("word", "twentyfivecharacterslongxx"), false);
  assert.equal(isPracticeWeaknessBossTargetKey("physical-key", "KeyE"), false);
});

test("PL32 Weakness Boss family remains one-boss-dose-v1 but is entity-type stratified", () => {
  const key = treatment("key", "e");
  const bigram = treatment("bigram", "th");
  assert.equal(key.protocolVariant, "one-boss-dose-v1");
  assert.equal(bigram.protocolVariant, "one-boss-dose-v1");
  assert.notEqual(key.treatmentFamilyKey, bigram.treatmentFamilyKey);
  assert.notEqual(key.protocolFingerprint, bigram.protocolFingerprint);
  assert.equal(key.assignmentKind, "manual");
});

test("PL33 v1 explicitly refuses Weakness Boss response history", () => {
  const identity = treatment("key", "e");
  const profile = selectPracticeCoachResponseProfile({
    profileId: "profile-test",
    contextId: "context-test",
    treatmentFamilyKey: identity.treatmentFamilyKey,
    targetEntityType: "key",
    targetStatId: "skill:key:e",
    responseStates: [{ treatmentFamilyKey: identity.treatmentFamilyKey }],
    now: new Date("2026-09-12T12:00:00.000Z"),
  });
  assert.equal(profile, null);
});

test("PL37 battle UI contains only Boss progress controls and not live performance pressure", () => {
  const root = { innerHTML: "" };
  renderPracticeWeaknessBossBattle(root, {
    session: {
      weaknessBossPlan: { bossTheme: { name: "The Anchor" }, target: { entityType: "key", entityKey: "e" } },
      contentPlan: {
        text: "eeee",
        metadata: { weaknessBoss: { phaseRanges: [{ id: "break-guard", ordinal: 2, label: "Break Guard", cue: "strong", startIndex: 0, endIndex: 4, targetPositions: [0, 1, 2, 3] }] } },
      },
    },
    snapshot: { cursorIndex: 1, lifecycleState: "active", errorPositions: [] },
    gameplay: { bossHp: 72, battle: { cleanTargetStreak: 3 } },
  });
  assert.match(root.innerHTML, /72% remaining/);
  assert.match(root.innerHTML, /Clean streak: 3/);
  assert.match(root.innerHTML, /Break Guard/);
  assert.doesNotMatch(root.innerHTML, /\bWPM\b/i);
  assert.doesNotMatch(root.innerHTML, /overall accuracy/i);
  assert.doesNotMatch(root.innerHTML, /mastery score/i);
  assert.doesNotMatch(root.innerHTML, /limiter score/i);
});

test("PL37 result disclosure forbids mastery interpretation", () => {
  const root = { innerHTML: "" };
  renderPracticeWeaknessBossResult(root, {
    summary: {
      trainingQuality: {
        clearStatus: "defeated",
        boss: { archetype: "The Anchor" },
        target: { entityType: "key", entityKey: "e" },
        openingProbe: { quality: 50 },
        finalProbe: { quality: 61 },
        immediateQualityDelta: 11,
        battle: { battleFirstPassAccuracy: 0.9, maxCleanTargetStreak: 12 },
      },
    },
  });
  assert.match(root.innerHTML, /Boss Defeated/);
  assert.match(root.innerHTML, /challenge completion, not mastery/i);
  assert.match(root.innerHTML, /does not establish durable learning, retention, transfer, or a permanent fix/i);
  assert.doesNotMatch(root.innerHTML, /Mastery Test/);
});

test("PL37 modules remain isolated from Campaign, network APIs, and PL36 physical telemetry consumption", () => {
  assert.doesNotMatch(bossSource, /campaign/i);
  assert.doesNotMatch(bossSource, /arcadeRush/i);
  assert.doesNotMatch(bossSource, /fetch\s*\(/, "PL37 Boss modules must not create direct network calls; runtime asset loading uses injected fetchImpl");
  assert.doesNotMatch(bossSource, /WebHID|WebUSB|navigator\.hid|navigator\.usb/i);
  assert.doesNotMatch(bossSource, /practicePhysical|physicalTelemetry/i);
  assert.doesNotMatch(bossSource, /leaderboard|supabase/i);
});

test("PL37 source and docs explicitly preserve training-only generation and no-partial-dose semantics", () => {
  const generator = fs.readFileSync(path.join(practiceDir, "practiceWeaknessBossGenerator.js"), "utf8");
  const learning = fs.readFileSync(path.join(practiceDir, "practiceWeaknessBossLearning.js"), "utf8");
  const canonicalDoc = fs.readFileSync(path.join(here, "../docs/PRACTICE_LAB_WEAKNESS_BOSS.md"), "utf8");
  assert.match(generator, /partition !== "training"/);
  assert.match(generator, /partition: "training"/);
  assert.match(learning, /fullProtocolObserved/);
  assert.match(learning, /battleRecords\.length === quotas\.battle/);
  assert.match(canonicalDoc, /No partial normalized Boss dose/i);
  assert.match(canonicalDoc, /Boss HP is protocol progress only/i);
});
