import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";
import { assertPracticeProblemWordsSessionContext } from "./practiceProblemWordsTrust.js";

const ACTION_SELECTOR = "[data-problem-words-session-action]";
const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const finite = Number.isFinite;
const number = (value, digits = 1) => finite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
const percent = (value) => finite(value) ? `${number(value * 100, 1)}%` : "—";
const signed = (value, suffix = "") => finite(value) ? `${value >= 0 ? "+" : ""}${number(value, 1)}${suffix}` : "—";

function phaseForCursor(contentPlan, cursor) {
  const phases = contentPlan?.metadata?.problemWords?.phaseRanges ?? [];
  return phases.find((phase) => cursor >= phase.startIndex && cursor < phase.endIndex) ?? phases.find((phase) => phase.startIndex >= cursor) ?? phases.at(-1) ?? null;
}
function highlightedPositions(phase) {
  if (!phase || phase.cue === "none") return new Set();
  const result = new Set();
  for (const range of phase.targetWordRanges ?? []) for (let index = range.startIndex; index < range.endIndex; index += 1) result.add(index);
  return result;
}
function renderText(contentPlan, snapshot, phase) {
  const graphemes = Array.from(contentPlan.text); const cursor = snapshot.cursorIndex ?? 0; const errors = new Set(snapshot.errorPositions ?? []); const cue = highlightedPositions(phase);
  const cueClass = phase?.cue === "strong-word" ? "strong" : phase?.cue === "subtle-word" ? "subtle" : "none";
  const start = Math.max(0, Math.min(cursor, phase?.startIndex ?? 0)); const end = Math.min(graphemes.length, phase?.endIndex ?? graphemes.length); const out = [];
  for (let index = start; index < end; index += 1) {
    const classes = ["practice-weak-key-char", "practice-problem-word-char"];
    if (index < cursor) classes.push(errors.has(index) ? "is-error" : "is-typed"); if (index === cursor) classes.push("is-current"); if (cue.has(index)) classes.push(`is-target-${cueClass}`);
    const value = graphemes[index]; out.push(`<span class="${classes.join(" ")}" data-char-index="${index}">${value === " " ? "&nbsp;" : value === "\n" ? "<br>" : escapeHtml(value)}</span>`);
  }
  return out.join("");
}
function instruction(phase, target) {
  if (phase?.id === "entry-probe") return "Type naturally. The target word is uncued in this Baseline.";
  if (phase?.id === "focus") return `Practice ${target} as a whole lexical unit. The entire target word receives the strong cue.`;
  if (phase?.id === "context") return `Type ${target} in broader contexts. The whole-word cue is reduced.`;
  if (phase?.id === "interleave") return "Type the mixed target-bearing and target-free material normally. No target cue is shown.";
  if (phase?.id === "exit-probe") return "Final same-session Check. Type naturally; the target word is uncued.";
  return "Type the displayed text.";
}
function phaseStrip(contentPlan, active) {
  return `<ol class="practice-weak-key-phase-strip" aria-label="Problem Words phases">${(contentPlan?.metadata?.problemWords?.phaseRanges ?? []).map((phase) => `<li data-phase-state="${phase.ordinal < (active?.ordinal ?? 1) ? "complete" : phase.id === active?.id ? "active" : "upcoming"}"><span>${phase.ordinal}</span><strong>${escapeHtml(phase.label)}</strong></li>`).join("")}</ol>`;
}
export function renderPracticeProblemWordsSessionSnapshot(root, { contentPlan, snapshot }) {
  const phase = phaseForCursor(contentPlan, snapshot.cursorIndex ?? 0); const target = contentPlan.metadata.problemWords.target.entityKey; const total = snapshot.content?.expectedLength ?? Array.from(contentPlan.text).length; const progress = total > 0 ? Math.min(100, ((snapshot.cursorIndex ?? 0) / total) * 100) : 0; const paused = snapshot.lifecycleState === "paused";
  root.innerHTML = `<section class="screen practice-lab-screen practice-weak-key-session practice-problem-word-session" data-practice-view="problem-words-session"><div class="practice-lab-shell">
    <header class="practice-weak-key-session-header"><div><div class="eyebrow">Problem Words</div><h1>Practicing: ${escapeHtml(target)}</h1></div><div class="practice-weak-key-session-actions"><button type="button" data-problem-words-session-action="${paused ? "resume" : "pause"}">${paused ? "RESUME" : "PAUSE"}</button><button type="button" data-problem-words-session-action="abandon">EXIT SESSION</button></div></header>
    ${phaseStrip(contentPlan, phase)}
    <section class="practice-weak-key-phase-card" aria-live="polite"><div class="practice-lab-card-meta"><span>Phase ${phase?.ordinal ?? "—"} of 5 · ${escapeHtml(phase?.label ?? "")}</span><span>${phase?.opportunityQuota ?? "—"} word opportunities</span></div><p>${escapeHtml(instruction(phase, target))}</p></section>
    <div class="practice-weak-key-progress" aria-label="Session progress"><span style="width:${progress.toFixed(2)}%"></span></div><div class="practice-weak-key-progress-label">${Math.round(progress)}% complete</div>
    <section class="practice-weak-key-typing" aria-label="Current Problem Words typing passage" data-session-paused="${paused ? "true" : "false"}">${renderText(contentPlan, snapshot, phase)}</section>
    ${paused ? '<div class="practice-lab-notice" role="status"><strong>Paused.</strong> Resume to continue; paused time is excluded.</div>' : ""}
    <textarea class="practice-weak-key-input-capture" data-problem-words-input aria-label="Problem Words typing input" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea>
  </div></section>`;
}
function resultGrid(before, after) {
  return `<dl class="practice-weak-key-result-grid"><div><dt>Execution quality</dt><dd>${number(before?.executionQuality)} → ${number(after?.executionQuality)}</dd></div><div><dt>Whole-word first-pass accuracy</dt><dd>${percent(before?.wholeWordFirstPassAccuracy)} → ${percent(after?.wholeWordFirstPassAccuracy)}</dd></div><div><dt>Starting the word</dt><dd>${number(before?.launch?.fluentResidualMedianMs)} ms → ${number(after?.launch?.fluentResidualMedianMs)} ms</dd></div><div><dt>Inside the word</dt><dd>${number(before?.internal?.fluentResidualMedianMs)} ms → ${number(after?.internal?.fluentResidualMedianMs)} ms</dd></div><div><dt>Launch hesitation</dt><dd>${percent(before?.launch?.disfluencyRate)} → ${percent(after?.launch?.disfluencyRate)}</dd></div><div><dt>Internal hesitation</dt><dd>${percent(before?.internal?.disfluencyRate)} → ${percent(after?.internal?.disfluencyRate)}</dd></div></dl>`;
}
export function renderPracticeProblemWordsResult(root, finalResult) {
  const summary = finalResult?.summary ?? null; const result = summary?.trainingQuality ?? null; const before = summary?.beforeMetrics ?? result?.beforeMetrics ?? null; const after = summary?.afterMetrics ?? result?.afterMetrics ?? null; const target = result?.target?.entityKey ?? summary?.configuration?.target?.entityKey ?? "—";
  const immediate = summary?.immediateProbeDelta ?? result?.immediateProbeDelta ?? null; const launchDelta = summary?.launchResidualDeltaMs ?? result?.launchResidualDeltaMs ?? null; const internalDelta = summary?.internalResidualDeltaMs ?? result?.internalResidualDeltaMs ?? null;
  root.innerHTML = `<section class="screen practice-lab-screen practice-weak-key-results" data-practice-view="problem-words-result"><div class="practice-lab-shell"><main class="practice-lab-detail"><div class="eyebrow">Problem Words complete</div><h1>Word: ${escapeHtml(target)}</h1><p class="practice-lab-lead">Baseline → Check execution delta: ${signed(immediate)} quality points.</p>${resultGrid(before, after)}<section class="practice-lab-empty-state"><h2>Session deltas</h2><dl><div><dt>Starting the word</dt><dd>${signed(launchDelta, " ms")}</dd></div><div><dt>Inside the word</dt><dd>${signed(internalDelta, " ms")}</dd></div><div><dt>Dose completed</dt><dd>1.0 · 15 direct word opportunities</dd></div></dl><p>For context-adjusted residuals, a negative delta means faster relative execution.</p></section><div class="practice-lab-notice" role="note">This compares your Baseline and Check inside this practice session. Long-term learning, transfer, and retention require later evidence.</div><div class="practice-weak-key-result-actions"><button type="button" data-problem-words-session-action="repeat">PRACTICE AGAIN</button><button type="button" data-problem-words-session-action="finish">BACK TO PROBLEM WORDS</button></div></main></div></section>`;
}
function normalizedInput(type, value) { return { type, value, source: "browser-input", monotonicTimestampMs: Math.max(0, globalThis.performance?.now?.() ?? Date.now()), wallTimestampUtc: new Date().toISOString(), modifiers: { ctrl: false, meta: false, alt: false, shift: false } }; }
export async function mountPracticeProblemWordsSession({ root, session, onExit = () => {}, onRepeat = () => {}, logger = null, dependencies = {} } = {}) {
  if (!root?.addEventListener || !root?.removeEventListener) throw new TypeError("Problem Words session host requires a DOM root");
  if (!session?.experiment || !session?.contentPlan || !session?.problemWordsPlan) throw new TypeError("Problem Words session host requires a prepared Practice session");
  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore(); const manifestStore = dependencies.manifestStore ?? createPracticeManifestStore(); const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore }); const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  assertPracticeProblemWordsSessionContext(session.problemWordsPlan, initialized.context);
  const engine = (dependencies.engineFactory ?? createPracticeSessionEngine)({ repository, sessionId: session.problemWordsPlan.sessionId, profileId: initialized.profile.profileId, contextId: initialized.context.contextId, logger });
  let finalResult = null; let closed = false; let unsubscribe = null;
  const focus = () => queueMicrotask(() => root.querySelector?.("[data-problem-words-input]")?.focus?.({ preventScroll: true }));
  const render = (snapshot) => { if (!closed && !finalResult) { renderPracticeProblemWordsSessionSnapshot(root, { contentPlan: session.contentPlan, snapshot }); if (snapshot.lifecycleState === "active") focus(); } };
  const finish = async (repeat = false) => { if (closed) return; closed = true; unsubscribe?.(); root.removeEventListener("beforeinput", beforeInput); root.removeEventListener("keydown", keyDown); root.removeEventListener("click", click); try { await engine.destroy(); } catch {} try { dataStore.close?.(); } catch {} (repeat ? onRepeat : onExit)(finalResult); };
  const handle = (input) => engine.handleInput(input);
  const beforeInput = (event) => { if (closed || finalResult || !event.target?.closest?.("[data-problem-words-input]")) return; event.preventDefault(); if (INSERT_TYPES.has(event.inputType) && typeof event.data === "string") for (const value of Array.from(event.data.normalize("NFC"))) handle(normalizedInput(value === " " ? "space" : "character", value)); else if (event.inputType === "deleteContentBackward") handle(normalizedInput("backspace", "")); else if (event.inputType === "deleteWordBackward") handle(normalizedInput("word-delete", "")); event.target.value = ""; };
  const keyDown = (event) => { if (event.key === "Escape" && !closed && !finalResult) { event.preventDefault(); const state = engine.getSnapshot().lifecycleState; void (state === "paused" ? engine.resume() : state === "active" ? engine.pause("manual") : Promise.resolve()); } };
  const click = (event) => { const target = event.target?.closest?.(ACTION_SELECTOR); if (!target) return; const action = target.dataset.problemWordsSessionAction; if (action === "pause") void engine.pause("manual"); else if (action === "resume") void engine.resume(); else if (action === "abandon") void engine.abandon("manual-stop").then(() => finish(false)).catch(() => finish(false)); else if (action === "repeat") void finish(true); else if (action === "finish") void finish(false); };
  root.addEventListener("beforeinput", beforeInput); root.addEventListener("keydown", keyDown); root.addEventListener("click", click);
  try {
    await engine.prepare({ experiment: session.experiment, configuration: session.configuration, contentPlan: session.contentPlan });
    unsubscribe = engine.subscribe((snapshot, event) => { if (event === "completed") { void engine.complete().then((result) => { finalResult = result; renderPracticeProblemWordsResult(root, result); }).catch((error) => { logger?.warn?.("Problem Words result failed", error); void finish(false); }); return; } render(snapshot); });
    render(await engine.start());
  } catch (error) { logger?.warn?.("Problem Words session failed", error); await finish(false); throw error; }
  return Object.freeze({ exit: () => finish(false), repeat: () => finish(true), getSnapshot: () => engine.getSnapshot() });
}
