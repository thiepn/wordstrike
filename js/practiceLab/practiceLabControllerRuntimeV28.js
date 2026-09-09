import { createPracticeLabController as createPracticeLabControllerV27 } from "./practiceLabControllerRuntimeV27.js";
import { renderPracticeLabV28, renderPracticeCommonWordsDetail } from "./practiceLabRendererV28.js";
import { registerPracticeCommonWordsExperiment } from "./practiceCommonWordsExperiment.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const ID = "common-words";

export function createPracticeLabController(options = {}) {
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
