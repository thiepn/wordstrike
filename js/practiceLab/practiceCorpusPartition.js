import {
  PRACTICE_CORPUS_DEFAULT_PARTITION_POLICY,
  PRACTICE_CORPUS_PARTITIONS,
  PRACTICE_CORPUS_PARTITION_POLICY_VERSION,
} from "./practiceCorpusConstants.js";

function policyError(message, details = null) {
  const error = new TypeError(message);
  error.code = "PRACTICE_CORPUS_INVALID_PARTITION_POLICY";
  error.details = details;
  return error;
}

export function validatePracticeCorpusPartitionPolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return { valid: false, errors: [{ path: "policy", code: "INVALID_TYPE", message: "partition policy must be an object" }] };
  if (!Number.isInteger(policy.version) || policy.version < 1) errors.push({ path: "version", code: "INVALID_VERSION", message: "policy version must be a positive integer" });
  else if (policy.version !== PRACTICE_CORPUS_PARTITION_POLICY_VERSION) errors.push({ path: "version", code: "UNSUPPORTED_VERSION", message: `partition policy version ${policy.version} is unsupported` });
  if (typeof policy.salt !== "string" || !policy.salt || policy.salt.length > 120) errors.push({ path: "salt", code: "INVALID_SALT", message: "partition salt must be a bounded non-empty string" });
  if (!policy.weights || typeof policy.weights !== "object" || Array.isArray(policy.weights)) errors.push({ path: "weights", code: "INVALID_WEIGHTS", message: "partition weights must be an object" });
  else {
    const keys = Object.keys(policy.weights).sort();
    const expected = [...PRACTICE_CORPUS_PARTITIONS].sort();
    if (JSON.stringify(keys) !== JSON.stringify(expected)) errors.push({ path: "weights", code: "PARTITION_SET_MISMATCH", message: "partition weights must define exactly the five canonical partitions" });
    let total = 0;
    for (const partition of PRACTICE_CORPUS_PARTITIONS) {
      const weight = policy.weights[partition];
      if (!Number.isInteger(weight) || weight < 0) errors.push({ path: `weights.${partition}`, code: "INVALID_WEIGHT", message: "partition weights must be non-negative integers" });
      else total += weight;
    }
    if (total !== 100) errors.push({ path: "weights", code: "WEIGHT_TOTAL", message: "partition weights must total 100" });
  }
  return { valid: errors.length === 0, errors };
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function derivePracticeFamilyPartition({
  familyId,
  corpusVersion,
  policy = PRACTICE_CORPUS_DEFAULT_PARTITION_POLICY,
} = {}) {
  const validation = validatePracticeCorpusPartitionPolicy(policy);
  if (!validation.valid) throw policyError("Practice corpus partition policy is invalid", validation.errors);
  if (typeof familyId !== "string" || !familyId) throw policyError("familyId is required for deterministic partitioning");
  if (!Number.isInteger(corpusVersion) || corpusVersion < 1) throw policyError("corpusVersion must be a positive integer");
  const key = `policy:${policy.version}|salt:${policy.salt}|corpus:${corpusVersion}|family:${familyId}`;
  const bucket = fnv1a32(key) % 100;
  let ceiling = 0;
  for (const partition of PRACTICE_CORPUS_PARTITIONS) {
    ceiling += policy.weights[partition];
    if (bucket < ceiling) return Object.freeze({ partition, bucket, assignment: "deterministic" });
  }
  throw policyError("Partition weights did not resolve a bucket");
}

export function resolvePracticeFamilyPartition({
  familyId,
  corpusVersion,
  partitionLock = null,
  policy = PRACTICE_CORPUS_DEFAULT_PARTITION_POLICY,
} = {}) {
  if (partitionLock != null) {
    if (!PRACTICE_CORPUS_PARTITIONS.includes(partitionLock)) throw policyError(`Invalid Practice corpus partition lock: ${partitionLock}`);
    return Object.freeze({ partition: partitionLock, bucket: null, assignment: "locked" });
  }
  return derivePracticeFamilyPartition({ familyId, corpusVersion, policy });
}

export function assertPracticeFamilyIsolation(items) {
  if (!Array.isArray(items)) throw policyError("Practice corpus family isolation requires an item array");
  const partitions = new Map();
  for (const item of items) {
    if (!item || typeof item.familyId !== "string" || !PRACTICE_CORPUS_PARTITIONS.includes(item.partition)) throw policyError("Practice corpus item has invalid family/partition identity");
    const existing = partitions.get(item.familyId);
    if (existing && existing !== item.partition) {
      const error = policyError(`Practice corpus family ${item.familyId} spans multiple partitions`);
      error.code = "PRACTICE_CORPUS_FAMILY_PARTITION_CONFLICT";
      throw error;
    }
    partitions.set(item.familyId, item.partition);
  }
  return Object.freeze(Object.fromEntries([...partitions.entries()].sort(([a], [b]) => a.localeCompare(b))));
}
