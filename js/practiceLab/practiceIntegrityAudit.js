import { PRACTICE_RECORD_VERSIONS, PRACTICE_STORE_NAMES } from "./practiceConstants.js";
import { getPracticeDataInventory } from "./practiceDataInventory.js";

export const PRACTICE_INTEGRITY_AUDIT_VERSION = 1;

const PROHIBITED_KEYS = Object.freeze(new Set([
  "rawEvents", "eventTrace", "wrongText", "incorrectString", "passageText", "customContent",
  "eventKey", "keystrokeSequence", "rawKeystrokes", "rawPhysicalEvents", "orderedEvents",
]));

const RAW_CONTENT_KEYS = Object.freeze(new Set(["sourceText"]));
const allowedRawPath = (storeName, path) => storeName === "customTexts" && path === "sourceText";
const plain = (value) => value == null || ["string", "number", "boolean"].includes(typeof value);

function walk(value, visit, path = "", seen = new WeakSet(), key = null) {
  visit(value, path, key);
  if (plain(value) || typeof value !== "object") return;
  if (seen.has(value)) { visit("[cycle]", path, "cycle"); return; }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, visit, path ? `${path}[${index}]` : `[${index}]`, seen, null));
    seen.delete(value);
    return;
  }
  for (const [childKey, entry] of Object.entries(value)) {
    const nextPath = path ? `${path}.${childKey}` : childKey;
    walk(entry, visit, nextPath, seen, childKey);
  }
  seen.delete(value);
}

function containsSentinel(value, sentinel) {
  return typeof value === "string" && value.includes(sentinel);
}

function recordIdFor(storeName, record, inventory) {
  const keyPath = inventory[storeName]?.primaryKey;
  if (typeof keyPath === "string") return record?.[keyPath] ?? null;
  if (Array.isArray(keyPath)) return keyPath.map((key) => record?.[key]).join("|");
  return null;
}

function versionError(storeName, record, inventory) {
  const recordType = inventory[storeName]?.recordType;
  if (!recordType) return null;
  const expected = PRACTICE_RECORD_VERSIONS[recordType];
  if (expected == null) return null;
  return record?.recordVersion === expected ? null : { expected, actual: record?.recordVersion ?? null };
}

export async function auditPracticeStoredData(dataStore, {
  privateSentinels = [],
  protectedSentinels = [],
} = {}) {
  if (!dataStore?.list) throw new TypeError("PL39 stored-data audit requires a Practice data store");
  const inventory = getPracticeDataInventory();
  const errors = [];
  const warnings = [];
  const storeCounts = {};
  const versionSummary = {};
  const sentinelHits = [];

  for (const storeName of PRACTICE_STORE_NAMES) {
    const records = await dataStore.list(storeName);
    storeCounts[storeName] = records.length;
    const versions = new Map();
    for (const record of records) {
      const recordId = recordIdFor(storeName, record, inventory);
      if (Number.isInteger(record?.recordVersion)) versions.set(record.recordVersion, (versions.get(record.recordVersion) ?? 0) + 1);
      const mismatch = versionError(storeName, record, inventory);
      if (mismatch) errors.push({ code: "RECORD_VERSION_MISMATCH", storeName, recordId, ...mismatch });

      walk(record, (value, path, key) => {
        if (key && PROHIBITED_KEYS.has(key)) errors.push({ code: "PROHIBITED_PERSISTED_KEY", storeName, recordId, path });
        if (key && RAW_CONTENT_KEYS.has(key) && !allowedRawPath(storeName, path)) errors.push({ code: "RAW_CONTENT_OUTSIDE_ALLOWLIST", storeName, recordId, path });
        if (typeof value === "number" && !Number.isFinite(value)) errors.push({ code: "NONFINITE_NUMBER", storeName, recordId, path });
        if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) errors.push({ code: "NON_SERIALIZABLE_VALUE", storeName, recordId, path, valueType: typeof value });
        for (const sentinel of privateSentinels) {
          if (!sentinel || !containsSentinel(value, sentinel)) continue;
          sentinelHits.push({ kind: "private", storeName, recordId, path });
          if (!(storeName === "customTexts" && path === "sourceText")) errors.push({ code: "PRIVATE_SENTINEL_LEAK", storeName, recordId, path });
        }
        for (const sentinel of protectedSentinels) {
          if (sentinel && containsSentinel(value, sentinel)) {
            sentinelHits.push({ kind: "protected", storeName, recordId, path });
            errors.push({ code: "PROTECTED_TEXT_PERSISTED", storeName, recordId, path });
          }
        }
      });

      if (record?.createdAt && record?.updatedAt) {
        const created = Date.parse(record.createdAt);
        const updated = Date.parse(record.updatedAt);
        if (Number.isFinite(created) && Number.isFinite(updated) && updated < created) errors.push({ code: "IMPOSSIBLE_TIMESTAMP_ORDER", storeName, recordId, path: "updatedAt" });
      }
    }
    versionSummary[storeName] = Object.fromEntries([...versions.entries()].sort(([a], [b]) => a - b));
  }

  return Object.freeze({
    auditVersion: PRACTICE_INTEGRITY_AUDIT_VERSION,
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    storeCounts: Object.freeze(storeCounts),
    versionSummary: Object.freeze(versionSummary),
    sentinelHits: Object.freeze(sentinelHits),
  });
}

