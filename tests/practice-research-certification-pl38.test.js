import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeResearchService } from "../js/practiceLab/practiceResearchService.js";
import { normalizePracticeResearchProbeResult } from "../js/practiceLab/practiceResearchProbe.js";
import { validatePracticeResearchAssignment } from "../js/practiceLab/practiceResearchValidation.js";
import { PRACTICE_RESEARCH_POLICY, PRACTICE_RESEARCH_STUDY_ID } from "../js/practiceLab/practiceResearchConstants.js";

test("PL38 follow-up window is closed before 24h, open at exact 24h on a later local day, valid through exact 72h, and expired only after 72h", () => {
  const service = createPracticeResearchService({ repository: {} });
  const completedAt = "2026-01-01T12:00:00.000Z";
  const completedMs = Date.parse(completedAt);
  const record = { treatment: { completedAt } };

  assert.equal(service.getFollowupState(record, new Date(completedMs + PRACTICE_RESEARCH_POLICY.minimumFollowupMs - 1)), "waiting");
  assert.equal(service.getFollowupState(record, new Date(completedMs + PRACTICE_RESEARCH_POLICY.minimumFollowupMs)), "ready");
  assert.equal(service.getFollowupState(record, new Date(completedMs + PRACTICE_RESEARCH_POLICY.maximumFollowupMs)), "ready");
  assert.equal(service.getFollowupState(record, new Date(completedMs + PRACTICE_RESEARCH_POLICY.maximumFollowupMs + 1)), "expired");
});

test("PL38 normalized probe results persist aggregate research metrics only", () => {
  const normalized = normalizePracticeResearchProbeResult({
    quality: 61,
    qualityCoverage: 0.8,
    firstPassAccuracy: 0.94,
    normalizedResidualMedianMs: 72,
    disfluencyRate: 0.04,
    completedAt: "2026-01-02T12:00:00.000Z",
    sourceText: "raw probe text",
    passageText: "raw passage",
    typedText: "typed content",
    typedBuffer: "typed buffer",
    eventTrace: [{ code: "KeyA" }],
    rawEvents: [{ key: "a" }],
    wrongStrings: ["x"],
    physicalTelemetry: { transition: "KeyA>KeyB" },
    customText: "private custom content",
    contentPlan: { text: "raw material" },
  });

  assert.equal(normalized.status, "valid");
  for (const key of ["sourceText", "passageText", "typedText", "typedBuffer", "eventTrace", "rawEvents", "wrongStrings", "physicalTelemetry", "customText", "contentPlan"]) {
    assert.equal(Object.hasOwn(normalized, key), false, `${key} must not survive PL38 probe normalization`);
  }
});

test("PL38 assignment persistence rejects raw probe text, wrong strings, raw key traces, custom content, and PL36 physical telemetry", () => {
  const base = {
    recordVersion: 1,
    researchAssignmentId: "research-assignment-1",
    researchEnrollmentId: "research-enrollment-1",
    profileId: "profile-1",
    contextId: "context-1",
    studyId: PRACTICE_RESEARCH_STUDY_ID,
    studyHash: "0123456789abcdef",
    assignedArm: "focused-practice",
    stratum: "key",
    status: "assigned",
    target: { entityType: "key", statId: "stat:key:a", entityKey: "a" },
    assignmentIndex: 0,
    blockIndex: 0,
    blockPosition: 0,
    baselineSessionId: null,
    followupSessionId: null,
    treatment: { sessionId: null },
    contamination: { level: "none" },
    analysisEligibility: "followup-missing",
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    closedAt: null,
  };

  assert.equal(validatePracticeResearchAssignment(base).valid, true);
  for (const key of ["sourceText", "passageText", "typedText", "typedBuffer", "eventTrace", "rawEvents", "wrongStrings", "physicalTelemetry", "customText", "contentPlan"]) {
    const record = { ...base, primaryFollowup: { [key]: key === "rawEvents" || key === "eventTrace" ? [] : "forbidden" } };
    const result = validatePracticeResearchAssignment(record);
    assert.equal(result.valid, false, `${key} must be rejected from research persistence`);
    assert.ok(result.errors.some((error) => error.includes(`${key}:forbidden`)), `${key} must report a privacy-boundary error`);
  }
});

test("PL38 pure research modules import with zero storage/network/listener/timer side effects", async () => {
  const calls = { storage: 0, indexedDb: 0, fetch: 0, listeners: 0, timers: 0 };
  const original = {
    localStorage: globalThis.localStorage,
    indexedDB: globalThis.indexedDB,
    fetch: globalThis.fetch,
    document: globalThis.document,
    window: globalThis.window,
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
  };
  Object.defineProperties(globalThis, {
    localStorage: { configurable: true, value: { getItem() { calls.storage += 1; }, setItem() { calls.storage += 1; }, removeItem() { calls.storage += 1; } } },
    indexedDB: { configurable: true, value: { open() { calls.indexedDb += 1; throw new Error("unexpected IndexedDB open"); } } },
    fetch: { configurable: true, value: async () => { calls.fetch += 1; throw new Error("unexpected fetch"); } },
    document: { configurable: true, value: { addEventListener() { calls.listeners += 1; } } },
    window: { configurable: true, value: { addEventListener() { calls.listeners += 1; } } },
    setTimeout: { configurable: true, value: (...args) => { calls.timers += 1; return original.setTimeout(...args); } },
    setInterval: { configurable: true, value: (...args) => { calls.timers += 1; return original.setInterval(...args); } },
  });

  try {
    for (const module of [
      "practiceResearchConstants.js",
      "practiceResearchStudyRegistry.js",
      "practiceResearchRandomization.js",
      "practiceResearchBinding.js",
      "practiceResearchProbe.js",
      "practiceResearchEnrollment.js",
      "practiceResearchAssignment.js",
      "practiceResearchRandomizationInference.js",
      "practiceResearchAnalysis.js",
      "practiceResearchContamination.js",
      "practiceResearchValidation.js",
      "practiceResearchDeletion.js",
    ]) {
      await import(new URL(`../js/practiceLab/${module}?pl38-purity=${encodeURIComponent(module)}`, import.meta.url));
    }
    assert.deepEqual(calls, { storage: 0, indexedDb: 0, fetch: 0, listeners: 0, timers: 0 });
  } finally {
    for (const [key, value] of Object.entries(original)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});