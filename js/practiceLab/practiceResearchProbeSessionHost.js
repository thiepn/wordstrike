import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";

const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);
const ACTION = "[data-research-probe-action]";
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

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

function renderText(contentPlan, snapshot) {
  const graphemes = Array.from(contentPlan.text);
  const cursor = snapshot.cursorIndex ?? 0;
  const errors = new Set(snapshot.errorPositions ?? []);
  return graphemes.map((value, index) => {
    const classes = ["practice-research-probe-char"];
    if (index < cursor) classes.push(errors.has(index) ? "is-error" : "is-typed");
    if (index === cursor) classes.push("is-current");
    const shown = value === " " ? "&nbsp;" : value === "\n" ? "<br>" : escapeHtml(value);
    return `<span class="${classes.join(" ")}">${shown}</span>`;
  }).join("");
}

export function renderPracticeResearchProbeSnapshot(root, { contentPlan, snapshot, phase }) {
  const expected = snapshot.content?.expectedLength ?? Array.from(contentPlan.text).length;
  const progress = expected > 0 ? Math.min(100, ((snapshot.cursorIndex ?? 0) / expected) * 100) : 0;
  const paused = snapshot.lifecycleState === "paused";
  const label = phase === "followup" ? "Follow-up measurement" : "Baseline measurement";
  root.innerHTML = `<section class="screen practice-lab-screen practice-research-probe" data-practice-view="research-probe-session">
    <div class="practice-lab-shell">
      <header class="practice-research-probe-header">
        <div><div class="eyebrow">Practice Research</div><h1>${label}</h1></div>
        <div class="practice-research-probe-actions">
          <button type="button" data-research-probe-action="${paused ? "resume" : "pause"}">${paused ? "RESUME" : "PAUSE"}</button>
          <button type="button" data-research-probe-action="exit">EXIT</button>
        </div>
      </header>
      <div class="practice-lab-notice" role="note">Type naturally. No live WPM, aggregate accuracy, target highlighting, cadence cue, or treatment feedback is shown during this measurement.</div>
      <div class="practice-research-probe-progress" aria-label="Measurement progress"><span style="width:${progress.toFixed(2)}%"></span></div>
      <div class="practice-research-probe-progress-label">${Math.round(progress)}% complete</div>
      <section class="practice-research-probe-typing" aria-label="Research typing passage" data-session-paused="${paused ? "true" : "false"}">${renderText(contentPlan, snapshot)}</section>
      ${paused ? '<div class="practice-lab-notice" role="status"><strong>Paused.</strong> Paused time is excluded from active typing time.</div>' : ""}
      <textarea data-research-probe-input aria-label="Research typing input" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea>
    </div>
  </section>`;
}

function renderFailure(root, error) {
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="research-probe-error"><div class="practice-lab-shell"><main class="practice-lab-detail"><div class="eyebrow">Practice Research</div><h1>Measurement could not start</h1><div class="practice-lab-notice" role="alert"><strong>${escapeHtml(error?.code ?? "RESEARCH_PROBE_ERROR")}</strong><p>${escapeHtml(error?.message ?? "The research measurement could not be initialized.")}</p></div><button type="button" data-research-probe-action="exit">BACK TO RESEARCH</button></main></div></section>`;
}

export async function mountPracticeResearchProbeSession({
  root,
  session,
  onComplete = () => {},
  onExit = () => {},
  logger = null,
  dependencies = {},
} = {}) {
  if (!root?.addEventListener || !root?.removeEventListener) throw new TypeError("Research probe host requires a DOM root");
  if (!session?.experiment || !session?.contentPlan || !session?.researchProbePlan) throw new TypeError("Research probe host requires a prepared probe session");
  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore();
  const manifestStore = dependencies.manifestStore ?? createPracticeManifestStore();
  const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore });
  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  const engineFactory = dependencies.engineFactory ?? createPracticeSessionEngine;
  const engine = engineFactory({
    repository,
    sessionId: session.sessionId,
    profileId: initialized.profile.profileId,
    contextId: initialized.context.contextId,
    logger,
  });
  let closed = false;
  let finalResult = null;
  let unsubscribe = null;
  const focusCapture = () => queueMicrotask(() => root.querySelector?.("[data-research-probe-input]")?.focus?.({ preventScroll: true }));

  const cleanup = async () => {
    unsubscribe?.();
    root.removeEventListener("beforeinput", beforeInput);
    root.removeEventListener("keydown", keyDown);
    root.removeEventListener("click", click);
    root.removeEventListener("pointerdown", pointerDown);
    globalThis.document?.removeEventListener?.("visibilitychange", visibilityChange);
    try { await engine.destroy(); } catch (error) { logger?.warn?.("Research probe engine destroy failed", error); }
    try { dataStore.close?.(); } catch {}
  };

  const finish = async (callback) => {
    if (closed) return;
    closed = true;
    await cleanup();
    callback(finalResult);
  };

  const renderSnapshot = (snapshot) => {
    if (closed || finalResult) return;
    renderPracticeResearchProbeSnapshot(root, { contentPlan: session.contentPlan, snapshot, phase: session.researchProbePlan.phase });
    if (snapshot.lifecycleState === "active") focusCapture();
  };

  const handleNormalized = (input) => {
    const outcome = engine.handleInput(input);
    if (!outcome.accepted && outcome.reason === "invalid-input") logger?.warn?.("Research probe rejected normalized input", outcome.errors);
  };

  const beforeInput = (event) => {
    if (closed || finalResult) return;
    const capture = event.target?.closest?.("[data-research-probe-input]");
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
    const control = event.target?.closest?.(ACTION);
    if (!control || !root.contains?.(control)) return;
    const action = control.dataset.researchProbeAction;
    if (action === "pause") void engine.pause("manual");
    else if (action === "resume") void engine.resume();
    else if (action === "exit") {
      void engine.abandon("manual-stop").catch((error) => logger?.warn?.("Research probe abandonment failed", error)).finally(() => finish(onExit));
    }
  };
  const pointerDown = () => { if (engine.getSnapshot().lifecycleState === "active") focusCapture(); };
  const visibilityChange = () => {
    const state = globalThis.document?.visibilityState;
    if (state === "hidden" || state === "visible") void engine.handleVisibilityState(state).catch((error) => logger?.warn?.("Research probe visibility transition failed", error));
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
          return finish(onComplete);
        }).catch((error) => {
          logger?.warn?.("Research probe completion failed", error);
          renderFailure(root, error);
        });
        return;
      }
      renderSnapshot(snapshot);
    });
    renderSnapshot(await engine.start());
  } catch (error) {
    logger?.warn?.("Research probe initialization failed", error);
    renderFailure(root, error);
  }

  return Object.freeze({ getSnapshot: () => engine.getSnapshot(), exit: () => finish(onExit) });
}
