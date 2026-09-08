import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";

const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);
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
    const classes = ["practice-weak-key-char"];
    if (index < cursor) classes.push(errors.has(index) ? "is-error" : "is-typed");
    if (index === cursor) classes.push("is-current");
    const shown = value === " " ? "&nbsp;" : value === "\n" ? "<br>" : escapeHtml(value);
    return `<span class="${classes.join(" ")}">${shown}</span>`;
  }).join("");
}

function renderSnapshot(root, session, snapshot) {
  const total = snapshot.content?.expectedLength ?? Array.from(session.contentPlan.text).length;
  const progress = total > 0 ? Math.min(100, ((snapshot.cursorIndex ?? 0) / total) * 100) : 0;
  const paused = snapshot.lifecycleState === "paused";
  const itemCount = session.reviewPlan?.bindings?.length ?? 0;
  root.innerHTML = `<section class="screen practice-lab-screen practice-coach-review-session" data-practice-view="coach-review-session"><div class="practice-lab-shell">
    <header class="practice-weak-key-session-header"><div><div class="eyebrow">Daily Training · Review</div><h1>Retention Review</h1><p>${itemCount} due item${itemCount === 1 ? "" : "s"} · cues off</p></div><div class="practice-weak-key-session-actions"><button type="button" data-coach-review-action="${paused ? "resume" : "pause"}">${paused ? "RESUME" : "PAUSE"}</button><button type="button" data-coach-review-action="abandon">EXIT SESSION</button></div></header>
    <div class="practice-lab-notice" role="note">Type naturally. This block is a delayed verification/maintenance probe; no acquisition repetitions are appended afterward.</div>
    <div class="practice-weak-key-progress" aria-label="Review progress"><span style="width:${progress.toFixed(2)}%"></span></div><div class="practice-weak-key-progress-label">${Math.round(progress)}% complete</div>
    <section class="practice-weak-key-typing" aria-label="Daily Coach review text" data-session-paused="${paused ? "true" : "false"}">${renderText(session.contentPlan, snapshot)}</section>
    ${paused ? '<div class="practice-lab-notice" role="status"><strong>Paused.</strong> Resume to continue.</div>' : ""}
    <textarea data-coach-review-input aria-label="Retention Review typing input" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea>
  </div></section>`;
}

function renderResult(root, result) {
  const summary = result?.summary ?? null;
  const retention = summary?.retentionReviewSummary ?? null;
  const measured = retention?.measuredCount ?? retention?.verificationCount ?? null;
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="coach-review-result"><div class="practice-lab-shell"><main class="practice-lab-detail">
    <div class="eyebrow">Daily Training · Review complete</div><h1>Review complete</h1><p class="practice-lab-lead">The delayed review probe is finished.</p>
    <section class="practice-lab-empty-state"><h2>Retention evidence</h2><p>${Number.isFinite(measured) ? `${measured} review measurement${measured === 1 ? "" : "s"} were retained.` : "Eligible review evidence was committed through the PL17 retention model."}</p><p>No acquisition dose was added by this review block.</p></section>
    <button type="button" data-coach-review-action="finish">BACK TO DAILY TRAINING</button>
  </main></div></section>`;
}

function renderFailure(root, error) {
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="coach-review-error"><div class="practice-lab-shell"><main class="practice-lab-detail"><div class="eyebrow">Daily Training · Review</div><h1>Review could not start</h1><div class="practice-lab-notice" role="alert"><strong>${escapeHtml(error?.code ?? "SESSION_ERROR")}</strong><p>${escapeHtml(error?.message ?? "The review session could not be initialized.")}</p></div><button type="button" data-coach-review-action="finish">BACK TO DAILY TRAINING</button></main></div></section>`;
}

