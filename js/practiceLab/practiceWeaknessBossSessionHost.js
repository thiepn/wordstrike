import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";
import { assertPracticeWeaknessBossSessionContext } from "./practiceWeaknessBossTrust.js";
import { createPracticeWeaknessBossGameplayState, advancePracticeWeaknessBossOpportunity } from "./practiceWeaknessBossGameplay.js";
import { getPracticeWeaknessBossPhase, renderPracticeWeaknessBossBattle, renderPracticeWeaknessBossResult } from "./practiceWeaknessBossUi.js";

const ACTION_SELECTOR = "[data-weakness-boss-session-action]";
const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);

function normalizedInput(type, value, source = "browser-input") {
  return {
    type,
    value,
    source,
    monotonicTimestampMs: Math.max(0, globalThis.performance?.now?.() ?? Date.now()),
    wallTimestampUtc: new Date().toISOString(),
    modifiers: { ctrl: false, meta: false, alt: false, shift: false },
  };
}

function phaseForPosition(contentPlan, position) {
  return (contentPlan?.metadata?.weaknessBoss?.phaseRanges ?? []).find((phase) => position >= phase.startIndex && position < phase.endIndex) ?? null;
}

function targetPositionSet(contentPlan) {
  return new Set((contentPlan?.metadata?.weaknessBoss?.phaseRanges ?? []).flatMap((phase) => phase.targetPositions ?? []));
}

