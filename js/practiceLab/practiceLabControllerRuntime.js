import { buildPracticeLabViewModel } from "./practiceLabViewModel.js";
import { renderPracticeLabV20 } from "./practiceLabRendererV20.js";
import { createPracticeLabRoute, normalizePracticeLabRoute, PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";
import {
  createDefaultPracticeCombinationRepairUiState,
  normalizePracticeCombinationRepairUiState,
} from "./practiceCombinationRepairUi.js";

export const PRACTICE_LAB_ONBOARDING_VERSION = 1;
const HISTORY_LIMIT = 20;
const COMBINATION_REPAIR_ID = "combination-repair";
const LIMITED_CODES = new Set(["INSUFFICIENT_TARGET_WORDS", "INSUFFICIENT_TARGET_CONTENT", "INSUFFICIENT_PROBE_MATCH"]);
const RECOMMENDATION_STATUSES = new Set(["ready", "no-evidence", "unavailable"]);

export function createPracticeLabController({
  root,
  appNavigation = {},
  experimentRegistry,
  featureGate,
  renderer = renderPracticeLabV20,
  combinationRepairRecommendationLoader = null,
  logger = null,
} = {}) {
  let mounted = false;
  let route = createPracticeLabRoute();
  let history = [];
  let unsubscribeRegistry = null;
  let lastRenderReason = null;
  let renderCount = 0;
  let combinationRepairState = createDefaultPracticeCombinationRepairUiState();
  let combinationSessionHost = null;
  let combinationPrepareEpoch = 0;
  let combinationRecommendationEpoch = 0;
  const subscribers = new Set();

  const isCombinationRepairRoute = () => route.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL
    && route.params?.experimentId === COMBINATION_REPAIR_ID;
  const snapshot = () => Object.freeze({
    mounted, route, historyDepth: history.length, listenerCount: mounted ? 1 : 0,
    renderCount, lastRenderReason, featureGate: featureGate.getSnapshot(), registry: experimentRegistry.getDiagnostics(),
    combinationRepair: Object.freeze({
      status: combinationRepairState.status,
      entityType: combinationRepairState.entityType,
      recommendationStatus: combinationRepairState.recommendationStatus,
      recommendationCount: combinationRepairState.recommendations.length,
      sessionActive: Boolean(combinationSessionHost),
    }),
  });
  const emit = (type) => {
    const value = Object.freeze({ type, ...snapshot() });
    [...subscribers].forEach((listener) => { try { listener(value); } catch (error) { logger?.warn?.("Practice controller subscriber failed", error); } });
  };
  const render = (reason, focusSelector = null) => {
    if (!mounted || combinationSessionHost) return false;
    renderer(root, buildPracticeLabViewModel({
      route,
      registry: experimentRegistry,
      featureGate,
      helpAvailable: typeof appNavigation.help === "function",
      combinationRepairState,
    }), { focusSelector });
    lastRenderReason = reason;
    renderCount += 1;
    emit("rendered");
    return true;
  };
  const setCombinationState = (patch, reason = "combination-state", focusSelector = null) => {
    combinationRepairState = normalizePracticeCombinationRepairUiState({ ...combinationRepairState, ...patch });
    render(reason, focusSelector);
  };

  const loadCombinationRepairRecommendations = async () => {
    if (!mounted || !isCombinationRepairRoute() || combinationRepairState.recommendationStatus !== "idle") return false;
    const epoch = ++combinationRecommendationEpoch;
    setCombinationState({ recommendationStatus: "loading", recommendationErrorCode: null }, "combination-recommendations-loading");
    try {
      const result = typeof combinationRepairRecommendationLoader === "function"
        ? await combinationRepairRecommendationLoader()
        : await import("./practiceCombinationRepairRecommendationRuntime.js")
            .then((module) => module.loadPracticeCombinationRepairRecommendations());
      if (!mounted || epoch !== combinationRecommendationEpoch) return false;
      const status = RECOMMENDATION_STATUSES.has(result?.status) ? result.status : "unavailable";
      setCombinationState({
        recommendationStatus: status,
        recommendationErrorCode: status === "unavailable" ? result?.errorCode ?? "RECOMMENDATIONS_UNAVAILABLE" : null,
        recommendations: status === "ready" ? result?.recommendations ?? [] : [],
      }, "combination-recommendations-loaded");
      return status === "ready";
    } catch (error) {
      if (!mounted || epoch !== combinationRecommendationEpoch) return false;
      logger?.warn?.("Combination Repair recommendations failed", error);
      setCombinationState({
        recommendationStatus: "unavailable",
        recommendationErrorCode: error?.code ?? "RECOMMENDATIONS_UNAVAILABLE",
        recommendations: [],
      }, "combination-recommendations-failed");
      return false;
    }
  };

  const navigate = (nextRoute, { replace = false, returnFocusSelector = null } = {}) => {
    if (!mounted || !featureGate.canAccess() || combinationSessionHost) return false;
    const normalized = normalizePracticeLabRoute(nextRoute, { featureGate });
    if (!replace) history = [...history.slice(-(HISTORY_LIMIT - 1)), { route, focusSelector: returnFocusSelector }];
    route = normalized;
    render("navigation");
    if (isCombinationRepairRoute()) void loadCombinationRepairRecommendations();
    return true;
  };
  const back = () => {
    if (!mounted) return false;
    if (combinationSessionHost) {
      void combinationSessionHost.exit();
      return true;
    }
    if (history.length) {
      const previous = history[history.length - 1];
      route = previous.route;
      history = history.slice(0, -1);
      render("back", previous.focusSelector);
      if (isCombinationRepairRoute()) void loadCombinationRepairRecommendations();
      return true;
    }
    appNavigation.exit?.();
    return true;
  };

  const readCombinationTarget = () => root.querySelector?.("[data-combination-target]")?.value ?? combinationRepairState.targetValue;
  const prepareCombinationRepair = async ({ entityType, entityKey, targetSource = "manual" }) => {
    const epoch = ++combinationPrepareEpoch;
    setCombinationState({ entityType, targetValue: entityKey, selectedSource: targetSource, status: "preparing", reasonCode: null, message: null }, "combination-prepare");
    const registration = experimentRegistry.getRegistration(COMBINATION_REPAIR_ID);
    if (!registration?.setupFactory || !registration?.sessionFactory) {
      if (epoch !== combinationPrepareEpoch) return;
      setCombinationState({ status: "unavailable", reasonCode: "TRAINING_CORPUS_NOT_READY" }, "combination-unavailable");
      return;
    }
    try {
      const prepared = await registration.setupFactory({ entityType, entityKey, targetSource });
      if (epoch !== combinationPrepareEpoch || !mounted) return;
      const session = registration.sessionFactory(prepared);
      setCombinationState({ status: "ready", reasonCode: null, message: null }, "combination-ready");
      const { mountPracticeCombinationRepairSession } = await import("./practiceCombinationRepairSessionHost.js");
      if (epoch !== combinationPrepareEpoch || !mounted) return;
      const host = await mountPracticeCombinationRepairSession({
        root,
        session,
        logger,
        onExit() {
          combinationSessionHost = null;
          if (!mounted) return;
          setCombinationState({ status: "idle", reasonCode: null, message: null }, "combination-session-exit", "[data-combination-target]");
        },
      });
      if (epoch !== combinationPrepareEpoch || !mounted) {
        await host.exit();
        return;
      }
      combinationSessionHost = host;
      lastRenderReason = "combination-session-start";
      emit("combination-session-started");
    } catch (error) {
      if (epoch !== combinationPrepareEpoch || !mounted) return;
      logger?.warn?.("Combination Repair preparation failed", error);
      const code = error?.code ?? "TRAINING_CORPUS_NOT_READY";
      const status = code === "UNSUPPORTED_COMBINATION_TARGET" ? "unsupported" : LIMITED_CODES.has(code) ? "limited-content" : "unavailable";
      setCombinationState({ status, reasonCode: code, message: null }, "combination-prepare-failed", "[data-combination-target]");
    }
  };

  const click = (event) => {
    if (event.button != null && event.button !== 0) return;
    const target = event.target?.closest?.("[data-practice-action]");
    if (!target || !root.contains?.(target) || target.disabled || target.getAttribute?.("aria-disabled") === "true") return;
    const action = target.dataset.practiceAction;
    if (action === "exit") appNavigation.exit?.();
    else if (action === "back") back();
    else if (action === "help") appNavigation.help?.({ onboardingVersion: PRACTICE_LAB_ONBOARDING_VERSION });
    else if (action === "open-experiment") navigate(
      createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: target.dataset.experimentId }),
      { returnFocusSelector: `[data-experiment-id="${String(target.dataset.experimentId || "").replace(/[^a-z0-9-]/gi, "")}"]` },
    );
    else if (action === "navigate") navigate(
      createPracticeLabRoute(target.dataset.route),
      { returnFocusSelector: `[data-route="${String(target.dataset.route || "").replace(/[^a-z0-9-]/gi, "")}"]` },
    );
    else if (action === "set-combination-type") {
      const entityType = target.dataset.entityType === "trigram" ? "trigram" : "bigram";
      setCombinationState({ entityType, targetValue: "", selectedSource: "manual", status: "idle", reasonCode: null, message: null }, "combination-type", "[data-combination-target]");
    } else if (action === "choose-combination-target") {
      const entityType = target.dataset.entityType === "trigram" ? "trigram" : "bigram";
      const entityKey = String(target.dataset.entityKey ?? "");
      setCombinationState({ entityType, targetValue: entityKey, selectedSource: target.dataset.targetSource === "recommended" ? "recommended" : "manual", status: "idle", reasonCode: null, message: null }, "combination-recommendation", "[data-combination-target]");
    } else if (action === "prepare-combination-repair") {
      const entityKey = String(readCombinationTarget() ?? "").normalize("NFC");
      void prepareCombinationRepair({ entityType: combinationRepairState.entityType, entityKey, targetSource: combinationRepairState.selectedSource });
    }
  };

  return Object.freeze({
    mount(initialRoute = createPracticeLabRoute()) {
      if (mounted) return snapshot();
      if (!root?.addEventListener || !root?.removeEventListener) throw new TypeError("Practice Lab controller requires a DOM root");
      route = normalizePracticeLabRoute(initialRoute, { featureGate });
      history = [];
      mounted = true;
      root.addEventListener("click", click);
      unsubscribeRegistry = experimentRegistry.subscribe(() => render("registry-change"));
      render("mount");
      if (isCombinationRepairRoute()) void loadCombinationRepairRecommendations();
      emit("mounted");
      return snapshot();
    },
    navigate,
    back,
    getSnapshot: snapshot,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Controller listener must be a function");
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    unmount() {
      if (!mounted) return false;
      combinationPrepareEpoch += 1;
      combinationRecommendationEpoch += 1;
      if (combinationSessionHost) void combinationSessionHost.exit();
      combinationSessionHost = null;
      root.removeEventListener("click", click);
      unsubscribeRegistry?.();
      unsubscribeRegistry = null;
      history = [];
      mounted = false;
      lastRenderReason = "unmount";
      emit("unmounted");
      subscribers.clear();
      return true;
    },
  });
}
