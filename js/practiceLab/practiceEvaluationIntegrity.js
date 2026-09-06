import {
  PRACTICE_EVALUATION_INTEGRITY_REASON_CODES,
  PRACTICE_EVALUATION_INTEGRITY_VERSION,
  PRACTICE_EVALUATION_PROTOCOL_V1,
} from "./practiceEvaluationConstants.js";
import { validatePracticeEvaluationBinding } from "./practiceEvaluationValidation.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const invalidCore = new Set([
  "missing-evaluation-plan", "binding-mismatch", "content-hash-mismatch", "wrong-partition",
  "targeted-content", "unexpected-content-append", "wrong-duration", "wrong-completion-reason",
  "manual-stop", "pause-or-visibility", "restored-session", "wrong-correction-policy",
  "feedback-policy", "content-exhausted", "transfer-repeat", "unsupported-protocol",
]);

function add(reasons, code) {
  if (!PRACTICE_EVALUATION_INTEGRITY_REASON_CODES.includes(code)) throw new TypeError(`Unknown Practice evaluation integrity reason: ${code}`);
  if (!reasons.includes(code)) reasons.push(code);
}

export function applyPracticeEvaluationConfigurationOverrides(configuration = {}, kind) {
  const protocol = PRACTICE_EVALUATION_PROTOCOL_V1[kind];
  if (!protocol) throw new TypeError("Unsupported Practice evaluation kind");
  return freezeDeep({
    ...configuration,
    correctionBehavior: "allow",
    showLiveWpm: false,
    showLiveAccuracy: false,
    showRhythmFeedback: false,
    metronomeSoundEnabled: false,
    adaptiveHints: false,
    targetHints: false,
    evaluationFeedbackMode: "measurement-minimal",
  });
}

export function evaluatePracticeEvaluationIntegrity({
  plan = null,
  session = null,
  contentPlan = null,
  historyStatus = "complete",
  runtime = {},
} = {}) {
  const reasons = [];
  const binding = plan?.binding ?? null;
  if (!plan || !binding) add(reasons, "missing-evaluation-plan");
  const bindingValidation = binding ? validatePracticeEvaluationBinding(binding) : { valid: false };
  if (binding && !bindingValidation.valid) add(reasons, "binding-mismatch");
  const kind = binding?.kind ?? plan?.kind ?? null;
  const protocol = kind ? PRACTICE_EVALUATION_PROTOCOL_V1[kind] : null;
  if (!protocol || plan?.measurementProtocol?.protocolId !== protocol?.protocolId || plan?.measurementProtocol?.protocolVersion !== protocol?.protocolVersion) add(reasons, "unsupported-protocol");
  if (binding && (
    binding.profileId !== session?.profileId
    || binding.contextId !== session?.contextId
    || binding.sessionId !== session?.sessionId
    || binding.kind !== kind
  )) add(reasons, "binding-mismatch");
  if ((contentPlan?.targetEntities?.length ?? 0) > 0) add(reasons, "targeted-content");
  const expectedPartition = kind === "benchmark" ? "benchmark" : kind === "cold-transfer" ? "transfer" : null;
  const actualPartition = contentPlan?.metadata?.partition ?? contentPlan?.metadata?.corpusPartition ?? null;
  if (!expectedPartition || actualPartition !== expectedPartition) add(reasons, "wrong-partition");
  const actualBindingHash = contentPlan?.metadata?.evaluationContentBindingHash ?? null;
  if (binding?.contentBindingHash && actualBindingHash !== binding.contentBindingHash) add(reasons, "content-hash-mismatch");
  if (contentPlan?.completion?.mode !== "duration" || contentPlan?.completion?.value !== protocol?.durationMs) add(reasons, "wrong-duration");
  if (session?.completionReason === "manual-stop") add(reasons, "manual-stop");
  else if (session?.completionReason === "content-complete") add(reasons, "content-exhausted");
  else if (session?.completionReason !== protocol?.completionReason) add(reasons, "wrong-completion-reason");
  if (runtime.pauseObserved || Number(session?.pausedDurationMs || 0) > 0) add(reasons, "pause-or-visibility");
  if (runtime.restoredFromCheckpoint) add(reasons, "restored-session");
  if (runtime.contentAppendObserved) add(reasons, "unexpected-content-append");
  if (session?.configuration?.correctionBehavior !== "allow") add(reasons, "wrong-correction-policy");
  for (const [key, expected] of Object.entries(protocol?.feedback ?? {})) {
    if (key === "mode") {
      if (session?.configuration?.evaluationFeedbackMode !== expected) add(reasons, "feedback-policy");
      continue;
    }
    if (Object.hasOwn(session?.configuration ?? {}, key) && session.configuration[key] !== expected) add(reasons, "feedback-policy");
  }
  if (historyStatus !== "complete") add(reasons, "history-partial");
  if (kind === "benchmark" && binding?.freshnessStatus === "repeat") add(reasons, "benchmark-repeat");
  if (kind === "cold-transfer" && binding?.freshnessStatus === "repeat") add(reasons, "transfer-repeat");

  const invalid = reasons.some((reason) => invalidCore.has(reason));
  const status = invalid ? "invalid" : reasons.length ? "nonstandard" : "valid";
  const strictFresh = binding?.freshnessStatus === "fresh" && historyStatus === "complete";
  const skillEvidenceEligible = status === "valid" && strictFresh;
  const abilityEligible = status === "valid" && strictFresh;
  const transferEvidenceEligible = status === "valid" && strictFresh && kind === "cold-transfer";
  const benchmarkComparisonEligible = status === "valid" && strictFresh && kind === "benchmark";
  const coldVerificationEligible = status === "valid" && strictFresh && kind === "cold-transfer";
  return freezeDeep({
    version: PRACTICE_EVALUATION_INTEGRITY_VERSION,
    kind,
    status,
    reasons,
    freshnessStatus: binding?.freshnessStatus ?? "unknown",
    historyStatus,
    skillEvidenceEligible,
    abilityEligible,
    transferEvidenceEligible,
    benchmarkComparisonEligible,
    coldVerificationEligible,
    benchmarkComparisonQuality: kind === "benchmark" && binding?.freshnessStatus === "repeat" ? "descriptive-only" : benchmarkComparisonEligible ? "comparable" : "not-eligible",
  });
}
