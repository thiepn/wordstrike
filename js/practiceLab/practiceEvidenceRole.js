import { assertPracticeContentUse } from "./practiceCorpusUseGuard.js";
import { resolvePracticeTypabilityRuntime } from "./practiceTypabilityRuntime.js";
import { PRACTICE_EVIDENCE_ROLES } from "./practiceSkillEvidencePolicy.js";

const PARTITION_TO_ROLE = Object.freeze({
  training: "training",
  transfer: "transfer",
  benchmark: "benchmark",
  diagnostic: "diagnostic",
});
const PARTITION_TO_PURPOSE = Object.freeze({
  training: "training",
  transfer: "cold-transfer",
  benchmark: "benchmark",
  diagnostic: "diagnostic",
});

function baseLanguage(value) {
  return typeof value === "string" && value.trim() ? value.trim().replace(/_/g, "-").toLowerCase().split("-")[0] : "und";
}

function looksCustom(contentPlan) {
  const metadata = contentPlan?.metadata ?? {};
  return Boolean(
    metadata.customTextId
    || metadata.contentSource === "custom"
    || metadata.sourceType === "custom"
    || metadata.privacy === "local-only"
    || String(contentPlan?.contentId ?? "").toLowerCase().includes("custom")
  );
}

function resolveTrustedStaticPartition(contentPlan, language) {
  const runtime = resolvePracticeTypabilityRuntime({ language });
  if (!runtime || !contentPlan) return null;
  const candidate = runtime.staticScoresBySessionContentHash?.[contentPlan.contentHash] ?? null;
  const metadata = contentPlan.metadata ?? {};
  if (!candidate) return null;
  if (metadata.corpusId !== runtime.reference.corpusId) return null;
  if (Number(metadata.corpusVersion) !== runtime.reference.corpusVersion) return null;
  if (metadata.sourceContentId !== candidate.contentId) return null;
  if (metadata.sourceContentHash !== candidate.contentHash) return null;
  if (candidate.sessionContentHash !== contentPlan.contentHash) return null;
  const purpose = PARTITION_TO_PURPOSE[candidate.partition];
  if (!purpose) return null;
  try { assertPracticeContentUse({ item: candidate, purpose }); }
  catch { return null; }
  return candidate.partition;
}

export function resolvePracticeEvidenceRole({ contentPlan, context = null } = {}) {
  if (looksCustom(contentPlan)) return "custom";
  const language = baseLanguage(contentPlan?.metadata?.language ?? context?.dataLocale);
  const partition = resolveTrustedStaticPartition(contentPlan, language);
  const role = PARTITION_TO_ROLE[partition] ?? "unclassified";
  if (!PRACTICE_EVIDENCE_ROLES.includes(role)) return "unclassified";
  return role;
}
