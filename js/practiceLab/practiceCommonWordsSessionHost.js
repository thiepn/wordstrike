import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";
import { PRACTICE_COMMON_WORD_BANDS, PRACTICE_COMMON_WORD_BAND_LABELS } from "./practiceCommonWordsConstants.js";

const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const finite = Number.isFinite;
const n = (value, digits = 1) => finite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
const pct = (value) => finite(value) ? `${n(value * (value <= 1 ? 100 : 1), 1)}%` : "—";

function renderText(contentPlan, snapshot) {
  const graphemes = Array.from(contentPlan.text); const cursor = snapshot.cursorIndex ?? 0; const errors = new Set(snapshot.errorPositions ?? []);
  const start = Math.max(0, cursor - 160); const end = Math.min(graphemes.length, cursor + 520);
  return graphemes.slice(start, end).map((value, offset) => {
    const index = start + offset; const classes = ["practice-real-text-char"];
    if (index < cursor) classes.push(errors.has(index) ? "is-error" : "is-typed");
    if (index === cursor) classes.push("is-current");
    return `<span class="${classes.join(" ")}">${value === " " ? "&nbsp;" : escapeHtml(value)}</span>`;
  }).join("");
}
function completedWords(contentPlan, cursor) {
  return (contentPlan.units ?? []).filter((unit) => unit.type === "word" && unit.endIndex <= cursor).length;
}
function renderActive(root, session, snapshot) {
  const total = session.contentPlan.completion.value; const completed = completedWords(session.contentPlan, snapshot.cursorIndex ?? 0);
  const check = session.flow === "check";
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="common-words-session"><div class="practice-lab-shell"><header class="practice-real-text-session-header"><div><div class="eyebrow">Common Words · ${check ? "Typing Breadth Check" : "Practice"}</div><h1>${check ? "Standardized common-word form" : "Broad lexical practice"}</h1><p>${completed} / ${total} words · live WPM and aggregate accuracy hidden</p></div><button type="button" data-common-words-session-action="stop">STOP</button></header><div role="progressbar" aria-label="Common Words progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${completed}"><div style="width:${Math.min(100, completed / total * 100)}%"></div></div><p class="practice-lab-muted">${check ? "This fixed balanced sample does not adapt to your current weaknesses." : "Balanced across Core, Frequent, Common, and Broad bands; selection favors less-observed words rather than weak words."}</p><section class="practice-real-text-typing" aria-label="Common words typing material">${renderText(session.contentPlan, snapshot)}</section><textarea data-common-words-input aria-label="Common Words typing input" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea></div></section>`;
}
function coverageRows(snapshot) {
  return PRACTICE_COMMON_WORD_BANDS.map((band) => { const row = snapshot?.bands?.[band] ?? {}; return `<tr><th scope="row">${PRACTICE_COMMON_WORD_BAND_LABELS[band]}</th><td>${n(row.observedPercent)}%</td><td>${n(row.repeatedEvidencePercent)}%</td><td>${n(row.automaticPercent)}%</td></tr>`; }).join("");
}
function bandRows(metrics) {
  return PRACTICE_COMMON_WORD_BANDS.map((band) => { const row = metrics?.[band] ?? {}; return `<tr><th scope="row">${PRACTICE_COMMON_WORD_BAND_LABELS[band]}</th><td>${pct(row.wholeWordFirstPassAccuracy)}</td><td>${n(row.launchResidualMedianMs)} ms</td><td>${n(row.internalResidualMedianMs)} ms</td><td>${pct(row.launchDisfluencyRate)}</td><td>${pct(row.internalDisfluencyRate)}</td></tr>`; }).join("");
}
function abilityInterval(estimate) {
  if (!finite(estimate?.interval95LowerWpm) || !finite(estimate?.interval95UpperWpm)) return "—";
  return `${n(estimate.interval95LowerWpm)}–${n(estimate.interval95UpperWpm)} WPM`;
}
export function renderPracticeCommonWordsResult(root, session, finalResult, breadthSnapshot, abilityState, { focusResult = true } = {}) {
  const summary = finalResult?.summary ?? {}; const after = summary.afterMetrics ?? summary.trainingQuality?.afterMetrics ?? {}; const check = session.flow === "check";
  const ability = abilityState?.estimate ?? abilityState?.currentEstimate ?? null;
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="common-words-result"><div class="practice-lab-shell"><main class="practice-lab-detail"><div class="eyebrow">${check ? "Typing Breadth Check" : "Common Words Practice"}</div><h1>${check ? "Common-word typing profile" : `${after.wordsCompleted ?? session.contentPlan.completion.value} words complete`}</h1><dl class="practice-real-text-result-grid"><div><dt>WPM</dt><dd>${n(after.wpm)}</dd></div><div><dt>${check ? "Accuracy" : "First-pass word accuracy"}</dt><dd>${pct(check ? after.accuracy : after.firstPassWordAccuracy)}</dd></div>${check ? `<div><dt>Common-word typing ability</dt><dd>${n(ability?.estimateWpm)} WPM</dd></div><div><dt>95% model interval</dt><dd>${abilityInterval(ability)}</dd></div><div><dt>Confidence</dt><dd>${escapeHtml(ability?.confidenceLevel ?? abilityState?.confidenceLevel ?? "—")}</dd></div>` : `<div><dt>Newly measured common words</dt><dd>${after.previouslyUnobservedCount ?? "—"}</dd></div><div><dt>Low-exposure words encountered</dt><dd>${after.lowExposureCount ?? "—"}</dd></div>`}</dl>${check ? `<h2>Frequency-band profile</h2><div style="overflow-x:auto"><table><thead><tr><th>Band</th><th>First-pass accuracy</th><th>Starting words</th><th>Inside words</th><th>Launch disfluency</th><th>Internal disfluency</th></tr></thead><tbody>${bandRows(after.bandMetrics)}</tbody></table></div>` : ""}<h2>Typing breadth coverage</h2><div style="overflow-x:auto"><table><thead><tr><th>Band</th><th>Measured</th><th>Repeated evidence</th><th>Automatic</th></tr></thead><tbody>${coverageRows(breadthSnapshot)}</tbody></table></div><div class="practice-lab-notice" role="note">Typing breadth measures WordStrike's typing evidence across the 1,200-word common-word reference. It does not estimate how many English words you know.</div><button type="button" data-common-words-session-action="finish">BACK TO COMMON WORDS</button></main></div></section>`;
  if (focusResult) root.querySelector?.("[data-common-words-session-action='finish']")?.focus?.({ preventScroll: true });
  return true;
}
function normalizedInput(type, value) { return { type, value, source: "browser-input", monotonicTimestampMs: Math.max(0, globalThis.performance?.now?.() ?? Date.now()), wallTimestampUtc: new Date().toISOString(), modifiers: { ctrl: false, meta: false, alt: false, shift: false } }; }

