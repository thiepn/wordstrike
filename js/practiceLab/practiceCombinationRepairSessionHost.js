import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";

const SESSION_ACTION_SELECTOR = "[data-combination-session-action]";
const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);

const finite = (value) => Number.isFinite(value);
const formatNumber = (value, digits = 1) => finite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
const formatPercent = (value) => finite(value) ? `${formatNumber(value, 1)}%` : "—";

function lower(value, language = "en") {
  try { return String(value).normalize("NFC").toLocaleLowerCase(language || undefined); }
  catch { return String(value).normalize("NFC").toLowerCase(); }
}

function phaseForCursor(contentPlan, cursorIndex) {
  const phases = contentPlan?.metadata?.combinationRepair?.phaseRanges ?? [];
  if (!phases.length) return null;
  return phases.find((phase) => cursorIndex >= phase.startIndex && cursorIndex < phase.endIndex)
    ?? phases.find((phase) => phase.startIndex >= cursorIndex)
    ?? phases.at(-1);
}

function targetHighlightPositions(contentPlan, phase) {
  if (!phase || phase.cue === "none") return new Set();
  const language = contentPlan?.metadata?.language ?? "en";
  const target = contentPlan?.metadata?.combinationRepair?.target?.entityKey ?? contentPlan?.targetEntities?.[0]?.entityKey ?? "";
  const graphemes = Array.from(contentPlan.text);
  const needle = Array.from(target);
  const positions = new Set();
  for (let index = phase.startIndex; index <= phase.endIndex - needle.length; index += 1) {
    const candidate = lower(graphemes.slice(index, index + needle.length).join(""), language);
    if (candidate !== target) continue;
    for (let offset = 0; offset < needle.length; offset += 1) positions.add(index + offset);
  }
  return positions;
}

function renderTypingText(contentPlan, snapshot, phase) {
  const graphemes = Array.from(contentPlan.text);
  const cursor = snapshot.cursorIndex ?? 0;
  const errors = new Set(snapshot.errorPositions ?? []);
  const highlighted = targetHighlightPositions(contentPlan, phase);
  const cueClass = phase?.cue === "strong" ? "strong" : phase?.cue === "subtle" ? "subtle" : "none";
  return graphemes.map((value, index) => {
    const classes = ["practice-combination-char"];
    if (index < cursor) classes.push(errors.has(index) ? "is-error" : "is-typed");
    if (index === cursor) classes.push("is-current");
    if (highlighted.has(index)) classes.push(`is-target-${cueClass}`);
    const shown = value === " " ? "&nbsp;" : value === "\n" ? "<br>" : escapeHtml(value);
    return `<span class="${classes.join(" ")}" data-char-index="${index}">${shown}</span>`;
  }).join("");
}

function phaseInstruction(phase, target) {
  if (!phase) return "Type the displayed text.";
  if (phase.id === "entry-probe") return "Type naturally. The target is not highlighted in this baseline.";
  if (phase.id === "acquire") return `Focus on the ${target} transition. Strong highlighting is intentional in this phase.`;
  if (phase.id === "integrate") return `Keep ${target} smooth inside normal context. Highlighting is reduced.`;
  if (phase.id === "interleave") return "Return to ordinary mixed typing without a target cue.";
  return "Final same-session check. Type naturally; the target is not highlighted.";
}

function phaseStrip(contentPlan, activePhase) {
  const phases = contentPlan?.metadata?.combinationRepair?.phaseRanges ?? [];
  return `<ol class="practice-combination-phase-strip" aria-label="Combination Repair phases">${phases.map((phase) => {
    const state = phase.ordinal < (activePhase?.ordinal ?? 1) ? "complete" : phase.id === activePhase?.id ? "active" : "upcoming";
    return `<li data-phase-state="${state}"><span>${phase.ordinal}</span><strong>${escapeHtml(phase.label)}</strong></li>`;
  }).join("")}</ol>`;
}