export async function mountPracticeCoachReviewSession({
  root,
  session,
  onExit = () => {},
  logger = null,
  dependencies = {},
} = {}) {
  if (!root?.addEventListener || !root?.removeEventListener) throw new TypeError("Coach Review session host requires a DOM root");
  if (!session?.experiment || !session?.contentPlan || !session?.reviewPlan) throw new TypeError("Coach Review session host requires a prepared review session");
  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore();
  const manifestStore = dependencies.manifestStore ?? createPracticeManifestStore();
  const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore });
  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  const engineFactory = dependencies.engineFactory ?? createPracticeSessionEngine;
  const engine = engineFactory({ repository, sessionId: session.sessionId, profileId: initialized.profile.profileId, contextId: initialized.context.contextId, logger });
  let finalResult = null;
  let closed = false;
  let unsubscribe = null;
  const focusCapture = () => queueMicrotask(() => root.querySelector?.("[data-coach-review-input]")?.focus?.({ preventScroll: true }));
  const finish = async () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    root.removeEventListener("beforeinput", beforeInput);
    root.removeEventListener("keydown", keyDown);
    root.removeEventListener("click", click);
    root.removeEventListener("pointerdown", pointerDown);
    globalThis.document?.removeEventListener?.("visibilitychange", visibilityChange);
    try { await engine.destroy(); } catch (error) { logger?.warn?.("Coach Review engine destroy failed", error); }
    try { if (!dependencies.dataStore) dataStore.close?.(); } catch {}
    onExit(finalResult);
  };
  const handle = (input) => {
    const outcome = engine.handleInput(input);
    if (!outcome.accepted && outcome.reason === "invalid-input") logger?.warn?.("Coach Review rejected normalized input", outcome.errors);
  };
  function beforeInput(event) {
    if (closed || finalResult) return;
    const capture = event.target?.closest?.("[data-coach-review-input]");
    if (!capture || !root.contains?.(capture)) return;
    event.preventDefault();
    if (INSERT_TYPES.has(event.inputType) && typeof event.data === "string" && event.data.length) {
      for (const value of Array.from(event.data.normalize("NFC"))) handle(normalizedInput(value === " " ? "space" : "character", value));
    } else if (event.inputType === "deleteContentBackward") handle(normalizedInput("backspace", ""));
    else if (event.inputType === "deleteWordBackward") handle(normalizedInput("word-delete", ""));
    capture.value = "";
  }
  function keyDown(event) {
    if (closed || finalResult) return;
    if ((event.ctrlKey || event.metaKey) && ["v", "x"].includes(String(event.key).toLowerCase())) event.preventDefault();
    if (event.key === "Escape") {
      event.preventDefault();
      const state = engine.getSnapshot().lifecycleState;
      void (state === "paused" ? engine.resume() : state === "active" ? engine.pause("manual") : Promise.resolve());
    }
  }
  function click(event) {
    const button = event.target?.closest?.("[data-coach-review-action]");
    if (!button || !root.contains?.(button)) return;
    const action = button.dataset.coachReviewAction;
    if (action === "pause") void engine.pause("manual");
    else if (action === "resume") void engine.resume();
    else if (action === "abandon") void engine.abandon("manual-stop").then(finish).catch(() => finish());
    else if (action === "finish") void finish();
  }
  const pointerDown = () => { if (engine.getSnapshot().lifecycleState === "active") focusCapture(); };
  const visibilityChange = () => {
    const state = globalThis.document?.visibilityState;
    if (state === "hidden" || state === "visible") void engine.handleVisibilityState(state).catch((error) => logger?.warn?.("Coach Review visibility transition failed", error));
  };
  root.addEventListener("beforeinput", beforeInput);
  root.addEventListener("keydown", keyDown);
  root.addEventListener("click", click);
  root.addEventListener("pointerdown", pointerDown);
  globalThis.document?.addEventListener?.("visibilitychange", visibilityChange);
  try {
    await engine.prepare({ experiment: session.experiment, configuration: session.configuration, contentPlan: session.contentPlan, reviewPlan: session.reviewPlan });
    unsubscribe = engine.subscribe((snapshot, event) => {
      if (event === "completed") {
        void engine.complete().then((result) => { finalResult = result; renderResult(root, result); }).catch((error) => { logger?.warn?.("Coach Review result retrieval failed", error); renderFailure(root, error); });
        return;
      }
      renderSnapshot(root, session, snapshot);
      if (snapshot.lifecycleState === "active") focusCapture();
    });
    const snapshot = await engine.start();
    renderSnapshot(root, session, snapshot);
    focusCapture();
  } catch (error) {
    logger?.warn?.("Coach Review session initialization failed", error);
    renderFailure(root, error);
  }
  return Object.freeze({ getSnapshot: () => engine.getSnapshot(), exit: finish });
}
