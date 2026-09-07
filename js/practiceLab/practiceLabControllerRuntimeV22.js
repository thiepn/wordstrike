import { createPracticeLabController as createPracticeLabControllerV21 } from "./practiceLabControllerRuntime.js";
import { renderPracticeLabV21 } from "./practiceLabRendererV21.js";
import { renderPracticeProblemWordsDetail } from "./practiceLabRendererV22.js";
import { buildPracticeProblemWordsDetailViewModel } from "./practiceProblemWordsUi.js";
import { registerPracticeProblemWordsExperiment } from "./practiceProblemWordsExperiment.js";
import { createDefaultPracticeProblemWordsUiState, normalizePracticeProblemWordsManualInput, normalizePracticeProblemWordsUiState } from "./practiceProblemWordsUi.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const PROBLEM_WORDS_ID = "problem-words";
const LIMITED_CODES = new Set(["INSUFFICIENT_WORD_CONTEXTS", "INSUFFICIENT_TARGET_FAMILIES", "INSUFFICIENT_NEUTRAL_CONTENT", "INSUFFICIENT_PROBE_MATCH"]);
const REC_STATUSES = new Set(["ready", "no-evidence", "unsupported", "unavailable"]);

export function createPracticeLabController(options = {}) {
  const { root, experimentRegistry, logger = null, problemWordsRecommendationLoader = null, problemWordsWarningsLoader = null } = options;
  registerPracticeProblemWordsExperiment(experimentRegistry);
  let state = createDefaultPracticeProblemWordsUiState();
  let sessionHost = null;
  let mounted = false;
  let lastView = null;
  let inspectEpoch = 0;
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
    void inspect({ entityKey: target.value, targetSource: "manual" });
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