function renderActive(root, { contentPlan, snapshot }) {
  const phase = phaseForCursor(contentPlan, snapshot.cursorIndex ?? 0);
  const target = contentPlan.metadata.combinationRepair.target.entityKey;
  const quota = phase?.opportunityQuota ?? null;
  const totalLength = snapshot.content?.expectedLength ?? Array.from(contentPlan.text).length;
  const progress = totalLength > 0 ? Math.min(100, ((snapshot.cursorIndex ?? 0) / totalLength) * 100) : 0;
  const paused = snapshot.lifecycleState === "paused";
  root.innerHTML = `<section class="screen practice-lab-screen practice-combination-session" data-practice-view="session">
    <div class="practice-lab-shell">
      <header class="practice-combination-session-header">
        <div><div class="eyebrow">Combination Repair · ${escapeHtml(contentPlan.targetEntities[0].entityType)}</div><h1>${escapeHtml(target)}</h1></div>
        <div class="practice-combination-session-actions">
          <button type="button" data-combination-session-action="${paused ? "resume" : "pause"}">${paused ? "RESUME" : "PAUSE"}</button>
          <button type="button" data-combination-session-action="abandon">EXIT SESSION</button>
        </div>
      </header>
      ${phaseStrip(contentPlan, phase)}
      <section class="practice-combination-phase-card" aria-live="polite">
        <div class="practice-lab-card-meta"><span>Phase ${phase?.ordinal ?? "—"} of 5 · ${escapeHtml(phase?.label ?? "")}</span><span>${quota == null ? "" : `${quota} target opportunities`}</span></div>
        <p>${escapeHtml(phaseInstruction(phase, target))}</p>
      </section>
      <div class="practice-combination-progress" aria-label="Session progress"><span style="width:${progress.toFixed(2)}%"></span></div>
      <section class="practice-combination-typing" aria-label="Typing passage" data-session-paused="${paused ? "true" : "false"}">${renderTypingText(contentPlan, snapshot, phase)}</section>
      <dl class="practice-combination-live-metrics"><div><dt>WPM</dt><dd>${formatNumber(snapshot.metrics?.wpm)}</dd></div><div><dt>Accuracy</dt><dd>${formatPercent(snapshot.metrics?.accuracy)}</dd></div><div><dt>Progress</dt><dd>${Math.round(progress)}%</dd></div></dl>
      ${paused ? '<div class="practice-lab-notice" role="status"><strong>Paused.</strong> Resume to continue; paused time is excluded from active typing time.</div>' : ""}
      <textarea class="practice-combination-input-capture" data-combination-input aria-label="Combination Repair typing input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>
    </div>
  </section>`;
}

function phaseResultRows(analysis) {
  return (analysis?.phases ?? []).map((phase) => `<tr><th scope="row">${escapeHtml(phase.label)}</th><td>${phase.opportunityCount}/${phase.expectedOpportunityCount}</td><td>${formatNumber(phase.quality)}</td></tr>`).join("");
}

function resultInterpretation(analysis) {
  const check = analysis?.sameSessionCheck;
  if (!check) return `<div class="practice-lab-notice" role="status"><strong>No comparable Baseline/Check result.</strong> ${escapeHtml(analysis?.interpretation?.wording ?? "The session did not retain enough complete phase evidence.")}</div>`;
  const delta = check.immediateQualityChange;
  const signed = finite(delta) ? `${delta >= 0 ? "+" : ""}${formatNumber(delta)}` : "—";
  return `<section class="practice-lab-empty-state"><div class="eyebrow">Same-session check</div><h2>${escapeHtml(check.immediateDirection)}</h2><dl><div><dt>Baseline quality</dt><dd>${formatNumber(check.entryQuality)}</dd></div><div><dt>Check quality</dt><dd>${formatNumber(check.exitQuality)}</dd></div><div><dt>Immediate change</dt><dd>${signed}</dd></div></dl><p>${escapeHtml(check.interpretation.wording)}</p><p><strong>Not established:</strong> mastery, retention, transfer, or causal improvement.</p></section>`;
}

function renderResult(root, finalResult) {
  const summary = finalResult?.summary ?? null;
  const analysis = summary?.analysis ?? null;
  root.innerHTML = `<section class="screen practice-lab-screen practice-combination-results" data-practice-view="session-result">
    <div class="practice-lab-shell"><main class="practice-lab-detail">
      <div class="eyebrow">Combination Repair complete</div>
      <h1>Session results</h1>
      <p class="practice-lab-lead">This is an immediate within-session training check, not a mastery or transfer test.</p>
      ${resultInterpretation(analysis)}
      <section class="practice-lab-empty-state"><h2>Phase evidence</h2><table><thead><tr><th>Phase</th><th>Opportunities</th><th>Quality</th></tr></thead><tbody>${phaseResultRows(analysis)}</tbody></table></section>
      <section class="practice-lab-empty-state"><h2>Session</h2><dl><div><dt>WPM</dt><dd>${formatNumber(summary?.metrics?.wpm)}</dd></div><div><dt>Accuracy</dt><dd>${formatPercent(summary?.metrics?.accuracy)}</dd></div></dl></section>
      <button type="button" data-combination-session-action="finish">BACK TO COMBINATION REPAIR</button>
    </main></div>
  </section>`;
}

