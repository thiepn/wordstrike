import test from "node:test";
import assert from "node:assert/strict";
import { loadPracticeEvaluationContent } from "../js/practiceLab/practiceEvaluationContentLoader.js";

const binding = { frameworkVersion:1, reservationId:"practice-evaluation-reservation_123456789", profileId:"practice-profile_123456789", contextId:"practice-context_123456789", sessionId:"practice-session_123456789", kind:"benchmark", protocolId:"ws-benchmark-60s-v1", protocolVersion:1, suiteId:"S", suiteVersion:1, formId:"F1", formVersion:1, poolId:null, poolVersion:null, unitId:null, unitVersion:null, exposureOrdinal:1, freshnessStatus:"fresh", reservedAtUtc:"2026-09-06T11:00:00Z", claimedAtUtc:"2026-09-06T11:01:00Z", contentBindingHash:"form-hash" };
const plan = { binding, measurementProtocol:{ durationMs:60000 }, contentDescriptor:{ partition:"benchmark", orderedContentIds:["c1"], contentHashes:{ c1:"h1" }, separator:"\n\n", contentBindingHash:"form-hash" } };

test("PL18 protected loader requires claimed binding, exact partition and content hashes", async () => {
  const loaded = await loadPracticeEvaluationContent({ plan, loadContentItems: async () => [{ contentId:"c1", contentHash:"h1", partition:"benchmark", text:"Protected text." }] });
  assert.equal(loaded.targetEntities.length, 0);
  assert.equal(loaded.metadata.partition, "benchmark");
  assert.equal(loaded.metadata.evaluationContentBindingHash, "form-hash");
  await assert.rejects(() => loadPracticeEvaluationContent({ plan, loadContentItems: async () => [{ contentId:"c1", contentHash:"h1", partition:"training", text:"bad" }] }), { code:"PRACTICE_CORPUS_PARTITION_MISMATCH" });
  await assert.rejects(() => loadPracticeEvaluationContent({ plan, loadContentItems: async () => [{ contentId:"c1", contentHash:"changed", partition:"benchmark", text:"bad" }] }), { code:"PRACTICE_EVALUATION_CONTENT_HASH_MISMATCH" });
});
