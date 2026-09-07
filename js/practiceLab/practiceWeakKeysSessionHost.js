import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";
import { assertPracticeWeakKeysSessionContext } from "./practiceWeakKeysTrust.js";

const SESSION_ACTION_SELECTOR = "[data-weak-keys-session-action]";
const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const finite = Number.isFinite;
const number = (value, digits = 1) => finite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
const percentFraction = (value) => finite(value) ? `${number(value * 100, 1)}%` : "—";
const signed = (value) => finite(value) ? `${value >= 0 ? "+" : ""}${number(value, 1)}` : "—";

function phaseForCursor(contentPlan, cursorIndex) {
  const phases = contentPlan?.metadata?.weakKeys?.phaseRanges ?? [];
  if (!phases.length) return null;
  return phases.find((phase) => cursorIndex >= phase.startIndex && cursorIndex < phase.endIndex)
    ?? phases.find((phase) => phase.startIndex >= cursorIndex)
    ?? phases.at(-1);
}

function renderTypingText(contentPlan, snapshot, phase) {
  if (!phase) return "";
  const graphemes = Array.from(contentPlan.text);
  const cursor = snapshot.cursorIndex ?? 0;
  const errors = new Set(snapshot.errorPositions ?? []);
  const highlighted = phase.cue === "none" ? new Set() : new Set(phase.targetPositions ?? []);
  const cueClass = phase.cue === "strong" ? "strong" : phase.cue === "subtle" ? "subtle" : "none";
  const visibleStart = Math.max(0, Math.min(cursor, phase.startIndex));
  const visibleEnd = Math.min(graphemes.length, phase.endIndex);
  const output = [];
  for (let index = visibleStart; index < visibleEnd; index += 1) {
    const classes = ["practice-weak-key-char"];
    if (index < cursor) classes.push(errors.has(index) ? "is-error" : "is-typed");
    if (index === cursor) classes.push("is-current");
    if (highlighted.has(index)) classes.push(`is-target-${cueClass}`);
    const value = graphemes[index];
    const shown = value === " " ? "&nbsp;" : value === "\n" ? "<br>" : escapeHtml(value);
    output.push(`<span class="${classes.join(" ")}" data-char-index="${index}">${shown}</span>`);
  }
  return output.join("");
}

function phaseInstruction(phase, target) {
  if (!phase) return "Type the displayed text.";
  if (phase.id === "entry-probe") return "Type naturally. The key is not highlighted in this Baseline.";
  if (phase.id === "focus") return `Notice ${target} across the varied words. Strong underlining marks the selected key.`;
  if (phase.id === "context") return `Keep ${target} smooth across different word positions and surrounding transitions. The cue is reduced.`;
  if (phase.id === "interleave") return "Type the mixed target-bearing and target-free material normally. The key cue is off.";
  return "Final same-session Check. Type naturally; the selected key is not highlighted.";
}

function phaseStrip(contentPlan, activePhase) {
  const phases = contentPlan?.metadata?.weakKeys?.phaseRanges ?? [];
  return `<ol class="practice-weak-key-phase-strip" aria-label="Weak Keys phases">${phases.map((phase) => {
    const state = phase.ordinal < (activePhase?.ordinal ?? 1) ? "complete" : phase.id === activePhase?.id ? "active" : "upcoming";
    return `<li data-phase-state="${state}"><span>${phase.ordinal}</span><strong>${escapeHtml(phase.label)}</strong></li>`;
  }).join("")}</ol>`;
}

