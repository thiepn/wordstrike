import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";

const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const finite = Number.isFinite;
const number = (value, digits = 1) => finite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
const percent = (value) => finite(value) ? `${number(value, 1)}%` : "—";
const ratioPercent = (value) => finite(value) ? `${number(value * 100, 1)}%` : "—";
const fmtSeconds = (ms) => finite(ms) ? `${number(ms / 1000, 0)} s` : "—";

function renderText(contentPlan, snapshot) {
  const graphemes = Array.from(contentPlan.text);
  const cursor = snapshot.cursorIndex ?? 0;
  const errors = new Set(snapshot.errorPositions ?? []);
  const start = Math.max(0, cursor - 180);
  const end = Math.min(graphemes.length, cursor + 500);
  return graphemes.slice(start, end).map((value, offset) => {
    const index = start + offset;
    const classes = ["practice-real-text-char"];
    if (index < cursor) classes.push(errors.has(index) ? "is-error" : "is-typed");
    if (index === cursor) classes.push("is-current");
    const shown = value === " " ? "&nbsp;" : escapeHtml(value);
    return `<span class="${classes.join(" ")}">${shown}</span>`;
  }).join("");
}

function renderActive(root, { contentPlan, snapshot, mode }) {
  const total = contentPlan.completion.value;
  const active = snapshot.timing?.activeDurationMs ?? 0;
  const remaining = Math.max(0, total - active);
  const label = mode === "cold" ? "Cold Transfer Check" : "Natural Practice";
  const note = mode === "cold"
    ? "Protected measurement · no targets · no live score"
    : "Broad training · no targets · no live score";
  root.innerHTML = `<section class="screen practice-lab-screen practice-real-text-session" data-practice-view="real-text-${mode}-session">
    <div class="practice-lab-shell"><header class="practice-real-text-session-header"><div><div class="eyebrow">Real Text</div><h1>${label}</h1><p>${note}</p></div><button type="button" data-real-text-session-action="stop">STOP</button></header>
    <div class="practice-real-text-time" aria-live="polite"><strong>${fmtSeconds(remaining)}</strong><span>remaining</span></div>
    <section class="practice-real-text-typing" aria-label="Natural typing passage">${renderText(contentPlan, snapshot)}</section>
    <textarea data-real-text-input aria-label="Real Text typing input" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea>
    </div></section>`;
}

function renderNaturalResult(root, finalResult) {
  const summary = finalResult?.summary ?? {};
  const metrics = summary.afterMetrics ?? summary.trainingQuality?.afterMetrics ?? {};
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="real-text-natural-result"><div class="practice-lab-shell"><main class="practice-lab-detail">
    <div class="eyebrow">Natural Practice complete</div><h1>Broad training</h1>
    <dl class="practice-real-text-result-grid"><div><dt>WPM</dt><dd>${number(metrics.wpm)}</dd></div><div><dt>Raw WPM</dt><dd>${number(metrics.rawWpm)}</dd></div><div><dt>First-pass accuracy</dt><dd>${percent(metrics.firstPassAccuracy)}</dd></div><div><dt>Fluency · disfluency</dt><dd>${ratioPercent(metrics.disfluencyRate)}</dd></div><div><dt>Correction inputs / 1000</dt><dd>${number(metrics.correctionInputsPer1000Accepted)}</dd></div><div><dt>Error episodes / 1000</dt><dd>${number(metrics.errorEpisodesPer1000Accepted)}</dd></div></dl>
    <div class="practice-lab-notice" role="note">This was broad training text. It contributes normal Practice evidence but is not a protected transfer measurement.</div>
    <button type="button" data-real-text-session-action="finish">BACK TO REAL TEXT</button>
  </main></div></section>`;
}

function renderColdResult(root, finalResult) {
  const summary = finalResult?.summary ?? {};
  const evaluation = summary.evaluationSummary ?? {};
  const learning = summary.learningEvidenceSummary ?? {};
  const count = Number(learning.transferObservationCount ?? 0);
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="real-text-cold-result"><div class="practice-lab-shell"><main class="practice-lab-detail">
    <div class="eyebrow">Cold Transfer Check</div><h1>Protected measurement</h1>
    <dl class="practice-real-text-result-grid"><div><dt>WPM</dt><dd>${number(evaluation.wpm)}</dd></div><div><dt>Adjusted WPM</dt><dd>${number(evaluation.adjustedWpm)}</dd></div><div><dt>Accuracy</dt><dd>${percent(evaluation.accuracy)}</dd></div><div><dt>Measurement uncertainty</dt><dd>${number(evaluation.measurementSigmaLog, 3)}</dd></div><div><dt>Freshness</dt><dd>${escapeHtml(evaluation.freshnessStatus ?? "—")}</dd></div><div><dt>Integrity</dt><dd>${escapeHtml(evaluation.integrityStatus ?? "—")}</dd></div><div><dt>Transfer observations added</dt><dd>${count}</dd></div></dl>
    <p>${count > 0 ? `${count} tracked transfer observation${count === 1 ? " was" : "s were"} added from skills that occurred naturally often enough.` : "No tracked target appeared often enough in this passage to add a target-specific transfer observation."}</p>
    <div class="practice-lab-notice" role="note">This passage was selected independently of your current targets. Target-specific transfer evidence is added only when tracked skills occur naturally often enough.</div>
    <button type="button" data-real-text-session-action="finish">BACK TO REAL TEXT</button>
  </main></div></section>`;
}

