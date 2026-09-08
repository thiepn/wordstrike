import { assertPracticeContentUse } from "./practiceCorpusUseGuard.js";
import { resolvePracticeTypabilityRuntime } from "./practiceTypabilityRuntime.js";
import { PRACTICE_EVIDENCE_ROLES } from "./practiceSkillEvidencePolicy.js";
import { getPracticeTrustedAssessmentBinding } from "./practiceAssessmentRegistry.js";
import { getPracticeTrustedCombinationRepairBinding } from "./practiceCombinationRepairTrust.js";
import { getPracticeTrustedWeakKeysBinding } from "./practiceWeakKeysTrust.js";
import { getPracticeTrustedProblemWordsBinding } from "./practiceProblemWordsTrust.js";
import { getPracticeTrustedAccuracyRecoveryBinding } from "./practiceAccuracyRecoveryTrust.js";

const PARTITION_TO_ROLE = Object.freeze({ training: "training", transfer: "transfer", benchmark: "benchmark", diagnostic: "diagnostic" });
const PARTITION_TO_PURPOSE = Object.freeze({ training: "training", transfer: "cold-transfer", benchmark: "benchmark", diagnostic: "diagnostic" });
function baseLanguage(value) { return typeof value === "string" && value.trim() ? value.trim().replace(/_/g, "-").toLowerCase().split("-")[0] : "und"; }
function looksCustom(contentPlan) { const metadata = contentPlan?.metadata ?? {}; return Boolean(metadata.customTextId || metadata.contentSource === "custom" || metadata.sourceType === "custom" || metadata.privacy === "local-only" || String(contentPlan?.contentId ?? "").toLowerCase().includes("custom")); }
function resolveTrustedAssessmentDiagnostic(contentPlan) { const binding = getPracticeTrustedAssessmentBinding(contentPlan); if (!binding || binding.expectedExperimentId !== "full-assessment-diagnostic" || !String(binding.blockId ?? "").startsWith("diagnostic-") || (contentPlan?.targetEntities?.length ?? 0) !== 0) return null; return "diagnostic"; }
function resolveTrustedCombinationRepair(contentPlan) { const binding = getPracticeTrustedCombinationRepairBinding(contentPlan); if (!binding || binding.experimentId !== "combination-repair" || binding.partition !== "training" || binding.evidenceRole !== "training") return null; return "training"; }
function resolveTrustedWeakKeys(contentPlan) { const binding = getPracticeTrustedWeakKeysBinding(contentPlan); if (!binding || binding.experimentId !== "weak-keys" || binding.partition !== "training" || binding.evidenceRole !== "training" || binding.target?.entityType !== "key" || !binding.target?.entityKey) return null; return "training"; }
function resolveTrustedAccuracyRecovery(contentPlan) { const binding = getPracticeTrustedAccuracyRecoveryBinding(contentPlan); if (!binding || binding.experimentId !== "accuracy-control" || binding.partition !== "training" || binding.evidenceRole !== "training" || !["key", "bigram", "trigram", "word"].includes(binding.target?.entityType) || !binding.target?.entityKey) return null; return "training"; }
function resolveTrustedProblemWords(contentPlan) { const binding = getPracticeTrustedProblemWordsBinding(contentPlan); if (!binding || binding.experimentId !== "problem-words" || binding.partition !== "training" || binding.evidenceRole !== "training" || binding.target?.entityType !== "word" || !binding.target?.entityKey) return null; return "training"; }
function resolveTrustedStaticPartition(contentPlan, language) {
  const runtime = resolvePracticeTypabilityRuntime({ language }); if (!runtime || !contentPlan) return null;
  const candidate = runtime.staticScoresBySessionContentHash?.[contentPlan.contentHash] ?? null; const metadata = contentPlan.metadata ?? {}; if (!candidate) return null;
  if (metadata.corpusId !== runtime.reference.corpusId || Number(metadata.corpusVersion) !== runtime.reference.corpusVersion || metadata.sourceContentId !== candidate.contentId || metadata.sourceContentHash !== candidate.contentHash || candidate.sessionContentHash !== contentPlan.contentHash) return null;
  const purpose = PARTITION_TO_PURPOSE[candidate.partition]; if (!purpose) return null; try { assertPracticeContentUse({ item: candidate, purpose }); } catch { return null; } return candidate.partition;
}
export function resolvePracticeEvidenceRole({ contentPlan, context = null } = {}) {
  if (looksCustom(contentPlan)) return "custom";
  const assessmentRole = resolveTrustedAssessmentDiagnostic(contentPlan); if (assessmentRole) return assessmentRole;
  const combinationRepairRole = resolveTrustedCombinationRepair(contentPlan); if (combinationRepairRole) return combinationRepairRole;
  const weakKeysRole = resolveTrustedWeakKeys(contentPlan); if (weakKeysRole) return weakKeysRole;
  const problemWordsRole = resolveTrustedProblemWords(contentPlan); if (problemWordsRole) return problemWordsRole;
  const accuracyRecoveryRole = resolveTrustedAccuracyRecovery(contentPlan); if (accuracyRecoveryRole) return accuracyRecoveryRole;
  const language = baseLanguage(contentPlan?.metadata?.language ?? context?.dataLocale); const partition = resolveTrustedStaticPartition(contentPlan, language); const role = PARTITION_TO_ROLE[partition] ?? "unclassified";
  if (!PRACTICE_EVIDENCE_ROLES.includes(role)) return "unclassified"; return role;
}
