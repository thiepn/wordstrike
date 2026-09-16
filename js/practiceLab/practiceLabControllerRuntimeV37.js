import { createPracticeLabController as createPracticeLabControllerV36 } from "./practiceLabControllerRuntimeV36.js";
import { renderPracticeLabV37 } from "./practiceLabRendererV37.js";
import { registerPracticeWeaknessBossExperiment } from "./practiceWeaknessBossExperiment.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const BOSS = "weakness-boss";

export function createPracticeLabController(options = {}) {
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
    const control = event.target?.closest?.("[data-practice-action='weakness-boss-start']");
    if (!control || !root?.contains?.(control)) return;
    event.preventDefault();
    event.stopPropagation();
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
