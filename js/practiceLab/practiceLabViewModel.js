import {
  PRACTICE_CATEGORY_LABELS, PRACTICE_DAILY_TRAINING, PRACTICE_EXPERIMENT_CATEGORIES,
} from "./practiceExperimentCatalog.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const durationLabel = (duration) => duration.minimum === duration.maximum
  ? `${duration.recommended} min`
  : `${duration.minimum}-${duration.maximum} min`;
const cardFromResolved = ({ catalogEntry: entry, availability, runnable }) => Object.freeze({
  id: entry.id, title: entry.title, description: entry.description, category: entry.category,
  categoryLabel: PRACTICE_CATEGORY_LABELS[entry.category], duration: durationLabel(entry.estimatedDurationMinutes),
  status: runnable ? "available" : availability === "preview" ? "preview" : "planned", runnable,
});

const CURRENT_ASSESSMENT_UNAVAILABLE = Object.freeze({
  language: "en",
  recommendedDepth: null,
  depths: Object.freeze({
    quick: Object.freeze({ depth: "quick", available: false, reasons: Object.freeze(["Compatible ready benchmark suite unavailable", "Diagnostic forms not ready"]) }),
    standard: Object.freeze({ depth: "standard", available: false, reasons: Object.freeze(["Compatible ready benchmark suite unavailable", "Diagnostic forms not ready"]) }),
    deep: Object.freeze({ depth: "deep", available: false, reasons: Object.freeze(["Compatible ready benchmark suite unavailable", "Diagnostic forms not ready", "Cold-transfer pool unavailable"]) }),
  }),
});
const DEPTH_META = Object.freeze({
  quick: Object.freeze({ label: "Quick", minutes: 4, blockCount: 3 }),
  standard: Object.freeze({ label: "Standard", minutes: 8, blockCount: 6 }),
  deep: Object.freeze({ label: "Deep", minutes: 12, blockCount: 10 }),
});

function assessmentDepths(availability) {
  const source = availability ?? CURRENT_ASSESSMENT_UNAVAILABLE;
  return Object.freeze(["quick", "standard", "deep"].map((depth) => {
    const state = source.depths?.[depth] ?? { available: false, reasons: ["Assessment artifacts not ready"] };
    return Object.freeze({
      depth,
      label: DEPTH_META[depth].label,
      minutes: DEPTH_META[depth].minutes,
      blockCount: DEPTH_META[depth].blockCount,
      available: Boolean(state.available),
      reasons: Object.freeze([...(state.reasons ?? [])]),
      recommended: source.recommendedDepth === depth,
    });
  }));
}

function assessmentProgress(run) {
  if (!run || !Array.isArray(run.blocks) || !["created", "active"].includes(run.status)) return null;
  const index = Math.min(run.progress?.currentBlockIndex ?? 0, Math.max(0, run.blocks.length - 1));
  const block = run.blocks[index] ?? null;
  return Object.freeze({
    assessmentRunId: run.assessmentRunId,
    depth: run.depth,
    status: run.status,
    currentBlockNumber: block ? index + 1 : run.blocks.length,
    totalBlockCount: run.blocks.length,
    completedBlockCount: run.progress?.completedBlockCount ?? 0,
    terminalBlockCount: run.progress?.terminalBlockCount ?? 0,
    blockId: block?.blockId ?? null,
    blockName: run.plan?.blocks?.[index]?.displayName ?? block?.blockId ?? null,
    waitingBetweenBlocks: block?.status === "pending",
  });
}

function assessmentResults(report) {
  if (!report) return null;
  return Object.freeze({
    reportStatus: report.reportStatus,
    integrity: report.integrity ?? null,
    sections: Object.freeze([
      Object.freeze({ id: "natural-text", title: "Natural Text", data: report.generalPerformance ?? null }),
      Object.freeze({ id: "accuracy-control", title: "Accuracy & Control", data: report.control ?? null }),
      Object.freeze({ id: "diagnostic-coverage", title: "Diagnostic Coverage", data: report.diagnosticCoverage ?? null }),
      Object.freeze({ id: "main-limiters", title: "Main Limiters", data: Object.freeze((report.limiterSnapshot ?? []).slice(0, 5)) }),
      Object.freeze({ id: "transfer", title: "Transfer", data: report.transfer ?? null }),
      Object.freeze({ id: "measurement-coverage", title: "Measurement Coverage", data: report.measurementCoverage ?? null }),
    ]),
  });
}

