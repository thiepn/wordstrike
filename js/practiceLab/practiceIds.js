const PREFIXES = Object.freeze({
  profile: "practice-profile_",
  context: "practice-context_",
  session: "practice-session_",
  review: "practice-review_",
  evaluationReservation: "practice-evaluation-reservation_",
  customText: "practice-text_",
  preset: "practice-preset_",
  quarantine: "practice-quarantine_",
  ability: "practice-ability_",
  performance: "practice-performance_",
});

function fallbackToken(now, random) {
  const suppliedTime = Number(now?.());
  const time = Math.max(0, Number.isFinite(suppliedTime) ? suppliedTime : Date.now()).toString(36);
  const parts = Array.from({ length: 4 }, () => {
    const suppliedRandom = Number(random?.());
    const sample = Number.isFinite(suppliedRandom) ? suppliedRandom : Math.random();
    return Math.floor(Math.max(0, Math.min(0.999999999999, sample)) * 0x100000000)
      .toString(36)
      .padStart(7, "0");
  });
  return [time, ...parts].join("-");
}

export function createPracticeId(kind, {
  cryptoObject = globalThis.crypto,
  now = () => Date.now(),
  random = () => Math.random(),
  uuid,
} = {}) {
  const prefix = PREFIXES[kind];
  if (!prefix) throw new TypeError(`Unknown Practice ID kind: ${kind}`);
  const value = uuid?.() ?? cryptoObject?.randomUUID?.() ?? fallbackToken(now, random);
  return `${prefix}${String(value).toLowerCase()}`;
}

export const createPracticeProfileId = (options) => createPracticeId("profile", options);
export const createPracticeContextId = (options) => createPracticeId("context", options);
export const createPracticeSessionId = (options) => createPracticeId("session", options);
export const createPracticeReviewItemId = (options) => createPracticeId("review", options);
export const createPracticeEvaluationReservationId = (options) => createPracticeId("evaluationReservation", options);
export const createPracticeCustomTextId = (options) => createPracticeId("customText", options);
export const createPracticePresetId = (options) => createPracticeId("preset", options);
export const createPracticeQuarantineId = (options) => createPracticeId("quarantine", options);

export function createDefaultPracticeContextId(profileId) {
  if (!isPracticeId(profileId, "profile")) throw new TypeError("Default Practice context requires a valid profileId");
  return `practice-context_default-${encodeURIComponent(profileId)}`;
}

function encodeIdentityPart(value) {
  const encoded = encodeURIComponent(String(value));
  return `${encoded.length}:${encoded}`;
}

export function createSkillStatId(profileId, contextId, entityType, entityKey) {
  if (arguments.length !== 4) throw new TypeError("createSkillStatId requires profileId, contextId, entityType, and entityKey");
  return `practice-stat_${[profileId, contextId, entityType, entityKey].map(encodeIdentityPart).join("|")}`;
}

export function createPracticeAbilityStateId(profileId, contextId, channel) {
  if (arguments.length !== 3) throw new TypeError("createPracticeAbilityStateId requires profileId, contextId, and channel");
  if (!isPracticeId(profileId, "profile") || !isPracticeId(contextId, "context") || typeof channel !== "string" || !channel) throw new TypeError("Practice ability state identity is invalid");
  return `practice-ability_${[profileId, contextId, channel].map(encodeIdentityPart).join("|")}`;
}

export function createPracticePerformanceStateId(profileId, contextId) {
  if (arguments.length !== 2) throw new TypeError("createPracticePerformanceStateId requires profileId and contextId");
  if (!isPracticeId(profileId, "profile") || !isPracticeId(contextId, "context")) throw new TypeError("Practice performance state identity is invalid");
  return `practice-performance_${[profileId, contextId].map(encodeIdentityPart).join("|")}`;
}

export function createPracticeLearningStateId(profileId, contextId, entityType, entityKey) {
  if (arguments.length !== 4) throw new TypeError("createPracticeLearningStateId requires profileId, contextId, entityType, and entityKey");
  if (!isPracticeId(profileId, "profile") || !isPracticeId(contextId, "context") || !["key", "bigram", "trigram", "word"].includes(entityType) || typeof entityKey !== "string" || !entityKey) throw new TypeError("Practice learning state identity is invalid");
  return `practice-learning_${[profileId, contextId, entityType, entityKey].map(encodeIdentityPart).join("|")}`;
}

export function createPracticeEvaluationStateId(profileId) {
  if (arguments.length !== 1 || !isPracticeId(profileId, "profile")) throw new TypeError("createPracticeEvaluationStateId requires a valid profileId");
  return `practice-evaluation_${encodeIdentityPart(profileId)}`;
}

export function hashPracticeContent(value = "") {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isPracticeId(value, kind) {
  const prefix = PREFIXES[kind];
  return Boolean(prefix && typeof value === "string" && value.startsWith(prefix) && value.length > prefix.length + 7 && value.length <= 500);
}
