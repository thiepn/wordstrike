// Phase 8 canonical Practice controller runtime.
// Consolidates the former V21→V40 wrapper chain into one production module while preserving layer behavior.
// Historical V-files are no longer part of the production dependency graph.

import * as __renderers from "./practiceLabRendererCurrent.js";
import * as __c_base_dep0 from "./practiceLabViewModelV21.js";
import * as __c_base_dep1 from "./practiceLabRoutes.js";
import * as __c_base_dep2 from "./practiceCombinationRepairUi.js";
import * as __c_base_dep3 from "./practiceWeakKeysUi.js";
import * as __c_v22_dep0 from "./practiceProblemWordsUi.js";
import * as __c_v22_dep1 from "./practiceProblemWordsExperiment.js";
import * as __c_v22_dep2 from "./practiceProblemWordsUi.js";
import * as __c_v22_dep3 from "./practiceLabRoutes.js";
import * as __c_v23_dep0 from "./practiceAccuracyRecoveryUi.js";
import * as __c_v23_dep1 from "./practiceAccuracyRecoveryExperiment.js";
import * as __c_v23_dep2 from "./practiceLabRoutes.js";
import * as __c_v24_dep0 from "./practiceRealTextUi.js";
import * as __c_v24_dep1 from "./practiceRealTextExperiment.js";
import * as __c_v24_dep2 from "./practiceLabRoutes.js";
import * as __c_v25_dep0 from "./practiceCoachUi.js";
import * as __c_v25_dep1 from "./practiceCoachService.js";
import * as __c_v25_dep2 from "./practiceIndexedDbStore.js";
import * as __c_v25_dep3 from "./practiceManifestStore.js";
import * as __c_v25_dep4 from "./practiceRepository.js";
import * as __c_v25_dep5 from "./practiceLabRoutes.js";
import * as __c_v26_dep0 from "./practicePaceLadderExperiment.js";
import * as __c_v26_dep1 from "./practiceLabRoutes.js";
import * as __c_v27_dep0 from "./practiceBurstSprintsExperiment.js";
import * as __c_v27_dep1 from "./practiceLabRoutes.js";
import * as __c_v28_dep0 from "./practiceCommonWordsExperiment.js";
import * as __c_v28_dep1 from "./practiceLabRoutes.js";
import * as __c_v29_dep0 from "./practiceConsistencyExperiment.js";
import * as __c_v29_dep1 from "./practiceEnduranceExperiment.js";
import * as __c_v29_dep2 from "./practiceConsistencyConstants.js";
import * as __c_v29_dep3 from "./practiceEnduranceConstants.js";
import * as __c_v29_dep4 from "./practiceLabRoutes.js";
import * as __c_v30_dep0 from "./practicePunctuationCapitalsExperiment.js";
import * as __c_v30_dep1 from "./practiceNumbersSymbolsExperiment.js";
import * as __c_v30_dep2 from "./practicePunctuationCapitalsConstants.js";
import * as __c_v30_dep3 from "./practiceNumbersSymbolsConstants.js";
import * as __c_v30_dep4 from "./practiceLabRoutes.js";
import * as __c_v31_dep0 from "./practiceCustomTextExperiment.js";
import * as __c_v31_dep1 from "./practiceCustomTextConstants.js";
import * as __c_v31_dep2 from "./practiceCustomTextAvailability.js";
import * as __c_v31_dep3 from "./practiceCustomTextProjection.js";
import * as __c_v31_dep4 from "./practiceCustomTextValidation.js";
import * as __c_v31_dep5 from "./practiceCustomTextImportExport.js";
import * as __c_v31_dep6 from "./practiceLabRoutes.js";
import * as __c_v32_dep0 from "./practiceLabRoutes.js";
import * as __c_v32_dep1 from "./practiceTreatmentResponseViewModel.js";
import * as __c_v36_dep0 from "./practiceLabRoutes.js";
import * as __c_v37_dep0 from "./practiceWeaknessBossExperiment.js";
import * as __c_v37_dep1 from "./practiceLabRoutes.js";
import * as __c_v38_dep0 from "./practiceLabRoutes.js";
import * as __c_v40_dep0 from "./practiceLabWorkshop.js";
import * as __c_v40_dep1 from "./practiceLabIdentity.js";
import * as __c_v40_dep2 from "./practicePreviewProtocolSetup.js";
import * as __c_v40_dep3 from "./practiceLabViewModel.js";
import * as __c_v40_dep4 from "./practiceEvidenceViews.js";

