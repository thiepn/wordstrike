import { createPracticeLabController as createPracticeLabControllerV32 } from "./practiceLabControllerRuntimeV32.js";
import { renderPracticeLabV36, renderPracticePhysicalKeyboardPage } from "./practiceLabRendererV36.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const PHYSICAL_ROUTE = PRACTICE_LAB_ROUTES.PHYSICAL_KEYBOARD;
const emptySnapshot = Object.freeze({ coverage: Object.freeze({}), keys: Object.freeze([]), transitions: Object.freeze([]), modifierRoutes: Object.freeze([]), updatedAt: null });

export function createPracticeLabController(options = {}) {
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
    const control = event.target?.closest?.("[data-practice-physical-enable],[data-practice-physical-clear]");
    if (!control || !root?.contains?.(control)) return;
    event.preventDefault();
    event.stopPropagation();
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