export function renderPracticeWeakKeysSessionSnapshot(root, { contentPlan, snapshot }) {
  const phase = phaseForCursor(contentPlan, snapshot.cursorIndex ?? 0);
  const target = contentPlan.metadata.weakKeys.target.entityKey;
  const totalLength = snapshot.content?.expectedLength ?? Array.from(contentPlan.text).length;
  const progress = totalLength > 0 ? Math.min(100, ((snapshot.cursorIndex ?? 0) / totalLength) * 100) : 0;
  const paused = snapshot.lifecycleState === "paused";
  root.innerHTML = `<section class="screen practice-lab-screen practice-weak-key-session" data-practice-view="weak-keys-session">
    <div class="practice-lab-shell">
      <header class="practice-weak-key-session-header">
        <div><div class="eyebrow">Weak Keys</div><h1>Practicing: ${escapeHtml(target)}</h1></div>
        <div class="practice-weak-key-session-actions">
          <button type="button" data-weak-keys-session-action="${paused ? "resume" : "pause"}">${paused ? "RESUME" : "PAUSE"}</button>
          <button type="button" data-weak-keys-session-action="abandon">EXIT SESSION</button>
        </div>
      </header>
      ${phaseStrip(contentPlan, phase)}
      <section class="practice-weak-key-phase-card" aria-live="polite">
        <div class="practice-lab-card-meta"><span>Phase ${phase?.ordinal ?? "—"} of 5 · ${escapeHtml(phase?.label ?? "")}</span><span>${phase?.opportunityQuota ?? "—"} key opportunities</span></div>
        <p>${escapeHtml(phaseInstruction(phase, target))}</p>
      </section>
      <div class="practice-weak-key-progress" aria-label="Session progress"><span style="width:${progress.toFixed(2)}%"></span></div>
      <div class="practice-weak-key-progress-label">${Math.round(progress)}% complete</div>
      <section class="practice-weak-key-typing" aria-label="Current Weak Keys typing passage" data-session-paused="${paused ? "true" : "false"}">${renderTypingText(contentPlan, snapshot, phase)}</section>
      ${paused ? '<div class="practice-lab-notice" role="status"><strong>Paused.</strong> Resume to continue; paused time is excluded from active typing time.</div>' : ""}
      <textarea class="practice-weak-key-input-capture" data-weak-keys-input aria-label="Weak Keys typing input" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea>
    </div>
  </section>`;
}

function probeRows(before, after) {
  return `<dl class="practice-weak-key-result-grid">
    <div><dt>Entry → Exit quality</dt><dd>${number(before?.quality)} → ${number(after?.quality)}</dd></div>
    <div><dt>First-pass accuracy</dt><dd>${percentFraction(before?.firstPassAccuracy)} → ${percentFraction(after?.firstPassAccuracy)}</dd></div>
    <div><dt>Context-adjusted timing</dt><dd>${number(before?.normalizedResidualMedianMs)} ms → ${number(after?.normalizedResidualMedianMs)} ms</dd></div>
    <div><dt>Hesitation rate</dt><dd>${percentFraction(before?.disfluencyRate)} → ${percentFraction(after?.disfluencyRate)}</dd></div>
  </dl>`;
}

export function renderPracticeWeakKeysResult(root, finalResult) {
  const summary = finalResult?.summary ?? null;
  const result = summary?.trainingQuality ?? null;
  const before = summary?.beforeMetrics ?? result?.beforeMetrics ?? null;
  const after = summary?.afterMetrics ?? result?.afterMetrics ?? null;
  const target = result?.target?.entityKey ?? summary?.configuration?.target?.entityKey ?? "—";
  const delta = result?.immediateProbeDelta ?? null;
  const contextVariety = result?.contextVariety ?? result?.trainingQuality?.contextVariety ?? "—";
  root.innerHTML = `<section class="screen practice-lab-screen practice-weak-key-results" data-practice-view="weak-keys-result">
    <div class="practice-lab-shell"><main class="practice-lab-detail">
      <div class="eyebrow">Weak Keys complete</div>
      <h1>Key: ${escapeHtml(target)}</h1>
      <p class="practice-lab-lead">The Check probe was ${signed(delta)} quality points relative to the Baseline probe.</p>
      ${probeRows(before, after)}
      <section class="practice-lab-empty-state"><h2>Session context</h2><dl><div><dt>Context variety</dt><dd>${escapeHtml(contextVariety)}</dd></div><div><dt>Dose completed</dt><dd>1.0 · 80 direct key opportunities</dd></div></dl></section>
      <div class="practice-lab-notice" role="note">This compares the beginning and end of this practice session. Long-term improvement requires later sessions and transfer evidence.</div>
      <div class="practice-weak-key-result-actions"><button type="button" data-weak-keys-session-action="repeat">PRACTICE AGAIN</button><button type="button" data-weak-keys-session-action="finish">BACK TO WEAK KEYS</button></div>
    </main></div>
  </section>`;
}