// practiceLabControllerRuntime — consolidated controller layer
const __controller_base = (() => {
  const { buildPracticeLabViewModelV21 } = __c_base_dep0;
  const { renderPracticeLabV21 } = __renderers;
  const { createPracticeLabRoute, normalizePracticeLabRoute, PRACTICE_LAB_ROUTES } = __c_base_dep1;
  const { createDefaultPracticeCombinationRepairUiState, normalizePracticeCombinationRepairUiState } = __c_base_dep2;
  const { createDefaultPracticeWeakKeysUiState, normalizePracticeWeakKeysManualInput, normalizePracticeWeakKeysUiState } = __c_base_dep3;
  const PRACTICE_LAB_ONBOARDING_VERSION = 1;
  const HISTORY_LIMIT = 20;
  const COMBINATION_REPAIR_ID = "combination-repair";
  const WEAK_KEYS_ID = "weak-keys";
  const COMBINATION_LIMITED_CODES = new Set(["INSUFFICIENT_TARGET_WORDS", "INSUFFICIENT_TARGET_CONTENT", "INSUFFICIENT_PROBE_MATCH"]);
  const WEAK_KEYS_LIMITED_CODES = new Set(["INSUFFICIENT_KEY_WORDS", "INSUFFICIENT_KEY_CONTENT", "INSUFFICIENT_POSITION_VARIETY", "INSUFFICIENT_NEUTRAL_CONTENT", "INSUFFICIENT_PROBE_MATCH"]);
  const RECOMMENDATION_STATUSES = new Set(["ready", "no-evidence", "unsupported", "unavailable"]);
  
  function createPracticeLabController({
    root,
    appNavigation = {},
    navigationController = null,
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
      mounted, route, historyDepth: history.length, listenerCount: mounted ? 3 : 0,
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
        dataManagementAvailable: typeof appNavigation.manageData === "function",
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
      const combinationField = event.target?.closest?.("[data-combination-target]");
      if (combinationField && root.contains?.(combinationField) && isCombinationRepairRoute() && !hasSessionHost()) {
        // Recommendation loading can repaint this form after the user has typed.
        // Keep the draft in state without replacing the focused input on each key.
        combinationRepairState = normalizePracticeCombinationRepairUiState({ ...combinationRepairState, targetValue: combinationField.value, selectedSource: "manual", status: "idle", reasonCode: null, message: null });
        return;
      }
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
  
    const keydown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      if (target?.closest?.("input,textarea,select,[contenteditable='true'],[contenteditable='']")) return;
      if (root.querySelector?.("[data-practice-session-capture],[data-assessment-input],[data-protocol-input]")) return;
      event.preventDefault?.();
      (navigationController?.back ?? back)();
    };
  
    const click = (event) => {
      if (event.button != null && event.button !== 0) return;
      const target = event.target?.closest?.("[data-practice-action]");
      if (!target || !root.contains?.(target) || target.disabled || target.getAttribute?.("aria-disabled") === "true") return;
      const action = target.dataset.practiceAction;
      if (action === "exit") appNavigation.exit?.();
      else if (action === "back") (navigationController?.back ?? back)();
      else if (action === "help") appNavigation.help?.({ onboardingVersion: PRACTICE_LAB_ONBOARDING_VERSION });
      else if (action === "manage-data") appNavigation.manageData?.();
      else if (action === "open-experiment") (navigationController?.navigate ?? navigate)(
        createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: target.dataset.experimentId }),
        { returnFocusSelector: `[data-experiment-id="${String(target.dataset.experimentId || "").replace(/[^a-z0-9-]/gi, "")}"]` },
      );
      else if (action === "navigate") (navigationController?.navigate ?? navigate)(
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
        root.addEventListener("keydown", keydown);
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
        root.removeEventListener("keydown", keydown);
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
  return Object.freeze({ createPracticeLabController, PRACTICE_LAB_ONBOARDING_VERSION });
})();

// practiceLabControllerRuntimeV22 — consolidated controller layer
const __controller_v22 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV21 } = __controller_base;
  const { renderPracticeLabV21 } = __renderers;
  const { renderPracticeProblemWordsDetail } = __renderers;
  const { buildPracticeProblemWordsDetailViewModel } = __c_v22_dep0;
  const { registerPracticeProblemWordsExperiment } = __c_v22_dep1;
  const { createDefaultPracticeProblemWordsUiState, normalizePracticeProblemWordsManualInput, normalizePracticeProblemWordsUiState } = __c_v22_dep2;
  const { PRACTICE_LAB_ROUTES } = __c_v22_dep3;
  const PROBLEM_WORDS_ID = "problem-words";
  const LIMITED_CODES = new Set(["INSUFFICIENT_WORD_CONTEXTS", "INSUFFICIENT_TARGET_FAMILIES", "INSUFFICIENT_NEUTRAL_CONTENT", "INSUFFICIENT_PROBE_MATCH"]);
  const REC_STATUSES = new Set(["ready", "no-evidence", "unsupported", "unavailable"]);
  
  function createPracticeLabController(options = {}) {
    const { root, experimentRegistry, logger = null, problemWordsRecommendationLoader = null, problemWordsWarningsLoader = null } = options;
    registerPracticeProblemWordsExperiment(experimentRegistry);
    let state = createDefaultPracticeProblemWordsUiState();
    let sessionHost = null;
    let mounted = false;
    let lastView = null;
    let inspectEpoch = 0;
    let inspectTimer = null;
    let prepareEpoch = 0;
    let recommendationEpoch = 0;
    let problemListenersAttached = false;
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
  
    function attachProblemListeners() {
      if (problemListenersAttached || !mounted) return;
      root?.addEventListener?.("click", click, true);
      root?.addEventListener?.("input", input, true);
      problemListenersAttached = true;
    }
  
    function detachProblemListeners() {
      clearTimeout(inspectTimer);
      if (!problemListenersAttached) return;
      root?.removeEventListener?.("click", click, true);
      root?.removeEventListener?.("input", input, true);
      problemListenersAttached = false;
    }
  
    function syncProblemListeners(view) {
      if (view?.kind === "experiment-detail" && view?.title === "Problem Words") attachProblemListeners();
      else detachProblemListeners();
    }
  
    const renderer = (renderRoot, view, rendererOptions = {}) => {
      lastView = view;
      syncProblemListeners(view);
      if (view?.kind === "experiment-detail" && view?.title === "Problem Words") {
        const detail = buildPracticeProblemWordsDetailViewModel({ entry: view, resolved: { runnable: view.runnable }, state });
        return externalRenderer ? externalRenderer(renderRoot, detail, rendererOptions) : renderPracticeProblemWordsDetail(renderRoot, detail, rendererOptions);
      }
      return externalRenderer ? externalRenderer(renderRoot, view, rendererOptions) : renderPracticeLabV21(renderRoot, view, rendererOptions);
    };
  
    const base = createPracticeLabControllerV21({ ...options, renderer });
    const isProblemRoute = () => base.getSnapshot()?.route?.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL && base.getSnapshot()?.route?.params?.experimentId === PROBLEM_WORDS_ID;
    const rerender = (focusSelector = null) => { if (mounted && !sessionHost && isProblemRoute() && lastView) renderer(root, lastView, { focusSelector }); };
    const setState = (patch, focusSelector = null) => { state = normalizePracticeProblemWordsUiState({ ...state, ...patch }); rerender(focusSelector); };
  
    const loadRecommendations = async () => {
      if (!mounted || !isProblemRoute() || state.recommendationStatus !== "idle") return false;
      const epoch = ++recommendationEpoch;
      setState({ recommendationStatus: "loading", recommendationErrorCode: null });
      try {
        const result = typeof problemWordsRecommendationLoader === "function"
          ? await problemWordsRecommendationLoader()
          : await import("./practiceProblemWordsRecommendationRuntime.js").then((module) => module.loadPracticeProblemWordRecommendations());
        if (!mounted || epoch !== recommendationEpoch || !isProblemRoute()) return false;
        const status = REC_STATUSES.has(result?.status) ? result.status : "unavailable";
        setState({
          recommendationStatus: status,
          recommendationErrorCode: status === "unavailable" ? result?.errorCode ?? "RECOMMENDATIONS_UNAVAILABLE" : null,
          recommendations: status === "ready" ? result?.recommendations ?? [] : [],
        });
        return status === "ready";
      } catch (error) {
        if (epoch !== recommendationEpoch) return false;
        setState({ recommendationStatus: "unavailable", recommendationErrorCode: error?.code ?? "RECOMMENDATIONS_UNAVAILABLE", recommendations: [] });
        return false;
      }
    };
  
    const warningsFor = async (entityKey) => {
      const recommended = state.recommendations.find((entry) => entry.entityKey === entityKey);
      const warnings = [];
      if (recommended?.hierarchyDeemphasized) warnings.push({ kind: "hierarchy", message: "Some of this word's difficulty may reflect lower-level letter combinations." });
      if (recommended?.saturationDeemphasized) warnings.push({ kind: "saturation", message: "Recent similar practice appears to have low marginal gain." });
      if (warnings.length) return warnings;
      try {
        const result = typeof problemWordsWarningsLoader === "function"
          ? await problemWordsWarningsLoader({ entityKey })
          : await import("./practiceProblemWordsRecommendationRuntime.js").then((module) => module.loadPracticeProblemWordManualWarnings({ entityKey }));
        return result?.warnings ?? [];
      } catch {
        return [];
      }
    };
  
    const inspect = async ({ entityKey, targetSource = "manual" } = {}) => {
      clearTimeout(inspectTimer);
      const normalized = normalizePracticeProblemWordsManualInput(entityKey, "en");
      const epoch = ++inspectEpoch;
      if (!normalized.valid) {
        setState({ targetValue: normalized.normalizedValue, selectedSource: targetSource, status: "unsupported", reasonCode: normalized.reasonCode, message: normalized.message, availability: null, warnings: [] }, "[data-problem-word-target]");
        return false;
      }
      setState({ targetValue: normalized.target.entityKey, selectedSource: targetSource, status: "checking", reasonCode: null, message: null, availability: null, warnings: [] }, "[data-problem-word-target]");
      const registration = experimentRegistry.getRegistration(PROBLEM_WORDS_ID);
      try {
        const [availability, warnings] = await Promise.all([
          registration?.runtime?.inspectTarget?.({ entityKey: normalized.target.entityKey }),
          warningsFor(normalized.target.entityKey),
        ]);
        if (!mounted || epoch !== inspectEpoch || !isProblemRoute()) return false;
        const status = ["ready", "limited-content", "unsupported", "unavailable"].includes(availability?.status) ? availability.status : "unavailable";
        setState({ targetValue: normalized.target.entityKey, selectedSource: targetSource, status, reasonCode: availability?.reasons?.[0] ?? null, availability, warnings }, "[data-problem-word-target]");
        return status === "ready";
      } catch (error) {
        if (epoch !== inspectEpoch) return false;
        setState({ status: "unavailable", reasonCode: error?.code ?? "TRAINING_CORPUS_NOT_READY", availability: null }, "[data-problem-word-target]");
        return false;
      }
    };
  
    const prepare = async ({ entityKey, targetSource = "manual" } = {}) => {
      const normalized = normalizePracticeProblemWordsManualInput(entityKey, "en");
      if (!normalized.valid) return inspect({ entityKey, targetSource });
      const epoch = ++prepareEpoch;
      setState({ targetValue: normalized.target.entityKey, selectedSource: targetSource, status: "preparing", reasonCode: null, message: null });
      const registration = experimentRegistry.getRegistration(PROBLEM_WORDS_ID);
      try {
        const prepared = await registration.setupFactory({ entityKey: normalized.target.entityKey, targetSource });
        if (!mounted || epoch !== prepareEpoch) return false;
        const session = registration.sessionFactory(prepared);
        const { mountPracticeProblemWordsSession } = await import("./practiceProblemWordsSessionHost.js");
        if (!mounted || epoch !== prepareEpoch) return false;
        detachProblemListeners();
        sessionHost = await mountPracticeProblemWordsSession({
          root,
          session,
          logger,
          onExit() {
            sessionHost = null;
            if (mounted) setState({ status: "ready", reasonCode: null, message: null }, "[data-problem-word-target]");
          },
          onRepeat() {
            sessionHost = null;
            if (mounted) void prepare({ entityKey: normalized.target.entityKey, targetSource });
          },
        });
        return true;
      } catch (error) {
        if (!mounted || epoch !== prepareEpoch) return false;
        const code = error?.code ?? "TRAINING_CORPUS_NOT_READY";
        const status = code === "UNSUPPORTED_WORD_TARGET" ? "unsupported" : LIMITED_CODES.has(code) ? "limited-content" : "unavailable";
        logger?.warn?.("Problem Words preparation failed", error);
        setState({ status, reasonCode: code, message: null }, "[data-problem-word-target]");
        return false;
      }
    };
  
    const click = (event) => {
      const target = event.target?.closest?.("[data-practice-action]");
      if (!target || !root?.contains?.(target)) return;
      const action = target.dataset.practiceAction;
      if (action === "choose-problem-word") {
        event.stopPropagation();
        void inspect({ entityKey: target.dataset.entityKey, targetSource: target.dataset.targetSource ?? "recommended" });
      } else if (action === "start-problem-words") {
        event.stopPropagation();
        const value = root.querySelector?.("[data-problem-word-target]")?.value ?? state.targetValue;
        void prepare({ entityKey: value, targetSource: state.selectedSource ?? "manual" });
      }
    };
  
    const input = (event) => {
      const target = event.target?.closest?.("[data-problem-word-target]");
      if (!target || !root?.contains?.(target)) return;
      clearTimeout(inspectTimer);
      inspectEpoch += 1;
      state = normalizePracticeProblemWordsUiState({ ...state, targetValue: target.value, selectedSource: "manual", status: "checking", availability: null });
      const start = root.querySelector?.('[data-practice-action="start-problem-words"]');
      if (start) start.disabled = true;
      inspectTimer = setTimeout(() => { if (mounted && isProblemRoute()) void inspect({ entityKey: state.targetValue, targetSource: "manual" }); }, 250);
    };
  
    const afterRoute = () => {
      if (isProblemRoute() && state.recommendationStatus === "idle") void loadRecommendations();
    };
  
    return Object.freeze({
      mount(route) {
        mounted = true;
        const result = base.mount(route);
        queueMicrotask(afterRoute);
        return result;
      },
      navigate(...args) {
        const result = base.navigate(...args);
        queueMicrotask(afterRoute);
        return result;
      },
      back() {
        if (sessionHost) {
          void sessionHost.exit();
          return true;
        }
        const result = base.back();
        queueMicrotask(afterRoute);
        return result;
      },
      getSnapshot() {
        const snapshot = base.getSnapshot();
        return Object.freeze({
          ...snapshot,
          problemWords: Object.freeze({
            status: state.status,
            targetValue: state.targetValue,
            recommendationStatus: state.recommendationStatus,
            recommendationCount: state.recommendations.length,
            sessionActive: Boolean(sessionHost),
          }),
        });
      },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() {
        mounted = false;
        inspectEpoch += 1;
        prepareEpoch += 1;
        recommendationEpoch += 1;
        detachProblemListeners();
        if (sessionHost) {
          void sessionHost.exit();
          sessionHost = null;
        }
        return base.unmount();
      },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV23 — consolidated controller layer
const __controller_v23 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV22 } = __controller_v22;
  const { renderPracticeAccuracyRecoveryDetail, renderPracticeLabV23 } = __renderers;
  const { buildPracticeAccuracyRecoveryDetailViewModel, createDefaultPracticeAccuracyRecoveryUiState, normalizePracticeAccuracyRecoveryManualInput, normalizePracticeAccuracyRecoveryUiState } = __c_v23_dep0;
  const { registerPracticeAccuracyRecoveryExperiment } = __c_v23_dep1;
  const { PRACTICE_LAB_ROUTES } = __c_v23_dep2;
  const ID = "accuracy-control";
  const REC_STATUSES = new Set(["ready", "no-evidence", "unsupported", "unavailable"]);
  const typeToManual = (type) => type === "key" ? "key" : type === "word" ? "word" : "combination";
  
  function createPracticeLabController(options = {}) {
    const { root, experimentRegistry, logger = null, accuracyRecoveryRecommendationLoader = null, accuracyRecoveryWarningsLoader = null } = options;
    registerPracticeAccuracyRecoveryExperiment(experimentRegistry);
    let inspectTimer = null;
    let state = createDefaultPracticeAccuracyRecoveryUiState(); let sessionHost = null; let mounted = false; let lastView = null; let inspectEpoch = 0; let prepareEpoch = 0; let recommendationEpoch = 0; let listeners = false; const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    function isDetail(view) { return view?.kind === "experiment-detail" && view?.title === "Accuracy & Recovery"; }
    function attach() { if (!listeners && mounted) { root?.addEventListener?.("click", click, true); root?.addEventListener?.("input", input, true); listeners = true; } }
    function detach() { clearTimeout(inspectTimer); if (listeners) { root?.removeEventListener?.("click", click, true); root?.removeEventListener?.("input", input, true); listeners = false; } }
    function renderer(renderRoot, view, rendererOptions = {}) { lastView = view; if (isDetail(view)) { attach(); const detail = buildPracticeAccuracyRecoveryDetailViewModel({ entry: view, resolved: { runnable: view.runnable }, state }); return externalRenderer ? externalRenderer(renderRoot, detail, rendererOptions) : renderPracticeAccuracyRecoveryDetail(renderRoot, detail, rendererOptions); } detach(); return externalRenderer ? externalRenderer(renderRoot, view, rendererOptions) : renderPracticeLabV23(renderRoot, view, rendererOptions); }
    const base = createPracticeLabControllerV22({ ...options, renderer });
    const isRoute = () => base.getSnapshot()?.route?.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL && base.getSnapshot()?.route?.params?.experimentId === ID;
    const rerender = (focusSelector = null) => { if (mounted && !sessionHost && isRoute() && lastView) renderer(root, lastView, { focusSelector }); };
    const setState = (patch, focusSelector = null) => { state = normalizePracticeAccuracyRecoveryUiState({ ...state, ...patch }); rerender(focusSelector); };
    const loadRecommendations = async () => {
      if (!mounted || !isRoute() || state.recommendationStatus !== "idle") return false; const epoch = ++recommendationEpoch; setState({ recommendationStatus: "loading" });
      try { const result = typeof accuracyRecoveryRecommendationLoader === "function" ? await accuracyRecoveryRecommendationLoader() : await import("./practiceAccuracyRecoveryRecommendationRuntime.js").then((module) => module.loadPracticeAccuracyRecoveryRecommendations()); if (!mounted || epoch !== recommendationEpoch || !isRoute()) return false; const status = REC_STATUSES.has(result?.status) ? result.status : "unavailable"; setState({ recommendationStatus: status, recommendations: status === "ready" ? result.recommendations ?? [] : [], recommendationErrorCode: status === "unavailable" ? result?.errorCode ?? "RECOMMENDATIONS_UNAVAILABLE" : null }); return status === "ready"; }
      catch (error) { if (epoch === recommendationEpoch) setState({ recommendationStatus: "unavailable", recommendations: [], recommendationErrorCode: error?.code ?? "RECOMMENDATIONS_UNAVAILABLE" }); return false; }
    };
    const warningsFor = async (target) => { const recommended = state.recommendations.find((item) => item.entityType === target.entityType && item.entityKey === target.entityKey); const warnings = []; if (recommended?.hierarchyDeemphasized) warnings.push({ kind: "hierarchy", message: "Some of this target's difficulty may be explained by a lower-level limiter." }); if (recommended?.saturationDeemphasized) warnings.push({ kind: "saturation", message: "Recent similar acquisition practice appears to have low marginal gain." }); if (warnings.length) return warnings; try { const result = typeof accuracyRecoveryWarningsLoader === "function" ? await accuracyRecoveryWarningsLoader(target) : await import("./practiceAccuracyRecoveryRecommendationRuntime.js").then((module) => module.loadPracticeAccuracyRecoveryManualWarnings(target)); return result?.warnings ?? []; } catch { return []; } };
    const inspect = async ({ value, manualType = state.manualType, targetSource = "manual", explicitEntityType = null } = {}) => {
      clearTimeout(inspectTimer);
      const normalized = explicitEntityType ? { valid: true, normalizedValue: value, target: { entityType: explicitEntityType, entityKey: value }, reasonCode: null, message: null } : normalizePracticeAccuracyRecoveryManualInput(value, manualType, "en"); const epoch = ++inspectEpoch;
      if (!normalized.valid) { setState({ manualType, targetValue: normalized.normalizedValue, entityType: null, selectedSource: targetSource, status: "unsupported", reasonCode: normalized.reasonCode, message: normalized.message, warnings: [], availability: null }, "[data-accuracy-recovery-target]"); return false; }
      setState({ manualType: typeToManual(normalized.target.entityType), targetValue: normalized.target.entityKey, entityType: normalized.target.entityType, selectedSource: targetSource, status: "checking", reasonCode: null, message: null, warnings: [] });
      const registration = experimentRegistry.getRegistration(ID);
      try { const [availability, warnings] = await Promise.all([registration?.runtime?.inspectTarget?.({ entityType: normalized.target.entityType, entityKey: normalized.target.entityKey, manualType: typeToManual(normalized.target.entityType) }), warningsFor(normalized.target)]); if (!mounted || epoch !== inspectEpoch || !isRoute()) return false; const status = ["ready", "limited-content", "unsupported", "unavailable"].includes(availability?.status) ? availability.status : "unavailable"; setState({ status, reasonCode: availability?.reasons?.[0] ?? null, availability, warnings }); return status === "ready"; }
      catch (error) { if (epoch === inspectEpoch) setState({ status: "unavailable", reasonCode: error?.code ?? "TRAINING_CORPUS_NOT_READY", availability: null }); return false; }
    };
    const prepare = async () => {
      const normalized = normalizePracticeAccuracyRecoveryManualInput(state.targetValue, state.manualType, "en"); if (!normalized.valid && !state.entityType) return false; const target = state.entityType ? { entityType: state.entityType, entityKey: state.targetValue } : normalized.target; const epoch = ++prepareEpoch; setState({ status: "preparing" }); const registration = experimentRegistry.getRegistration(ID);
      try { const prepared = await registration.setupFactory({ entityType: target.entityType, entityKey: target.entityKey, manualType: typeToManual(target.entityType), targetSource: state.selectedSource }); if (!mounted || epoch !== prepareEpoch) return false; const session = registration.sessionFactory(prepared); const { mountPracticeAccuracyRecoverySession } = await import("./practiceAccuracyRecoverySessionHost.js"); detach(); sessionHost = await mountPracticeAccuracyRecoverySession({ root, session, logger, onExit() { sessionHost = null; if (mounted) setState({ status: "ready" }, "[data-accuracy-recovery-target]"); }, onRepeat() { sessionHost = null; if (mounted) void prepare(); } }); return true; }
      catch (error) { if (mounted && epoch === prepareEpoch) { logger?.warn?.("Accuracy & Recovery preparation failed", error); setState({ status: "unavailable", reasonCode: error?.code ?? "TRAINING_CORPUS_NOT_READY" }); } return false; }
    };
    function click(event) { const button = event.target?.closest?.("[data-practice-action]"); if (!button || !root?.contains?.(button)) return; const action = button.dataset.practiceAction; if (action === "set-accuracy-recovery-type") { clearTimeout(inspectTimer); inspectEpoch += 1; event.stopPropagation(); setState({ manualType: button.dataset.manualType, entityType: button.dataset.manualType === "key" ? "key" : button.dataset.manualType === "word" ? "word" : null, targetValue: "", status: "idle", warnings: [] }, "[data-accuracy-recovery-target]"); } else if (action === "choose-accuracy-recovery-target") { event.stopPropagation(); void inspect({ value: button.dataset.entityKey, manualType: typeToManual(button.dataset.entityType), explicitEntityType: button.dataset.entityType, targetSource: "recommended" }); } else if (action === "start-accuracy-recovery") { event.stopPropagation(); void prepare(); } }
    function input(event) {
      const target = event.target?.closest?.("[data-accuracy-recovery-target]");
      if (!target || !root?.contains?.(target)) return;
      clearTimeout(inspectTimer); inspectEpoch += 1;
      state = normalizePracticeAccuracyRecoveryUiState({ ...state, targetValue: target.value, selectedSource: "manual", status: "checking", availability: null, entityType: null });
      const start = root.querySelector?.('[data-practice-action="start-accuracy-recovery"]');
      if (start) start.disabled = true;
      inspectTimer = setTimeout(() => { if (mounted && isRoute()) void inspect({ value: state.targetValue, manualType: state.manualType, targetSource: "manual" }); }, 250);
    }
  
    const afterRoute = () => { if (isRoute() && state.recommendationStatus === "idle") void loadRecommendations(); };
    return Object.freeze({ mount(route) { mounted = true; const result = base.mount(route); queueMicrotask(afterRoute); return result; }, navigate(...args) { const result = base.navigate(...args); queueMicrotask(afterRoute); return result; }, back() { if (sessionHost) { void sessionHost.exit(); return true; } const result = base.back(); queueMicrotask(afterRoute); return result; }, getSnapshot() { const snapshot = base.getSnapshot(); return Object.freeze({ ...snapshot, accuracyRecovery: Object.freeze({ status: state.status, manualType: state.manualType, entityType: state.entityType, targetValue: state.targetValue, recommendationStatus: state.recommendationStatus, recommendationCount: state.recommendations.length, sessionActive: Boolean(sessionHost) }) }); }, subscribe(listener) { return base.subscribe(listener); }, unmount() { mounted = false; inspectEpoch += 1; prepareEpoch += 1; recommendationEpoch += 1; detach(); if (sessionHost) { void sessionHost.exit(); sessionHost = null; } return base.unmount(); } });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV24 — consolidated controller layer
const __controller_v24 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV23 } = __controller_v23;
  const { renderPracticeLabV24, renderPracticeRealTextDetail } = __renderers;
  const { buildPracticeRealTextDetailViewModel, createDefaultPracticeRealTextUiState, normalizePracticeRealTextUiState } = __c_v24_dep0;
  const { registerPracticeRealTextExperiment } = __c_v24_dep1;
  const { PRACTICE_LAB_ROUTES } = __c_v24_dep2;
  const ID = "real-text";
  
  function createPracticeLabController(options = {}) {
    const { root, experimentRegistry, logger = null, realTextColdRuntime = null } = options;
    registerPracticeRealTextExperiment(experimentRegistry);
    let state = createDefaultPracticeRealTextUiState();
    let sessionHost = null; let mounted = false; let lastView = null; let loadEpoch = 0; let startEpoch = 0; let listeners = false; let coldRuntimePromise = null;
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    const isDetail = (view) => view?.kind === "experiment-detail" && view?.title === "Real Text";
    const attach = () => { if (!listeners && mounted) { root?.addEventListener?.("click", click, true); listeners = true; } };
    const detach = () => { if (listeners) { root?.removeEventListener?.("click", click, true); listeners = false; } };
    function renderer(renderRoot, view, rendererOptions = {}) {
      lastView = view;
      if (isDetail(view)) { attach(); const detail = buildPracticeRealTextDetailViewModel({ entry: view, resolved: { runnable: view.runnable }, state }); return externalRenderer ? externalRenderer(renderRoot, detail, rendererOptions) : renderPracticeRealTextDetail(renderRoot, detail, rendererOptions); }
      detach(); return externalRenderer ? externalRenderer(renderRoot, view, rendererOptions) : renderPracticeLabV24(renderRoot, view, rendererOptions);
    }
    const base = createPracticeLabControllerV23({ ...options, renderer });
    const isRoute = () => base.getSnapshot()?.route?.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL && base.getSnapshot()?.route?.params?.experimentId === ID;
    const rerender = (focusSelector = null) => { if (mounted && !sessionHost && isRoute() && lastView) renderer(root, lastView, { focusSelector }); };
    const setState = (patch, focusSelector = null) => { state = normalizePracticeRealTextUiState({ ...state, ...patch }); rerender(focusSelector); };
    const getColdRuntime = async () => {
      if (realTextColdRuntime) return realTextColdRuntime;
      coldRuntimePromise ??= import("./practiceRealTextColdTransferRuntime.js").then((module) => module.createDefaultPracticeRealTextColdTransferRuntime());
      return coldRuntimePromise;
    };
    const loadAvailability = async () => {
      if (!mounted || !isRoute()) return false;
      const epoch = ++loadEpoch;
      setState({ practiceStatus: "loading", coldStatus: "loading", errorCode: null });
      const registration = experimentRegistry.getRegistration(ID);
      const [practice, cold] = await Promise.all([
        registration?.runtime?.getAvailability?.().catch((error) => ({ status: "unavailable", reasons: [error?.code ?? "REAL_TEXT_POOL_NOT_READY"], supportedDurationsMs: [] })) ?? { status: "unavailable", reasons: ["REAL_TEXT_POOL_NOT_READY"], supportedDurationsMs: [] },
        getColdRuntime().then((runtime) => runtime.getAvailability()).catch((error) => ({ status: "unavailable", reason: error?.code ?? "REAL_TEXT_COLD_TRANSFER_UNAVAILABLE" })),
      ]);
      if (!mounted || epoch !== loadEpoch || !isRoute()) return false;
      setState({ practiceStatus: practice.status === "ready" ? "ready" : "unavailable", practiceAvailability: practice, coldStatus: cold.status === "ready" ? "ready" : "unavailable", coldAvailability: cold });
      return true;
    };
    const mountSession = async (session, mode) => {
      const { mountPracticeRealTextSession } = await import("./practiceRealTextSessionHost.js");
      detach();
      sessionHost = await mountPracticeRealTextSession({ root, session, mode, logger, onExit() { sessionHost = null; if (mounted) { setState({ starting: null }); void loadAvailability(); } } });
      return true;
    };
    const startNatural = async () => {
      if (!state.practiceAvailability?.supportedDurationsMs?.includes(state.durationMs)) return false;
      const epoch = ++startEpoch; setState({ starting: "natural", errorCode: null });
      try { const registration = experimentRegistry.getRegistration(ID); const prepared = await registration.setupFactory({ durationMs: state.durationMs }); if (!mounted || epoch !== startEpoch) return false; return mountSession(registration.sessionFactory(prepared), "natural"); }
      catch (error) { if (mounted && epoch === startEpoch) { logger?.warn?.("Natural Practice preparation failed", error); setState({ starting: null, errorCode: error?.code ?? "REAL_TEXT_POOL_NOT_READY" }); } return false; }
    };
    const startCold = async () => {
      if (state.coldStatus !== "ready") return false;
      const epoch = ++startEpoch; setState({ starting: "cold", errorCode: null });
      try {
        const runtime = await getColdRuntime();
        const reserved = await runtime.reserve();
        if (!mounted || epoch !== startEpoch) return false;
        const prepared = await runtime.claimAndPrepare({ reservationId: reserved.reservation.reservationId });
        if (!mounted || epoch !== startEpoch) return false;
        return mountSession(prepared, "cold");
      } catch (error) { if (mounted && epoch === startEpoch) { logger?.warn?.("Cold Transfer start failed", error); setState({ starting: null, coldStatus: "unavailable", errorCode: error?.code ?? "REAL_TEXT_COLD_TRANSFER_UNAVAILABLE" }); void loadAvailability(); } return false; }
    };
    function click(event) {
      const button = event.target?.closest?.("[data-practice-action]"); if (!button || !root?.contains?.(button)) return;
      const action = button.dataset.practiceAction;
      if (action === "set-real-text-duration") { event.stopPropagation(); const durationMs = Number(button.dataset.durationMs); if (state.practiceAvailability?.supportedDurationsMs?.includes(durationMs)) setState({ durationMs }, `[data-duration-ms="${durationMs}"]`); }
      else if (action === "start-real-text-natural") { event.stopPropagation(); void startNatural(); }
      else if (action === "start-real-text-cold") { event.stopPropagation(); void startCold(); }
    }
    const afterRoute = () => { if (isRoute()) void loadAvailability(); };
    return Object.freeze({
      mount(route) { mounted = true; const value = base.mount(route); queueMicrotask(afterRoute); return value; },
      navigate(...args) { const value = base.navigate(...args); queueMicrotask(afterRoute); return value; },
      back() { if (sessionHost) { void sessionHost.exit(); return true; } const value = base.back(); queueMicrotask(afterRoute); return value; },
      getSnapshot() { const snapshot = base.getSnapshot(); return Object.freeze({ ...snapshot, realText: Object.freeze({ durationMs: state.durationMs, practiceStatus: state.practiceStatus, coldStatus: state.coldStatus, sessionActive: Boolean(sessionHost) }) }); },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() { mounted = false; loadEpoch += 1; startEpoch += 1; detach(); if (sessionHost) { void sessionHost.exit(); sessionHost = null; } return base.unmount(); },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV25 — consolidated controller layer
const __controller_v25 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV24 } = __controller_v24;
  const { renderPracticeLabV25 } = __renderers;
  const { buildPracticeCoachViewModel, createDefaultPracticeCoachUiState, normalizePracticeCoachUiState } = __c_v25_dep0;
  const { createPracticeCoachService } = __c_v25_dep1;
  const { createPracticeIndexedDbStore } = __c_v25_dep2;
  const { createPracticeManifestStore } = __c_v25_dep3;
  const { createPracticeRepository } = __c_v25_dep4;
  const { createPracticeLabRoute, PRACTICE_LAB_ROUTES } = __c_v25_dep5;
  const DAILY_ROUTE = PRACTICE_LAB_ROUTES.DAILY_TRAINING;
  const TERMINAL_PLAN_STATUSES = new Set(["finished", "abandoned", "expired"]);
  
  function coachErrorDetail(error, stage) {
    const cause = error?.cause;
    return Object.freeze({
      stage,
      name: String(error?.name ?? "Error").slice(0, 80),
      operation: error?.operation ? String(error.operation).slice(0, 120) : null,
      causeName: cause?.name ? String(cause.name).slice(0, 80) : null,
      causeMessage: cause?.message ? String(cause.message).slice(0, 240) : null,
    });
  }
  
  /** Use the same durable metadata initialization as every other Practice mode. */
  export async function initializePracticeCoachRuntimeData({repository,initialized=null}={}) {
    if(initialized?.profile && initialized?.context)return initialized;
    if(!repository?.initializePracticeStorage)throw new TypeError('Daily Coach storage runtime is incomplete');
    return repository.initializePracticeStorage();
  }
  
  function createPracticeLabController(options = {}) {
    const {
      root,
      experimentRegistry,
      logger = null,
      coachService: injectedCoachService = null,
      coachRepository: injectedCoachRepository = null,
      coachInitialized: injectedCoachInitialized = null,
      coachDataStore: injectedCoachDataStore = null,
      coachManifestStore: injectedCoachManifestStore = null,
      coachRuntimeProvider = null,
      coachGetAssessmentAvailability = null,
      coachGetAssessmentState = null,
      coachGetColdTransferAvailability = null,
      coachGetRecentColdTransferAt = null,
    } = options;
    const coachPreview = options.featureGate?.getSnapshot?.().reason === "developer";
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    let base = null;
    let mounted = false;
    let coachState = createDefaultPracticeCoachUiState();
    let coachDurationUserSelected = false;
    let coachRuntimePromise = null;
    let ownedCoachDataStore = null;
    let coachSessionHost = null;
    let loadEpoch = 0;
    let actionEpoch = 0;
    let loadScheduled = false;
    let coachListenerAttached = false;
  
    const isDailyRoute = () => base?.getSnapshot?.()?.route?.name === DAILY_ROUTE;
    const hasCoachSession = () => Boolean(coachSessionHost);
    const attachCoachListener = () => {
      if (coachListenerAttached || !mounted || !isDailyRoute() || hasCoachSession()) return;
      root?.addEventListener?.("click", click, true);
      coachListenerAttached = true;
    };
    const detachCoachListener = () => {
      if (!coachListenerAttached) return;
      root?.removeEventListener?.("click", click, true);
      coachListenerAttached = false;
    };
  
    const renderCoach = (focusSelector = null) => {
      if (!mounted || !isDailyRoute() || hasCoachSession()) return false;
      attachCoachListener();
      const view = buildPracticeCoachViewModel({ state: coachState, preview: coachPreview });
      return externalRenderer
        ? externalRenderer(root, view, { focusSelector })
        : renderPracticeLabV25(root, view, { focusSelector });
    };
  
    const setCoachState = (patch, focusSelector = null) => {
      coachState = normalizePracticeCoachUiState({ ...coachState, ...patch });
      renderCoach(focusSelector);
    };
  
    const scheduleDailyLoad = () => {
      if (loadScheduled || !mounted || !isDailyRoute() || hasCoachSession()) return;
      if (coachState.status !== "idle") return;
      loadScheduled = true;
      queueMicrotask(() => {
        loadScheduled = false;
        void loadTodayPlan();
      });
    };
  
    function renderer(renderRoot, view, rendererOptions = {}) {
      if (isDailyRoute()) {
        attachCoachListener();
        const coachView = buildPracticeCoachViewModel({ state: coachState, preview: coachPreview });
        const rendered = externalRenderer
          ? externalRenderer(renderRoot, coachView, rendererOptions)
          : renderPracticeLabV25(renderRoot, coachView, rendererOptions);
        scheduleDailyLoad();
        return rendered;
      }
      detachCoachListener();
      return externalRenderer
        ? externalRenderer(renderRoot, view, rendererOptions)
        : renderPracticeLabV25(renderRoot, view, rendererOptions);
    }
  
    base = createPracticeLabControllerV24({ ...options, renderer });
  
    const ensureCoachRuntime = async () => {
      if (coachRuntimePromise) return coachRuntimePromise;
      coachRuntimePromise = (async () => {
        if (typeof coachRuntimeProvider === "function") {
          const provided = await coachRuntimeProvider({ experimentRegistry });
          if (!provided?.service || !provided?.initialized?.profile || !provided?.initialized?.context) throw new TypeError("Coach runtime provider returned an incomplete runtime");
          return provided;
        }
        const dataStore = injectedCoachDataStore ?? createPracticeIndexedDbStore();
        if (!injectedCoachDataStore) ownedCoachDataStore = dataStore;
        const manifestStore = injectedCoachManifestStore ?? createPracticeManifestStore();
        const repository = injectedCoachRepository ?? createPracticeRepository({ dataStore, manifestStore });
        const initialized = await initializePracticeCoachRuntimeData({
          dataStore,
          repository,
          manifestStore,
          initialized: injectedCoachInitialized,
        });
        const service = injectedCoachService ?? createPracticeCoachService({
          repository,
          experimentRegistry,
          getAssessmentAvailability: coachGetAssessmentAvailability,
          getAssessmentState: coachGetAssessmentState,
          getColdTransferAvailability: coachGetColdTransferAvailability,
          getRecentColdTransferAt: coachGetRecentColdTransferAt,
          logger,
        });
        return Object.freeze({ service, repository, initialized, dataStore });
      })().catch((error) => {
        coachRuntimePromise = null;
        throw error;
      });
      return coachRuntimePromise;
    };
  
    async function loadTodayPlan({ reconcile = true } = {}) {
      if (!mounted || !isDailyRoute() || hasCoachSession()) return false;
      const epoch = ++loadEpoch;
      setCoachState({ status: "loading", errorCode: null, errorDetail: null, startingBlockId: null });
      try {
        const runtime = await ensureCoachRuntime();
        let plan = await runtime.service.getTodayPracticeCoachPlan(runtime.initialized.profile.profileId, runtime.initialized.context.contextId);
        if (plan && reconcile && !TERMINAL_PLAN_STATUSES.has(plan.status)) plan = await runtime.service.reconcilePracticeCoachPlan({ coachPlanId: plan.coachPlanId });
        if (!mounted || epoch !== loadEpoch || !isDailyRoute() || hasCoachSession()) return false;
        let requestedMinutes = coachState.requestedMinutes;
        if (!plan && !coachDurationUserSelected) {
          try { requestedMinutes = runtime.repository?.getPracticeSettings?.()?.dailySessionLengthMinutes ?? requestedMinutes; } catch {}
        }
        setCoachState({ status: "ready", plan, requestedMinutes, errorCode: null, errorDetail: null, startingBlockId: null }, "[data-practice-heading]");
        return true;
      } catch (error) {
        if (!mounted || epoch !== loadEpoch) return false;
        logger?.warn?.("Daily Coach load failed", error);
        setCoachState({ status: "error", errorCode: error?.code ?? "PRACTICE_COACH_UNAVAILABLE", errorDetail: coachErrorDetail(error, "load"), startingBlockId: null });
        return false;
      }
    }
  
    async function createTodayPlan() {
      if (!mounted || !isDailyRoute() || coachState.plan || coachState.status === "creating") return false;
      const epoch = ++actionEpoch;
      const requestedMinutes = coachState.requestedMinutes;
      setCoachState({ status: "creating", errorCode: null, errorDetail: null });
      try {
        const runtime = await ensureCoachRuntime();
        const created = await runtime.service.createTodayPracticeCoachPlan({
          profileId: runtime.initialized.profile.profileId,
          contextId: runtime.initialized.context.contextId,
          requestedMinutes,
          language: runtime.initialized.context.dataLocale,
        });
        if (!mounted || epoch !== actionEpoch || !isDailyRoute()) return false;
        if (!created.plan) {
          setCoachState({ status: "ready", plan: null, requestedMinutes, errorCode: "PRACTICE_COACH_NO_AVAILABLE_BLOCKS", errorDetail: null });
          return false;
        }
        setCoachState({ status: "ready", plan: created.plan, requestedMinutes: created.plan.requestedMinutes, errorCode: null, errorDetail: null });
        return true;
      } catch (error) {
        if (!mounted || epoch !== actionEpoch) return false;
        logger?.warn?.("Daily Coach plan creation failed", error);
        setCoachState({ status: "error", errorCode: error?.code ?? "PRACTICE_COACH_PLAN_FAILED", errorDetail: coachErrorDetail(error, "create-plan") });
        return false;
      }
    }
  
    const onCoachChildExit = () => {
      coachSessionHost = null;
      if (!mounted || !isDailyRoute()) return;
      coachState = normalizePracticeCoachUiState({ ...coachState, status: "loading", startingBlockId: null, errorCode: null });
      renderCoach();
      void loadTodayPlan({ reconcile: true });
    };
  
    async function mountCoachChild(started) {
      const session = started.session;
      const common = { root, session, logger, onExit: onCoachChildExit };
      if (started.block.kind === "review") {
        const { mountPracticeCoachReviewSession } = await import("./practiceCoachReviewSessionHost.js");
        return mountPracticeCoachReviewSession(common);
      }
      if (started.block.experimentId === "weak-keys") {
        const { mountPracticeWeakKeysSession } = await import("./practiceWeakKeysSessionHost.js");
        return mountPracticeWeakKeysSession({ ...common, onRepeat: onCoachChildExit });
      }
      if (started.block.experimentId === "combination-repair") {
        const [{ mountPracticeCombinationRepairSession }, { createPracticeSessionEngine }] = await Promise.all([
          import("./practiceCombinationRepairSessionHost.js"),
          import("./practiceSessionEngine.js"),
        ]);
        return mountPracticeCombinationRepairSession({
          ...common,
          dependencies: {
            engineFactory(engineOptions) {
              return createPracticeSessionEngine({ ...engineOptions, sessionId: session.sessionId });
            },
          },
        });
      }
      if (started.block.experimentId === "problem-words") {
        const { mountPracticeProblemWordsSession } = await import("./practiceProblemWordsSessionHost.js");
        return mountPracticeProblemWordsSession({ ...common, onRepeat: onCoachChildExit });
      }
      if (started.block.experimentId === "accuracy-control") {
        const { mountPracticeAccuracyRecoverySession } = await import("./practiceAccuracyRecoverySessionHost.js");
        return mountPracticeAccuracyRecoverySession({ ...common, onRepeat: onCoachChildExit });
      }
      if (started.block.experimentId === "real-text") {
        const { mountPracticeRealTextSession } = await import("./practiceRealTextSessionHost.js");
        return mountPracticeRealTextSession({ ...common, mode: "natural" });
      }
      throw Object.assign(new Error("Daily Coach child host is unavailable"), { code: "PRACTICE_COACH_CHILD_HOST_UNAVAILABLE" });
    }
  
    async function startNextBlock() {
      const plan = coachState.plan;
      if (!mounted || !isDailyRoute() || !plan || hasCoachSession()) return false;
      const next = plan.blocks.find((block) => block.status === "pending");
      if (!next) return false;
      const epoch = ++actionEpoch;
      setCoachState({ status: "starting", startingBlockId: next.blockId, errorCode: null });
      try {
        const runtime = await ensureCoachRuntime();
        const started = await runtime.service.startPracticeCoachBlock({ coachPlanId: plan.coachPlanId, blockId: next.blockId });
        if (!mounted || epoch !== actionEpoch || !isDailyRoute()) return false;
        if (!started.started) {
          setCoachState({ status: "ready", plan: started.plan, startingBlockId: null, errorCode: null, errorDetail: null });
          return false;
        }
        coachState = normalizePracticeCoachUiState({ ...coachState, status: "ready", plan: started.plan, startingBlockId: null, errorCode: null });
        detachCoachListener();
        coachSessionHost = await mountCoachChild(started);
        return true;
      } catch (error) {
        if (!mounted || epoch !== actionEpoch) return false;
        logger?.warn?.("Daily Coach child start failed", error);
        const errorDetail = coachErrorDetail(error, "start-block");
        try {
          const runtime = await ensureCoachRuntime();
          const recovered = await runtime.service.recoverInterruptedPracticeCoachBlock?.({ coachPlanId: plan.coachPlanId });
          if (mounted && epoch === actionEpoch && recovered?.plan) {
            setCoachState({ status: "ready", plan: recovered.plan, startingBlockId: null, errorCode: "PRACTICE_COACH_BLOCK_START_FAILED", errorDetail });
            return false;
          }
        } catch (recoveryError) {
          logger?.warn?.("Daily Coach automatic block recovery failed", recoveryError);
        }
        setCoachState({ status: "ready", startingBlockId: null, errorCode: error?.code ?? "PRACTICE_COACH_BLOCK_START_FAILED", errorDetail });
        return false;
      }
    }
  
    async function skipBlock(blockId) {
      const plan = coachState.plan;
      if (!plan || hasCoachSession()) return false;
      if (globalThis.confirm?.("Skip this Daily Training block? The frozen plan will not replace it today.") === false) return false;
      const next = plan.blocks.find((block) => block.status === "pending");
      if (!next || next.blockId !== blockId) return false;
      const epoch = ++actionEpoch;
      try {
        const runtime = await ensureCoachRuntime();
        const result = await runtime.service.skipPracticeCoachBlock({ coachPlanId: plan.coachPlanId, blockId });
        if (!mounted || epoch !== actionEpoch) return false;
        setCoachState({ status: "ready", plan: result.plan, errorCode: result.updated ? null : result.reason });
        return Boolean(result.updated);
      } catch (error) {
        if (epoch === actionEpoch) setCoachState({ status: "ready", errorCode: error?.code ?? "PRACTICE_COACH_SKIP_FAILED", errorDetail: coachErrorDetail(error, "skip-block") });
        return false;
      }
    }
  
    async function recoverActiveBlock() {
      const plan = coachState.plan;
      if (!plan || hasCoachSession() || !plan.blocks?.some((block) => block.status === "active")) return false;
      if (globalThis.confirm?.("Recover this interrupted Daily Training block? Only do this if the session is not still running in another tab. The interrupted block will be closed rather than resumed.") === false) return false;
      const epoch = ++actionEpoch;
      try {
        const runtime = await ensureCoachRuntime();
        const result = await runtime.service.recoverInterruptedPracticeCoachBlock({ coachPlanId: plan.coachPlanId });
        if (!mounted || epoch !== actionEpoch) return false;
        setCoachState({ status: "ready", plan: result.plan, errorCode: null, errorDetail: null, startingBlockId: null });
        return Boolean(result.updated);
      } catch (error) {
        if (epoch === actionEpoch) setCoachState({ status: "ready", errorCode: "PRACTICE_COACH_RECOVERY_FAILED", errorDetail: coachErrorDetail(error, "recover-block") });
        return false;
      }
    }
  
    async function endForToday() {
      const plan = coachState.plan;
      if (!plan || hasCoachSession()) return false;
      if (globalThis.confirm?.("End today’s Daily Training plan? Completed blocks stay saved; remaining blocks will be left unfinished.") === false) return false;
      const epoch = ++actionEpoch;
      try {
        const runtime = await ensureCoachRuntime();
        const next = await runtime.service.abandonPracticeCoachPlan({ coachPlanId: plan.coachPlanId });
        if (!mounted || epoch !== actionEpoch) return false;
        setCoachState({ status: "ready", plan: next, errorCode: null });
        return true;
      } catch (error) {
        if (epoch === actionEpoch) setCoachState({ status: "ready", errorCode: error?.code ?? "PRACTICE_COACH_END_FAILED", errorDetail: coachErrorDetail(error, "end-plan") });
        return false;
      }
    }
  
    function click(event) {
      if (!mounted || hasCoachSession()) return;
      const button = event.target?.closest?.("[data-practice-action]");
      if (!button || !root?.contains?.(button) || button.disabled || button.getAttribute?.("aria-disabled") === "true") return;
      const action = button.dataset.practiceAction;
      if (!["set-coach-duration", "create-coach-plan", "reload-coach", "recover-coach-active", "start-coach-next", "skip-coach-block", "abandon-coach-plan", "open-coach-assessment", "open-coach-cold-transfer"].includes(action)) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      if (!isDailyRoute()) return;
      if (action === "set-coach-duration" && !coachState.plan) {
        coachDurationUserSelected = true;
        setCoachState({ requestedMinutes: Number(button.dataset.coachMinutes), errorCode: null }, `[data-coach-minutes="${button.dataset.coachMinutes}"]`);
      }
      else if (action === "create-coach-plan") void createTodayPlan();
      else if (action === "reload-coach") void loadTodayPlan();
      else if (action === "recover-coach-active") void recoverActiveBlock();
      else if (action === "start-coach-next") void startNextBlock();
      else if (action === "skip-coach-block") void skipBlock(button.dataset.coachBlockId);
      else if (action === "abandon-coach-plan") void endForToday();
      else if (action === "open-coach-assessment") base.navigate(createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "full-assessment" }));
      else if (action === "open-coach-cold-transfer") base.navigate(createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "real-text" }));
    }
  
    const routeAfterNavigation = () => {
      if (isDailyRoute()) {
        attachCoachListener();
        if (coachState.status === "idle") scheduleDailyLoad();
      } else {
        detachCoachListener();
      }
    };
  
    return Object.freeze({
      mount(route) {
        mounted = true;
        const value = base.mount(route);
        queueMicrotask(routeAfterNavigation);
        return value;
      },
      navigate(...args) {
        const value = base.navigate(...args);
        queueMicrotask(routeAfterNavigation);
        return value;
      },
      back() {
        if (coachSessionHost) {
          void coachSessionHost.exit();
          return true;
        }
        const value = base.back();
        queueMicrotask(routeAfterNavigation);
        return value;
      },
      getSnapshot() {
        const snapshot = base.getSnapshot();
        return Object.freeze({
          ...snapshot,
          dailyCoach: Object.freeze({
            status: coachState.status,
            requestedMinutes: coachState.requestedMinutes,
            coachPlanId: coachState.plan?.coachPlanId ?? null,
            planStatus: coachState.plan?.status ?? null,
            blockCount: coachState.plan?.blocks?.length ?? 0,
            sessionActive: Boolean(coachSessionHost),
          }),
        });
      },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() {
        mounted = false;
        loadEpoch += 1;
        actionEpoch += 1;
        detachCoachListener();
        if (coachSessionHost) {
          void coachSessionHost.exit();
          coachSessionHost = null;
        }
        try { ownedCoachDataStore?.close?.(); } catch {}
        ownedCoachDataStore = null;
        coachRuntimePromise = null;
        coachDurationUserSelected = false;
        coachState = createDefaultPracticeCoachUiState();
        return base.unmount();
      },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV26 — consolidated controller layer
const __controller_v26 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV25 } = __controller_v25;
  const { renderPracticeLabV26, renderPracticePaceLadderDetail } = __renderers;
  const { registerPracticePaceLadderExperiment } = __c_v26_dep0;
  const { PRACTICE_LAB_ROUTES } = __c_v26_dep1;
  const ID = "pace-ladder";
  function createPracticeLabController(options = {}) {
    const { root, experimentRegistry, logger = null } = options;
    registerPracticePaceLadderExperiment(experimentRegistry);
    let state = { status: "idle", availability: null, userSelectedWpm: "", starting: false, errorCode: null };
    let host = null; let mounted = false; let lastView = null; let loadEpoch = 0; let startEpoch = 0; let listeners = false;
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    const isDetail = (view) => view?.kind === "experiment-detail" && view?.title === "Pace Ladder";
    const isRoute = (base) => base.getSnapshot()?.route?.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL && base.getSnapshot()?.route?.params?.experimentId === ID;
    function attach() { if (!listeners && mounted) { root?.addEventListener?.("click", click, true); root?.addEventListener?.("input", input, true); listeners = true; } }
    function detach() { if (listeners) { root?.removeEventListener?.("click", click, true); root?.removeEventListener?.("input", input, true); listeners = false; } }
    function renderer(renderRoot, view, rendererOptions = {}) { lastView = view; if (isDetail(view)) { attach(); const detail = { ...view, kind: "pace-ladder-detail", ...state }; return externalRenderer ? externalRenderer(renderRoot, detail, rendererOptions) : renderPracticePaceLadderDetail(renderRoot, detail, rendererOptions); } detach(); return externalRenderer ? externalRenderer(renderRoot, view, rendererOptions) : renderPracticeLabV26(renderRoot, view, rendererOptions); }
    const base = createPracticeLabControllerV25({ ...options, renderer });
    function rerender(focusSelector = null) { if (mounted && !host && isRoute(base) && lastView) renderer(root, lastView, { focusSelector }); }
    function setState(patch, focusSelector = null) { state = { ...state, ...patch }; rerender(focusSelector); }
    async function loadAvailability() { if (!mounted || !isRoute(base)) return; const epoch = ++loadEpoch; setState({ status: "loading", errorCode: null }); try { const registration = experimentRegistry.getRegistration(ID); const availability = await registration.runtime.getAvailability(); if (!mounted || epoch !== loadEpoch || !isRoute(base)) return; setState({ status: availability.status === "ready" ? "ready" : "unavailable", availability }); } catch (error) { if (mounted && epoch === loadEpoch) setState({ status: "unavailable", availability: { status: "unavailable", mode: "unavailable", reasons: [error?.code ?? "PACE_LADDER_UNAVAILABLE"] }, errorCode: error?.code ?? "PACE_LADDER_UNAVAILABLE" }); } }
    async function start() { if (state.starting || state.status !== "ready") return false; const epoch = ++startEpoch; setState({ starting: true, errorCode: null }); try { const registration = experimentRegistry.getRegistration(ID); const value = state.userSelectedWpm.trim(); const prepared = await registration.setupFactory({ userSelectedWpm: value ? Number(value) : null }); if (!mounted || epoch !== startEpoch) return false; if (prepared.status !== "ready") { setState({ starting: false, availability: prepared.availability, errorCode: "PACE_LADDER_USER_ANCHOR_REQUIRED" }); return false; } const session = registration.sessionFactory(prepared); const { mountPracticePaceLadderSession } = await import("./practicePaceLadderSessionHost.js"); detach(); host = await mountPracticePaceLadderSession({ root, session, logger, onExit() { host = null; if (mounted) { setState({ starting: false }); void loadAvailability(); } } }); return true; } catch (error) { logger?.warn?.("Pace Ladder start failed", error); if (mounted && epoch === startEpoch) setState({ starting: false, errorCode: error?.code ?? "PACE_LADDER_UNAVAILABLE" }); return false; } }
    function click(event) { const button = event.target?.closest?.("[data-practice-action]"); if (!button || !root?.contains?.(button)) return; if (button.dataset.practiceAction === "start-pace-ladder") { event.stopPropagation(); void start(); } }
    function input(event) { const field = event.target?.closest?.("[data-pace-anchor-input]"); if (!field || !root?.contains?.(field)) return; state = { ...state, userSelectedWpm: field.value, errorCode: null }; const button = root.querySelector?.("[data-practice-action='start-pace-ladder']"); if (button) { const requires = state.availability?.mode === "user-selected-anchor-required"; const wpm = Number(field.value); button.disabled = state.status !== "ready" || state.starting || (requires && !(Number.isFinite(wpm) && wpm >= 5 && wpm <= 400)); } }
    const afterRoute = () => { if (isRoute(base)) void loadAvailability(); };
    return Object.freeze({
      mount(route) { mounted = true; const value = base.mount(route); queueMicrotask(afterRoute); return value; },
      navigate(...args) { const value = base.navigate(...args); queueMicrotask(afterRoute); return value; },
      back() { if (host) { void host.interrupt?.("manual-stop"); return true; } const value = base.back(); queueMicrotask(afterRoute); return value; },
      getSnapshot() { const snapshot = base.getSnapshot(); return Object.freeze({ ...snapshot, paceLadder: Object.freeze({ status: state.status, starting: state.starting, sessionActive: Boolean(host), userSelectedWpm: state.userSelectedWpm }) }); },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() { mounted = false; loadEpoch += 1; startEpoch += 1; detach(); if (host) { void host.exit(); host = null; } return base.unmount(); },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV27 — consolidated controller layer
const __controller_v27 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV26 } = __controller_v26;
  const { renderPracticeLabV27, renderPracticeBurstSprintsDetail } = __renderers;
  const { registerPracticeBurstSprintsExperiment } = __c_v27_dep0;
  const { PRACTICE_LAB_ROUTES } = __c_v27_dep1;
  const ID = "burst-sprints";
  
  function createPracticeLabController(options = {}) {
    const { root, experimentRegistry, logger = null } = options;
    registerPracticeBurstSprintsExperiment(experimentRegistry);
    let state = { status: "idle", availability: null, starting: false, errorCode: null };
    let host = null;
    let mounted = false;
    let lastView = null;
    let loadEpoch = 0;
    let startEpoch = 0;
    let listeners = false;
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    const isDetail = (view) => view?.kind === "experiment-detail" && view?.title === "Burst Sprints";
    const isRoute = (base) => base.getSnapshot()?.route?.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL && base.getSnapshot()?.route?.params?.experimentId === ID;
  
    function attach() {
      if (!listeners && mounted) {
        root?.addEventListener?.("click", click, true);
        listeners = true;
      }
    }
    function detach() {
      if (listeners) {
        root?.removeEventListener?.("click", click, true);
        listeners = false;
      }
    }
    function renderer(renderRoot, view, rendererOptions = {}) {
      lastView = view;
      if (isDetail(view)) {
        attach();
        const detail = { ...view, kind: "burst-sprints-detail", ...state };
        return externalRenderer
          ? externalRenderer(renderRoot, detail, rendererOptions)
          : renderPracticeBurstSprintsDetail(renderRoot, detail, rendererOptions);
      }
      detach();
      return externalRenderer
        ? externalRenderer(renderRoot, view, rendererOptions)
        : renderPracticeLabV27(renderRoot, view, rendererOptions);
    }
  
    const base = createPracticeLabControllerV26({ ...options, renderer });
  
    function rerender(focusSelector = null) {
      if (mounted && !host && isRoute(base) && lastView) renderer(root, lastView, { focusSelector });
    }
    function setState(patch, focusSelector = null) {
      state = { ...state, ...patch };
      rerender(focusSelector);
    }
    async function loadAvailability() {
      if (!mounted || !isRoute(base)) return;
      const epoch = ++loadEpoch;
      setState({ status: "loading", errorCode: null });
      try {
        const registration = experimentRegistry.getRegistration(ID);
        const availability = await registration.runtime.getAvailability();
        if (!mounted || epoch !== loadEpoch || !isRoute(base)) return;
        setState({ status: availability.status === "ready" ? "ready" : "unavailable", availability });
      } catch (error) {
        if (mounted && epoch === loadEpoch) setState({
          status: "unavailable",
          availability: { status: "unavailable", reasons: [error?.code ?? "BURST_SPRINTS_UNAVAILABLE"] },
          errorCode: error?.code ?? "BURST_SPRINTS_UNAVAILABLE",
        });
      }
    }
    async function start() {
      if (state.starting || state.status !== "ready") return false;
      const epoch = ++startEpoch;
      setState({ starting: true, errorCode: null });
      try {
        const registration = experimentRegistry.getRegistration(ID);
        const prepared = await registration.setupFactory();
        if (!mounted || epoch !== startEpoch) return false;
        if (prepared.status !== "ready") {
          setState({ starting: false, availability: prepared.availability ?? null, errorCode: "BURST_SPRINTS_UNAVAILABLE" });
          return false;
        }
        const session = registration.sessionFactory(prepared);
        const { mountPracticeBurstSprintsSession } = await import("./practiceBurstSprintsSessionHost.js");
        detach();
        host = await mountPracticeBurstSprintsSession({
          root,
          session,
          logger,
          onExit() {
            host = null;
            if (mounted) {
              setState({ starting: false });
              void loadAvailability();
            }
          },
        });
        return true;
      } catch (error) {
        logger?.warn?.("Burst Sprints start failed", error);
        if (mounted && epoch === startEpoch) setState({ starting: false, errorCode: error?.code ?? "BURST_SPRINTS_UNAVAILABLE" });
        return false;
      }
    }
    function click(event) {
      const button = event.target?.closest?.("[data-practice-action]");
      if (!button || !root?.contains?.(button)) return;
      if (button.dataset.practiceAction === "start-burst-sprints") {
        event.stopPropagation();
        void start();
      }
    }
    const afterRoute = () => { if (isRoute(base)) void loadAvailability(); };
  
    return Object.freeze({
      mount(route) {
        mounted = true;
        const value = base.mount(route);
        queueMicrotask(afterRoute);
        return value;
      },
      navigate(...args) {
        const value = base.navigate(...args);
        queueMicrotask(afterRoute);
        return value;
      },
      back() {
        if (host) {
          void host.interrupt?.("manual-stop");
          return true;
        }
        const value = base.back();
        queueMicrotask(afterRoute);
        return value;
      },
      getSnapshot() {
        const snapshot = base.getSnapshot();
        return Object.freeze({
          ...snapshot,
          burstSprints: Object.freeze({ status: state.status, starting: state.starting, sessionActive: Boolean(host) }),
        });
      },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() {
        mounted = false;
        loadEpoch += 1;
        startEpoch += 1;
        detach();
        if (host) {
          void host.exit();
          host = null;
        }
        return base.unmount();
      },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV28 — consolidated controller layer
const __controller_v28 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV27 } = __controller_v27;
  const { renderPracticeLabV28, renderPracticeCommonWordsDetail } = __renderers;
  const { registerPracticeCommonWordsExperiment } = __c_v28_dep0;
  const { PRACTICE_LAB_ROUTES } = __c_v28_dep1;
  const ID = "common-words";
  
  function createPracticeLabController(options = {}) {
    const { root, experimentRegistry, logger = null } = options;
    registerPracticeCommonWordsExperiment(experimentRegistry);
    let state = { status: "idle", availability: null, breadthSnapshot: null, wordCount: 160, starting: null, errorCode: null };
    let host = null; let mounted = false; let lastView = null; let loadEpoch = 0; let startEpoch = 0; let listeners = false;
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    const isDetail = (view) => view?.kind === "experiment-detail" && view?.title === "Common Words";
    const isRoute = (base) => base.getSnapshot()?.route?.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL && base.getSnapshot()?.route?.params?.experimentId === ID;
    function attach() { if (!listeners && mounted) { root?.addEventListener?.("click", click, true); listeners = true; } }
    function detach() { if (listeners) { root?.removeEventListener?.("click", click, true); listeners = false; } }
    function renderer(renderRoot, view, rendererOptions = {}) {
      lastView = view;
      if (isDetail(view)) {
        attach(); const detail = { ...view, kind: "common-words-detail", ...state };
        return externalRenderer ? externalRenderer(renderRoot, detail, rendererOptions) : renderPracticeCommonWordsDetail(renderRoot, detail, rendererOptions);
      }
      detach(); return externalRenderer ? externalRenderer(renderRoot, view, rendererOptions) : renderPracticeLabV28(renderRoot, view, rendererOptions);
    }
    const base = createPracticeLabControllerV27({ ...options, renderer });
    function rerender(focusSelector = null) { if (mounted && !host && isRoute(base) && lastView) renderer(root, lastView, { focusSelector }); }
    function setState(patch, focusSelector = null) { state = { ...state, ...patch }; rerender(focusSelector); }
    async function load() {
      if (!mounted || !isRoute(base)) return;
      const epoch = ++loadEpoch; setState({ status: "loading", errorCode: null });
      try {
        const registration = experimentRegistry.getRegistration(ID);
        const [availability, breadthSnapshot] = await Promise.all([registration.runtime.getAvailability(), registration.runtime.getBreadthSnapshot().catch(() => null)]);
        if (!mounted || epoch !== loadEpoch || !isRoute(base)) return;
        setState({ status: availability.practiceAvailable || availability.checkAvailable ? "ready" : "unavailable", availability, breadthSnapshot });
      } catch (error) {
        if (mounted && epoch === loadEpoch) setState({ status: "unavailable", availability: { practiceAvailable: false, practiceSizes: [], checkAvailable: false, reasons: [error?.code ?? "COMMON_WORDS_UNAVAILABLE"] }, errorCode: error?.code ?? "COMMON_WORDS_UNAVAILABLE" });
      }
    }
    async function start(flow) {
      if (state.starting || !["practice", "check"].includes(flow)) return false;
      if (flow === "practice" && !state.availability?.practiceAvailable) return false;
      if (flow === "check" && !state.availability?.checkAvailable) return false;
      const epoch = ++startEpoch; setState({ starting: flow, errorCode: null });
      try {
        const registration = experimentRegistry.getRegistration(ID);
        const prepared = await registration.setupFactory({ flow, wordCount: state.wordCount });
        if (!mounted || epoch !== startEpoch) return false;
        const session = registration.sessionFactory(prepared);
        const { mountPracticeCommonWordsSession } = await import("./practiceCommonWordsSessionHost.js");
        detach();
        host = await mountPracticeCommonWordsSession({ root, session, runtime: registration.runtime, logger, onExit() { host = null; if (mounted) { setState({ starting: null }); void load(); } } });
        return true;
      } catch (error) {
        logger?.warn?.("Common Words start failed", error);
        if (mounted && epoch === startEpoch) setState({ starting: null, errorCode: error?.code ?? "COMMON_WORDS_UNAVAILABLE" });
        return false;
      }
    }
    function click(event) {
      const button = event.target?.closest?.("[data-practice-action]"); if (!button || !root?.contains?.(button)) return;
      const action = button.dataset.practiceAction;
      if (action === "common-words-size") { event.stopPropagation(); const size = Number(button.dataset.wordCount); if (state.availability?.practiceSizes?.includes?.(size)) setState({ wordCount: size }, `[data-word-count='${size}']`); }
      else if (action === "start-common-words-practice") { event.stopPropagation(); void start("practice"); }
      else if (action === "start-common-words-check") { event.stopPropagation(); void start("check"); }
    }
    const afterRoute = () => { if (isRoute(base)) void load(); };
    return Object.freeze({
      mount(route) { mounted = true; const value = base.mount(route); queueMicrotask(afterRoute); return value; },
      navigate(...args) { const value = base.navigate(...args); queueMicrotask(afterRoute); return value; },
      back() { if (host) { void host.stop?.(); return true; } const value = base.back(); queueMicrotask(afterRoute); return value; },
      getSnapshot() { const snapshot = base.getSnapshot(); return Object.freeze({ ...snapshot, commonWords: Object.freeze({ status: state.status, starting: state.starting, wordCount: state.wordCount, sessionActive: Boolean(host) }) }); },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() { mounted = false; loadEpoch += 1; startEpoch += 1; detach(); if (host) { void host.exit(); host = null; } return base.unmount(); },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV29 — consolidated controller layer
const __controller_v29 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV28 } = __controller_v28;
  const { renderPracticeLabV29, renderPracticeConsistencyDetail, renderPracticeEnduranceDetail } = __renderers;
  const { registerPracticeConsistencyExperiment } = __c_v29_dep0;
  const { registerPracticeEnduranceExperiment } = __c_v29_dep1;
  const { PRACTICE_CONSISTENCY_DEFAULT_DURATION_MS, PRACTICE_CONSISTENCY_DURATIONS_MS } = __c_v29_dep2;
  const { PRACTICE_ENDURANCE_DEFAULT_PRACTICE_DURATION_MS, PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS } = __c_v29_dep3;
  const { PRACTICE_LAB_ROUTES } = __c_v29_dep4;
  const CONSISTENCY = "consistency-trainer"; const ENDURANCE = "endurance";
  function createPracticeLabController(options = {}) {
    const { root, experimentRegistry, logger = null } = options;
    registerPracticeConsistencyExperiment(experimentRegistry); registerPracticeEnduranceExperiment(experimentRegistry);
    let states = {
      [CONSISTENCY]: { status: "idle", availability: null, durationMs: PRACTICE_CONSISTENCY_DEFAULT_DURATION_MS, starting: null, errorCode: null },
      [ENDURANCE]: { status: "idle", availability: null, durationMs: PRACTICE_ENDURANCE_DEFAULT_PRACTICE_DURATION_MS, starting: null, errorCode: null },
    };
    let host = null; let mounted = false; let lastView = null; let loadEpoch = 0; let startEpoch = 0; let listeners = false;
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    const routeId = (base) => base.getSnapshot()?.route?.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL ? base.getSnapshot()?.route?.params?.experimentId : null;
    const detailId = (view) => view?.kind === "experiment-detail" ? (view.title === "Consistency Trainer" ? CONSISTENCY : view.title === "Endurance" ? ENDURANCE : null) : null;
    function attach() { if (!listeners && mounted) { root?.addEventListener?.("click", click, true); listeners = true; } }
    function detach() { if (listeners) { root?.removeEventListener?.("click", click, true); listeners = false; } }
    function renderer(renderRoot, view, rendererOptions = {}) {
      lastView = view; const id = detailId(view);
      if (id) { attach(); const detail = { ...view, kind: id === CONSISTENCY ? "consistency-detail" : "endurance-detail", ...states[id] }; if (externalRenderer) return externalRenderer(renderRoot, detail, rendererOptions); return id === CONSISTENCY ? renderPracticeConsistencyDetail(renderRoot, detail, rendererOptions) : renderPracticeEnduranceDetail(renderRoot, detail, rendererOptions); }
      detach(); return externalRenderer ? externalRenderer(renderRoot, view, rendererOptions) : renderPracticeLabV29(renderRoot, view, rendererOptions);
    }
    const base = createPracticeLabControllerV28({ ...options, renderer });
    function rerender(id, focusSelector = null) { if (mounted && !host && routeId(base) === id && lastView) renderer(root, lastView, { focusSelector }); }
    function setState(id, patch, focusSelector = null) { states = { ...states, [id]: { ...states[id], ...patch } }; rerender(id, focusSelector); }
    async function load(id) {
      if (!mounted || routeId(base) !== id) return; const epoch = ++loadEpoch; setState(id, { status: "loading", errorCode: null });
      try { const registration = experimentRegistry.getRegistration(id); const availability = await registration.runtime.getAvailability(); if (!mounted || epoch !== loadEpoch || routeId(base) !== id) return; const ready = id === CONSISTENCY ? availability.available : availability.practiceAvailable || availability.checkAvailable; setState(id, { status: ready ? "ready" : "unavailable", availability }); }
      catch (error) { if (mounted && epoch === loadEpoch) setState(id, { status: "unavailable", errorCode: error?.code ?? `${id.toUpperCase()}_UNAVAILABLE` }); }
    }
    async function start(id, flow = "practice") {
      const state = states[id]; if (state.starting) return false; const epoch = ++startEpoch; setState(id, { starting: flow, errorCode: null });
      try { const registration = experimentRegistry.getRegistration(id); const prepared = await registration.setupFactory({ flow, durationMs: state.durationMs }); if (!mounted || epoch !== startEpoch) return false; const session = registration.sessionFactory(prepared); const module = id === CONSISTENCY ? await import("./practiceConsistencySessionHost.js") : await import("./practiceEnduranceSessionHost.js"); const mount = id === CONSISTENCY ? module.mountPracticeConsistencySession : module.mountPracticeEnduranceSession; detach(); host = await mount({ root, session, runtime: registration.runtime, logger, onExit() { host = null; if (mounted) { setState(id, { starting: null }); void load(id); } } }); return true; }
      catch (error) { logger?.warn?.(`PL29 ${id} start failed`, error); if (mounted && epoch === startEpoch) setState(id, { starting: null, errorCode: error?.code ?? `${id.toUpperCase()}_UNAVAILABLE` }); return false; }
    }
    function click(event) {
      const button = event.target?.closest?.("[data-practice-action]"); if (!button || !root?.contains?.(button)) return; const action = button.dataset.practiceAction; const current = routeId(base);
      if (action === "consistency-duration" && current === CONSISTENCY) { event.stopPropagation(); const value = Number(button.dataset.durationMs); if (PRACTICE_CONSISTENCY_DURATIONS_MS.includes(value)) setState(CONSISTENCY, { durationMs: value }, `[data-duration-ms='${value}']`); }
      else if (action === "start-consistency" && current === CONSISTENCY) { event.stopPropagation(); void start(CONSISTENCY, "practice"); }
      else if (action === "endurance-duration" && current === ENDURANCE) { event.stopPropagation(); const value = Number(button.dataset.durationMs); if (PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS.includes(value)) setState(ENDURANCE, { durationMs: value }, `[data-duration-ms='${value}']`); }
      else if (action === "start-endurance-practice" && current === ENDURANCE) { event.stopPropagation(); void start(ENDURANCE, "practice"); }
      else if (action === "start-endurance-check" && current === ENDURANCE) { event.stopPropagation(); void start(ENDURANCE, "check"); }
    }
    const afterRoute = () => { const id = routeId(base); if (id === CONSISTENCY || id === ENDURANCE) void load(id); };
    return Object.freeze({
      mount(route) { mounted = true; const value = base.mount(route); queueMicrotask(afterRoute); return value; },
      navigate(...args) { const value = base.navigate(...args); queueMicrotask(afterRoute); return value; },
      back() { if (host) { void host.stop?.(); return true; } const value = base.back(); queueMicrotask(afterRoute); return value; },
      getSnapshot() { const snapshot = base.getSnapshot(); return Object.freeze({ ...snapshot, consistency: Object.freeze({ ...states[CONSISTENCY], sessionActive: Boolean(host) && routeId(base) === CONSISTENCY }), endurance: Object.freeze({ ...states[ENDURANCE], sessionActive: Boolean(host) && routeId(base) === ENDURANCE }) }); },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() { mounted = false; loadEpoch += 1; startEpoch += 1; detach(); if (host) { void host.exit(); host = null; } return base.unmount(); },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV30 — consolidated controller layer
const __controller_v30 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV29 } = __controller_v29;
  const { renderPracticeLabV30, renderPracticeNumbersSymbolsDetail, renderPracticePunctuationCapitalsDetail } = __renderers;
  const { registerPracticePunctuationCapitalsExperiment } = __c_v30_dep0;
  const { registerPracticeNumbersSymbolsExperiment } = __c_v30_dep1;
  const { PRACTICE_PUNCTUATION_CAPITALS_DEFAULT_PRACTICE_DURATION_MS, PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS } = __c_v30_dep2;
  const { PRACTICE_NUMBERS_SYMBOLS_DEFAULT_PRACTICE_DURATION_MS, PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS } = __c_v30_dep3;
  const { PRACTICE_LAB_ROUTES } = __c_v30_dep4;
  const PUNCTUATION = "punctuation-capitals";
  const NUMBERS = "numbers-symbols";
  
  function createPracticeLabController(options = {}) {
    const { root, experimentRegistry, logger = null } = options;
    registerPracticePunctuationCapitalsExperiment(experimentRegistry);
    registerPracticeNumbersSymbolsExperiment(experimentRegistry);
    let states = {
      [PUNCTUATION]: { status: "idle", availability: null, durationMs: PRACTICE_PUNCTUATION_CAPITALS_DEFAULT_PRACTICE_DURATION_MS, starting: null, errorCode: null },
      [NUMBERS]: { status: "idle", availability: null, durationMs: PRACTICE_NUMBERS_SYMBOLS_DEFAULT_PRACTICE_DURATION_MS, starting: null, errorCode: null },
    };
    let host = null;
    let mounted = false;
    let lastView = null;
    let loadEpoch = 0;
    let startEpoch = 0;
    let listeners = false;
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    const routeId = (base) => base.getSnapshot()?.route?.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL ? base.getSnapshot()?.route?.params?.experimentId : null;
    const detailId = (view) => view?.kind === "experiment-detail"
      ? (view.title === "Punctuation & Capitals" ? PUNCTUATION : view.title === "Numbers & Symbols" ? NUMBERS : null)
      : null;
    function attach() { if (!listeners && mounted) { root?.addEventListener?.("click", click, true); listeners = true; } }
    function detach() { if (listeners) { root?.removeEventListener?.("click", click, true); listeners = false; } }
    function renderer(renderRoot, view, rendererOptions = {}) {
      lastView = view;
      const id = detailId(view);
      if (id) {
        attach();
        const detail = { ...view, kind: id === PUNCTUATION ? "punctuation-capitals-detail" : "numbers-symbols-detail", ...states[id] };
        if (externalRenderer) return externalRenderer(renderRoot, detail, rendererOptions);
        return id === PUNCTUATION ? renderPracticePunctuationCapitalsDetail(renderRoot, detail, rendererOptions) : renderPracticeNumbersSymbolsDetail(renderRoot, detail, rendererOptions);
      }
      detach();
      return externalRenderer ? externalRenderer(renderRoot, view, rendererOptions) : renderPracticeLabV30(renderRoot, view, rendererOptions);
    }
    const base = createPracticeLabControllerV29({ ...options, renderer });
    function rerender(id, focusSelector = null) { if (mounted && !host && routeId(base) === id && lastView) renderer(root, lastView, { focusSelector }); }
    function setState(id, patch, focusSelector = null) { states = { ...states, [id]: { ...states[id], ...patch } }; rerender(id, focusSelector); }
    async function load(id) {
      if (!mounted || routeId(base) !== id) return;
      const epoch = ++loadEpoch;
      setState(id, { status: "loading", errorCode: null });
      try {
        const registration = experimentRegistry.getRegistration(id);
        const availability = await registration.runtime.getAvailability();
        if (!mounted || epoch !== loadEpoch || routeId(base) !== id) return;
        setState(id, { status: availability.practiceAvailable || availability.checkAvailable ? "ready" : "unavailable", availability });
      } catch (error) {
        if (mounted && epoch === loadEpoch) setState(id, { status: "unavailable", errorCode: error?.code ?? `${id.toUpperCase().replaceAll("-", "_")}_UNAVAILABLE` });
      }
    }
    async function start(id, flow) {
      const state = states[id];
      if (state.starting) return false;
      const epoch = ++startEpoch;
      setState(id, { starting: flow, errorCode: null });
      try {
        const registration = experimentRegistry.getRegistration(id);
        const prepared = await registration.setupFactory({ flow, durationMs: flow === "practice" ? state.durationMs : null });
        if (!mounted || epoch !== startEpoch) return false;
        const session = registration.sessionFactory(prepared);
        const module = id === PUNCTUATION ? await import("./practicePunctuationCapitalsSessionHost.js") : await import("./practiceNumbersSymbolsSessionHost.js");
        const mount = id === PUNCTUATION ? module.mountPracticePunctuationCapitalsSession : module.mountPracticeNumbersSymbolsSession;
        detach();
        host = await mount({ root, session, runtime: registration.runtime, logger, onExit() { host = null; if (mounted) { setState(id, { starting: null }); void load(id); } } });
        return true;
      } catch (error) {
        logger?.warn?.(`PL30 ${id} start failed`, error);
        if (mounted && epoch === startEpoch) setState(id, { starting: null, errorCode: error?.code ?? `${id.toUpperCase().replaceAll("-", "_")}_UNAVAILABLE` });
        return false;
      }
    }
    function click(event) {
      const button = event.target?.closest?.("[data-practice-action]");
      if (!button || !root?.contains?.(button)) return;
      const action = button.dataset.practiceAction;
      const current = routeId(base);
      if (action === "punctuation-capitals-duration" && current === PUNCTUATION) {
        event.stopPropagation(); const value = Number(button.dataset.durationMs);
        if (PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS.includes(value)) setState(PUNCTUATION, { durationMs: value }, `[data-duration-ms='${value}']`);
      } else if (action === "numbers-symbols-duration" && current === NUMBERS) {
        event.stopPropagation(); const value = Number(button.dataset.durationMs);
        if (PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS.includes(value)) setState(NUMBERS, { durationMs: value }, `[data-duration-ms='${value}']`);
      } else if (action === "start-punctuation-capitals-practice" && current === PUNCTUATION) { event.stopPropagation(); void start(PUNCTUATION, "practice"); }
      else if (action === "start-punctuation-capitals-check" && current === PUNCTUATION) { event.stopPropagation(); void start(PUNCTUATION, "check"); }
      else if (action === "start-numbers-symbols-practice" && current === NUMBERS) { event.stopPropagation(); void start(NUMBERS, "practice"); }
      else if (action === "start-numbers-symbols-check" && current === NUMBERS) { event.stopPropagation(); void start(NUMBERS, "check"); }
    }
    const afterRoute = () => { const id = routeId(base); if (id === PUNCTUATION || id === NUMBERS) void load(id); };
    return Object.freeze({
      mount(route) { mounted = true; const value = base.mount(route); queueMicrotask(afterRoute); return value; },
      navigate(...args) { const value = base.navigate(...args); queueMicrotask(afterRoute); return value; },
      back() { if (host) { void host.stop?.(); return true; } const value = base.back(); queueMicrotask(afterRoute); return value; },
      getSnapshot() {
        const snapshot = base.getSnapshot();
        return Object.freeze({
          ...snapshot,
          punctuationCapitals: Object.freeze({ ...states[PUNCTUATION], sessionActive: Boolean(host) && routeId(base) === PUNCTUATION }),
          numbersSymbols: Object.freeze({ ...states[NUMBERS], sessionActive: Boolean(host) && routeId(base) === NUMBERS }),
        });
      },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() { mounted = false; loadEpoch += 1; startEpoch += 1; detach(); if (host) { void host.exit(); host = null; } return base.unmount(); },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV31 — consolidated controller layer
const __controller_v31 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV30 } = __controller_v30;
  const { renderPracticeLabV31, renderPracticeCustomTextDetail, updatePracticeCustomEditorUi } = __renderers;
  const { registerPracticeCustomTextExperiment } = __c_v31_dep0;
  const { PRACTICE_CUSTOM_TEXT_DEFAULT_TIMED_DURATION_MS, PRACTICE_CUSTOM_TEXT_ERROR_CODES, PRACTICE_CUSTOM_TEXT_MIN_GRAPHEMES, PRACTICE_CUSTOM_TEXT_TIMED_DURATIONS_MS } = __c_v31_dep1;
  const { getPracticeCustomTextTimedAvailability } = __c_v31_dep2;
  const { buildPracticeCustomTypingProjection } = __c_v31_dep3;
  const { inspectPracticeCustomTextSource } = __c_v31_dep4;
  const { importPracticeCustomTextFile, exportPracticeCustomTextFile } = __c_v31_dep5;
  const { PRACTICE_LAB_ROUTES } = __c_v31_dep6;
  const CUSTOM = "custom-text";
  const emptyEditor = () => ({ customTextId: null, revision: null, sourceHash: null, title: "", sourceText: "", dataLocale: null, baselineTitle: "", baselineSourceText: "" });
  
  function createPracticeLabController(options = {}) {
    const { root, experimentRegistry, logger = null } = options;
    registerPracticeCustomTextExperiment(experimentRegistry);
    let state = {
      status: "idle", texts: [], contextDataLocale: null, editor: emptyEditor(), sessionMode: "full-text",
      timedDurationMs: PRACTICE_CUSTOM_TEXT_DEFAULT_TIMED_DURATION_MS, timedAvailability: [], sourceGraphemeCount: 0,
      validationErrorCode: PRACTICE_CUSTOM_TEXT_ERROR_CODES.EMPTY, localeMismatch: false, dirty: false,
      saving: false, starting: false, errorCode: null,
    };
    let host = null;
    let mounted = false;
    let lastView = null;
    let listeners = false;
    let deriveTimer = null;
    let loadEpoch = 0;
    let startEpoch = 0;
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    const routeId = (base) => base.getSnapshot()?.route?.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL ? base.getSnapshot()?.route?.params?.experimentId : null;
    const detailId = (view) => view?.kind === "experiment-detail" && view.title === "Custom Text" ? CUSTOM : null;
    const dirty = () => Boolean(state.editor.customTextId)
      ? state.editor.title !== state.editor.baselineTitle || state.editor.sourceText !== state.editor.baselineSourceText
      : Boolean(state.editor.title.trim() || state.editor.sourceText);
    const sourceDirty = () => Boolean(state.editor.customTextId) && state.editor.sourceText !== state.editor.baselineSourceText;
    const confirmDiscard = () => !dirty() || globalThis.confirm?.("Discard unsaved Custom Text changes?") !== false;
    const discardEditor = () => { state = { ...state, editor: { ...emptyEditor(), dataLocale: state.contextDataLocale }, localeMismatch: false, errorCode: null, dirty: false }; };
  
    function attach() {
      if (listeners || !mounted) return;
      root?.addEventListener?.("click", click, true);
      root?.addEventListener?.("input", input, true);
      root?.addEventListener?.("change", change, true);
      globalThis.addEventListener?.("beforeunload", beforeUnload);
      listeners = true;
    }
    function detach() {
      if (!listeners) return;
      root?.removeEventListener?.("click", click, true);
      root?.removeEventListener?.("input", input, true);
      root?.removeEventListener?.("change", change, true);
      globalThis.removeEventListener?.("beforeunload", beforeUnload);
      listeners = false;
    }
    function beforeUnload(event) { if (routeId(base) === CUSTOM && dirty() && !host) { event.preventDefault(); event.returnValue = ""; } }
  
    function renderer(renderRoot, view, rendererOptions = {}) {
      lastView = view;
      if (detailId(view)) {
        attach();
        const detail = { ...view, kind: "custom-text-detail", ...state, dirty: dirty() };
        if (externalRenderer) return externalRenderer(renderRoot, detail, rendererOptions);
        return renderPracticeCustomTextDetail(renderRoot, detail, rendererOptions);
      }
      detach();
      return externalRenderer ? externalRenderer(renderRoot, view, rendererOptions) : renderPracticeLabV31(renderRoot, view, rendererOptions);
    }
  
    const base = createPracticeLabControllerV30({ ...options, renderer });
    function rerender(focusSelector = null) { if (mounted && !host && routeId(base) === CUSTOM && lastView) renderer(root, lastView, { focusSelector }); }
    function setState(patch, focusSelector = null) { state = { ...state, ...patch, dirty: dirty() }; rerender(focusSelector); }
  
    function deriveEditor({ render = false } = {}) {
      let sourceGraphemeCount = 0;
      let validationErrorCode = null;
      let timedAvailability = [];
      try {
        const source = inspectPracticeCustomTextSource(state.editor.sourceText);
        sourceGraphemeCount = source.graphemeCount;
        const projection = buildPracticeCustomTypingProjection(source.sourceText);
        timedAvailability = getPracticeCustomTextTimedAvailability(projection.graphemeCount);
        if (!projection.text) validationErrorCode = PRACTICE_CUSTOM_TEXT_ERROR_CODES.EMPTY;
        else if (projection.graphemeCount < PRACTICE_CUSTOM_TEXT_MIN_GRAPHEMES) validationErrorCode = PRACTICE_CUSTOM_TEXT_ERROR_CODES.TOO_SHORT;
      } catch (error) { validationErrorCode = error?.code ?? PRACTICE_CUSTOM_TEXT_ERROR_CODES.TOO_LARGE; }
      state = { ...state, sourceGraphemeCount, timedAvailability, validationErrorCode, dirty: dirty() };
      if (render) rerender();
      else updateDerivedDom();
    }
    function scheduleDerive() { if (deriveTimer) clearTimeout(deriveTimer); deriveTimer = setTimeout(() => { deriveTimer = null; deriveEditor(); }, 120); }
    function updateDerivedDom() {
      if (routeId(base) !== CUSTOM || host) return;
      updatePracticeCustomEditorUi(root, { ...state, dirty: dirty() });
      const save = root?.querySelector?.("[data-practice-action='custom-save']"); if (save) save.disabled = state.saving || !dirty() || Boolean(state.localeMismatch);
      for (const button of root?.querySelectorAll?.("[data-practice-action='custom-duration']") ?? []) {
        const value = Number(button.dataset.durationMs); const available = state.timedAvailability.find((row) => row.durationMs === value)?.available === true; button.disabled = !available;
      }
    }
  
    async function load() {
      if (!mounted || routeId(base) !== CUSTOM) return;
      const epoch = ++loadEpoch;
      setState({ status: "loading", errorCode: null });
      try {
        const runtime = experimentRegistry.getRegistration(CUSTOM).runtime;
        const workspace = await runtime.getWorkspaceState();
        if (!mounted || epoch !== loadEpoch || routeId(base) !== CUSTOM) return;
        const editor = state.editor.dataLocale == null ? { ...state.editor, dataLocale: workspace.dataLocale } : state.editor;
        state = { ...state, status: "ready", texts: workspace.texts, contextDataLocale: workspace.dataLocale, editor, localeMismatch: Boolean(editor.customTextId && editor.dataLocale !== workspace.dataLocale), errorCode: null };
        deriveEditor({ render: true });
      } catch (error) {
        if (mounted && epoch === loadEpoch) setState({ status: "unavailable", errorCode: error?.code ?? "CUSTOM_TEXT_UNAVAILABLE" });
      }
    }
  
    async function openSaved(customTextId) {
      if (!confirmDiscard()) return false;
      try {
        const runtime = experimentRegistry.getRegistration(CUSTOM).runtime;
        const record = await runtime.getCustomText(customTextId);
        if (!record) throw Object.assign(new Error("Custom Text missing"), { code: PRACTICE_CUSTOM_TEXT_ERROR_CODES.NOT_FOUND });
        state = { ...state, editor: { customTextId: record.customTextId, revision: record.revision, sourceHash: record.sourceHash, title: record.title, sourceText: record.sourceText, dataLocale: record.dataLocale, baselineTitle: record.title, baselineSourceText: record.sourceText }, localeMismatch: record.dataLocale !== state.contextDataLocale, errorCode: null };
        deriveEditor({ render: true });
        return true;
      } catch (error) { setState({ errorCode: error?.code ?? "CUSTOM_TEXT_LOAD_FAILED" }); return false; }
    }
  
    function newText() {
      if (!confirmDiscard()) return false;
      state = { ...state, editor: { ...emptyEditor(), dataLocale: state.contextDataLocale }, localeMismatch: false, errorCode: null };
      deriveEditor({ render: true });
      return true;
    }
  
    async function save() {
      if (state.saving || state.localeMismatch) return false;
      setState({ saving: true, errorCode: null });
      try {
        const runtime = experimentRegistry.getRegistration(CUSTOM).runtime;
        const record = state.editor.customTextId
          ? await runtime.updateCustomText({ customTextId: state.editor.customTextId, expectedRevision: state.editor.revision, title: state.editor.title, sourceText: state.editor.sourceText, dataLocale: state.editor.dataLocale ?? state.contextDataLocale })
          : await runtime.createCustomText({ title: state.editor.title, sourceText: state.editor.sourceText, dataLocale: state.contextDataLocale });
        state = { ...state, editor: { customTextId: record.customTextId, revision: record.revision, sourceHash: record.sourceHash, title: record.title, sourceText: record.sourceText, dataLocale: record.dataLocale, baselineTitle: record.title, baselineSourceText: record.sourceText }, localeMismatch: false, saving: false, errorCode: null };
        await load();
        return true;
      } catch (error) { setState({ saving: false, errorCode: error?.code ?? "CUSTOM_TEXT_SAVE_FAILED" }); return false; }
    }
  
    async function rebind() {
      if (!state.editor.customTextId || !state.localeMismatch) return false;
      try {
        const runtime = experimentRegistry.getRegistration(CUSTOM).runtime;
        const record = await runtime.rebindCustomTextLocale({ customTextId: state.editor.customTextId, expectedRevision: state.editor.revision });
        state = { ...state, editor: { ...state.editor, revision: record.revision, sourceHash: record.sourceHash, dataLocale: record.dataLocale, baselineTitle: record.title, baselineSourceText: record.sourceText, title: record.title, sourceText: record.sourceText }, localeMismatch: false, errorCode: null };
        await load(); return true;
      } catch (error) { setState({ errorCode: error?.code ?? "CUSTOM_TEXT_REBIND_FAILED" }); return false; }
    }
  
    async function remove() {
      if (!state.editor.customTextId) return false;
      if (globalThis.confirm?.("Delete this saved Custom Text from this device?") === false) return false;
      try { await experimentRegistry.getRegistration(CUSTOM).runtime.deleteCustomText(state.editor.customTextId); state = { ...state, editor: { ...emptyEditor(), dataLocale: state.contextDataLocale }, localeMismatch: false, errorCode: null }; await load(); return true; }
      catch (error) { setState({ errorCode: error?.code ?? "CUSTOM_TEXT_DELETE_FAILED" }); return false; }
    }
  
    async function startCustom() {
      if (state.starting || state.localeMismatch) return false;
      const epoch = ++startEpoch;
      // Capture the user's highlighted range before the busy-state render replaces the editor.
      const source = root?.querySelector?.("[data-custom-text-source]");
      const selectionRange = state.sessionMode === "selection" ? { start: source?.selectionStart ?? -1, end: source?.selectionEnd ?? -1 } : null;
      state = { ...state, starting: true, errorCode: null }; rerender();
      try {
        const registration = experimentRegistry.getRegistration(CUSTOM);
        const savedIdentity = Boolean(state.editor.customTextId) && !sourceDirty();
        const prepared = await registration.setupFactory({
          sourceText: state.editor.sourceText,
          sourceKind: savedIdentity ? "saved" : "ephemeral",
          customTextId: savedIdentity ? state.editor.customTextId : null,
          revision: savedIdentity ? state.editor.revision : null,
          sourceHash: savedIdentity ? state.editor.sourceHash : null,
          sessionMode: state.sessionMode,
          timedDurationMs: state.sessionMode === "timed" ? state.timedDurationMs : null,
          selectionRange,
        });
        if (!mounted || epoch !== startEpoch) return false;
        const session = registration.sessionFactory(prepared);
        const module = await import("./practiceCustomTextSessionHost.js");
        detach();
        host = await module.mountPracticeCustomTextSession({
          root, session, runtime: registration.runtime, logger,
          onExit() { host = null; if (mounted) { state = { ...state, starting: false }; void load(); } },
          onPracticeAgain() { queueMicrotask(() => { if (mounted) void startCustom(); }); },
        });
        return true;
      } catch (error) {
        logger?.warn?.("PL31 Custom Text start failed", error);
        if (mounted && epoch === startEpoch) setState({ starting: false, errorCode: error?.code ?? "CUSTOM_TEXT_UNAVAILABLE" });
        return false;
      }
    }
  
    function input(event) {
      if (routeId(base) !== CUSTOM || host) return;
      if (event.target?.matches?.("[data-custom-text-title]")) { state = { ...state, editor: { ...state.editor, title: event.target.value }, dirty: true }; updateDerivedDom(); }
      else if (event.target?.matches?.("[data-custom-text-source]")) { state = { ...state, editor: { ...state.editor, sourceText: event.target.value }, dirty: true, errorCode: null }; scheduleDerive(); }
    }
  
    async function change(event) {
      const fileInput = event.target?.matches?.("[data-custom-text-file]") ? event.target : null;
      if (!fileInput || routeId(base) !== CUSTOM || host) return;
      const file = fileInput.files?.[0]; fileInput.value = ""; if (!file) return;
      if (!confirmDiscard()) return;
      try {
        const imported = await importPracticeCustomTextFile(file);
        state = { ...state, editor: { ...emptyEditor(), title: imported.suggestedTitle, sourceText: imported.sourceText, dataLocale: state.contextDataLocale }, localeMismatch: false, errorCode: null };
        deriveEditor({ render: true });
      } catch (error) { setState({ errorCode: error?.code ?? "CUSTOM_TEXT_IMPORT_FAILED" }); }
    }
  
    function click(event) {
      const button = event.target?.closest?.("[data-practice-action]"); if (!button || !root?.contains?.(button) || routeId(base) !== CUSTOM || host) return;
      const action = button.dataset.practiceAction;
      if (!["back", "custom-retry", "custom-new", "custom-open", "custom-save", "custom-delete", "custom-import", "custom-export", "custom-rebind", "custom-mode", "custom-duration", "custom-start"].includes(action)) return;
      event.stopPropagation();
      if (action === "back") { if (confirmDiscard()) { if (dirty()) discardEditor(); const value = base.back(); queueMicrotask(afterRoute); return value; } return; }
      if (action === "custom-retry") { void load(); return; }
      if (action === "custom-new") { newText(); return; }
      if (action === "custom-open") { void openSaved(button.dataset.customTextId); return; }
      if (action === "custom-save") { void save(); return; }
      if (action === "custom-delete") { void remove(); return; }
      if (action === "custom-import") { root.querySelector?.("[data-custom-text-file]")?.click?.(); return; }
      if (action === "custom-export") { try { exportPracticeCustomTextFile({ sourceText: state.editor.sourceText, title: state.editor.title || "Untitled text" }); } catch (error) { setState({ errorCode: error?.code ?? "CUSTOM_TEXT_EXPORT_FAILED" }); } return; }
      if (action === "custom-rebind") { void rebind(); return; }
      if (action === "custom-mode") { const mode = button.dataset.customMode; if (["full-text", "selection", "timed"].includes(mode)) setState({ sessionMode: mode }, `[data-custom-mode='${mode}']`); return; }
      if (action === "custom-duration") { const value = Number(button.dataset.durationMs); if (PRACTICE_CUSTOM_TEXT_TIMED_DURATIONS_MS.includes(value) && state.timedAvailability.find((row) => row.durationMs === value)?.available) setState({ timedDurationMs: value }, `[data-duration-ms='${value}']`); return; }
      if (action === "custom-start") void startCustom();
    }
  
    const afterRoute = () => { if (routeId(base) === CUSTOM) void load(); else detach(); };
    return Object.freeze({
      mount(route) { mounted = true; const value = base.mount(route); queueMicrotask(afterRoute); return value; },
      navigate(...args) { if (routeId(base) === CUSTOM && !host) { if (!confirmDiscard()) return false; if (dirty()) discardEditor(); } const value = base.navigate(...args); queueMicrotask(afterRoute); return value; },
      back() { if (host) { void host.stop?.(); return true; } if (routeId(base) === CUSTOM) { if (!confirmDiscard()) return false; if (dirty()) discardEditor(); } const value = base.back(); queueMicrotask(afterRoute); return value; },
      getSnapshot() { const snapshot = base.getSnapshot(); return Object.freeze({ ...snapshot, customText: Object.freeze({ ...state, dirty: dirty(), sessionActive: Boolean(host) }) }); },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() { mounted = false; loadEpoch += 1; startEpoch += 1; if (deriveTimer) clearTimeout(deriveTimer); detach(); if (host) { void host.exit(); host = null; } experimentRegistry.getRegistration(CUSTOM)?.runtime?.close?.(); return base.unmount(); },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV32 — consolidated controller layer
const __controller_v32 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV31 } = __controller_v31;
  const { renderPracticeLabV32, renderPracticeTreatmentResponseProgress } = __renderers;
  const { PRACTICE_LAB_ROUTES } = __c_v32_dep0;
  const { buildPracticeTreatmentResponseViewModel } = __c_v32_dep1;
  function createPracticeLabController(options = {}) {
    const { root, logger = null } = options;
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    const ownsRuntime = !options.treatmentResponseRuntime;
    let runtime = options.treatmentResponseRuntime ?? null;
    let runtimePromise = null;
    let state = buildPracticeTreatmentResponseViewModel({ status: "loading" });
    let mounted = false;
    let listeners = false;
    let lastProgressView = null;
    let loadEpoch = 0;
  
    const isProgressRoute = (base) => base.getSnapshot()?.route?.name === PRACTICE_LAB_ROUTES.PROGRESS;
  
    async function ensureRuntime() {
      if (runtime) return runtime;
      runtimePromise ??= import("./practiceTreatmentResponseRuntime.js")
        .then((module) => {
          runtime = module.createPracticeTreatmentResponseRuntime();
          return runtime;
        });
      return runtimePromise;
    }
  
    function attach() {
      if (listeners || !mounted) return;
      root?.addEventListener?.("click", click, true);
      listeners = true;
    }
  
    function detach() {
      if (!listeners) return;
      root?.removeEventListener?.("click", click, true);
      listeners = false;
    }
  
    function renderer(renderRoot, view, rendererOptions = {}) {
      if (view?.kind === "progress") {
        attach();
        lastProgressView = view;
        const progress = { ...view, ...state, kind: "treatment-response-progress", backLabel: view.backLabel ?? state.backLabel };
        return externalRenderer
          ? externalRenderer(renderRoot, progress, rendererOptions)
          : renderPracticeTreatmentResponseProgress(renderRoot, progress, rendererOptions);
      }
      lastProgressView = null;
      detach();
      return externalRenderer ? externalRenderer(renderRoot, view, rendererOptions) : renderPracticeLabV32(renderRoot, view, rendererOptions);
    }
  
    const base = createPracticeLabControllerV31({ ...options, renderer });
  
    function rerender(focusSelector = null) {
      if (!mounted || !isProgressRoute(base) || !lastProgressView) return;
      renderer(root, lastProgressView, { focusSelector });
    }
  
    async function load({ focusSelector = null } = {}) {
      if (!mounted || !isProgressRoute(base)) return;
      const epoch = ++loadEpoch;
      state = buildPracticeTreatmentResponseViewModel({ status: "loading" });
      rerender(focusSelector);
      try {
        const responseRuntime = await ensureRuntime();
        const next = await responseRuntime.getSnapshot();
        if (!mounted || epoch !== loadEpoch || !isProgressRoute(base)) return;
        state = next;
        rerender(focusSelector);
      } catch (error) {
        logger?.warn?.("PL32 Treatment Response progress load failed", error);
        if (!mounted || epoch !== loadEpoch) return;
        state = buildPracticeTreatmentResponseViewModel({ status: "unavailable", errorCode: error?.code ?? "TREATMENT_RESPONSE_UNAVAILABLE" });
        rerender(focusSelector);
      }
    }
  
    function click(event) {
      if (!isProgressRoute(base)) return;
      const button = event.target?.closest?.("[data-practice-action]");
      if (!button || !root?.contains?.(button) || button.dataset.practiceAction !== "treatment-response-refresh") return;
      event.preventDefault();
      event.stopPropagation();
      void load({ focusSelector: "[data-practice-action='treatment-response-refresh']" });
    }
  
    const afterRoute = () => {
      if (isProgressRoute(base)) void load();
      else detach();
    };
  
    return Object.freeze({
      mount(route) {
        mounted = true;
        const value = base.mount(route);
        queueMicrotask(afterRoute);
        return value;
      },
      navigate(...args) {
        const value = base.navigate(...args);
        queueMicrotask(afterRoute);
        return value;
      },
      back() {
        const value = base.back();
        queueMicrotask(afterRoute);
        return value;
      },
      getSnapshot() {
        const snapshot = base.getSnapshot();
        return Object.freeze({
          ...snapshot,
          treatmentResponse: Object.freeze({
            status: state.status,
            cardCount: state.cards?.length ?? 0,
            trackingCount: state.trackingCount ?? 0,
            hasEvidence: state.hasEvidence === true,
          }),
        });
      },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() {
        mounted = false;
        loadEpoch += 1;
        detach();
        if (ownsRuntime) runtime?.close?.();
        runtime = options.treatmentResponseRuntime ?? null;
        runtimePromise = null;
        return base.unmount();
      },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV36 — consolidated controller layer
const __controller_v36 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV32 } = __controller_v32;
  const { renderPracticeLabV36, renderPracticePhysicalKeyboardPage } = __renderers;
  const { PRACTICE_LAB_ROUTES } = __c_v36_dep0;
  const PHYSICAL_ROUTE = PRACTICE_LAB_ROUTES.PHYSICAL_KEYBOARD;
  const emptySnapshot = Object.freeze({ coverage: Object.freeze({}), keys: Object.freeze([]), transitions: Object.freeze([]), modifierRoutes: Object.freeze([]), updatedAt: null });
  
  function createPracticeLabController(options = {}) {
    const { root, logger = null } = options;
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    const ownsRuntime = !options.physicalTelemetryViewRuntime;
    let runtime = options.physicalTelemetryViewRuntime ?? null;
    let runtimePromise = null;
    let state = Object.freeze({ status: "loading", availability: null, snapshot: emptySnapshot, hasStoredData: false, errorCode: null });
    let mounted = false;
    let listeners = false;
    let lastView = null;
    let loadEpoch = 0;
    let base = null;
  
    const routeName = () => base?.getSnapshot?.()?.route?.name ?? null;
    const isPhysicalRoute = () => routeName() === PHYSICAL_ROUTE;
    const isHomeRoute = () => routeName() === PRACTICE_LAB_ROUTES.HOME;
  
    async function ensureRuntime() {
      if (runtime) return runtime;
      runtimePromise ??= import("./practicePhysicalTelemetryViewRuntime.js").then((module) => {
        runtime = module.createPracticePhysicalTelemetryViewRuntime();
        return runtime;
      });
      return runtimePromise;
    }
  
    function attach() {
      if (listeners || !mounted || !isPhysicalRoute()) return;
      root?.addEventListener?.("click", click, true);
      root?.addEventListener?.("change", change, true);
      listeners = true;
    }
  
    function detach() {
      if (!listeners) return;
      root?.removeEventListener?.("click", click, true);
      root?.removeEventListener?.("change", change, true);
      listeners = false;
    }
  
    function homeWithPhysicalNavigation(view) {
      if (view?.kind !== "home" || state.status !== "ready" || state.availability?.contextEligible !== true) return view;
      if (view.analysis?.some?.((item) => item.route === PHYSICAL_ROUTE)) return view;
      return Object.freeze({
        ...view,
        analysis: Object.freeze([
          ...(view.analysis ?? []),
          Object.freeze({ route: PHYSICAL_ROUTE, title: "Physical Keyboard", description: "Inspect local aggregate physical-keyboard telemetry." }),
        ]),
      });
    }
  
    function renderer(renderRoot, view, rendererOptions = {}) {
      lastView = view;
      if (isPhysicalRoute()) {
        attach();
        const physicalView = Object.freeze({ ...view, ...state, kind: "physical-keyboard" });
        return externalRenderer
          ? externalRenderer(renderRoot, physicalView, rendererOptions)
          : renderPracticePhysicalKeyboardPage(renderRoot, physicalView, rendererOptions);
      }
      detach();
      const decorated = homeWithPhysicalNavigation(view);
      return externalRenderer ? externalRenderer(renderRoot, decorated, rendererOptions) : renderPracticeLabV36(renderRoot, decorated, rendererOptions);
    }
  
    base = createPracticeLabControllerV32({ ...options, renderer });
  
    function rerender(focusSelector = null) {
      if (!mounted || !lastView) return;
      renderer(root, lastView, { focusSelector });
    }
  
    async function load({ focusSelector = null } = {}) {
      if (!mounted || (!isPhysicalRoute() && !isHomeRoute())) return;
      const epoch = ++loadEpoch;
      if (isPhysicalRoute()) {
        state = Object.freeze({ ...state, status: "loading", errorCode: null });
        rerender(focusSelector);
      }
      try {
        const physicalRuntime = await ensureRuntime();
        const next = await physicalRuntime.getState();
        if (!mounted || epoch !== loadEpoch || (!isPhysicalRoute() && !isHomeRoute())) return;
        state = Object.freeze({ ...next, errorCode: null });
        rerender(focusSelector);
      } catch (error) {
        logger?.warn?.("PL36 Physical Keyboard diagnostics load failed", error);
        if (!mounted || epoch !== loadEpoch) return;
        state = Object.freeze({ ...state, status: "unavailable", errorCode: error?.code ?? "PHYSICAL_TELEMETRY_UNAVAILABLE" });
        rerender(focusSelector);
      }
    }
  
    async function setEnabled(enabled, focusSelector) {
      try {
        const physicalRuntime = await ensureRuntime();
        state = Object.freeze({ ...(await physicalRuntime.setEnabled(enabled)), errorCode: null });
      } catch (error) {
        logger?.warn?.("PL36 physical telemetry setting update failed", error);
        state = Object.freeze({ ...state, status: "unavailable", errorCode: error?.code ?? "PHYSICAL_TELEMETRY_SETTING_FAILED" });
      }
      rerender(focusSelector);
    }
  
    async function clear() {
      if (globalThis.confirm?.("Clear all locally stored physical keyboard telemetry for this Practice profile?") === false) return;
      try {
        const physicalRuntime = await ensureRuntime();
        state = Object.freeze({ ...(await physicalRuntime.clear()), errorCode: null });
      } catch (error) {
        logger?.warn?.("PL36 physical telemetry clear failed", error);
        state = Object.freeze({ ...state, status: "unavailable", errorCode: error?.code ?? "PHYSICAL_TELEMETRY_CLEAR_FAILED" });
      }
      rerender("[data-practice-physical-toggle]");
    }
  
    function click(event) {
      if (!isPhysicalRoute()) return;
      const control = event.target?.closest?.("[data-practice-physical-enable],[data-practice-physical-clear],[data-practice-action='physical-retry']");
      if (!control || !root?.contains?.(control)) return;
      event.preventDefault();
      event.stopPropagation();
      if (control.matches("[data-practice-action='physical-retry']")) { void load({ focusSelector: "[data-practice-action='physical-retry']" }); return; }
      if (control.matches("[data-practice-physical-enable]")) void setEnabled(true, "[data-practice-physical-toggle]");
      else void clear();
    }
  
    function change(event) {
      if (!isPhysicalRoute() || !event.target?.matches?.("[data-practice-physical-toggle]")) return;
      event.stopPropagation();
      void setEnabled(event.target.checked === true, "[data-practice-physical-toggle]");
    }
  
    const afterRoute = () => {
      if (isPhysicalRoute()) {
        attach();
        void load();
      } else {
        detach();
        if (isHomeRoute()) void load();
      }
    };
  
    return Object.freeze({
      mount(route) {
        mounted = true;
        const value = base.mount(route);
        queueMicrotask(afterRoute);
        return value;
      },
      navigate(...args) {
        const value = base.navigate(...args);
        queueMicrotask(afterRoute);
        return value;
      },
      back() {
        const value = base.back();
        queueMicrotask(afterRoute);
        return value;
      },
      getSnapshot() {
        const snapshot = base.getSnapshot();
        return Object.freeze({
          ...snapshot,
          physicalTelemetry: Object.freeze({
            status: state.status,
            enabled: state.availability?.enabled === true,
            contextEligible: state.availability?.contextEligible === true,
            hasStoredData: state.hasStoredData === true,
            keyCount: state.snapshot?.keys?.length ?? 0,
            transitionCount: state.snapshot?.transitions?.length ?? 0,
          }),
        });
      },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() {
        mounted = false;
        loadEpoch += 1;
        detach();
        if (ownsRuntime) runtime?.close?.();
        runtime = options.physicalTelemetryViewRuntime ?? null;
        runtimePromise = null;
        return base.unmount();
      },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV37 — consolidated controller layer
const __controller_v37 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV36 } = __controller_v36;
  const { renderPracticeLabV37 } = __renderers;
  const { registerPracticeWeaknessBossExperiment } = __c_v37_dep0;
  const { PRACTICE_LAB_ROUTES } = __c_v37_dep1;
  const BOSS = "weakness-boss";
  
  function createPracticeLabController(options = {}) {
    const { root, experimentRegistry, logger = null } = options;
    registerPracticeWeaknessBossExperiment(experimentRegistry, options.weaknessBossRuntime ? { runtime: options.weaknessBossRuntime } : {});
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    let state = Object.freeze({ status: "idle", candidates: Object.freeze([]), recommendedCandidate: null, starting: null, errorCode: null });
    let host = null;
    let mounted = false;
    let listeners = false;
    let lastView = null;
    let loadEpoch = 0;
    let startEpoch = 0;
    let base = null;
  
    const routeId = () => base?.getSnapshot?.()?.route?.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL
      ? base.getSnapshot()?.route?.params?.experimentId
      : null;
    const isBossRoute = () => routeId() === BOSS;
    const detailId = (view) => view?.kind === "experiment-detail" && view?.title === "Weakness Boss" ? BOSS : null;
  
    function attach() {
      if (listeners || !mounted || !isBossRoute() || host) return;
      root?.addEventListener?.("click", click, true);
      listeners = true;
    }
    function detach() {
      if (!listeners) return;
      root?.removeEventListener?.("click", click, true);
      listeners = false;
    }
  
    function renderer(renderRoot, view, rendererOptions = {}) {
      lastView = view;
      if (detailId(view)) {
        attach();
        const detail = Object.freeze({ ...view, ...state, kind: "weakness-boss-detail" });
        return externalRenderer ? externalRenderer(renderRoot, detail, rendererOptions) : renderPracticeLabV37(renderRoot, detail, rendererOptions);
      }
      detach();
      return externalRenderer ? externalRenderer(renderRoot, view, rendererOptions) : renderPracticeLabV37(renderRoot, view, rendererOptions);
    }
  
    base = createPracticeLabControllerV36({ ...options, renderer });
  
    function rerender(focusSelector = null) {
      if (!mounted || host || !isBossRoute() || !lastView) return;
      renderer(root, lastView, { focusSelector });
    }
    function setState(patch, focusSelector = null) {
      state = Object.freeze({ ...state, ...patch });
      rerender(focusSelector);
    }
  
    async function load() {
      if (!mounted || !isBossRoute() || host) return false;
      const epoch = ++loadEpoch;
      setState({ status: "loading", errorCode: null });
      try {
        const registration = experimentRegistry.getRegistration(BOSS);
        const result = await registration.runtime.loadCandidates();
        if (!mounted || epoch !== loadEpoch || !isBossRoute() || host) return false;
        setState({
          status: result?.status === "unavailable" ? "unavailable" : "ready",
          candidates: Object.freeze([...(result?.candidates ?? [])].slice(0, 5)),
          recommendedCandidate: result?.recommendedCandidate ?? null,
          errorCode: result?.errorCode ?? null,
        }, "[data-practice-action='weakness-boss-start']");
        return result?.available === true;
      } catch (error) {
        logger?.warn?.("PL37 Weakness Boss candidate load failed", error);
        if (mounted && epoch === loadEpoch) setState({ status: "unavailable", candidates: Object.freeze([]), recommendedCandidate: null, errorCode: error?.code ?? "PRACTICE_WEAKNESS_BOSS_UNAVAILABLE" });
        return false;
      }
    }
  
    async function start(statId = null, targetSource = null) {
      if (!mounted || !isBossRoute() || host || state.starting) return false;
      const epoch = ++startEpoch;
      const chosen = state.candidates.find((candidate) => candidate.statId === statId) ?? state.recommendedCandidate;
      if (!chosen) return false;
      const source = targetSource ?? (state.recommendedCandidate?.statId === chosen.statId ? "recommended" : "candidate-choice");
      setState({ starting: chosen.statId, errorCode: null });
      try {
        const registration = experimentRegistry.getRegistration(BOSS);
        const prepared = await registration.setupFactory({ statId: chosen.statId, targetSource: source });
        if (!mounted || epoch !== startEpoch || !isBossRoute()) return false;
        const session = registration.sessionFactory(prepared);
        const module = await import("./practiceWeaknessBossSessionHost.js");
        detach();
        host = await module.mountPracticeWeaknessBossSession({
          root,
          session,
          logger,
          onExit() {
            host = null;
            if (!mounted) return;
            state = Object.freeze({ ...state, starting: null });
            void load();
          },
          onRepeat() {
            host = null;
            if (!mounted) return;
            state = Object.freeze({ ...state, starting: null });
            queueMicrotask(() => { if (mounted && isBossRoute()) void start(chosen.statId, source); });
          },
        });
        return true;
      } catch (error) {
        logger?.warn?.("PL37 Weakness Boss start failed", error);
        if (mounted && epoch === startEpoch) setState({ starting: null, errorCode: error?.code ?? "PRACTICE_WEAKNESS_BOSS_UNAVAILABLE" });
        return false;
      }
    }
  
    function click(event) {
      if (!isBossRoute() || host) return;
      const control = event.target?.closest?.("[data-practice-action='weakness-boss-start'],[data-practice-action='weakness-boss-refresh']");
      if (!control || !root?.contains?.(control)) return;
      event.preventDefault();
      event.stopPropagation();
      if (control.dataset.practiceAction === "weakness-boss-refresh") { void load(); return; }
      void start(control.dataset.bossStatId ?? null, null);
    }
  
    const afterRoute = () => {
      if (isBossRoute()) {
        attach();
        void load();
      } else detach();
    };
  
    return Object.freeze({
      mount(route) {
        mounted = true;
        const value = base.mount(route);
        queueMicrotask(afterRoute);
        return value;
      },
      navigate(...args) {
        const value = base.navigate(...args);
        queueMicrotask(afterRoute);
        return value;
      },
      back() {
        if (host) { void host.stop?.(); return true; }
        const value = base.back();
        queueMicrotask(afterRoute);
        return value;
      },
      getSnapshot() {
        const snapshot = base.getSnapshot();
        return Object.freeze({
          ...snapshot,
          weaknessBoss: Object.freeze({
            status: state.status,
            candidateCount: state.candidates.length,
            recommendedStatId: state.recommendedCandidate?.statId ?? null,
            starting: state.starting,
            sessionActive: Boolean(host),
            errorCode: state.errorCode ?? null,
          }),
        });
      },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() {
        mounted = false;
        loadEpoch += 1;
        startEpoch += 1;
        detach();
        if (host) { void host.exit(); host = null; }
        options.weaknessBossRuntime?.close?.();
        return base.unmount();
      },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV38 — consolidated controller layer
const __controller_v38 = (() => {
  const { createPracticeLabController: createPracticeLabControllerV37 } = __controller_v37;
  const { renderPracticeLabV38 } = __renderers;
  const { PRACTICE_LAB_ROUTES } = __c_v38_dep0;
  const RESEARCH_ROUTE = PRACTICE_LAB_ROUTES.RESEARCH;
  const initialState = () => Object.freeze({
    status: "loading",
    enrollment: null,
    assignments: Object.freeze([]),
    activeAssignment: null,
    analysis: null,
    errorCode: null,
  });
  
  function createPracticeLabController(options = {}) {
    const { root, experimentRegistry, logger = null } = options;
    const researchDeveloperEnabled = options.featureGate?.getSnapshot?.().reason === "developer";
    const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
    const ownsRuntime = !options.researchRuntime;
    let runtime = options.researchRuntime ?? null;
    let runtimePromise = null;
    let state = initialState();
    let host = null;
    let mounted = false;
    let listeners = false;
    let lastView = null;
    let loadEpoch = 0;
    let actionEpoch = 0;
    let base = null;
  
    const routeName = () => base?.getSnapshot?.()?.route?.name ?? null;
    const isResearchRoute = () => routeName() === RESEARCH_ROUTE;
  
    async function ensureRuntime() {
      if (runtime) return runtime;
      runtimePromise ??= import("./practiceResearchRuntime.js").then((module) => {
        runtime = module.createPracticeResearchRuntime({
          experimentRegistry,
          dataStore: options.researchDataStore ?? null,
          manifestStore: options.researchManifestStore ?? null,
          practiceRepository: options.researchPracticeRepository ?? null,
          researchRepository: options.researchRepository ?? null,
          now: options.researchNow ?? (() => new Date()),
          cryptoImpl: options.researchCrypto ?? globalThis.crypto,
          logger,
        });
        return runtime;
      });
      return runtimePromise;
    }
  
    function releaseOwnedRuntime(activeRuntime = runtime) {
      if (!ownsRuntime || !activeRuntime) return;
      try { activeRuntime.close?.(); } catch (error) { logger?.warn?.("PL38 Research runtime close failed", error); }
      if (runtime === activeRuntime) {
        runtime = null;
        runtimePromise = null;
      }
    }
  
    function attach() {
      if (listeners || !mounted || !isResearchRoute() || host) return;
      root?.addEventListener?.("click", click, true);
      listeners = true;
    }
  
    function detach() {
      if (!listeners) return;
      root?.removeEventListener?.("click", click, true);
      listeners = false;
    }
  
    function homeWithResearchNavigation(view) {
      if (view?.kind !== "home" || !researchDeveloperEnabled) return view;
      if (view.analysis?.some?.((item) => item.route === RESEARCH_ROUTE)) return view;
      return Object.freeze({
        ...view,
        analysis: Object.freeze([
          ...(view.analysis ?? []),
          Object.freeze({
            route: RESEARCH_ROUTE,
            title: "Research",
            description: "Optional local randomized Practice comparisons. Experimental and opt-in.",
          }),
        ]),
      });
    }
  
    function renderer(renderRoot, view, rendererOptions = {}) {
      lastView = view;
      if (isResearchRoute() && !host) {
        attach();
        const researchView = Object.freeze({ ...view, ...state, kind: "research" });
        return externalRenderer
          ? externalRenderer(renderRoot, researchView, rendererOptions)
          : renderPracticeLabV38(renderRoot, researchView, rendererOptions);
      }
      if (!host) detach();
      const decorated = homeWithResearchNavigation(view);
      return externalRenderer ? externalRenderer(renderRoot, decorated, rendererOptions) : renderPracticeLabV38(renderRoot, decorated, rendererOptions);
    }
  
    base = createPracticeLabControllerV37({ ...options, renderer });
  
    function rerender(focusSelector = null) {
      if (!mounted || host || !isResearchRoute() || !lastView) return;
      renderer(root, lastView, { focusSelector });
    }
  
    function setState(next, focusSelector = null) {
      state = Object.freeze({ ...state, ...next });
      rerender(focusSelector);
    }
  
    async function load({ focusSelector = null } = {}) {
      if (!mounted || !isResearchRoute() || host) return false;
      const epoch = ++loadEpoch;
      setState({ status: "loading", errorCode: null });
      try {
        const research = await ensureRuntime();
        const next = await research.getState();
        if (!mounted || epoch !== loadEpoch || !isResearchRoute() || host) return false;
        state = Object.freeze({ ...initialState(), ...next, errorCode: null });
        rerender(focusSelector);
        return true;
      } catch (error) {
        logger?.warn?.("PL38 Research state load failed", error);
        if (mounted && epoch === loadEpoch && isResearchRoute() && !host) {
          setState({ status: "unavailable", errorCode: error?.code ?? "PRACTICE_RESEARCH_UNAVAILABLE" });
        }
        return false;
      }
    }
  
    async function mutate(operation, { focusSelector = null, errorCode = "PRACTICE_RESEARCH_ACTION_FAILED" } = {}) {
      if (!mounted || !isResearchRoute() || host) return false;
      const epoch = ++actionEpoch;
      setState({ errorCode: null });
      try {
        const research = await ensureRuntime();
        await operation(research);
        if (!mounted || epoch !== actionEpoch || !isResearchRoute() || host) return false;
        return load({ focusSelector });
      } catch (error) {
        logger?.warn?.("PL38 Research action failed", error);
        if (mounted && epoch === actionEpoch && isResearchRoute() && !host) setState({ errorCode: error?.code ?? errorCode }, focusSelector);
        return false;
      }
    }
  
    async function finalizeProbe(assignmentId, phase, finalResult) {
      const activeRuntime = await ensureRuntime();
      try {
        await activeRuntime.completeProbe(assignmentId, phase, finalResult);
      } catch (error) {
        logger?.warn?.(`PL38 ${phase} probe finalization failed`, error);
        if (mounted) setState({ errorCode: error?.code ?? "PRACTICE_RESEARCH_PROBE_FINALIZE_FAILED" });
      }
      if (mounted && isResearchRoute()) await load();
      else if (!mounted) releaseOwnedRuntime(activeRuntime);
    }
  
    async function startProbe(phase) {
      const assignment = state.activeAssignment;
      if (!assignment || host || !mounted || !isResearchRoute()) return false;
      const epoch = ++actionEpoch;
      setState({ errorCode: null });
      let research = null;
      try {
        research = await ensureRuntime();
        const session = await research.prepareProbe(assignment.researchAssignmentId, phase);
        if (!mounted || epoch !== actionEpoch || !isResearchRoute()) {
          try { await research.completeProbe(assignment.researchAssignmentId, phase, null); } catch {}
          return false;
        }
        const module = await import("./practiceResearchProbeSessionHost.js");
        detach();
        host = await module.mountPracticeResearchProbeSession({
          root,
          session,
          logger,
          onComplete(finalResult) {
            host = null;
            void finalizeProbe(assignment.researchAssignmentId, phase, finalResult);
          },
          onExit(finalResult) {
            host = null;
            // A started baseline/follow-up measurement consumes this assignment outcome.
            // PL38 never offers a measurement reroll after abandonment.
            void finalizeProbe(assignment.researchAssignmentId, phase, finalResult);
          },
        });
        return true;
      } catch (error) {
        logger?.warn?.(`PL38 ${phase} probe start failed`, error);
        if (research && error?.code !== "PRACTICE_RESEARCH_SESSION_CONFLICT") {
          try { await research.completeProbe(assignment.researchAssignmentId, phase, null); } catch {}
        }
        if (mounted && epoch === actionEpoch) setState({ errorCode: error?.code ?? "PRACTICE_RESEARCH_PROBE_UNAVAILABLE" });
        return false;
      }
    }
  
    async function treatmentHost(experimentId) {
      if (experimentId === "weak-keys") {
        const module = await import("./practiceWeakKeysSessionHost.js");
        return module.mountPracticeWeakKeysSession;
      }
      if (experimentId === "combination-repair") {
        const module = await import("./practiceCombinationRepairSessionHost.js");
        return module.mountPracticeCombinationRepairSession;
      }
      if (experimentId === "problem-words") {
        const module = await import("./practiceProblemWordsSessionHost.js");
        return module.mountPracticeProblemWordsSession;
      }
      if (experimentId === "weakness-boss") {
        const module = await import("./practiceWeaknessBossSessionHost.js");
        return module.mountPracticeWeaknessBossSession;
      }
      throw new TypeError(`Unsupported PL38 treatment host: ${experimentId}`);
    }
  
    async function finalizeTreatment(assignmentId, finalResult) {
      const activeRuntime = await ensureRuntime();
      try {
        await activeRuntime.completeTreatment(assignmentId, finalResult);
      } catch (error) {
        logger?.warn?.("PL38 randomized treatment finalization failed", error);
        try { await activeRuntime.abandonTreatment(assignmentId, "treatment-finalization-failed"); } catch {}
        if (mounted) setState({ errorCode: error?.code ?? "PRACTICE_RESEARCH_TREATMENT_FINALIZE_FAILED" });
      }
      if (mounted && isResearchRoute()) await load();
      else if (!mounted) releaseOwnedRuntime(activeRuntime);
    }
  
    async function startTreatment() {
      const assignment = state.activeAssignment;
      if (!assignment || host || !mounted || !isResearchRoute()) return false;
      const epoch = ++actionEpoch;
      setState({ errorCode: null });
      let prepared = null;
      try {
        const research = await ensureRuntime();
        prepared = await research.prepareTreatment(assignment.researchAssignmentId);
        if (!mounted || epoch !== actionEpoch || !isResearchRoute()) {
          await research.abandonTreatment(assignment.researchAssignmentId, "navigation-before-treatment-start");
          return false;
        }
        const mountHost = await treatmentHost(prepared.experimentId);
        detach();
        const finish = (finalResult) => {
          host = null;
          void finalizeTreatment(assignment.researchAssignmentId, finalResult);
        };
        host = await mountHost({
          root,
          session: prepared.session,
          logger,
          onExit: finish,
          // Randomized treatment is exactly one canonical dose. Existing treatment
          // result screens may expose a repeat control; in Research it closes the
          // assignment instead of starting a second randomized dose.
          onRepeat: finish,
        });
        return true;
      } catch (error) {
        logger?.warn?.("PL38 randomized treatment start failed", error);
        if (prepared) {
          try { await (await ensureRuntime()).abandonTreatment(assignment.researchAssignmentId, "treatment-start-failed"); } catch {}
        }
        if (mounted && epoch === actionEpoch) setState({ errorCode: error?.code ?? "PRACTICE_RESEARCH_TREATMENT_UNAVAILABLE" });
        return false;
      }
    }
  
    function goBack() {
      const value = base.back();
      queueMicrotask(afterRoute);
      return value;
    }
  
    function click(event) {
      if (!isResearchRoute() || host) return;
      const control = event.target?.closest?.("[data-research-action]");
      if (!control || !root?.contains?.(control)) return;
      const action = control.dataset.researchAction;
      event.preventDefault();
      event.stopPropagation();
      if (action === "back") { goBack(); return; }
      if (action === "reload") { void load({ focusSelector: "[data-research-action='reload']" }); return; }
      if (action === "enroll") { void mutate((research) => research.enroll(), { focusSelector: "[data-research-action='new-assignment']", errorCode: "PRACTICE_RESEARCH_ENROLL_FAILED" }); return; }
      if (action === "new-assignment") { void mutate((research) => research.createAssignment(), { focusSelector: "[data-research-action='start-baseline']", errorCode: "PRACTICE_RESEARCH_ASSIGNMENT_FAILED" }); return; }
      if (action === "start-baseline") { void startProbe("baseline"); return; }
      if (action === "start-followup") { void startProbe("followup"); return; }
      if (action === "start-treatment") { void startTreatment(); return; }
      if (action === "decline-treatment") {
        if (globalThis.confirm?.("Decline this revealed randomized assignment? It will not be rerolled or replaced today.") === false) return;
        void mutate((research) => research.declineTreatment(state.activeAssignment?.researchAssignmentId), { errorCode: "PRACTICE_RESEARCH_DECLINE_FAILED" });
        return;
      }
      if (action === "pause") { void mutate((research) => research.setEnrollmentStatus("paused"), { errorCode: "PRACTICE_RESEARCH_PAUSE_FAILED" }); return; }
      if (action === "resume") { void mutate((research) => research.setEnrollmentStatus("active"), { errorCode: "PRACTICE_RESEARCH_RESUME_FAILED" }); return; }
      if (action === "withdraw") {
        if (globalThis.confirm?.("Withdraw from this local research study? Future randomized assignments will stop, but existing research records remain unless separately deleted.") === false) return;
        void mutate((research) => research.setEnrollmentStatus("withdrawn"), { errorCode: "PRACTICE_RESEARCH_WITHDRAW_FAILED" });
        return;
      }
      if (action === "delete") {
        if (globalThis.confirm?.("Delete this enrollment and its local Research assignment/analysis records? Ordinary Practice sessions and evidence that actually occurred will remain.") === false) return;
        void mutate((research) => research.deleteEnrollment(), { errorCode: "PRACTICE_RESEARCH_DELETE_FAILED" });
      }
    }
  
    const afterRoute = () => {
      if (isResearchRoute()) {
        attach();
        void load();
      } else detach();
    };
  
    return Object.freeze({
      mount(route) {
        mounted = true;
        const value = base.mount(route);
        queueMicrotask(afterRoute);
        return value;
      },
      navigate(...args) {
        const value = base.navigate(...args);
        queueMicrotask(afterRoute);
        return value;
      },
      back() {
        if (host) {
          void host.exit?.();
          return true;
        }
        return goBack();
      },
      getSnapshot() {
        const snapshot = base.getSnapshot();
        return Object.freeze({
          ...snapshot,
          research: Object.freeze({
            status: state.status,
            enrollmentStatus: state.enrollment?.status ?? null,
            assignmentCount: state.assignments?.length ?? 0,
            activeAssignmentId: state.activeAssignment?.researchAssignmentId ?? null,
            activeAssignmentStatus: state.activeAssignment?.status ?? null,
            sessionActive: Boolean(host),
            errorCode: state.errorCode ?? null,
          }),
        });
      },
      subscribe(listener) { return base.subscribe(listener); },
      unmount() {
        mounted = false;
        loadEpoch += 1;
        actionEpoch += 1;
        detach();
        const activeHost = host;
        host = null;
        if (activeHost) void activeHost.exit?.();
        else releaseOwnedRuntime();
        return base.unmount();
      },
    });
  }
  return Object.freeze({ createPracticeLabController });
})();

// practiceLabControllerRuntimeV40 — consolidated controller layer
const __controller_v40 = (() => {
  const { capturePracticeWorkshopFocus, restorePracticeWorkshopFocus } = __c_v40_dep0;
  const { renderPracticeLabHome, enhancePracticeLabView, disposePracticeLabPresentation } = __c_v40_dep1;
  const { renderPracticePreviewProtocolSetup } = __c_v40_dep2;
  const { createPracticeLabController: createBase } = __controller_v38;
  const { renderPracticeLabV38 } = __renderers;
  const { buildExperimentDetailViewModel } = __c_v40_dep3;
  const { loadPracticeEvidenceViews, renderPracticeEvidenceView } = __c_v40_dep4;
  function createPracticeLabController(options={}) {
    const {root}=options;let listening=false;const attach=()=>{if(!listening){root.addEventListener('click',click,true);listening=true;}};const detach=()=>{if(listening){root.removeEventListener('click',click,true);listening=false;}};let mounted=false,lastView=null,key=null,state={status:'loading'},epoch=0,runtime=null,runtimePromise=null,host=null,report=null;
    const ensureRuntime=()=>runtimePromise??=(import('./practiceAssessmentRuntime.js').then(m=>m.createPracticeAssessmentRuntime()).then(r=>{runtime=r;return r;}).catch(e=>{runtimePromise=null;throw e;}));
    function renderContent(renderRoot,view,renderOptions={}) {
      if(host)return true;lastView=view;
      const protocolId=['read-ahead','metronome-typing'].includes(view.experimentId)?view.experimentId:null;
      if(protocolId){attach();const result=renderPracticePreviewProtocolSetup(renderRoot,protocolId);if(!options.renderer)enhancePracticeLabView(renderRoot,view);return result;}
      const current=['skill-map','review-queue','treatment-response-progress','full-assessment-detail'].includes(view.kind)?view.kind:null;
      if(current)attach();else detach();
      if(current!==key){key=current;epoch++;state={status:'loading'};if(current)queueMicrotask(()=>void load());}
      if(view.kind==='home'&&!options.renderer)return renderPracticeLabHome(renderRoot,view,renderOptions);
      if(view.kind==='skill-map'||view.kind==='review-queue'){const result=options.renderer ? options.renderer(renderRoot,{...view,evidence:state},renderOptions) : renderPracticeEvidenceView(renderRoot,view.kind,state,{focus:renderOptions.focusSelector!==null});if(!options.renderer)enhancePracticeLabView(renderRoot,view);return result;}
      if(view.kind==='full-assessment-detail'&&state.availability){const next=buildExperimentDetailViewModel({route:{params:{experimentId:'full-assessment'}},registry:options.experimentRegistry,assessmentAvailability:state.availability,assessmentReport:report});const result=(options.renderer??renderPracticeLabV38)(renderRoot,next,renderOptions);if(report){const button=renderRoot.ownerDocument.createElement('button');button.type='button';button.dataset.practiceAction='assessment-restart';button.textContent='START ANOTHER ASSESSMENT';renderRoot.querySelector('main')?.append(button);}if(!options.renderer)enhancePracticeLabView(renderRoot,next);return result;}
      const result=(options.renderer??renderPracticeLabV38)(renderRoot,view,renderOptions);
      if(view.kind==='treatment-response-progress') {const main=renderRoot.querySelector?.('main');if(main){const section=renderRoot.ownerDocument.createElement('section');section.setAttribute('data-practice-history','');main.prepend(section);renderPracticeEvidenceView(section,'history',state,{embedded:true});}}
      if(view.kind==='full-assessment-detail'&&state.status==='error'){const doc=renderRoot.ownerDocument,alert=doc.createElement('div'),strong=doc.createElement('strong'),copy=doc.createElement('p'),retry=doc.createElement('button');alert.className='practice-lab-notice is-warning';alert.setAttribute('role','alert');strong.textContent='Assessment could not load.';copy.textContent='Your existing Practice data has not been changed.';retry.type='button';retry.dataset.practiceAction='assessment-refresh';retry.textContent='TRY AGAIN';alert.append(strong,copy,retry);renderRoot.querySelector('main')?.append(alert);}
      if(!options.renderer)enhancePracticeLabView(renderRoot,view);
      return result;
    }
    function renderer(renderRoot,view,renderOptions={}) {
      const focus = options.renderer ? null : capturePracticeWorkshopFocus(renderRoot);
      const result = renderContent(renderRoot,view,renderOptions);
      if (!options.renderer) restorePracticeWorkshopFocus(renderRoot,focus);
      return result;
    }
    // DOM navigation must traverse every versioned controller so route loading hooks run.
    const base=createBase({...options,renderer,navigationController:{navigate:(...args)=>controller.navigate(...args),back:()=>controller.back()}});
    async function load(){const ticket=epoch,routeKey=key;if(!mounted||!key)return;try{const next=key==='full-assessment-detail'?{status:'ready',availability:await (await ensureRuntime()).getAvailability()}:await loadPracticeEvidenceViews();if(mounted&&ticket===epoch&&routeKey===key){state=next;if(lastView)renderer(root,lastView,{focusSelector:null});}}catch{if(mounted&&ticket===epoch){state={status:'error'};if(lastView)renderer(root,lastView,{focusSelector:null});}}}
    let starting=false;
    async function click(event){const button=event.target.closest?.('[data-practice-action]');if(!button||button.disabled)return;const action=button.dataset.practiceAction;if(action==='start-preview-protocol'&&!starting){event.stopPropagation();starting=true;button.disabled=true;try{const {mountPracticePreviewProtocolSession}=await import('./practicePreviewProtocolSessionHost.js');host=await mountPracticePreviewProtocolSession({root,experimentId:button.dataset.experimentId,durationMs:Number(root.querySelector('[data-protocol-duration]').value),onExit:result=>{host=null;if(mounted){renderer(root,lastView);if(result?.error){const alert=root.ownerDocument.createElement('p');alert.setAttribute('role','alert');alert.textContent='The interrupted session could not be saved. Please try again.';root.querySelector('main')?.append(alert);}}}});if(!mounted){await host.exit();host=null;}}catch(error){if(mounted){renderer(root,lastView);const alert=root.ownerDocument.createElement('p');alert.setAttribute('role','alert');alert.textContent=error.message;root.querySelector('main')?.append(alert);}}finally{starting=false;}return;}if(action==='assessment-refresh'){event.stopPropagation();state={status:'loading'};renderer(root,lastView);void load();return;}if(action==='assessment-restart'){event.stopPropagation();report=null;renderer(root,lastView);void load();return;}if(action==='evidence-page'){event.stopPropagation();state={...state,page:Math.max(0,Number(button.dataset.page)||0)};renderer(root,lastView);return;}if(action==='evidence-refresh'){event.stopPropagation();void load();}else if(action==='start-assessment'&&!starting){event.stopPropagation();starting=true;button.disabled=true;try{const r=await ensureRuntime();const {run}=await r.start(button.dataset.assessmentDepth);if(!mounted){await r.service.abandonAssessment(run.assessmentRunId);return;}const {mountPracticeAssessmentSession}=await import('./practiceAssessmentSessionHost.js');host=await mountPracticeAssessmentSession({root,runtime:r,run,onExit:next=>{host=null;report=next?.report??null;if(mounted){renderer(root,lastView);void load();}}});}catch{state={status:'error'};if(mounted)renderer(root,lastView);}finally{starting=false;}}}
    const controller={...base,mount(route){mounted=true;return base.mount(route);},navigate(...args){if(host||starting)return false;return base.navigate(...args);},back(){if(host){void host.exit();return true;}return base.back();},unmount(){mounted=false;epoch++;detach();disposePracticeLabPresentation(root);const exiting=host?.exit();host=null;Promise.resolve(exiting).finally(()=>runtime?.close());return base.unmount();}};
    return controller;
  }
  return Object.freeze({ createPracticeLabController });
})();

export const PRACTICE_LAB_ONBOARDING_VERSION = __controller_base.PRACTICE_LAB_ONBOARDING_VERSION;
export const createPracticeLabControllerCurrent = __controller_v40.createPracticeLabController;
export const createPracticeLabController = createPracticeLabControllerCurrent;