export async function auditPracticeRepositoryIntegrity(dataStore) {
  if (!dataStore?.list) throw new TypeError("PL39 repository integrity audit requires a Practice data store");
  const errors = [];
  const warnings = [];
  const all = Object.fromEntries(await Promise.all(PRACTICE_STORE_NAMES.map(async (storeName) => [storeName, await dataStore.list(storeName)])));
  const profiles = new Map((all.profiles ?? []).map((record) => [record.profileId, record]));
  const contexts = new Map((all.contexts ?? []).map((record) => [record.contextId, record]));
  const enrollments = new Map((all.researchEnrollments ?? []).map((record) => [record.researchEnrollmentId, record]));
  const inventory = getPracticeDataInventory();

  for (const context of all.contexts ?? []) {
    if (!profiles.has(context.profileId)) errors.push({ code: "ORPHAN_CONTEXT", storeName: "contexts", recordId: context.contextId });
  }

  for (const [storeName, records] of Object.entries(all)) {
    if (["meta", "profiles", "contexts", "quarantine"].includes(storeName)) continue;
    for (const record of records) {
      const recordId = recordIdFor(storeName, record, inventory);
      if (record?.profileId && !profiles.has(record.profileId)) errors.push({ code: "ORPHAN_PROFILE_REFERENCE", storeName, recordId, profileId: record.profileId });
      if (record?.contextId) {
        const context = contexts.get(record.contextId);
        if (!context) errors.push({ code: "ORPHAN_CONTEXT_REFERENCE", storeName, recordId, contextId: record.contextId });
        else if (record.profileId && context.profileId !== record.profileId) errors.push({ code: "CONTEXT_PROFILE_MISMATCH", storeName, recordId, contextId: record.contextId, profileId: record.profileId });
      }
    }
  }

  for (const assignment of all.researchAssignments ?? []) {
    const parent = enrollments.get(assignment.researchEnrollmentId);
    if (!parent) errors.push({ code: "ORPHAN_RESEARCH_ASSIGNMENT", storeName: "researchAssignments", recordId: assignment.researchAssignmentId });
    else if (parent.profileId !== assignment.profileId || parent.contextId !== assignment.contextId || parent.studyId !== assignment.studyId || parent.studyVersion !== assignment.studyVersion) {
      errors.push({ code: "RESEARCH_PARENT_MISMATCH", storeName: "researchAssignments", recordId: assignment.researchAssignmentId });
    }
  }

  const activeCoachKeys = new Set();
  for (const plan of all.coachPlans ?? []) {
    if (plan.status !== "active") continue;
    const keyValue = `${plan.profileId}|${plan.contextId}|${plan.localDayKey}`;
    if (activeCoachKeys.has(keyValue)) errors.push({ code: "DUPLICATE_ACTIVE_COACH_DAY", storeName: "coachPlans", recordId: plan.coachPlanId });
    activeCoachKeys.add(keyValue);
  }

  return Object.freeze({
    auditVersion: PRACTICE_INTEGRITY_AUDIT_VERSION,
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    storeCounts: Object.freeze(Object.fromEntries(Object.entries(all).map(([storeName, records]) => [storeName, records.length]))),
  });
}
