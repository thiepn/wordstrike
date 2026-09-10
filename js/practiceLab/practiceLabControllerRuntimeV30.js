import { createPracticeLabController as createPracticeLabControllerV29 } from "./practiceLabControllerRuntimeV29.js";
import { renderPracticeLabV30, renderPracticeNumbersSymbolsDetail, renderPracticePunctuationCapitalsDetail } from "./practiceLabRendererV30.js";
import { registerPracticePunctuationCapitalsExperiment } from "./practicePunctuationCapitalsExperiment.js";
import { registerPracticeNumbersSymbolsExperiment } from "./practiceNumbersSymbolsExperiment.js";
import { PRACTICE_PUNCTUATION_CAPITALS_DEFAULT_PRACTICE_DURATION_MS, PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS } from "./practicePunctuationCapitalsConstants.js";
import { PRACTICE_NUMBERS_SYMBOLS_DEFAULT_PRACTICE_DURATION_MS, PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS } from "./practiceNumbersSymbolsConstants.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const PUNCTUATION = "punctuation-capitals";
const NUMBERS = "numbers-symbols";

export function createPracticeLabController(options = {}) {
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
