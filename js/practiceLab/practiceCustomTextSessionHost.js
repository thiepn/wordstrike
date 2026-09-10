import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";
import { splitGraphemes } from "./practiceTextSegmentation.js";
import { getPracticeCustomTextRenderWindow } from "./practiceCustomTextPlan.js";

const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);
const finite = Number.isFinite;
const number = (value, digits = 1) => finite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
const percent = (value) => finite(value) ? `${number(value * (value <= 1 ? 100 : 1), 1)}%` : "—";

function normalizedInput(type, value) {
  return { type, value, source: "browser-input", monotonicTimestampMs: Math.max(0, globalThis.performance?.now?.() ?? Date.now()), wallTimestampUtc: new Date().toISOString(), modifiers: { ctrl: false, meta: false, alt: false, shift: false } };
}

function renderActive(root, session, snapshot) {
  const cursor = snapshot.cursorIndex ?? 0;
  const window = getPracticeCustomTextRenderWindow(session.customTextPlan.typingGraphemes, cursor);
  const total = window.total;
  const timed = session.customTextPlan.sessionMode === "timed";
  const remainingMs = timed ? Math.max(0, Number(session.customTextPlan.timedDurationMs) - Number(snapshot.metrics?.activeDurationMs ?? snapshot.activeElapsedMs ?? 0)) : null;
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="custom-text-session"><div class="practice-lab-shell"><header class="practice-real-text-session-header"><div><div class="eyebrow">Custom Text · local practice</div><h1>Type your text</h1><p data-custom-session-status></p></div><button type="button" data-custom-text-session-action="stop">STOP</button></header><div class="practice-custom-session-progress" role="progressbar" aria-label="Custom Text progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${Math.min(cursor, total)}"><div style="width:${total ? Math.min(100, cursor / total * 100) : 0}%"></div></div><div class="practice-lab-notice">Local custom material · no leaderboard, PB, mastery, ability, transfer, or benchmark claim.</div><section class="practice-real-text-typing practice-custom-text-window" aria-label="Custom Text typing material" data-custom-text-window></section><textarea data-custom-text-session-input aria-label="Custom Text typing input" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea></div></section>`;
  const status = root.querySelector?.("[data-custom-session-status]");
  if (status) status.textContent = timed ? `${number(remainingMs / 1000, 0)} s active time remaining · ${cursor} characters typed` : `${cursor} / ${total} characters`;
  const box = root.querySelector?.("[data-custom-text-window]");
  const errors = new Set(snapshot.errorPositions ?? []);
  if (box && globalThis.document?.createDocumentFragment) {
    const fragment = document.createDocumentFragment();
    window.graphemes.forEach((value, offset) => {
      const index = window.start + offset;
      const span = document.createElement("span");
      span.className = "practice-real-text-char" + (index < cursor ? (errors.has(index) ? " is-error" : " is-typed") : "") + (index === cursor ? " is-current" : "");
      span.textContent = value;
      fragment.append(span);
    });
    box.append(fragment);
  }
}

function renderResult(root, session, finalResult) {
  const summary = finalResult?.summary ?? {};
  const after = summary.afterMetrics ?? {};
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="custom-text-result"><div class="practice-lab-shell"><main class="practice-lab-detail"><div class="eyebrow">Custom Text · local result</div><h1>Practice complete</h1><dl class="practice-real-text-result-grid"><div><dt>WPM</dt><dd>${number(after.wpm ?? summary.wpm)}</dd></div><div><dt>Raw WPM</dt><dd>${number(after.rawWpm ?? summary.rawWpm)}</dd></div><div><dt>Accuracy</dt><dd>${percent(after.acceptedInsertionAccuracy ?? summary.accuracy)}</dd></div><div><dt>First-pass accuracy</dt><dd>${percent(after.firstPassAccuracy)}</dd></div><div><dt>Characters</dt><dd>${after.charactersTyped ?? summary.typedCharacterCount ?? 0}</dd></div><div><dt>Words encountered</dt><dd>${after.wordsEncountered ?? summary.completedWordCount ?? 0}</dd></div><div><dt>Corrections</dt><dd>${after.correctionInputs ?? "—"}</dd></div><div><dt>Error episodes</dt><dd>${after.errorEpisodeCount ?? "—"}</dd></div></dl><div class="practice-lab-notice">These are session-local descriptive metrics. Custom Text does not update standardized ability, transfer, benchmark, retention, mastery, PBs, or rankings.</div><div class="practice-custom-actions"><button type="button" data-custom-text-session-action="again">PRACTICE AGAIN</button><button type="button" data-custom-text-session-action="finish">BACK TO CUSTOM TEXT</button></div></main></div></section>`;
  root.querySelector?.("[data-custom-text-session-action='again']")?.focus?.({ preventScroll: true });
}

