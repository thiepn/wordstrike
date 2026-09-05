import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultSkillStat } from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import {
  createPracticeMasteryEvidenceFingerprint,
  createPracticeMasteryService,
} from "../js/practiceLab/practiceMasteryService.js";

const now = () => new Date("2026-09-05T18:00:00.000Z");
const profileId = createPracticeId("profile", { uuid: () => "pl15-service-profile-123456" });
const contextA = createPracticeId("context", { uuid: () => "pl15-service-context-a-123456" });
const contextB = createPracticeId("context", { uuid: () => "pl15-service-context-b-123456" });

function aggregate(count, meanMs) {
  return { count, meanMs, m2: 0, minMs: count ? meanMs : null, maxMs: count ? meanMs : null, recentSamples: Array.from({ length: Math.min(12, count) }, () => meanMs) };
}

function makeStat(contextId, entityKey, opportunities = 100) {
  const stat = createDefaultSkillStat({ profileId, contextId, entityType: "bigram", entityKey, now });
  stat.updatedAt = now().toISOString();
  stat.lastObservedAt = now().toISOString();
  stat.evidence.opportunities = { count: opportunities, correctCount: opportunities - 1, errorCount: 1, directTargetedCount: 50, incidentalCount: opportunities - 50 };
  stat.evidence.observation = {
    sessionCount: 5,
    completedSessionCount: 5,
    abandonedSessionCount: 0,
    dayCount: 5,
    targetedSessionCount: 5,
    breadthEvidencePoints: 20,
    firstObservedAt: "2026-09-01T18:00:00.000Z",
    lastObservedAt: now().toISOString(),
    lastObservedDayKey: "2026-09-05",
  };
  stat.evidence.timing = {
    eligibleCount: opportunities,
    fluentCount: opportunities,
    disfluentCount: 0,
    fluentLatency: aggregate(opportunities, 100),
    fluentResidual: aggregate(opportunities, 0),
    disfluentResidual: aggregate(0, 0),
    completeTraceSessionCount: 5,
    retainedWindowSessionCount: 0,
  };
  stat.evidence.roles.training = {
    opportunityCount: opportunities,
    correctCount: opportunities - 1,
    errorCount: 1,
    timingEligibleCount: opportunities,
    fluentCount: opportunities,
    disfluentCount: 0,
    fluentResidualCount: opportunities,
    fluentResidualMeanMs: 0,
    fluentResidualM2: 0,
    recentResidualSamples: [],
    primaryErrorEpisodeCount: 1,
    sessionCount: 5,
    lastObservedAt: now().toISOString(),
  };
  return stat;
}

function repositoryFor(statsByContext) {
  const writes = { count: 0 };
  return {
    writes,
    async getPracticeContext(contextId) {
      return { contextId, profileId, dataLocale: "en" };
    },
    async listSkillStats(requestProfileId, contextId) {
      assert.equal(requestProfileId, profileId);
      return statsByContext.get(contextId) ?? [];
    },
    async putSkillStat() { writes.count += 1; },
    async putSessionSummary() { writes.count += 1; },
  };
}

test("PL15 service returns bounded immutable derived snapshots, default Retained=0, direct entity query and no persistence writes", async () => {
  const statsA = Array.from({ length: 10 }, (_, index) => makeStat(contextA, `a${index}`, 100 + index));
  const repo = repositoryFor(new Map([[contextA, statsA], [contextB, [makeStat(contextB, "a0", 20)]]]));
  const service = createPracticeMasteryService({ repository: repo, now });

  const first = await service.buildContextMasterySnapshot({ profileId, contextId: contextA, maxEntities: 5 });
  assert.equal(first.entities.length, 5);
  assert.equal(first.counts.stageCounts.retained, 0);
  assert.equal(first.counts.retentionUnverifiedCount, 10);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.entities), true);
  assert.equal(repo.writes.count, 0);

  const cached = await service.buildContextMasterySnapshot({ profileId, contextId: contextA, maxEntities: 5 });
  assert.equal(cached, first);
  assert.equal(service.getCacheSize(), 1);

  const direct = await service.getEntityMastery(profileId, contextA, "bigram", "a9");
  assert.equal(direct.entityKey, "a9");
  assert.equal(direct.retention.status, "unverified");
  assert.equal(repo.writes.count, 0);
});

test("PL15 context isolation and cache fingerprint invalidation follow durable skill evidence", async () => {
  const statA = makeStat(contextA, "th", 200);
  const statB = makeStat(contextB, "th", 20);
  const map = new Map([[contextA, [statA]], [contextB, [statB]]]);
  const repo = repositoryFor(map);
  const service = createPracticeMasteryService({ repository: repo, now });

  const a = await service.getEntityMastery(profileId, contextA, "bigram", "th");
  const b = await service.getEntityMastery(profileId, contextB, "bigram", "th");
  assert.equal(a.contextId, contextA);
  assert.equal(b.contextId, contextB);
  assert.notEqual(a.evidenceSummary.opportunityCount, b.evidenceSummary.opportunityCount);

  const before = createPracticeMasteryEvidenceFingerprint([statA]);
  const first = await service.buildContextMasterySnapshot({ profileId, contextId: contextA });
  statA.updatedAt = "2026-09-05T18:05:00.000Z";
  statA.evidence.opportunities.count += 1;
  statA.evidence.opportunities.correctCount += 1;
  const after = createPracticeMasteryEvidenceFingerprint([statA]);
  assert.notEqual(after, before);
  const second = await service.buildContextMasterySnapshot({ profileId, contextId: contextA });
  assert.notEqual(second, first);
});

test("PL15 snapshots support entity-type filtering without creating cross-entity global mastery", async () => {
  const bigram = makeStat(contextA, "th");
  const key = createDefaultSkillStat({ profileId, contextId: contextA, entityType: "key", entityKey: "t", now });
  const repo = repositoryFor(new Map([[contextA, [bigram, key]]]));
  const service = createPracticeMasteryService({ repository: repo, now });
  const snapshot = await service.buildContextMasterySnapshot({ profileId, contextId: contextA, entityTypes: ["key"] });
  assert.ok(snapshot.entities.every((entity) => entity.entityType === "key"));
  assert.equal("masteryScore" in snapshot, false);
});
