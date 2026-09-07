import { buildPracticeLabViewModelV21 } from "./practiceLabViewModelV21.js";
import { renderPracticeLabV21 } from "./practiceLabRendererV21.js";
import { createPracticeLabRoute, normalizePracticeLabRoute, PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";
import {
  createDefaultPracticeCombinationRepairUiState,
  normalizePracticeCombinationRepairUiState,
} from "./practiceCombinationRepairUi.js";
import {
  createDefaultPracticeWeakKeysUiState,
  normalizePracticeWeakKeysManualInput,
  normalizePracticeWeakKeysUiState,
} from "./practiceWeakKeysUi.js";

export const PRACTICE_LAB_ONBOARDING_VERSION = 1;
const HISTORY_LIMIT = 20;
const COMBINATION_REPAIR_ID = "combination-repair";
const WEAK_KEYS_ID = "weak-keys";
const COMBINATION_LIMITED_CODES = new Set(["INSUFFICIENT_TARGET_WORDS", "INSUFFICIENT_TARGET_CONTENT", "INSUFFICIENT_PROBE_MATCH"]);
const WEAK_KEYS_LIMITED_CODES = new Set(["INSUFFICIENT_KEY_WORDS", "INSUFFICIENT_KEY_CONTENT", "INSUFFICIENT_POSITION_VARIETY", "INSUFFICIENT_NEUTRAL_CONTENT", "INSUFFICIENT_PROBE_MATCH"]);
const RECOMMENDATION_STATUSES = new Set(["ready", "no-evidence", "unsupported", "unavailable"]);

export function createPracticeLabController({
  root,
  appNavigation = {},
  experimentRegistry,
  featureGate,
  renderer = renderPracticeLabV21,
  combinationRepairRecommendationLoader = null,
  weakKeysRecommendationLoader = null,
  weakKeysSaturationLoader = null,
  logger = null,
} = {}) {
  let mounted = false;
  let route = createPracticeLabRoute();
  let history = [];
  let unsubscribeRegistry = null;
  let lastRenderReason = null;
  let renderCount = 0;
  let combinationRepairState = createDefaultPracticeCombinationRepairUiState();
  let weakKeysState = createDefaultPracticeWeakKeysUiState();
  let combinationSessionHost = null;
  let weakKeysSessionHost = null;
  let combinationPrepareEpoch = 0;
  let combinationRecommendationEpoch = 0;
  let weakKeysPrepareEpoch = 0;
  let weakKeysRecommendationEpoch = 0;
  let weakKeysInspectEpoch = 0;
  const subscribers = new Set();

  const isCombinationRepairRoute = () => route.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL && route.params?.experimentId === COMBINATION_REPAIR_ID;
  const isWeakKeysRoute = () => route.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL && route.params?.experimentId === WEAK_KEYS_ID;
  const hasSessionHost = () => Boolean(combinationSessionHost || weakKeysSessionHost);
  const snapshot = () => Object.freeze({
    mounted, route, historyDepth: history.length, listenerCount: mounted ? 2 : 0,
    renderCount, lastRenderReason, featureGate: featureGate.getSnapshot(), registry: experimentRegistry.getDiagnostics(),
    combinationRepair: Object.freeze({
      status: combinationRepairState.status,
      entityType: combinationRepairState.entityType,
      recommendationStatus: combinationRepairState.recommendationStatus,
      recommendationCount: combinationRepairState.recommendations.length,
      sessionActive: Boolean(combinationSessionHost),
    }),
    weakKeys: Object.freeze({
      status: weakKeysState.status,
      targetValue: weakKeysState.targetValue,
      recommendationStatus: weakKeysState.recommendationStatus,
      recommendationCount: weakKeysState.recommendations.length,
      sessionActive: Boolean(weakKeysSessionHost),
    }),
  });
  const emit = (type) => {
    const value = Object.freeze({ type, ...snapshot() });
    [...subscribers].forEach((listener) => { try { listener(value); } catch (error) { logger?.warn?.("Practice controller subscriber failed", error); } });
  };
  const render = (reason, focusSelector = null) => {
    if (!mounted || hasSessionHost()) return false;
    renderer(root, buildPracticeLabViewModelV21({
      route,
      registry: experimentRegistry,
      featureGate,
      helpAvailable: typeof appNavigation.help === "function",
      combinationRepairState,
      weakKeysState,
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
  const setWeakKeysState = (patch, reason = "weak-keys-state", focusSelector = null) => {
    weakKeysState = normalizePracticeWeakKeysUiState({ ...weakKeysState, ...patch });
    render(reason, focusSelector);
  };

  const loadCombinationRepairRecommendations = async () => {
    if (!mounted || !isCombinationRepairRoute() || combinationRepairState.recommendationStatus !== "idle") return false;
    const epoch = ++combinationRecommendationEpoch;
    setCombinationState({ recommendationStatus: "loading", recommendationErrorCode: null }, "combination-recommendations-loading");
    try {
      const result = typeof combinationRepairRecommendationLoader === "function"
        ? await combinationRepairRecommendationLoader()
        : await import("./practiceCombinationRepairRecommendationRuntime.js").then((module) => module.loadPracticeCombinationRepairRecommendations());
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
      setCombinationState({ recommendationStatus: "unavailable", recommendationErrorCode: error?.code ?? "RECOMMENDATIONS_UNAVAILABLE", recommendations: [] }, "combination-recommendations-failed");
      return false;
    }
  };

  const loadWeakKeysRecommendations = async () => {
    if (!mounted || !isWeakKeysRoute() || weakKeysState.recommendationStatus !== "idle") return false;
    const epoch = ++weakKeysRecommendationEpoch;
    setWeakKeysState({ recommendationStatus: "loading", recommendationErrorCode: null }, "weak-keys-recommendations-loading");
    try {
      const result = typeof weakKeysRecommendationLoader === "function"
        ? await weakKeysRecommendationLoader()
        : await import("./practiceWeakKeysRecommendationRuntime.js").then((module) => module.loadPracticeWeakKeyRecommendations());
      if (!mounted || epoch !== weakKeysRecommendationEpoch) return false;
      const status = RECOMMENDATION_STATUSES.has(result?.status) ? result.status : "unavailable";
      setWeakKeysState({
        recommendationStatus: status,
        recommendationErrorCode: status === "unavailable" ? result?.errorCode ?? "RECOMMENDATIONS_UNAVAILABLE" : null,
        recommendations: status === "ready" ? result?.recommendations ?? [] : [],
      }, "weak-keys-recommendations-loaded");
      return status === "ready";
    } catch (error) {
      if (!mounted || epoch !== weakKeysRecommendationEpoch) return false;
      logger?.warn?.("Weak Keys recommendations failed", error);
      setWeakKeysState({ recommendationStatus: "unavailable", recommendationErrorCode: error?.code ?? "RECOMMENDATIONS_UNAVAILABLE", recommendations: [] }, "weak-keys-recommendations-failed");
      return false;
    }
  };

  const loadManualSaturationWarning = async (entityKey) => {
    const recommended = weakKeysState.recommendations.find((entry) => entry.entityKey === entityKey);
    if (recommended?.saturationDeemphasized) return Object.freeze({
      status: recommended.saturationStatus,
      message: "Recent learning evidence suggests this key may already be saturated. Manual practice is still allowed, but another unresolved limiter may have higher value.",
    });
    try {
      const result = typeof weakKeysSaturationLoader === "function"
        ? await weakKeysSaturationLoader({ entityKey })
        : await import("./practiceWeakKeysRecommendationRuntime.js").then((module) => module.loadPracticeWeakKeyManualSaturationWarning?.({ entityKey }));
      return result?.warning ?? null;
    } catch { return null; }
  };

  const inspectWeakKey = async ({ entityKey, targetSource = "manual", knownWarning = null }) => {
    const normalized = normalizePracticeWeakKeysManualInput(entityKey, "en");
    const epoch = ++weakKeysInspectEpoch;
    if (!normalized.valid) {
      setWeakKeysState({
        targetValue: normalized.normalizedValue,
        selectedSource: targetSource,
        status: "unsupported",
        reasonCode: "UNSUPPORTED_KEY_TARGET",
        message: normalized.message,
        availability: null,
        saturationWarning: null,
      }, "weak-keys-target-invalid", "[data-weak-key-target]");
      return false;
    }
    setWeakKeysState({
      targetValue: normalized.normalizedValue,
      selectedSource: targetSource,
      status: "checking",
      reasonCode: null,
      message: null,
      availability: null,
      saturationWarning: knownWarning,
    }, "weak-keys-target-checking", "[data-weak-key-target]");
    const registration = experimentRegistry.getRegistration(WEAK_KEYS_ID);
    if (!registration?.runtime?.inspectTarget) {
      if (epoch !== weakKeysInspectEpoch) return false;
      setWeakKeysState({ status: "unavailable", reasonCode: "TRAINING_CORPUS_NOT_READY" }, "weak-keys-target-unavailable");
      return false;
    }
    try {
      const [availability, warning] = await Promise.all([
        registration.runtime.inspectTarget({ entityKey: normalized.target.entityKey }),
        knownWarning ? Promise.resolve(knownWarning) : loadManualSaturationWarning(normalized.target.entityKey),
      ]);
      if (!mounted || epoch !== weakKeysInspectEpoch || !isWeakKeysRoute()) return false;
      const status = ["ready", "limited-content", "unsupported", "unavailable"].includes(availability?.status) ? availability.status : "unavailable";
      setWeakKeysState({
        targetValue: normalized.target.entityKey,
        selectedSource: targetSource,
        status,
        reasonCode: availability?.reasons?.[0] ?? null,
        message: null,
        availability,
        saturationWarning: warning,
      }, "weak-keys-target-checked", "[data-weak-key-target]");
      return status === "ready";
    } catch (error) {
      if (!mounted || epoch !== weakKeysInspectEpoch) return false;
      setWeakKeysState({ status: "unavailable", reasonCode: error?.code ?? "TRAINING_CORPUS_NOT_READY", availability: null }, "weak-keys-target-check-failed", "[data-weak-key-target]");
      return false;
    }
  };

  const navigate = (nextRoute, { replace = false, returnFocusSelector = null } = {}) => {
    if (!mounted || !featureGate.canAccess() || hasSessionHost()) return false;
    const normalized = normalizePracticeLabRoute(nextRoute, { featureGate });
    if (!replace) history = [...history.slice(-(HISTORY_LIMIT - 1)), { route, focusSelector: returnFocusSelector }];
    route = normalized;
    render("navigation");
    if (isCombinationRepairRoute()) void loadCombinationRepairRecommendations();
    if (isWeakKeysRoute()) void loadWeakKeysRecommendations();
    return true;
  };
  const back = () => {
    if (!mounted) return false;
    if (combinationSessionHost) { void combinationSessionHost.exit(); return true; }
    if (weakKeysSessionHost) { void weakKeysSessionHost.exit(); return true; }
    if (history.length) {
      const previous = history[history.length - 1];
      route = previous.route;
      history = history.slice(0, -1);
      render("back", previous.focusSelector);
      if (isCombinationRepairRoute()) void loadCombinationRepairRecommendations();
      if (isWeakKeysRoute()) void loadWeakKeysRecommendations();
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
        root, session, logger,
        onExit() {
          combinationSessionHost = null;
          if (!mounted) return;
          setCombinationState({ status: "idle", reasonCode: null, message: null }, "combination-session-exit", "[data-combination-target]");
        },
      });
      if (epoch !== combinationPrepareEpoch || !mounted) { await host.exit(); return; }
      combinationSessionHost = host;
      lastRenderReason = "combination-session-start";
      emit("combination-session-started");
    } catch (error) {
      if (epoch !== combinationPrepareEpoch || !mounted) return;
      logger?.warn?.("Combination Repair preparation failed", error);
      const code = error?.code ?? "TRAINING_CORPUS_NOT_READY";
      const status = code === "UNSUPPORTED_COMBINATION_TARGET" ? "unsupported" : COMBINATION_LIMITED_CODES.has(code) ? "limited-content" : "unavailable";
      setCombinationState({ status, reasonCode: code, message: null }, "combination-prepare-failed", "[data-combination-target]");
    }
  };

  const prepareWeakKeys = async ({ entityKey, targetSource = "manual" }) => {
    const normalized = normalizePracticeWeakKeysManualInput(entityKey, "en");
    if (!normalized.valid) { void inspectWeakKey({ entityKey, targetSource }); return; }
    const epoch = ++weakKeysPrepareEpoch;
    setWeakKeysState({ targetValue: normalized.target.entityKey, selectedSource: targetSource, status: "preparing", reasonCode: null, message: null }, "weak-keys-prepare");
    const registration = experimentRegistry.getRegistration(WEAK_KEYS_ID);
    if (!registration?.setupFactory || !registration?.sessionFactory) {
      if (epoch !== weakKeysPrepareEpoch) return;
      setWeakKeysState({ status: "unavailable", reasonCode: "TRAINING_CORPUS_NOT_READY" }, "weak-keys-unavailable");
      return;
    }
    try {
      const prepared = await registration.setupFactory({ entityKey: normalized.target.entityKey, targetSource });
      if (epoch !== weakKeysPrepareEpoch || !mounted) return;
      const session = registration.sessionFactory(prepared);
      const { mountPracticeWeakKeysSession } = await import("./practiceWeakKeysSessionHost.js");
      if (epoch !== weakKeysPrepareEpoch || !mounted) return;
      const host = await mountPracticeWeakKeysSession({
        root,
        session,
        logger,
        onExit() {
          weakKeysSessionHost = null;
          if (!mounted) return;
          setWeakKeysState({ status: "ready", reasonCode: null, message: null }, "weak-keys-session-exit", "[data-weak-key-target]");
        },
        onRepeat() {
          weakKeysSessionHost = null;
          if (!mounted) return;
          void prepareWeakKeys({ entityKey: normalized.target.entityKey, targetSource });
        },
      });
      if (epoch !== weakKeysPrepareEpoch || !mounted) { await host.exit(); return; }
      weakKeysSessionHost = host;
      lastRenderReason = "weak-keys-session-start";
      emit("weak-keys-session-started");
    } catch (error) {
      if (epoch !== weakKeysPrepareEpoch || !mounted) return;
      logger?.warn?.("Weak Keys preparation failed", error);
      const code = error?.code ?? "TRAINING_CORPUS_NOT_READY";
      const status = code === "UNSUPPORTED_KEY_TARGET" ? "unsupported" : WEAK_KEYS_LIMITED_CODES.has(code) ? "limited-content" : "unavailable";
      setWeakKeysState({ status, reasonCode: code, message: null }, "weak-keys-prepare-failed", "[data-weak-key-target]");
    }
  };

  const input = (event) => {
    const field = event.target?.closest?.("[data-weak-key-target]");
    if (!field || !root.contains?.(field) || !isWeakKeysRoute() || hasSessionHost()) return;
    const normalized = normalizePracticeWeakKeysManualInput(field.value, "en");
    field.value = normalized.normalizedValue;
    if (!normalized.valid) {
      weakKeysInspectEpoch += 1;
      setWeakKeysState({
        targetValue: normalized.normalizedValue,
        selectedSource: "manual",
        status: normalized.normalizedValue ? "unsupported" : "idle",
        reasonCode: normalized.normalizedValue ? "UNSUPPORTED_KEY_TARGET" : null,
        message: normalized.normalizedValue ? normalized.message : null,
        availability: null,
        saturationWarning: null,
      }, "weak-keys-input", "[data-weak-key-target]");
      return;
    }
    void inspectWeakKey({ entityKey: normalized.target.entityKey, targetSource: "manual" });
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
    } else if (action === "choose-weak-key") {
      const entityKey = String(target.dataset.entityKey ?? "");
      const recommendation = weakKeysState.recommendations.find((entry) => entry.entityKey === entityKey);
      const warning = recommendation?.saturationDeemphasized ? Object.freeze({
        status: recommendation.saturationStatus,
        message: "Recent learning evidence suggests this key may already be saturated. Manual practice is still allowed, but another unresolved limiter may have higher value.",
      }) : null;
      void inspectWeakKey({ entityKey, targetSource: target.dataset.targetSource === "recommended" ? "recommended" : "manual", knownWarning: warning });
    } else if (action === "start-weak-keys") {
      if (weakKeysState.status !== "ready") return;
      void prepareWeakKeys({ entityKey: weakKeysState.targetValue, targetSource: weakKeysState.selectedSource });
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
      root.addEventListener("input", input);
      unsubscribeRegistry = experimentRegistry.subscribe(() => render("registry-change"));
      render("mount");
      if (isCombinationRepairRoute()) void loadCombinationRepairRecommendations();
      if (isWeakKeysRoute()) void loadWeakKeysRecommendations();
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
      weakKeysPrepareEpoch += 1;
      weakKeysRecommendationEpoch += 1;
      weakKeysInspectEpoch += 1;
      if (combinationSessionHost) void combinationSessionHost.exit();
      if (weakKeysSessionHost) void weakKeysSessionHost.exit();
      combinationSessionHost = null;
      weakKeysSessionHost = null;
      root.removeEventListener("click", click);
      root.removeEventListener("input", input);
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
