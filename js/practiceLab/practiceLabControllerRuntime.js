import { buildPracticeLabViewModel } from "./practiceLabViewModel.js";
import { renderPracticeLab } from "./practiceLabRenderer.js";
import { createPracticeLabRoute, normalizePracticeLabRoute, PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

export const PRACTICE_LAB_ONBOARDING_VERSION = 1;
const HISTORY_LIMIT = 20;

export function createPracticeLabController({
  root,
  appNavigation = {},
  experimentRegistry,
  featureGate,
  renderer = renderPracticeLab,
  logger = null,
} = {}) {
  let mounted = false;
  let route = createPracticeLabRoute();
  let history = [];
  let unsubscribeRegistry = null;
  let lastRenderReason = null;
  let renderCount = 0;
  const subscribers = new Set();

  const snapshot = () => Object.freeze({
    mounted, route, historyDepth: history.length, listenerCount: mounted ? 1 : 0,
    renderCount, lastRenderReason, featureGate: featureGate.getSnapshot(), registry: experimentRegistry.getDiagnostics(),
  });
  const emit = (type) => {
    const value = Object.freeze({ type, ...snapshot() });
    [...subscribers].forEach((listener) => { try { listener(value); } catch (error) { logger?.warn?.("Practice controller subscriber failed", error); } });
  };
  const render = (reason, focusSelector = null) => {
    if (!mounted) return false;
    renderer(root, buildPracticeLabViewModel({
      route,
      registry: experimentRegistry,
      featureGate,
      helpAvailable: typeof appNavigation.help === "function",
    }), { focusSelector });
    lastRenderReason = reason;
    renderCount += 1;
    emit("rendered");
    return true;
  };
  const navigate = (nextRoute, { replace = false, returnFocusSelector = null } = {}) => {
    if (!mounted || !featureGate.canAccess()) return false;
    const normalized = normalizePracticeLabRoute(nextRoute, { featureGate });
    if (!replace) history = [...history.slice(-(HISTORY_LIMIT - 1)), { route, focusSelector: returnFocusSelector }];
    route = normalized;
    render("navigation");
    return true;
  };
  const back = () => {
    if (!mounted) return false;
    if (history.length) {
      const previous = history[history.length - 1];
      route = previous.route;
      history = history.slice(0, -1);
      render("back", previous.focusSelector);
      return true;
    }
    appNavigation.exit?.();
    return true;
  };
  const click = (event) => {
    if (event.button != null && event.button !== 0) return;
    const target = event.target?.closest?.("[data-practice-action]");
    if (!target || !root.contains?.(target) || target.disabled || target.getAttribute?.("aria-disabled") === "true") return;
    const action = target.dataset.practiceAction;
    if (action === "exit") appNavigation.exit?.();
    else if (action === "back") back();
    else if (action === "help") appNavigation.help?.({ onboardingVersion: PRACTICE_LAB_ONBOARDING_VERSION });
    else if (action === "open-experiment") navigate(
      createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: target.dataset.experimentId }),
      { returnFocusSelector: `[data-experiment-id="${String(target.dataset.experimentId || "").replace(/[^a-z0-9-]/gi, "")}"]` },
    );
    else if (action === "navigate") navigate(
      createPracticeLabRoute(target.dataset.route),
      { returnFocusSelector: `[data-route="${String(target.dataset.route || "").replace(/[^a-z0-9-]/gi, "")}"]` },
    );
  };

  return Object.freeze({
    mount(initialRoute = createPracticeLabRoute()) {
      if (mounted) return snapshot();
      if (!root?.addEventListener || !root?.removeEventListener) throw new TypeError("Practice Lab controller requires a DOM root");
      route = normalizePracticeLabRoute(initialRoute, { featureGate });
      history = [];
      mounted = true;
      root.addEventListener("click", click);
      unsubscribeRegistry = experimentRegistry.subscribe(() => render("registry-change"));
      render("mount");
      emit("mounted");
      return snapshot();
    },
    navigate,
    back,
    getSnapshot: snapshot,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Controller listener must be a function");
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    unmount() {
      if (!mounted) return false;
      root.removeEventListener("click", click);
      unsubscribeRegistry?.();
      unsubscribeRegistry = null;
      history = [];
      mounted = false;
      lastRenderReason = "unmount";
      emit("unmounted");
      subscribers.clear();
      return true;
    },
  });
}
