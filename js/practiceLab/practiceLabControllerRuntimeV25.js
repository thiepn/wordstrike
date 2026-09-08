import { createPracticeLabController as createPracticeLabControllerV24 } from "./practiceLabControllerRuntimeV24.js";
import { renderPracticeLabV25 } from "./practiceLabRendererV25.js";
import { buildPracticeCoachViewModel, createDefaultPracticeCoachUiState, normalizePracticeCoachUiState } from "./practiceCoachUi.js";
import { createPracticeCoachService } from "./practiceCoachService.js";
import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeLabRoute, PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const DAILY_ROUTE = PRACTICE_LAB_ROUTES.DAILY_TRAINING;
const TERMINAL_PLAN_STATUSES = new Set(["finished", "abandoned", "expired"]);

export function createPracticeLabController(options = {}) {
  const {
    root,
    experimentRegistry,
    logger = null,
    coachService: injectedCoachService = null,
    coachRepository: injectedCoachRepository = null,
    coachInitialized: injectedCoachInitialized = null,
    coachDataStore: injectedCoachDataStore = null,
    coachManifestStore: injectedCoachManifestStore = null,
    coachRuntimeProvider = null,
    coachGetAssessmentAvailability = null,
    coachGetAssessmentState = null,
    coachGetColdTransferAvailability = null,
    coachGetRecentColdTransferAt = null,
  } = options;
  const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
  let base = null;
  let mounted = false;
  let coachState = createDefaultPracticeCoachUiState();
  let coachRuntimePromise = null;
  let ownedCoachDataStore = null;
  let coachSessionHost = null;
  let loadEpoch = 0;
  let actionEpoch = 0;
  let loadScheduled = false;

  const isDailyRoute = () => base?.getSnapshot?.()?.route?.name === DAILY_ROUTE;
  const hasCoachSession = () => Boolean(coachSessionHost);

  const renderCoach = (focusSelector = null) => {
    if (!mounted || !isDailyRoute() || hasCoachSession()) return false;
    const view = buildPracticeCoachViewModel({ state: coachState, preview: true });
    return externalRenderer
      ? externalRenderer(root, view, { focusSelector })
      : renderPracticeLabV25(root, view, { focusSelector });
  };

  const setCoachState = (patch, focusSelector = null) => {
    coachState = normalizePracticeCoachUiState({ ...coachState, ...patch });
    renderCoach(focusSelector);
  };

  const scheduleDailyLoad = () => {
    if (loadScheduled || !mounted || !isDailyRoute() || hasCoachSession()) return;
    if (!["idle", "error"].includes(coachState.status)) return;
    loadScheduled = true;
    queueMicrotask(() => {
      loadScheduled = false;
      void loadTodayPlan();
    });
  };

  function renderer(renderRoot, view, rendererOptions = {}) {
    if (isDailyRoute()) {
      const coachView = buildPracticeCoachViewModel({ state: coachState, preview: true });
      const rendered = externalRenderer
        ? externalRenderer(renderRoot, coachView, rendererOptions)
        : renderPracticeLabV25(renderRoot, coachView, rendererOptions);
      scheduleDailyLoad();
      return rendered;
    }
    return externalRenderer
      ? externalRenderer(renderRoot, view, rendererOptions)
      : renderPracticeLabV25(renderRoot, view, rendererOptions);
  }

  base = createPracticeLabControllerV24({ ...options, renderer });

  const ensureCoachRuntime = async () => {
    if (coachRuntimePromise) return coachRuntimePromise;
    coachRuntimePromise = (async () => {
      if (typeof coachRuntimeProvider === "function") {
        const provided = await coachRuntimeProvider({ experimentRegistry });
        if (!provided?.service || !provided?.initialized?.profile || !provided?.initialized?.context) throw new TypeError("Coach runtime provider returned an incomplete runtime");
        return provided;
      }
      const dataStore = injectedCoachDataStore ?? createPracticeIndexedDbStore();
      if (!injectedCoachDataStore) ownedCoachDataStore = dataStore;
      const manifestStore = injectedCoachManifestStore ?? createPracticeManifestStore();
      const repository = injectedCoachRepository ?? createPracticeRepository({ dataStore, manifestStore });
      const initialized = injectedCoachInitialized ?? await repository.initializePracticeStorage();
      const service = injectedCoachService ?? createPracticeCoachService({
        repository,
        experimentRegistry,
        getAssessmentAvailability: coachGetAssessmentAvailability,
        getAssessmentState: coachGetAssessmentState,
        getColdTransferAvailability: coachGetColdTransferAvailability,
        getRecentColdTransferAt: coachGetRecentColdTransferAt,
      });
      return Object.freeze({ service, repository, initialized, dataStore });
    })().catch((error) => {
      coachRuntimePromise = null;
      throw error;
    });
    return coachRuntimePromise;
  };

  async function loadTodayPlan({ reconcile = true } = {}) {
    if (!mounted || !isDailyRoute() || hasCoachSession()) return false;
    const epoch = ++loadEpoch;
    setCoachState({ status: "loading", errorCode: null, startingBlockId: null });
    try {
      const runtime = await ensureCoachRuntime();
      let plan = await runtime.service.getTodayPracticeCoachPlan(runtime.initialized.profile.profileId, runtime.initialized.context.contextId);
      if (plan && reconcile && !TERMINAL_PLAN_STATUSES.has(plan.status)) plan = await runtime.service.reconcilePracticeCoachPlan({ coachPlanId: plan.coachPlanId });
      if (!mounted || epoch !== loadEpoch || !isDailyRoute() || hasCoachSession()) return false;
      let requestedMinutes = coachState.requestedMinutes;
      if (!plan) {
        try { requestedMinutes = runtime.repository?.getPracticeSettings?.()?.dailySessionLengthMinutes ?? requestedMinutes; } catch {}
      }
      setCoachState({ status: "ready", plan, requestedMinutes, errorCode: null, startingBlockId: null }, "[data-practice-heading]");
      return true;
    } catch (error) {
      if (!mounted || epoch !== loadEpoch) return false;
      logger?.warn?.("Daily Coach load failed", error);
      setCoachState({ status: "error", errorCode: error?.code ?? "PRACTICE_COACH_UNAVAILABLE", startingBlockId: null });
      return false;
    }
  }

  async function createTodayPlan() {
    if (!mounted || !isDailyRoute() || coachState.plan || coachState.status === "creating") return false;
    const epoch = ++actionEpoch;
    setCoachState({ status: "creating", errorCode: null });
    try {
      const runtime = await ensureCoachRuntime();
      const created = await runtime.service.createTodayPracticeCoachPlan({
        profileId: runtime.initialized.profile.profileId,
        contextId: runtime.initialized.context.contextId,
        requestedMinutes: coachState.requestedMinutes,
        language: runtime.initialized.context.dataLocale,
      });
      if (!mounted || epoch !== actionEpoch || !isDailyRoute()) return false;
      setCoachState({ status: "ready", plan: created.plan, requestedMinutes: created.plan.requestedMinutes, errorCode: null });
      return true;
    } catch (error) {
      if (!mounted || epoch !== actionEpoch) return false;
      logger?.warn?.("Daily Coach plan creation failed", error);
      setCoachState({ status: "error", errorCode: error?.code ?? "PRACTICE_COACH_PLAN_FAILED" });
      return false;
    }
  }

  const onCoachChildExit = () => {
    coachSessionHost = null;
    if (!mounted || !isDailyRoute()) return;
    coachState = normalizePracticeCoachUiState({ ...coachState, status: "loading", startingBlockId: null, errorCode: null });
    renderCoach();
    void loadTodayPlan({ reconcile: true });
  };

  async function mountCoachChild(started) {
    const session = started.session;
    const common = { root, session, logger, onExit: onCoachChildExit };
    if (started.block.kind === "review") {
      const { mountPracticeCoachReviewSession } = await import("./practiceCoachReviewSessionHost.js");
      return mountPracticeCoachReviewSession(common);
    }
    if (started.block.experimentId === "weak-keys") {
      const { mountPracticeWeakKeysSession } = await import("./practiceWeakKeysSessionHost.js");
      return mountPracticeWeakKeysSession({ ...common, onRepeat: onCoachChildExit });
    }
    if (started.block.experimentId === "combination-repair") {
      const [{ mountPracticeCombinationRepairSession }, { createPracticeSessionEngine }] = await Promise.all([
        import("./practiceCombinationRepairSessionHost.js"),
        import("./practiceSessionEngine.js"),
      ]);
      return mountPracticeCombinationRepairSession({
        ...common,
        dependencies: {
          engineFactory(engineOptions) {
            return createPracticeSessionEngine({ ...engineOptions, sessionId: session.sessionId });
          },
        },
      });
    }
    if (started.block.experimentId === "problem-words") {
      const { mountPracticeProblemWordsSession } = await import("./practiceProblemWordsSessionHost.js");
      return mountPracticeProblemWordsSession({ ...common, onRepeat: onCoachChildExit });
    }
    if (started.block.experimentId === "accuracy-control") {
      const { mountPracticeAccuracyRecoverySession } = await import("./practiceAccuracyRecoverySessionHost.js");
      return mountPracticeAccuracyRecoverySession({ ...common, onRepeat: onCoachChildExit });
    }
    if (started.block.experimentId === "real-text") {
      const { mountPracticeRealTextSession } = await import("./practiceRealTextSessionHost.js");
      return mountPracticeRealTextSession({ ...common, mode: "natural" });
    }
    throw Object.assign(new Error("Daily Coach child host is unavailable"), { code: "PRACTICE_COACH_CHILD_HOST_UNAVAILABLE" });
  }

  async function startNextBlock() {
    const plan = coachState.plan;
    if (!mounted || !isDailyRoute() || !plan || hasCoachSession()) return false;
    const next = plan.blocks.find((block) => block.status === "pending");
    if (!next) return false;
    const epoch = ++actionEpoch;
    setCoachState({ status: "starting", startingBlockId: next.blockId, errorCode: null });
    try {
      const runtime = await ensureCoachRuntime();
      const started = await runtime.service.startPracticeCoachBlock({ coachPlanId: plan.coachPlanId, blockId: next.blockId });
      if (!mounted || epoch !== actionEpoch || !isDailyRoute()) return false;
      if (!started.started) {
        setCoachState({ status: "ready", plan: started.plan, startingBlockId: null, errorCode: started.reason ?? null });
        return false;
      }
      coachState = normalizePracticeCoachUiState({ ...coachState, status: "ready", plan: started.plan, startingBlockId: null, errorCode: null });
      coachSessionHost = await mountCoachChild(started);
      return true;
    } catch (error) {
      if (!mounted || epoch !== actionEpoch) return false;
      logger?.warn?.("Daily Coach child start failed", error);
      setCoachState({ status: "error", startingBlockId: null, errorCode: error?.code ?? "PRACTICE_COACH_BLOCK_START_FAILED" });
      try { await loadTodayPlan({ reconcile: true }); } catch {}
      return false;
    }
  }

  async function skipBlock(blockId) {
    const plan = coachState.plan;
    if (!plan || hasCoachSession()) return false;
    const next = plan.blocks.find((block) => block.status === "pending");
    if (!next || next.blockId !== blockId) return false;
    const epoch = ++actionEpoch;
    try {
      const runtime = await ensureCoachRuntime();
      const result = await runtime.service.skipPracticeCoachBlock({ coachPlanId: plan.coachPlanId, blockId });
      if (!mounted || epoch !== actionEpoch) return false;
      setCoachState({ status: "ready", plan: result.plan, errorCode: result.updated ? null : result.reason });
      return Boolean(result.updated);
    } catch (error) {
      if (epoch === actionEpoch) setCoachState({ status: "error", errorCode: error?.code ?? "PRACTICE_COACH_SKIP_FAILED" });
      return false;
    }
  }

  async function endForToday() {
    const plan = coachState.plan;
    if (!plan || hasCoachSession()) return false;
    const epoch = ++actionEpoch;
    try {
      const runtime = await ensureCoachRuntime();
      const next = await runtime.service.abandonPracticeCoachPlan({ coachPlanId: plan.coachPlanId });
      if (!mounted || epoch !== actionEpoch) return false;
      setCoachState({ status: "ready", plan: next, errorCode: null });
      return true;
    } catch (error) {
      if (epoch === actionEpoch) setCoachState({ status: "error", errorCode: error?.code ?? "PRACTICE_COACH_END_FAILED" });
      return false;
    }
  }

  function click(event) {
    if (!mounted || hasCoachSession()) return;
    const button = event.target?.closest?.("[data-practice-action]");
    if (!button || !root?.contains?.(button) || button.disabled || button.getAttribute?.("aria-disabled") === "true") return;
    const action = button.dataset.practiceAction;
    if (!["open-daily-training", "set-coach-duration", "create-coach-plan", "start-coach-next", "skip-coach-block", "abandon-coach-plan", "open-coach-assessment", "open-coach-cold-transfer"].includes(action)) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (action === "open-daily-training") {
      base.navigate(createPracticeLabRoute(DAILY_ROUTE));
      return;
    }
    if (!isDailyRoute()) return;
    if (action === "set-coach-duration" && !coachState.plan) setCoachState({ requestedMinutes: Number(button.dataset.coachMinutes), errorCode: null }, `[data-coach-minutes="${button.dataset.coachMinutes}"]`);
    else if (action === "create-coach-plan") void createTodayPlan();
    else if (action === "start-coach-next") void startNextBlock();
    else if (action === "skip-coach-block") void skipBlock(button.dataset.coachBlockId);
    else if (action === "abandon-coach-plan") void endForToday();
    else if (action === "open-coach-assessment") base.navigate(createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "full-assessment" }));
    else if (action === "open-coach-cold-transfer") base.navigate(createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "real-text" }));
  }

  const routeAfterNavigation = () => {
    if (isDailyRoute()) {
      if (coachState.status === "idle" || coachState.status === "error") scheduleDailyLoad();
    }
  };

  return Object.freeze({
    mount(route) {
      mounted = true;
      const value = base.mount(route);
      root?.addEventListener?.("click", click, true);
      queueMicrotask(routeAfterNavigation);
      return value;
    },
    navigate(...args) {
      const value = base.navigate(...args);
      queueMicrotask(routeAfterNavigation);
      return value;
    },
    back() {
      if (coachSessionHost) {
        void coachSessionHost.exit();
        return true;
      }
      const value = base.back();
      queueMicrotask(routeAfterNavigation);
      return value;
    },
    getSnapshot() {
      const snapshot = base.getSnapshot();
      return Object.freeze({
        ...snapshot,
        dailyCoach: Object.freeze({
          status: coachState.status,
          requestedMinutes: coachState.requestedMinutes,
          coachPlanId: coachState.plan?.coachPlanId ?? null,
          planStatus: coachState.plan?.status ?? null,
          blockCount: coachState.plan?.blocks?.length ?? 0,
          sessionActive: Boolean(coachSessionHost),
        }),
      });
    },
    subscribe(listener) { return base.subscribe(listener); },
    unmount() {
      mounted = false;
      loadEpoch += 1;
      actionEpoch += 1;
      root?.removeEventListener?.("click", click, true);
      if (coachSessionHost) {
        void coachSessionHost.exit();
        coachSessionHost = null;
      }
      try { ownedCoachDataStore?.close?.(); } catch {}
      ownedCoachDataStore = null;
      coachRuntimePromise = null;
      coachState = createDefaultPracticeCoachUiState();
      return base.unmount();
    },
  });
}
