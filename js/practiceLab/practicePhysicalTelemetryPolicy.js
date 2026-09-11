import {
  PRACTICE_PHYSICAL_ELIGIBLE_EVIDENCE_ROLES,
  PRACTICE_PHYSICAL_EXCLUDED_EVIDENCE_ROLES,
  PRACTICE_PHYSICAL_LIMITS,
  PRACTICE_PHYSICAL_TELEMETRY_SETTING,
} from "./practicePhysicalTelemetryConstants.js";

function roleFor({ evidenceRole, contentPlan } = {}) {
  return String(evidenceRole ?? contentPlan?.metadata?.evidenceRole ?? contentPlan?.metadata?.role ?? "unclassified");
}

function partitionFor(contentPlan) {
  return String(contentPlan?.metadata?.partition ?? contentPlan?.metadata?.corpusPartition ?? "");
}

export function isPracticePhysicalTelemetryEnabled(settings = {}) {
  return settings?.[PRACTICE_PHYSICAL_TELEMETRY_SETTING] === true;
}

export function getPracticePhysicalTelemetryPersistencePolicy(input = {}) {
  const role = roleFor(input);
  const partition = partitionFor(input.contentPlan);
  const enabled = input.enabled === true || isPracticePhysicalTelemetryEnabled(input.settings);
  const inputMethod = input.inputMethod ?? input.context?.inputMethod ?? "unknown";
  const completed = input.sessionStatus === "completed" || input.completed === true;
  const eligibleCount = Math.max(0, Number(input.eligibleTextEventCount) || 0);
  const validCount = Math.max(0, Number(input.validCodeEventCount) || 0);
  const coverage = eligibleCount > 0 ? validCount / eligibleCount : 0;
  const reasons = [];
  if (!enabled) reasons.push("telemetry-disabled");
  if (inputMethod !== "physical") reasons.push("context-not-physical");
  if (!completed) reasons.push("session-not-completed");
  if (!PRACTICE_PHYSICAL_ELIGIBLE_EVIDENCE_ROLES.includes(role)) reasons.push(PRACTICE_PHYSICAL_EXCLUDED_EVIDENCE_ROLES.includes(role) ? `excluded-role:${role}` : "role-not-eligible");
  if (["transfer", "benchmark", "research-holdout", "custom"].includes(partition)) reasons.push(`excluded-partition:${partition}`);
  if (eligibleCount < PRACTICE_PHYSICAL_LIMITS.minimumEligibleTextEvents) reasons.push("insufficient-event-count");
  if (coverage < PRACTICE_PHYSICAL_LIMITS.minimumCodeCoverage) reasons.push("insufficient-code-coverage");
  return Object.freeze({ enabled, inputMethod, completed, role, partition, eligibleTextEventCount: eligibleCount, validCodeEventCount: validCount, codeCoverage: coverage, eligible: reasons.length === 0, reasons: Object.freeze(reasons) });
}

export function isPracticePhysicalTelemetryPersistenceEligible(input = {}) {
  return getPracticePhysicalTelemetryPersistencePolicy(input).eligible;
}

export function getPracticePhysicalTelemetryRuntimeEligibility({ settings = {}, context = null, evidenceRole = null, contentPlan = null } = {}) {
  const enabled = isPracticePhysicalTelemetryEnabled(settings);
  const inputMethod = context?.inputMethod ?? "unknown";
  const role = roleFor({ evidenceRole, contentPlan });
  const partition = partitionFor(contentPlan);
  const reasons = [];
  if (!enabled) reasons.push("telemetry-disabled");
  if (inputMethod !== "physical") reasons.push("context-not-physical");
  if (!PRACTICE_PHYSICAL_ELIGIBLE_EVIDENCE_ROLES.includes(role)) reasons.push(PRACTICE_PHYSICAL_EXCLUDED_EVIDENCE_ROLES.includes(role) ? `excluded-role:${role}` : "role-not-eligible");
  if (["transfer", "benchmark", "research-holdout", "custom"].includes(partition)) reasons.push(`excluded-partition:${partition}`);
  return Object.freeze({ enabled, inputMethod, role, partition, eligible: reasons.length === 0, reasons: Object.freeze(reasons) });
}