export async function mountPracticeCommonWordsSession({ root, session, runtime = null, onExit = () => {}, logger = null, dependencies = {} } = {}) {
  if (!root?.addEventListener || !session?.experiment || !session?.contentPlan) throw new TypeError("Common Words session host requires prepared session");
  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore(); const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore: dependencies.manifestStore ?? createPracticeManifestStore() });
  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  if (initialized.profile.profileId !== session.commonWordsPlan.profileId || initialized.context.contextId !== session.commonWordsPlan.contextId) throw Object.assign(new Error("Practice context changed after Common Words preparation"), { code: "PRACTICE_CONTEXT_MISMATCH" });
  const engine = (dependencies.engineFactory ?? createPracticeSessionEngine)({ repository, sessionId: session.commonWordsPlan.sessionId, profileId: initialized.profile.profileId, contextId: initialized.context.contextId, logger });
  let finalResult = null; let closed = false; let unsubscribe = null;
  const focus = () => queueMicrotask(() => root.querySelector?.("[data-common-words-input]")?.focus?.({ preventScroll: true }));
  const cleanup = async () => { if (closed) return; closed = true; unsubscribe?.(); root.removeEventListener("beforeinput", beforeInput); root.removeEventListener("keydown", keyDown); root.removeEventListener("click", click); globalThis.document?.removeEventListener?.("visibilitychange", visibilityChange); try { await engine.destroy(); } catch {} try { dataStore.close?.(); } catch {} onExit(finalResult); };
  const beforeInput = (event) => { const capture = event.target?.closest?.("[data-common-words-input]"); if (!capture || !root.contains?.(capture) || closed || finalResult) return; event.preventDefault(); if (INSERT_TYPES.has(event.inputType) && typeof event.data === "string") for (const char of Array.from(event.data.normalize("NFC"))) engine.handleInput(normalizedInput(char === " " ? "space" : "character", char)); else if (event.inputType === "deleteContentBackward") engine.handleInput(normalizedInput("backspace", "")); else if (event.inputType === "deleteWordBackward") engine.handleInput(normalizedInput("word-delete", "")); capture.value = ""; };
  const keyDown = (event) => { if ((event.ctrlKey || event.metaKey) && ["v", "x"].includes(String(event.key).toLowerCase())) event.preventDefault(); };
  const stop = () => engine.abandon("manual-stop").then((result) => { finalResult = result; return cleanup(); }).catch(() => cleanup());
  const click = (event) => { const button = event.target?.closest?.("[data-common-words-session-action]"); if (!button || !root.contains?.(button)) return; if (button.dataset.commonWordsSessionAction === "finish") void cleanup(); else if (button.dataset.commonWordsSessionAction === "stop") void stop(); };
  const visibilityChange = () => { if (globalThis.document?.visibilityState === "hidden" && !closed && !finalResult) void stop(); };
  root.addEventListener("beforeinput", beforeInput); root.addEventListener("keydown", keyDown); root.addEventListener("click", click); globalThis.document?.addEventListener?.("visibilitychange", visibilityChange);
  await engine.prepare({ experiment: session.experiment, configuration: session.configuration, contentPlan: session.contentPlan });
  unsubscribe = engine.subscribe((snapshot, event) => {
    if (event === "completed") {
      void engine.complete().then(async (result) => {
        finalResult = result;
        const [breadth, ability] = await Promise.all([runtime?.getBreadthSnapshot?.().catch(() => null), session.flow === "check" ? runtime?.getCommonWordsAbilityState?.().catch(() => null) : null]);
        renderPracticeCommonWordsResult(root, session, result, breadth ?? session.breadthSnapshotBefore, ability);
      }).catch((error) => logger?.warn?.("Common Words completion retrieval failed", error));
      return;
    }
    if (!finalResult) { renderActive(root, session, snapshot); if (snapshot.lifecycleState === "active") focus(); }
  });
  const snapshot = await engine.start(); renderActive(root, session, snapshot); focus();
  return Object.freeze({ getSnapshot: () => engine.getSnapshot(), exit: cleanup, stop });
}