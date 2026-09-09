import { createPracticeLabController as createPracticeLabControllerV25 } from "./practiceLabControllerRuntimeV25.js";
import { renderPracticeLabV26, renderPracticePaceLadderDetail } from "./practiceLabRendererV26.js";
import { registerPracticePaceLadderExperiment } from "./practicePaceLadderExperiment.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const ID = "pace-ladder";
export function createPracticeLabController(options = {}) {
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
