import { createPracticeLabController as createPracticeLabControllerV26 } from "./practiceLabControllerRuntimeV26.js";
import { renderPracticeLabV27, renderPracticeBurstSprintsDetail } from "./practiceLabRendererV27.js";
import { registerPracticeBurstSprintsExperiment } from "./practiceBurstSprintsExperiment.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const ID = "burst-sprints";

export function createPracticeLabController(options = {}) {
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
