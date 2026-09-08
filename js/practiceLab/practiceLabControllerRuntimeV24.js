import { createPracticeLabController as createPracticeLabControllerV23 } from "./practiceLabControllerRuntimeV23.js";
import { renderPracticeLabV24, renderPracticeRealTextDetail } from "./practiceLabRendererV24.js";
import { buildPracticeRealTextDetailViewModel, createDefaultPracticeRealTextUiState, normalizePracticeRealTextUiState } from "./practiceRealTextUi.js";
import { registerPracticeRealTextExperiment } from "./practiceRealTextExperiment.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const ID = "real-text";

export function createPracticeLabController(options = {}) {
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
