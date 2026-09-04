import {
  PRACTICE_INDEX_ARTIFACT_TYPES,
  PRACTICE_INDEX_SHARD_POLICY,
  PRACTICE_INDEX_SHARD_POLICY_VERSION,
} from "./practiceIndexConstants.js";

function shardError(message) {
  const error = new TypeError(message);
  error.code = "SHARD_INVALID";
  return error;
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function validatePracticeIndexShardPolicy(policy = PRACTICE_INDEX_SHARD_POLICY) {
  const errors = [];
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return { valid: false, errors: [{ path: "policy", code: "INVALID_TYPE", message: "shard policy must be an object" }] };
  if (policy.version !== PRACTICE_INDEX_SHARD_POLICY_VERSION) errors.push({ path: "version", code: "UNSUPPORTED_VERSION", message: "unsupported shard policy version" });
  if (typeof policy.salt !== "string" || !policy.salt || policy.salt.length > 160) errors.push({ path: "salt", code: "INVALID_SALT", message: "shard salt must be bounded text" });
  if (!Number.isInteger(policy.shardCount) || policy.shardCount < 1 || policy.shardCount > 256) errors.push({ path: "shardCount", code: "INVALID_COUNT", message: "shardCount must be 1..256" });
  return { valid: errors.length === 0, errors };
}

export function derivePracticeIndexShardId({ indexType, entityType, entityKey, policy = PRACTICE_INDEX_SHARD_POLICY } = {}) {
  const validation = validatePracticeIndexShardPolicy(policy);
  if (!validation.valid) throw shardError("Practice index shard policy is invalid");
  if (!PRACTICE_INDEX_ARTIFACT_TYPES.includes(indexType)) throw shardError(`Unknown Practice index type: ${indexType}`);
  if (typeof entityType !== "string" || !entityType || typeof entityKey !== "string") throw shardError("Practice index shard identity requires entityType and entityKey");
  const key = `v${policy.version}|${policy.salt}|${indexType}|${entityType}|${entityKey}`;
  return fnv1a32(key) % policy.shardCount;
}

export function formatPracticeIndexShardId(shardId, policy = PRACTICE_INDEX_SHARD_POLICY) {
  if (!Number.isInteger(shardId) || shardId < 0 || shardId >= policy.shardCount) throw shardError("Practice index shardId is outside policy range");
  const width = Math.max(2, String(policy.shardCount - 1).length);
  return String(shardId).padStart(width, "0");
}

export function getPracticeIndexShardPath({ partition, indexType, shardId, policy = PRACTICE_INDEX_SHARD_POLICY } = {}) {
  const formatted = formatPracticeIndexShardId(shardId, policy);
  const stem = indexType === "annotations" ? "annotation" : indexType === "targets" ? "target" : indexType === "words" ? "word" : "content";
  return `${partition}/${indexType}/${stem}-${formatted}.json`;
}
