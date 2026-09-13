import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeResearchRepository } from "../js/practiceLab/practiceResearchRepository.js";
import { createPracticeResearchService } from "../js/practiceLab/practiceResearchService.js";
import { createPracticeResearchEnrollment } from "../js/practiceLab/practiceResearchEnrollment.js";
import { createPracticeResearchAssignmentRecord } from "../js/practiceLab/practiceResearchAssignment.js";
import { createPracticeResearchBinding } from "../js/practiceLab/practiceResearchBinding.js";
import { practiceResearchStudyRegistry } from "../js/practiceLab/practiceResearchStudyRegistry.js";
import { PRACTICE_RESEARCH_STUDY_ID } from "../js/practiceLab/practiceResearchConstants.js";

const cryptoImpl = globalThis.crypto;
const now = () => new Date("2026-09-13T10:00:00.000Z");
const candidate = Object.freeze({
  entityType: "key",
  statId: "stat:k",
  entityKey: "k",
  weaknessStatus: "confirmed",
  hierarchyStatus: "independent",
  stableAnchor: false,
  saturationStatus: "possible",
  learningHeadroom: 10,
  bossTargetUtility: 70,
  bossContentReady: true,
  focusedContentReady: true,
  canonicalTreatment: "weak-keys",
  retentionReviewState: "inactive",
  coachConflict: false,
  lastDirectPractisedAt: null,
  lastResearchAssignedAt: null,
});

function memoryDataStore() {
  const keyPath = {
    researchEnrollments: "researchEnrollmentId",
    researchAssignments: "researchAssignmentId",
    researchAnalysisStates: "researchAnalysisStateId",
    sessionSummaries: "sessionId",
  };
  const tables = new Map(Object.keys(keyPath).map((name) => [name, new Map()]));
  let transactionTail = Promise.resolve();
  const api = {
    async get(store, id) { return structuredClone(tables.get(store)?.get(id) ?? null); },
    async put(store, record) {
      const key = record?.[keyPath[store]];
      if (!key) throw new TypeError(`Missing key for ${store}`);
      tables.get(store).set(key, structuredClone(record));
      return record;
    },
    async delete(store, id) { tables.get(store)?.delete(id); },
    async query(store, index, value) {
      const values = [...(tables.get(store)?.values() ?? [])];
      return structuredClone(values.filter((record) => {
        if (store === "researchAssignments" && index === "researchEnrollmentId") return record.researchEnrollmentId === value;
        if (store === "sessionSummaries" && index === "researchAssignmentId") return record.researchBinding?.researchAssignmentId === value;
        return false;
      }));
    },
    runTransaction(_stores, _mode, callback) {
      const run = transactionTail.then(() => callback(api));
      transactionTail = run.catch(() => undefined);
      return run;
    },
  };
  return api;
}

async function makeAssignment() {
  const study = await practiceResearchStudyRegistry.getBound(PRACTICE_RESEARCH_STUDY_ID, 1, cryptoImpl);
  const enrollment = createPracticeResearchEnrollment({
    profileId: "profile",
    contextId: "context",
    study,
    consented: true,
    now: now(),
    cryptoImpl,
  });
  const assignment = await createPracticeResearchAssignmentRecord({ enrollment, study, target: candidate, now: now(), cryptoImpl });
  return { study, enrollment, assignment };
}

test("PL38 atomically reserves exactly one baseline and treatment session identity", async () => {
  const store = memoryDataStore();
  const repo = createPracticeResearchRepository({ dataStore: store, now });
  const { assignment } = await makeAssignment();
  await repo.saveAssignment(assignment);

  const [first, second] = await Promise.allSettled([
    repo.reserveProbeSession(assignment.researchAssignmentId, "baseline", "session-baseline-a"),
    repo.reserveProbeSession(assignment.researchAssignmentId, "baseline", "session-baseline-b"),
  ]);
  const fulfilled = [first, second].filter((result) => result.status === "fulfilled");
  const rejected = [first, second].filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, "PRACTICE_RESEARCH_SESSION_CONFLICT");
  const baseline = await repo.getAssignment(assignment.researchAssignmentId);
  assert.equal(baseline.status, "baseline-active");
  assert.ok(["session-baseline-a", "session-baseline-b"].includes(baseline.baselineSessionId));

  const revealed = Object.freeze({
    ...baseline,
    status: "treatment-revealed",
    baseline: Object.freeze({ status: "valid", quality: 50, qualityCoverage: 0.8 }),
  });
  await repo.saveAssignment(revealed);
  const reservedTreatment = await repo.reserveTreatmentSession(assignment.researchAssignmentId, "session-treatment-a");
  assert.equal(reservedTreatment.status, "treatment-active");
  assert.equal(reservedTreatment.treatment.sessionId, "session-treatment-a");
  await assert.rejects(
    repo.reserveTreatmentSession(assignment.researchAssignmentId, "session-treatment-b"),
    (error) => error?.code === "PRACTICE_RESEARCH_SESSION_CONFLICT",
  );
});

test("PL38 reconciliation consumes only the exact reserved bound completed session", async () => {
  const store = memoryDataStore();
  const repo = createPracticeResearchRepository({ dataStore: store, now });
  const { assignment } = await makeAssignment();
  await repo.saveAssignment(assignment);
  const reserved = await repo.reserveProbeSession(assignment.researchAssignmentId, "baseline", "session-baseline-canonical");
  const binding = await createPracticeResearchBinding(reserved, "baseline", cryptoImpl);
  const probeMetrics = Object.freeze({
    status: "valid",
    probeId: "probe",
    probeHash: "hash",
    familyIds: Object.freeze(["family-a"]),
    quality: 55,
    qualityCoverage: 0.8,
    firstPassAccuracy: 0.9,
    normalizedResidualMedianMs: 10,
    disfluencyRate: 0.1,
    launchResidualMedianMs: null,
    internalResidualMedianMs: null,
  });

  await store.put("sessionSummaries", {
    sessionId: "session-stray",
    status: "completed",
    experimentId: "research-target-probe",
    completedAtUtc: "2026-09-13T10:05:00.000Z",
    researchBinding: binding,
    beforeMetrics: probeMetrics,
  });
  const service = createPracticeResearchService({ repository: repo, now, cryptoImpl });
  const stillActive = await service.reconcileAssignment(assignment.researchAssignmentId);
  assert.equal(stillActive.status, "baseline-active");
  assert.equal(stillActive.baseline, null);

  await store.put("sessionSummaries", {
    sessionId: "session-baseline-canonical",
    status: "completed",
    experimentId: "research-target-probe",
    completedAtUtc: "2026-09-13T10:06:00.000Z",
    researchBinding: binding,
    beforeMetrics: probeMetrics,
  });
  const recovered = await service.reconcileAssignment(assignment.researchAssignmentId);
  assert.equal(recovered.status, "treatment-revealed");
  assert.equal(recovered.baseline.status, "valid");
  assert.equal(recovered.baseline.quality, 55);
  assert.equal(recovered.baselineSessionId, "session-baseline-canonical");
});