export async function mountPracticeCustomTextSession({ root, session, runtime = null, onExit = () => {}, onPracticeAgain = () => {}, logger = null, dependencies = {} } = {}) {
  if (!root?.addEventListener || !session?.experiment || !session?.contentPlan || !session?.customTextPlan) throw new TypeError("Custom Text session host requires prepared session");
  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore();
  const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore: dependencies.manifestStore ?? createPracticeManifestStore() });
  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  if (initialized.profile.profileId !== session.profileId || initialized.context.contextId !== session.contextId) throw Object.assign(new Error("Practice context changed after Custom Text preparation"), { code: "PRACTICE_CONTEXT_MISMATCH" });
  const engine = (dependencies.engineFactory ?? createPracticeSessionEngine)({ repository, sessionId: session.sessionId, profileId: initialized.profile.profileId, contextId: initialized.context.contextId, logger });
  let finalResult = null;
  let closed = false;
  let finishing = false;
  let unsubscribe = null;
  let timer = null;
  const focus = () => queueMicrotask(() => root.querySelector?.("[data-custom-text-session-input]")?.focus?.({ preventScroll: true }));
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    unsubscribe?.();
    root.removeEventListener("beforeinput", beforeInput);
    root.removeEventListener("keydown", keyDown);
    root.removeEventListener("click", click);
    globalThis.document?.removeEventListener?.("visibilitychange", visibilityChange);
    try { await engine.destroy(); } catch {}
    try { dataStore.close?.(); } catch {}
    onExit(finalResult);
  };
  const complete = async () => {
    if (finishing || finalResult || closed) return;
    finishing = true;
    try {
      finalResult = await engine.complete();
      if (finalResult?.summary?.status === "completed") await runtime?.markPractised?.(session, finalResult.summary.completedAtUtc).catch(() => false);
      renderResult(root, session, finalResult);
    } catch (error) { logger?.warn?.("Custom Text completion failed", error); finishing = false; }
  };
  const beforeInput = (event) => {
    const capture = event.target?.closest?.("[data-custom-text-session-input]");
    if (!capture || !root.contains?.(capture) || closed || finalResult) return;
    event.preventDefault();
    if (INSERT_TYPES.has(event.inputType) && typeof event.data === "string") {
      for (const grapheme of splitGraphemes(event.data.normalize("NFC"))) engine.handleInput(normalizedInput(grapheme === " " ? "space" : "character", grapheme));
    } else if (event.inputType === "deleteContentBackward") engine.handleInput(normalizedInput("backspace", ""));
    else if (event.inputType === "deleteWordBackward") engine.handleInput(normalizedInput("word-delete", ""));
    capture.value = "";
  };
  const keyDown = (event) => { if ((event.ctrlKey || event.metaKey) && ["v", "x"].includes(String(event.key).toLowerCase())) event.preventDefault(); };
  const stop = async () => { if (closed || finalResult) return cleanup(); try { finalResult = await engine.abandon("manual-stop"); } catch {} return cleanup(); };
  const click = (event) => {
    const button = event.target?.closest?.("[data-custom-text-session-action]");
    if (!button || !root.contains?.(button)) return;
    const action = button.dataset.customTextSessionAction;
    if (action === "stop") void stop();
    else if (action === "finish") void cleanup();
    else if (action === "again") void cleanup().then(() => onPracticeAgain());
  };
  const visibilityChange = () => {
    if (closed || finalResult) return;
    if (globalThis.document?.visibilityState === "hidden") void engine.pause?.("visibility-hidden").catch?.(() => {});
    else if (globalThis.document?.visibilityState === "visible") void engine.resume?.().catch?.(() => {});
  };
  root.addEventListener("beforeinput", beforeInput);
  root.addEventListener("keydown", keyDown);
  root.addEventListener("click", click);
  globalThis.document?.addEventListener?.("visibilitychange", visibilityChange);
  await engine.prepare({ experiment: session.experiment, configuration: session.configuration, contentPlan: session.contentPlan });
  unsubscribe = engine.subscribe((snapshot, event) => {
    if (event === "completed") { void complete(); return; }
    if (!finalResult) { renderActive(root, session, snapshot); if (snapshot.lifecycleState === "active") focus(); }
  });
  const snapshot = await engine.start();
  renderActive(root, session, snapshot);
  focus();
  if (session.customTextPlan.sessionMode === "timed") timer = setInterval(() => { void engine.tick?.().then((result) => { if (result?.completed) void complete(); }).catch(() => {}); }, 250);
  return Object.freeze({ getSnapshot: () => engine.getSnapshot(), exit: cleanup, stop });
}
