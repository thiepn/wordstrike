import { getPracticeExperiment } from "./practiceExperimentCatalog.js";

export const PRACTICE_LAB_ROUTES = Object.freeze({
  HOME: "home", EXPERIMENT_DETAIL: "experiment-detail", SKILL_MAP: "skill-map",
  REVIEW_QUEUE: "review-queue", PROGRESS: "progress",
  EXPERIMENT_SETUP: "experiment-setup", ACTIVE_SESSION: "active-session",
  SESSION_RESULTS: "session-results", ASSESSMENT_RESULTS: "assessment-results",
});
export const PRACTICE_LAB_PUBLIC_ROUTES = Object.freeze([
  PRACTICE_LAB_ROUTES.HOME, PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL,
  PRACTICE_LAB_ROUTES.SKILL_MAP, PRACTICE_LAB_ROUTES.REVIEW_QUEUE, PRACTICE_LAB_ROUTES.PROGRESS,
]);
export const PRACTICE_LAB_RESERVED_ROUTES = Object.freeze([
  PRACTICE_LAB_ROUTES.EXPERIMENT_SETUP, PRACTICE_LAB_ROUTES.ACTIVE_SESSION,
  PRACTICE_LAB_ROUTES.SESSION_RESULTS, PRACTICE_LAB_ROUTES.ASSESSMENT_RESULTS,
]);

export function createPracticeLabRoute(name = PRACTICE_LAB_ROUTES.HOME, params = {}) {
  return Object.freeze({ name, params: Object.freeze({ ...params }) });
}

export function normalizePracticeLabRoute(route, { featureGate, getExperiment = getPracticeExperiment } = {}) {
  if (featureGate?.canAccess?.() !== true) return createPracticeLabRoute("unavailable");
  if (!route || typeof route !== "object" || !PRACTICE_LAB_PUBLIC_ROUTES.includes(route.name)) return createPracticeLabRoute();
  if (route.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL) {
    const experimentId = typeof route.params?.experimentId === "string" ? route.params.experimentId : "";
    return createPracticeLabRoute(route.name, { experimentId, notFound: !getExperiment(experimentId) });
  }
  return createPracticeLabRoute(route.name);
}

export function arePracticeLabRoutesEqual(left, right) {
  return left?.name === right?.name && left?.params?.experimentId === right?.params?.experimentId;
}