function normalizedInput(type, value) {
  return { type, value, source: "browser-input", monotonicTimestampMs: Math.max(0, globalThis.performance?.now?.() ?? Date.now()), wallTimestampUtc: new Date().toISOString(), modifiers: { ctrl: false, meta: false, alt: false, shift: false } };
}

export async function mountPracticeRealTextSession({ root, session, mode = "natural", onExit = () => {}, logger = null, dependencies = {} } = {}) {
  if (!root?.addEventListener || !session?.experiment || !session?.contentPlan) throw new TypeError("Real Text session host requires root and prepared session");
  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore();
  const manifestStore = dependencies.manifestStore ?? createPracticeManifestStore();
  const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore });
  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  const expectedContextId = mode === "cold" ? session.binding?.contextId : session.realTextPlan?.contextId;
  if (expectedContextId && initialized.context.contextId !== expectedContextId) throw Object.assign(new Error("Practice context changed after Real Text preparation"), { code: "PRACTICE_CONTEXT_MISMATCH" });
  const sessionId = mode === "cold" ? session.sessionId : session.realTextPlan.sessionId;
  const engine = (dependencies.engineFactory ?? createPracticeSessionEngine)({ repository, sessionId, profileId: initialized.profile.profileId, contextId: initialized.context.contextId, logger });
  let finalResult = null; let closed = false; let unsubscribe = null;
  const focus = () => queueMicrotask(() => root.querySelector?.("[data-real-text-input]")?.focus?.({ preventScroll: true }));
  const finish = async () => { if (closed) return; closed = true; unsubscribe?.(); root.removeEventListener("beforeinput", beforeInput); root.removeEventListener("keydown", keyDown); root.removeEventListener("click", click); globalThis.document?.removeEventListener?.("visibilitychange", visibilityChange); try { await engine.destroy(); } catch {} try { dataStore.close?.(); } catch {} onExit(finalResult); };
  const handle = (input) => engine.handleInput(input);
  const beforeInput = (event) => {
    const capture = event.target?.closest?.("[data-real-text-input]"); if (closed || finalResult || !capture || !root.contains?.(capture)) return; event.preventDefault();
    if (INSERT_TYPES.has(event.inputType) && typeof event.data === "string") for (const value of Array.from(event.data.normalize("NFC"))) handle(normalizedInput(value === " " ? "space" : "character", value));
    else if (event.inputType === "deleteContentBackward") handle(normalizedInput("backspace", ""));
    else if (event.inputType === "deleteWordBackward") handle(normalizedInput("word-delete", ""));
    capture.value = "";
  };
  const keyDown = (event) => { if ((event.ctrlKey || event.metaKey) && ["v", "x"].includes(String(event.key).toLowerCase())) event.preventDefault(); };
  const click = (event) => { const button = event.target?.closest?.("[data-real-text-session-action]"); if (!button || !root.contains?.(button)) return; if (button.dataset.realTextSessionAction === "finish") void finish(); else if (button.dataset.realTextSessionAction === "stop") void engine.abandon("manual-stop").then((result) => { finalResult = result; return finish(); }).catch(() => finish()); };
  const visibilityChange = () => { if (globalThis.document?.visibilityState !== "hidden" || closed || finalResult) return; if (mode === "cold") void engine.handleVisibilityState("hidden").then(() => engine.abandon("visibility-hidden")).then((result) => { finalResult = result; return finish(); }).catch(() => finish()); else void engine.abandon("visibility-hidden").then((result) => { finalResult = result; return finish(); }).catch(() => finish()); };
  root.addEventListener("beforeinput", beforeInput); root.addEventListener("keydown", keyDown); root.addEventListener("click", click); globalThis.document?.addEventListener?.("visibilitychange", visibilityChange);
  try {
    await engine.prepare({ experiment: session.experiment, configuration: session.configuration, contentPlan: session.contentPlan, ...(mode === "cold" ? { evaluationPlan: session.evaluationPlan, evaluationArtifact: session.evaluationArtifact } : {}) });
    unsubscribe = engine.subscribe((snapshot, event) => {
      if (event === "completed") { void engine.complete().then((result) => { finalResult = result; mode === "cold" ? renderColdResult(root, result) : renderNaturalResult(root, result); }).catch((error) => logger?.warn?.("Real Text completion retrieval failed", error)); return; }
      if (!finalResult) { renderActive(root, { contentPlan: session.contentPlan, snapshot, mode }); if (snapshot.lifecycleState === "active") focus(); }
    });
    const snapshot = await engine.start(); renderActive(root, { contentPlan: session.contentPlan, snapshot, mode }); focus();
  } catch (error) { logger?.warn?.("Real Text session start failed", error); await finish(); throw error; }
  return Object.freeze({ getSnapshot: () => engine.getSnapshot(), exit: finish });
}
