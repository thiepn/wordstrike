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

export function buildPracticeHomeViewModel({ registry, featureGate }) {
  const visible = registry.listResolvedExperiments().filter(({ catalogEntry }) => catalogEntry.status !== "hidden");
  const categories = PRACTICE_EXPERIMENT_CATEGORIES
    .map((id) => ({ id, title: PRACTICE_CATEGORY_LABELS[id], experiments: visible.filter(({ catalogEntry }) => catalogEntry.category === id).sort((a, b) => a.catalogEntry.displayOrder - b.catalogEntry.displayOrder).map(cardFromResolved) }))
    .filter((category) => category.experiments.length > 0)
    .map(Object.freeze);
  return Object.freeze({
    kind: "home", title: "Practice Lab", subtitle: "Diagnose weaknesses, train specific skills, and measure improvement.",
    preview: featureGate.getSnapshot().reason === "developer-preview",
    dailyTraining: Object.freeze({ title: PRACTICE_DAILY_TRAINING.title, description: PRACTICE_DAILY_TRAINING.description, state: "assessment-required", stateLabel: "Assessment required", duration: "12-minute recommended session" }),
    assessment: cardFromResolved(registry.getResolvedExperiment("full-assessment")),
    profile: Object.freeze({ state: "not-loaded", title: "No skill profile yet", description: "Complete the Full Assessment once it becomes available. Practice Lab will then identify the keys, combinations, words, and pacing patterns that most limit your typing." }),
    recommendations: Object.freeze({ state: "needs-data", title: "Recommendations need data", description: "After assessment and practice sessions, this section will recommend the most useful experiment for your current weaknesses." }),
    categories: Object.freeze(categories),
    analysis: Object.freeze([
      { route: PRACTICE_LAB_ROUTES.SKILL_MAP, title: "Skill Map", description: "Explore measured typing strengths and limiters." },
      { route: PRACTICE_LAB_ROUTES.REVIEW_QUEUE, title: "Review Queue", description: "Return to weaknesses when they need reinforcement." },
      { route: PRACTICE_LAB_ROUTES.PROGRESS, title: "Progress", description: "See training history and change over time." },
    ].map(Object.freeze)),
  });
}

export function buildExperimentDetailViewModel({ route, registry }) {
  const resolved = registry.getResolvedExperiment(route.params?.experimentId);
  if (!resolved) return Object.freeze({ kind: "not-found", title: "Experiment not found", description: "That Practice Lab experiment does not exist.", backLabel: "Back to Practice Lab" });
  const entry = resolved.catalogEntry;
  return Object.freeze({
    kind: "experiment-detail", title: entry.title, category: PRACTICE_CATEGORY_LABELS[entry.category],
    description: entry.description, longDescription: entry.longDescription, primarySkill: entry.primarySkill,
    duration: durationLabel(entry.estimatedDurationMinutes), difficulty: entry.difficulty,
    prerequisites: [entry.requiresAssessment && "Full Assessment", entry.requiresPracticeData && "Practice data"].filter(Boolean),
    deviceSupport: [entry.supportsPhysicalKeyboard && "Physical keyboard", entry.supportsSoftwareKeyboard && "Software keyboard", entry.supportsMobile && "Mobile layouts"].filter(Boolean),
    status: resolved.runnable ? "available" : entry.status === "preview" ? "preview" : "planned",
    runnable: resolved.runnable,
    unavailableMessage: resolved.runnable ? "" : "This experiment is not available in the current development build.",
    backLabel: "Back to Practice Lab",
  });
}

const emptyView = (kind, title, description, emptyTitle, emptyDescription, futureItems) => Object.freeze({ kind, title, description, emptyTitle, emptyDescription, futureItems: Object.freeze(futureItems), backLabel: "Back to Practice Lab" });
export const buildSkillMapEmptyViewModel = () => emptyView("skill-map", "Skill Map", "A future evidence view for key speed, accuracy, combinations, word fluency, punctuation, numbers, consistency, and endurance.", "No skill data", "Complete an assessment and training sessions to build your Skill Map.", ["Key speed and accuracy", "Bigrams and trigrams", "Words and punctuation", "Consistency and endurance"]);
export const buildReviewQueueEmptyViewModel = () => emptyView("review-queue", "Review Queue", "Future review scheduling will revisit weak keys, slow combinations, problem words, punctuation transitions, and number patterns.", "No reviews scheduled", "Completed Practice sessions will eventually add evidence-based review items here.", ["Weak keys", "Slow combinations", "Problem words", "Punctuation and number patterns"]);
export const buildProgressEmptyViewModel = () => emptyView("progress", "Progress", "A future home for training time, sustainable and burst speed, accuracy, consistency, mastered weaknesses, and experiment history.", "No training history", "Complete future Practice sessions to begin a local training history.", ["Training activity", "Speed and accuracy", "Consistency", "Mastered weaknesses"]);
export const buildPracticeUnavailableViewModel = () => Object.freeze({ kind: "unavailable", title: "Practice Lab", description: "Practice Lab is coming soon.", backLabel: "Back" });

export function buildPracticeLabViewModel({ route, registry, featureGate }) {
  if (!featureGate.canAccess() || route.name === "unavailable") return buildPracticeUnavailableViewModel();
  if (route.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL) return buildExperimentDetailViewModel({ route, registry });
  if (route.name === PRACTICE_LAB_ROUTES.SKILL_MAP) return buildSkillMapEmptyViewModel();
  if (route.name === PRACTICE_LAB_ROUTES.REVIEW_QUEUE) return buildReviewQueueEmptyViewModel();
  if (route.name === PRACTICE_LAB_ROUTES.PROGRESS) return buildProgressEmptyViewModel();
  return buildPracticeHomeViewModel({ registry, featureGate });
}
