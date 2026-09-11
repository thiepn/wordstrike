import { createPracticeLabController as createPracticeLabControllerV31 } from "./practiceLabControllerRuntimeV31.js";
import { renderPracticeLabV32, renderPracticeTreatmentResponseProgress } from "./practiceLabRendererV32.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";
import { createPracticeTreatmentResponseRuntime } from "./practiceTreatmentResponseRuntime.js";
import { buildPracticeTreatmentResponseViewModel } from "./practiceTreatmentResponseViewModel.js";

export function createPracticeLabController(options = {}) {
  const { root, logger = null } = options;
  const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
  const ownsRuntime = !options.treatmentResponseRuntime;
  const runtime = options.treatmentResponseRuntime ?? createPracticeTreatmentResponseRuntime();
  let state = buildPracticeTreatmentResponseViewModel({ status: "loading" });
  let mounted = false;
  let listeners = false;
  let lastProgressView = null;
  let loadEpoch = 0;

  const isProgressRoute = (base) => base.getSnapshot()?.route?.name === PRACTICE_LAB_ROUTES.PROGRESS;

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
      const next = await runtime.getSnapshot();
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
      if (ownsRuntime) runtime.close?.();
      return base.unmount();
    },
  });
}