export function buildPracticeHomeViewModel({ registry, featureGate, helpAvailable = false }) {
  const visible = registry.listResolvedExperiments().filter(({ catalogEntry }) => catalogEntry.status !== "hidden");
  const categories = PRACTICE_EXPERIMENT_CATEGORIES
    .map((id) => ({ id, title: PRACTICE_CATEGORY_LABELS[id], experiments: visible.filter(({ catalogEntry }) => catalogEntry.category === id).sort((a, b) => a.catalogEntry.displayOrder - b.catalogEntry.displayOrder).map(cardFromResolved) }))
    .filter((category) => category.experiments.length > 0)
    .map(Object.freeze);
  return Object.freeze({
    kind: "home", title: "Practice Lab", subtitle: "Diagnose weaknesses, train specific skills, and measure typing evidence.",
    preview: featureGate.getSnapshot().reason === "developer-preview",
    helpAvailable: helpAvailable === true,
    dailyTraining: Object.freeze({ title: PRACTICE_DAILY_TRAINING.title, description: PRACTICE_DAILY_TRAINING.description, state: "planned", stateLabel: "Planned", duration: "12-minute recommended session" }),
    assessment: cardFromResolved(registry.getResolvedExperiment("full-assessment")),
    profile: Object.freeze({ state: "not-loaded", title: "No skill profile yet", description: "Full Assessment is recommended when its required artifacts are ready, but it is optional. Practice modes and future Skill Map use are not gated on completing it." }),
    recommendations: Object.freeze({ state: "needs-data", title: "Recommendations need data", description: "After valid assessment or practice evidence exists, this section can summarize what is measured without forcing a training path." }),
    categories: Object.freeze(categories),
    analysis: Object.freeze([
      { route: PRACTICE_LAB_ROUTES.SKILL_MAP, title: "Skill Map", description: "Explore measured typing strengths and limiters." },
      { route: PRACTICE_LAB_ROUTES.REVIEW_QUEUE, title: "Review Queue", description: "Return to weaknesses when they need reinforcement." },
      { route: PRACTICE_LAB_ROUTES.PROGRESS, title: "Progress", description: "See training history and change over time." },
    ].map(Object.freeze)),
  });
}

export function buildExperimentDetailViewModel({ route, registry, assessmentAvailability = null, assessmentRun = null, assessmentReport = null }) {
  const resolved = registry.getResolvedExperiment(route.params?.experimentId);
  if (!resolved) return Object.freeze({ kind: "not-found", title: "Experiment not found", description: "That Practice Lab experiment does not exist.", backLabel: "Back to Practice Lab" });
  const entry = resolved.catalogEntry;
  const base = {
    title: entry.title, category: PRACTICE_CATEGORY_LABELS[entry.category], description: entry.description,
    longDescription: entry.longDescription, primarySkill: entry.primarySkill,
    duration: durationLabel(entry.estimatedDurationMinutes), difficulty: entry.difficulty,
    prerequisites: [entry.requiresAssessment && "Full Assessment", entry.requiresPracticeData && "Practice data"].filter(Boolean),
    deviceSupport: [entry.supportsPhysicalKeyboard && "Physical keyboard", entry.supportsSoftwareKeyboard && "Software keyboard", entry.supportsMobile && "Mobile layouts"].filter(Boolean),
    status: resolved.runnable ? "available" : entry.status === "preview" ? "preview" : "planned",
    runnable: resolved.runnable,
    unavailableMessage: resolved.runnable ? "" : "This experiment is not available in the current development build.",
    backLabel: "Back to Practice Lab",
  };
  if (entry.id !== "full-assessment") return Object.freeze({ kind: "experiment-detail", ...base });
  const availability = assessmentAvailability ?? CURRENT_ASSESSMENT_UNAVAILABLE;
  return Object.freeze({
    kind: "full-assessment-detail",
    ...base,
    optional: true,
    publicGateUnchanged: true,
    recommendedDepth: availability.recommendedDepth ?? null,
    depths: assessmentDepths(availability),
    progress: assessmentProgress(assessmentRun),
    results: assessmentResults(assessmentReport ?? assessmentRun?.report ?? null),
  });
}

const emptyView = (kind, title, description, emptyTitle, emptyDescription, futureItems) => Object.freeze({ kind, title, description, emptyTitle, emptyDescription, futureItems: Object.freeze(futureItems), backLabel: "Back to Practice Lab" });
export const buildSkillMapEmptyViewModel = () => emptyView("skill-map", "Skill Map", "A future evidence view for key speed, accuracy, combinations, word fluency, punctuation, numbers, consistency, and endurance.", "No skill data", "Assessment is optional. Valid assessment and Practice sessions can both contribute evidence to the Skill Map.", ["Key speed and accuracy", "Bigrams and trigrams", "Words and punctuation", "Consistency and endurance"]);
export const buildReviewQueueEmptyViewModel = () => emptyView("review-queue", "Review Queue", "Future review scheduling will revisit weak keys, slow combinations, problem words, punctuation transitions, and number patterns.", "No reviews scheduled", "Completed Practice sessions will eventually add evidence-based review items here.", ["Weak keys", "Slow combinations", "Problem words", "Punctuation and number patterns"]);
export const buildProgressEmptyViewModel = () => emptyView("progress", "Progress", "A future home for training time, sustainable and burst speed, accuracy, consistency, mastered weaknesses, and experiment history.", "No training history", "Complete future Practice sessions to begin a local training history.", ["Training activity", "Speed and accuracy", "Consistency", "Mastered weaknesses"]);
export const buildPracticeUnavailableViewModel = () => Object.freeze({ kind: "unavailable", title: "Practice Lab", description: "Practice Lab is coming soon.", backLabel: "Back" });

export function buildPracticeLabViewModel({ route, registry, featureGate, helpAvailable = false, assessmentAvailability = null, assessmentRun = null, assessmentReport = null }) {
  if (!featureGate.canAccess() || route.name === "unavailable") return buildPracticeUnavailableViewModel();
  if (route.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL) return buildExperimentDetailViewModel({ route, registry, assessmentAvailability, assessmentRun, assessmentReport });
  if (route.name === PRACTICE_LAB_ROUTES.SKILL_MAP) return buildSkillMapEmptyViewModel();
  if (route.name === PRACTICE_LAB_ROUTES.REVIEW_QUEUE) return buildReviewQueueEmptyViewModel();
  if (route.name === PRACTICE_LAB_ROUTES.PROGRESS) return buildProgressEmptyViewModel();
  return buildPracticeHomeViewModel({ registry, featureGate, helpAvailable });
}