function renderFailure(root, error) {
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="weak-keys-session-error"><div class="practice-lab-shell"><main class="practice-lab-detail"><div class="eyebrow">Weak Keys</div><h1>Session could not start</h1><div class="practice-lab-notice" role="alert"><strong>${escapeHtml(error?.code ?? "SESSION_ERROR")}</strong><p>${escapeHtml(error?.message ?? "The Practice session could not be initialized.")}</p></div><button type="button" data-weak-keys-session-action="finish">BACK</button></main></div></section>`;
}

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

export async function mountPracticeWeakKeysSession({
  root,
  session,
  onExit = () => {},
  onRepeat = () => {},
  logger = null,
  dependencies = {},
} = {}) {
  if (!root?.addEventListener || !root?.removeEventListener) throw new TypeError("Weak Keys session host requires a DOM root");
  if (!session?.experiment || !session?.contentPlan || !session?.weakKeysPlan) throw new TypeError("Weak Keys session host requires a prepared Practice session");

  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore();
  const manifestStore = dependencies.manifestStore ?? createPracticeManifestStore();
  const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore });
  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  assertPracticeWeakKeysSessionContext(session.weakKeysPlan, initialized.context);
  const engineFactory = dependencies.engineFactory ?? createPracticeSessionEngine;
  const engine = engineFactory({
    repository,
    sessionId: session.weakKeysPlan.sessionId,
    profileId: initialized.profile.profileId,
    contextId: initialized.context.contextId,
    logger,
  });

  let finalResult = null;
  let closed = false;
  let unsubscribe = null;
  const focusCapture = () => queueMicrotask(() => root.querySelector?.("[data-weak-keys-input]")?.focus?.({ preventScroll: true }));
  const renderSnapshot = (snapshot) => {
    if (closed || finalResult) return;
    renderPracticeWeakKeysSessionSnapshot(root, { contentPlan: session.contentPlan, snapshot });
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
    try { await engine.destroy(); } catch (error) { logger?.warn?.("Weak Keys engine destroy failed", error); }
    try { dataStore.close?.(); } catch {}
    if (repeat) onRepeat(finalResult);
    else onExit(finalResult);
  };

  const handleNormalized = (input) => {
    const outcome = engine.handleInput(input);
    if (!outcome.accepted && outcome.reason === "invalid-input") logger?.warn?.("Weak Keys rejected normalized input", outcome.errors);
    return outcome;
  };

  const beforeInput = (event) => {
    if (closed || finalResult) return;
    const capture = event.target?.closest?.("[data-weak-keys-input]");
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
    const target = event.target?.closest?.(SESSION_ACTION_SELECTOR);
    if (!target || !root.contains?.(target)) return;
    const action = target.dataset.weakKeysSessionAction;
    if (action === "pause") void engine.pause("manual");
    else if (action === "resume") void engine.resume();
    else if (action === "abandon") void engine.abandon("manual-stop").then(() => finish(false)).catch((error) => { logger?.warn?.("Weak Keys abandon failed", error); void finish(false); });
    else if (action === "repeat") void finish(true);
    else if (action === "finish") void finish(false);
  };
  const pointerDown = () => { if (engine.getSnapshot().lifecycleState === "active") focusCapture(); };
  const visibilityChange = () => {
    const state = globalThis.document?.visibilityState;
    if (state === "hidden" || state === "visible") void engine.handleVisibilityState(state).catch((error) => logger?.warn?.("Weak Keys visibility transition failed", error));
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
          renderPracticeWeakKeysResult(root, result);
        }).catch((error) => {
          logger?.warn?.("Weak Keys result retrieval failed", error);
          renderFailure(root, error);
        });
        return;
      }
      renderSnapshot(snapshot);
    });
    const snapshot = await engine.start();
    renderSnapshot(snapshot);
  } catch (error) {
    logger?.warn?.("Weak Keys session initialization failed", error);
    renderFailure(root, error);
  }

  return Object.freeze({
    getSnapshot: () => engine.getSnapshot(),
    exit: () => finish(false),
  });
}
