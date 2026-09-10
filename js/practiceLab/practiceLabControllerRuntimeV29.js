import { createPracticeLabController as createPracticeLabControllerV28 } from "./practiceLabControllerRuntimeV28.js";
import { renderPracticeLabV29, renderPracticeConsistencyDetail, renderPracticeEnduranceDetail } from "./practiceLabRendererV29.js";
import { registerPracticeConsistencyExperiment } from "./practiceConsistencyExperiment.js";
import { registerPracticeEnduranceExperiment } from "./practiceEnduranceExperiment.js";
import { PRACTICE_CONSISTENCY_DEFAULT_DURATION_MS, PRACTICE_CONSISTENCY_DURATIONS_MS } from "./practiceConsistencyConstants.js";
import { PRACTICE_ENDURANCE_DEFAULT_PRACTICE_DURATION_MS, PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS } from "./practiceEnduranceConstants.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const CONSISTENCY = "consistency-trainer"; const ENDURANCE = "endurance";
export function createPracticeLabController(options = {}) {
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