function renderFailure(root, error) {
  const code = String(error?.code ?? "SESSION_ERROR").replace(/[&<>'"]/g, "");
  const message = String(error?.message ?? "The Weakness Boss session could not be initialized.").replace(/[&<>'"]/g, "");
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="weakness-boss-session-error"><div class="practice-lab-shell"><main class="practice-lab-detail"><div class="eyebrow">Weakness Boss</div><h1>Encounter could not start</h1><div class="practice-lab-notice" role="alert"><strong>${code}</strong><p>${message}</p></div><button type="button" data-weakness-boss-session-action="finish">BACK</button></main></div></section>`;
}

export async function mountPracticeWeaknessBossSession({
  root,
  session,
  onExit = () => {},
  onRepeat = () => {},
  logger = null,
  dependencies = {},
} = {}) {
  if (!root?.addEventListener || !root?.removeEventListener) throw new TypeError("Weakness Boss session host requires a DOM root");
  if (!session?.experiment || !session?.contentPlan || !session?.weaknessBossPlan) throw new TypeError("Weakness Boss session host requires a prepared encounter");

  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore();
  const manifestStore = dependencies.manifestStore ?? createPracticeManifestStore();
  const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore });
  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  assertPracticeWeaknessBossSessionContext(session.weaknessBossPlan, initialized.context);
  const engineFactory = dependencies.engineFactory ?? createPracticeSessionEngine;
  const engine = engineFactory({
    repository,
    sessionId: session.weaknessBossPlan.sessionId,
    profileId: initialized.profile.profileId,
    contextId: initialized.context.contextId,
    logger,
  });

  let gameplay = createPracticeWeaknessBossGameplayState({ entityType: session.weaknessBossPlan.target.entityType });
  const targetPositions = targetPositionSet(session.contentPlan);
  const attemptedTargetPositions = new Set();
  let finalResult = null;
  let closed = false;
  let unsubscribe = null;

  const focusCapture = () => queueMicrotask(() => root.querySelector?.("[data-weakness-boss-input]")?.focus?.({ preventScroll: true }));
  const renderSnapshot = (snapshot) => {
    if (closed || finalResult) return;
    renderPracticeWeaknessBossBattle(root, { session, snapshot, gameplay });
    if (snapshot.lifecycleState === "active") focusCapture();
  };

  const finish = async (repeat = false) => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    root.removeEventListener("beforeinput", beforeInput);
    root.removeEventListener("keydown", keyDown);
    root.removeEventListener("click", click);
    root.removeEventListener("pointerdown", pointerDown);
    globalThis.document?.removeEventListener?.("visibilitychange", visibilityChange);
    try { await engine.destroy(); } catch (error) { logger?.warn?.("Weakness Boss engine destroy failed", error); }
    try { dataStore.close?.(); } catch {}
    if (repeat) onRepeat(finalResult);
    else onExit(finalResult);
  };

  const handleNormalized = (input) => {
    const outcome = engine.handleInput(input);
    if (outcome?.accepted && Number.isInteger(outcome.position) && targetPositions.has(outcome.position) && !attemptedTargetPositions.has(outcome.position)) {
      attemptedTargetPositions.add(outcome.position);
      const phase = phaseForPosition(session.contentPlan, outcome.position);
      if (phase) gameplay = advancePracticeWeaknessBossOpportunity(gameplay, {
        phaseId: phase.id,
        hitState: outcome.correctness === "correct" ? "clean-hit" : "unresolved-hit",
        targetOpportunity: true,
      });
    }
    if (!outcome?.accepted && outcome?.reason === "invalid-input") logger?.warn?.("Weakness Boss rejected normalized input", outcome.errors);
    return outcome;
  };

  const beforeInput = (event) => {
    if (closed || finalResult) return;
    const capture = event.target?.closest?.("[data-weakness-boss-input]");
    if (!capture || !root.contains?.(capture)) return;
    event.preventDefault();
    if (INSERT_TYPES.has(event.inputType) && typeof event.data === "string" && event.data.length) {
      for (const value of Array.from(event.data.normalize("NFC"))) handleNormalized(normalizedInput(value === " " ? "space" : "character", value));
    } else if (event.inputType === "deleteContentBackward") handleNormalized(normalizedInput("backspace", ""));
    else if (event.inputType === "deleteWordBackward") handleNormalized(normalizedInput("word-delete", ""));
    capture.value = "";
  };

  const keyDown = (event) => {
    if (closed || finalResult) return;
    if ((event.ctrlKey || event.metaKey) && ["v", "x"].includes(String(event.key).toLowerCase())) event.preventDefault();
    if (event.key === "Escape") {
      event.preventDefault();
      const state = engine.getSnapshot().lifecycleState;
      void (state === "paused" ? engine.resume() : state === "active" ? engine.pause("manual") : Promise.resolve());
    }
  };

  const click = (event) => {
    const target = event.target?.closest?.(ACTION_SELECTOR);
    if (!target || !root.contains?.(target)) return;
    const action = target.dataset.weaknessBossSessionAction;
    if (action === "pause") void engine.pause("manual");
    else if (action === "resume") void engine.resume();
    else if (action === "abandon") void engine.abandon("manual-stop").then(() => finish(false)).catch((error) => { logger?.warn?.("Weakness Boss abandon failed", error); void finish(false); });
    else if (action === "repeat") void finish(true);
    else if (action === "finish") void finish(false);
  };
  const pointerDown = () => { if (engine.getSnapshot().lifecycleState === "active") focusCapture(); };
  const visibilityChange = () => {
    const state = globalThis.document?.visibilityState;
    if (state === "hidden" || state === "visible") void engine.handleVisibilityState(state).catch((error) => logger?.warn?.("Weakness Boss visibility transition failed", error));
  };

  root.addEventListener("beforeinput", beforeInput);
  root.addEventListener("keydown", keyDown);
  root.addEventListener("click", click);
  root.addEventListener("pointerdown", pointerDown);
  globalThis.document?.addEventListener?.("visibilitychange", visibilityChange);

  try {
    await engine.prepare({ experiment: session.experiment, configuration: session.configuration, contentPlan: session.contentPlan });
    unsubscribe = engine.subscribe((snapshot, event) => {
      if (event === "completed") {
        void engine.complete().then((result) => {
          finalResult = result;
          renderPracticeWeaknessBossResult(root, result);
        }).catch((error) => { logger?.warn?.("Weakness Boss result retrieval failed", error); renderFailure(root, error); });
        return;
      }
      renderSnapshot(snapshot);
    });
    const snapshot = await engine.start();
    renderSnapshot(snapshot);
  } catch (error) {
    logger?.warn?.("Weakness Boss session initialization failed", error);
    renderFailure(root, error);
  }

  return Object.freeze({
    getSnapshot: () => engine.getSnapshot(),
    getGameplay: () => gameplay,
    stop: () => engine.abandon("manual-stop").then(() => finish(false)),
    exit: () => finish(false),
  });
}
