import { createPracticeLabController as createPracticeLabControllerV37 } from "./practiceLabControllerRuntimeV37.js";
import { renderPracticeLabV38 } from "./practiceLabRendererV38.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const RESEARCH_ROUTE = PRACTICE_LAB_ROUTES.RESEARCH;
const initialState = () => Object.freeze({
  status: "loading",
  enrollment: null,
  assignments: Object.freeze([]),
  activeAssignment: null,
  analysis: null,
  errorCode: null,
});

export function createPracticeLabController(options = {}) {
  const { root, experimentRegistry, logger = null } = options;
  const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
  const ownsRuntime = !options.researchRuntime;
  let runtime = options.researchRuntime ?? null;
  let runtimePromise = null;
  let state = initialState();
  let host = null;
  let mounted = false;
  let listeners = false;
  let lastView = null;
  let loadEpoch = 0;
  let actionEpoch = 0;
  let base = null;

  const routeName = () => base?.getSnapshot?.()?.route?.name ?? null;
  const isResearchRoute = () => routeName() === RESEARCH_ROUTE;

  async function ensureRuntime() {
    if (runtime) return runtime;
    runtimePromise ??= import("./practiceResearchRuntime.js").then((module) => {
      runtime = module.createPracticeResearchRuntime({
        experimentRegistry,
        dataStore: options.researchDataStore ?? null,
        manifestStore: options.researchManifestStore ?? null,
        practiceRepository: options.researchPracticeRepository ?? null,
        researchRepository: options.researchRepository ?? null,
        now: options.researchNow ?? (() => new Date()),
        cryptoImpl: options.researchCrypto ?? globalThis.crypto,
        logger,
      });
      return runtime;
    });
    return runtimePromise;
  }

  function attach() {
    if (listeners || !mounted || !isResearchRoute() || host) return;
    root?.addEventListener?.("click", click, true);
    listeners = true;
  }

  function detach() {
    if (!listeners) return;
    root?.removeEventListener?.("click", click, true);
    listeners = false;
  }

  function homeWithResearchNavigation(view) {
    if (view?.kind !== "home") return view;
    if (view.analysis?.some?.((item) => item.route === RESEARCH_ROUTE)) return view;
    return Object.freeze({
      ...view,
      analysis: Object.freeze([
        ...(view.analysis ?? []),
        Object.freeze({
          route: RESEARCH_ROUTE,
          title: "Research",
          description: "Optional local randomized Practice comparisons. Experimental and opt-in.",
        }),
      ]),
    });
  }

  function renderer(renderRoot, view, rendererOptions = {}) {
    lastView = view;
    if (isResearchRoute() && !host) {
      attach();
      const researchView = Object.freeze({ ...view, ...state, kind: "research" });
      return externalRenderer
        ? externalRenderer(renderRoot, researchView, rendererOptions)
        : renderPracticeLabV38(renderRoot, researchView, rendererOptions);
    }
    if (!host) detach();
    const decorated = homeWithResearchNavigation(view);
    return externalRenderer ? externalRenderer(renderRoot, decorated, rendererOptions) : renderPracticeLabV38(renderRoot, decorated, rendererOptions);
  }

  base = createPracticeLabControllerV37({ ...options, renderer });

  function rerender(focusSelector = null) {
    if (!mounted || host || !isResearchRoute() || !lastView) return;
    renderer(root, lastView, { focusSelector });
  }

  function setState(next, focusSelector = null) {
    state = Object.freeze({ ...state, ...next });
    rerender(focusSelector);
  }

  async function load({ focusSelector = null } = {}) {
    if (!mounted || !isResearchRoute() || host) return false;
    const epoch = ++loadEpoch;
    setState({ status: "loading", errorCode: null });
    try {
      const research = await ensureRuntime();
      const next = await research.getState();
      if (!mounted || epoch !== loadEpoch || !isResearchRoute() || host) return false;
      state = Object.freeze({ ...initialState(), ...next, errorCode: null });
      rerender(focusSelector);
      return true;
    } catch (error) {
      logger?.warn?.("PL38 Research state load failed", error);
      if (mounted && epoch === loadEpoch && isResearchRoute() && !host) {
        setState({ status: "unavailable", errorCode: error?.code ?? "PRACTICE_RESEARCH_UNAVAILABLE" });
      }
      return false;
    }
  }

  async function mutate(operation, { focusSelector = null, errorCode = "PRACTICE_RESEARCH_ACTION_FAILED" } = {}) {
    if (!mounted || !isResearchRoute() || host) return false;
    const epoch = ++actionEpoch;
    setState({ errorCode: null });
    try {
      const research = await ensureRuntime();
      await operation(research);
      if (!mounted || epoch !== actionEpoch || !isResearchRoute() || host) return false;
      return load({ focusSelector });
    } catch (error) {
      logger?.warn?.("PL38 Research action failed", error);
      if (mounted && epoch === actionEpoch && isResearchRoute() && !host) setState({ errorCode: error?.code ?? errorCode }, focusSelector);
      return false;
    }
  }

  async function finalizeProbe(assignmentId, phase, finalResult) {
    const activeRuntime = await ensureRuntime();
    try {
      await activeRuntime.completeProbe(assignmentId, phase, finalResult);
    } catch (error) {
      logger?.warn?.(`PL38 ${phase} probe finalization failed`, error);
      if (mounted) setState({ errorCode: error?.code ?? "PRACTICE_RESEARCH_PROBE_FINALIZE_FAILED" });
    }
    if (mounted && isResearchRoute()) await load();
    else if (!mounted && ownsRuntime) activeRuntime.close?.();
  }

  async function startProbe(phase) {
    const assignment = state.activeAssignment;
    if (!assignment || host || !mounted || !isResearchRoute()) return false;
    const epoch = ++actionEpoch;
    setState({ errorCode: null });
    try {
      const research = await ensureRuntime();
      const session = await research.prepareProbe(assignment.researchAssignmentId, phase);
      if (!mounted || epoch !== actionEpoch || !isResearchRoute()) return false;
      const module = await import("./practiceResearchProbeSessionHost.js");
      detach();
      host = await module.mountPracticeResearchProbeSession({
        root,
        session,
        logger,
        onComplete(finalResult) {
          host = null;
          void finalizeProbe(assignment.researchAssignmentId, phase, finalResult);
        },
        onExit(finalResult) {
          host = null;
          // A started baseline/follow-up measurement consumes this assignment outcome.
          // PL38 never offers a measurement reroll after abandonment.
          void finalizeProbe(assignment.researchAssignmentId, phase, finalResult);
        },
      });
      return true;
    } catch (error) {
      logger?.warn?.(`PL38 ${phase} probe start failed`, error);
      if (mounted && epoch === actionEpoch) setState({ errorCode: error?.code ?? "PRACTICE_RESEARCH_PROBE_UNAVAILABLE" });
      return false;
    }
  }

  async function treatmentHost(experimentId) {
    if (experimentId === "weak-keys") {
      const module = await import("./practiceWeakKeysSessionHost.js");
      return module.mountPracticeWeakKeysSession;
    }
    if (experimentId === "combination-repair") {
      const module = await import("./practiceCombinationRepairSessionHost.js");
      return module.mountPracticeCombinationRepairSession;
    }
    if (experimentId === "problem-words") {
      const module = await import("./practiceProblemWordsSessionHost.js");
      return module.mountPracticeProblemWordsSession;
    }
    if (experimentId === "weakness-boss") {
      const module = await import("./practiceWeaknessBossSessionHost.js");
      return module.mountPracticeWeaknessBossSession;
    }
    throw new TypeError(`Unsupported PL38 treatment host: ${experimentId}`);
  }

  async function finalizeTreatment(assignmentId, finalResult) {
    const activeRuntime = await ensureRuntime();
    try {
      await activeRuntime.completeTreatment(assignmentId, finalResult);
    } catch (error) {
      logger?.warn?.("PL38 randomized treatment finalization failed", error);
      try { await activeRuntime.abandonTreatment(assignmentId, "treatment-finalization-failed"); } catch {}
      if (mounted) setState({ errorCode: error?.code ?? "PRACTICE_RESEARCH_TREATMENT_FINALIZE_FAILED" });
    }
    if (mounted && isResearchRoute()) await load();
    else if (!mounted && ownsRuntime) activeRuntime.close?.();
  }

  async function startTreatment() {
    const assignment = state.activeAssignment;
    if (!assignment || host || !mounted || !isResearchRoute()) return false;
    const epoch = ++actionEpoch;
    setState({ errorCode: null });
    let prepared = null;
    try {
      const research = await ensureRuntime();
      prepared = await research.prepareTreatment(assignment.researchAssignmentId);
      if (!mounted || epoch !== actionEpoch || !isResearchRoute()) {
        await research.abandonTreatment(assignment.researchAssignmentId, "navigation-before-treatment-start");
        return false;
      }
      const mountHost = await treatmentHost(prepared.experimentId);
      detach();
      const finish = (finalResult) => {
        host = null;
        void finalizeTreatment(assignment.researchAssignmentId, finalResult);
      };
      host = await mountHost({
        root,
        session: prepared.session,
        logger,
        onExit: finish,
        // Randomized treatment is exactly one canonical dose. Existing treatment
        // result screens may expose a repeat control; in Research it closes the
        // assignment instead of starting a second randomized dose.
        onRepeat: finish,
      });
      return true;
    } catch (error) {
      logger?.warn?.("PL38 randomized treatment start failed", error);
      if (prepared) {
        try { await (await ensureRuntime()).abandonTreatment(assignment.researchAssignmentId, "treatment-start-failed"); } catch {}
      }
      if (mounted && epoch === actionEpoch) setState({ errorCode: error?.code ?? "PRACTICE_RESEARCH_TREATMENT_UNAVAILABLE" });
      return false;
    }
  }

  function goBack() {
    const value = base.back();
    queueMicrotask(afterRoute);
    return value;
  }

  function click(event) {
    if (!isResearchRoute() || host) return;
    const control = event.target?.closest?.("[data-research-action]");
    if (!control || !root?.contains?.(control)) return;
    const action = control.dataset.researchAction;
    event.preventDefault();
    event.stopPropagation();
    if (action === "back") { goBack(); return; }
    if (action === "reload") { void load({ focusSelector: "[data-research-action='reload']" }); return; }
    if (action === "enroll") { void mutate((research) => research.enroll(), { focusSelector: "[data-research-action='new-assignment']", errorCode: "PRACTICE_RESEARCH_ENROLL_FAILED" }); return; }
    if (action === "new-assignment") { void mutate((research) => research.createAssignment(), { focusSelector: "[data-research-action='start-baseline']", errorCode: "PRACTICE_RESEARCH_ASSIGNMENT_FAILED" }); return; }
    if (action === "start-baseline") { void startProbe("baseline"); return; }
    if (action === "start-followup") { void startProbe("followup"); return; }
    if (action === "start-treatment") { void startTreatment(); return; }
    if (action === "decline-treatment") {
      if (globalThis.confirm?.("Decline this revealed randomized assignment? It will not be rerolled or replaced today.") === false) return;
      void mutate((research) => research.declineTreatment(state.activeAssignment?.researchAssignmentId), { errorCode: "PRACTICE_RESEARCH_DECLINE_FAILED" });
      return;
    }
    if (action === "pause") { void mutate((research) => research.setEnrollmentStatus("paused"), { errorCode: "PRACTICE_RESEARCH_PAUSE_FAILED" }); return; }
    if (action === "resume") { void mutate((research) => research.setEnrollmentStatus("active"), { errorCode: "PRACTICE_RESEARCH_RESUME_FAILED" }); return; }
    if (action === "withdraw") {
      if (globalThis.confirm?.("Withdraw from this local research study? Future randomized assignments will stop, but existing research records remain unless separately deleted.") === false) return;
      void mutate((research) => research.setEnrollmentStatus("withdrawn"), { errorCode: "PRACTICE_RESEARCH_WITHDRAW_FAILED" });
      return;
    }
    if (action === "delete") {
      if (globalThis.confirm?.("Delete this enrollment and its local Research assignment/analysis records? Ordinary Practice sessions and evidence that actually occurred will remain.") === false) return;
      void mutate((research) => research.deleteEnrollment(), { errorCode: "PRACTICE_RESEARCH_DELETE_FAILED" });
    }
  }

  const afterRoute = () => {
    if (isResearchRoute()) {
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
      if (host) {
        void host.exit?.();
        return true;
      }
      return goBack();
    },
    getSnapshot() {
      const snapshot = base.getSnapshot();
      return Object.freeze({
        ...snapshot,
        research: Object.freeze({
          status: state.status,
          enrollmentStatus: state.enrollment?.status ?? null,
          assignmentCount: state.assignments?.length ?? 0,
          activeAssignmentId: state.activeAssignment?.researchAssignmentId ?? null,
          activeAssignmentStatus: state.activeAssignment?.status ?? null,
          sessionActive: Boolean(host),
          errorCode: state.errorCode ?? null,
        }),
      });
    },
    subscribe(listener) { return base.subscribe(listener); },
    unmount() {
      mounted = false;
      loadEpoch += 1;
      actionEpoch += 1;
      detach();
      const activeHost = host;
      host = null;
      if (activeHost) void activeHost.exit?.();
      else if (ownsRuntime) runtime?.close?.();
      runtime = options.researchRuntime ?? runtime;
      if (!activeHost && ownsRuntime) {
        runtime = null;
        runtimePromise = null;
      }
      return base.unmount();
    },
  });
}