function renderFailure(root, error) {
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="session-error"><div class="practice-lab-shell"><main class="practice-lab-detail"><div class="eyebrow">Combination Repair</div><h1>Session could not start</h1><div class="practice-lab-notice" role="alert"><strong>${escapeHtml(error?.code ?? "SESSION_ERROR")}</strong><p>${escapeHtml(error?.message ?? "The Practice session could not be initialized.")}</p></div><button type="button" data-combination-session-action="finish">BACK</button></main></div></section>`;
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

export async function mountPracticeCombinationRepairSession({
  root,
  session,
  onExit = () => {},
  logger = null,
  dependencies = {},
} = {}) {
  if (!root?.addEventListener || !root?.removeEventListener) throw new TypeError("Combination Repair session host requires a DOM root");
  if (!session?.experiment || !session?.contentPlan) throw new TypeError("Combination Repair session host requires a prepared Practice session");

  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore();
  const manifestStore = dependencies.manifestStore ?? createPracticeManifestStore();
  const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore });
  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  const engineFactory = dependencies.engineFactory ?? createPracticeSessionEngine;
  const engine = engineFactory({
    repository,
    profileId: initialized.profile.profileId,
    contextId: initialized.context.contextId,
    logger,
  });

  let finalResult = null;
  let closed = false;
  let unsubscribe = null;

  const focusCapture = () => queueMicrotask(() => root.querySelector?.("[data-combination-input]")?.focus?.({ preventScroll: true }));
  const renderSnapshot = (snapshot) => {
    if (closed || finalResult) return;
    renderActive(root, { contentPlan: session.contentPlan, snapshot });
    if (snapshot.lifecycleState === "active") focusCapture();
  };

  const finish = async () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    root.removeEventListener("beforeinput", beforeInput);
    root.removeEventListener("keydown", keyDown);
    root.removeEventListener("click", click);
    root.removeEventListener("pointerdown", pointerDown);
    globalThis.document?.removeEventListener?.("visibilitychange", visibilityChange);
    try { await engine.destroy(); } catch (error) { logger?.warn?.("Combination Repair engine destroy failed", error); }
    try { dataStore.close?.(); } catch {}
    onExit(finalResult);
  };

  const handleNormalized = (input) => {
    const outcome = engine.handleInput(input);
    if (!outcome.accepted && outcome.reason === "invalid-input") logger?.warn?.("Combination Repair rejected normalized input", outcome.errors);
    return outcome;
  };

  const beforeInput = (event) => {
    if (closed || finalResult) return;
    const capture = event.target?.closest?.("[data-combination-input]");
    if (!capture || !root.contains?.(capture)) return;
    event.preventDefault();
    if (INSERT_TYPES.has(event.inputType) && typeof event.data === "string" && event.data.length) {
      for (const value of Array.from(event.data.normalize("NFC"))) handleNormalized(normalizedInput(value === " " ? "space" : "character", value === " " ? " " : value));
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
    const action = target.dataset.combinationSessionAction;
    if (action === "pause") void engine.pause("manual");
    else if (action === "resume") void engine.resume();
    else if (action === "abandon") void engine.abandon("manual-stop").then(() => finish()).catch((error) => { logger?.warn?.("Combination Repair abandon failed", error); void finish(); });
    else if (action === "finish") void finish();
  };

  const pointerDown = () => {
    if (engine.getSnapshot().lifecycleState === "active") focusCapture();
  };

  const visibilityChange = () => {
    const state = globalThis.document?.visibilityState;
    if (state === "hidden" || state === "visible") void engine.handleVisibilityState(state).catch((error) => logger?.warn?.("Combination Repair visibility transition failed", error));
  };

  root.addEventListener("beforeinput", beforeInput);
  root.addEventListener("keydown", keyDown);
  root.addEventListener("click", click);
  root.addEventListener("pointerdown", pointerDown);
  globalThis.document?.addEventListener?.("visibilitychange", visibilityChange);

  try {
    await engine.prepare({
      experiment: session.experiment,
      configuration: session.configuration,
      contentPlan: session.contentPlan,
    });
    unsubscribe = engine.subscribe((snapshot, event) => {
      if (event === "completed") {
        void engine.complete().then((result) => {
          finalResult = result;
          renderResult(root, result);
        }).catch((error) => {
          logger?.warn?.("Combination Repair result retrieval failed", error);
          renderFailure(root, error);
        });
        return;
      }
      renderSnapshot(snapshot);
    });
    const snapshot = await engine.start();
    renderSnapshot(snapshot);
  } catch (error) {
    logger?.warn?.("Combination Repair session initialization failed", error);
    renderFailure(root, error);
  }

  return Object.freeze({
    engine,
    getResult: () => finalResult,
    async exit() {
      if (!finalResult && ["active", "paused", "ready"].includes(engine.getSnapshot().lifecycleState)) {
        try { await engine.abandon("manual-stop"); } catch {}
      }
      await finish();
    },
  });
}
