import { createPracticeSessionPulse } from "./practiceSessionPulse.js";
import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";

const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const finite = Number.isFinite;
const number = (value, digits = 1) => finite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
const pct = (value) => finite(value) ? `${number(value * 100)}%` : "—";
const formatRemaining = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
const normalizedInput = (type, value) => ({
  type, value, source: "browser-input",
  monotonicTimestampMs: Math.max(0, globalThis.performance?.now?.() ?? Date.now()),
  wallTimestampUtc: new Date().toISOString(),
  modifiers: { ctrl: false, meta: false, alt: false, shift: false },
});

function renderText(contentPlan, snapshot) {
  const chars = Array.from(contentPlan.text);
  const cursor = snapshot.cursorIndex ?? 0;
  const errors = new Set(snapshot.errorPositions ?? []);
  const start = Math.max(0, cursor - 120);
  const end = Math.min(chars.length, cursor + 520);
  return chars.slice(start, end).map((value, offset) => {
    const index = start + offset;
    const classes = ["practice-real-text-char"];
    if (index < cursor) classes.push(errors.has(index) ? "is-error" : "is-typed");
    if (index === cursor) classes.push("is-current");
    return `<span class="${classes.join(" ")}">${value === " " ? "&nbsp;" : value === "\n" ? "<br>" : escapeHtml(value)}</span>`;
  }).join("");
}

function labels(session) {
  const punctuation = session.plan.experimentId.startsWith("punctuation-capitals");
  return punctuation
    ? { mode: "Punctuation & Capitals", check: "Punctuation & Capitals Check" }
    : { mode: "Numbers & Symbols", check: "Numbers & Symbols Check" };
}

function renderActive(root, session, snapshot) {
  const check = session.flow === "check";
  const names = labels(session);
  const activeMs = snapshot.timing?.activeDurationMs ?? 0;
  const expected = snapshot.content?.expectedLength ?? Array.from(session.contentPlan.text).length;
  const cursor = snapshot.cursorIndex ?? 0;
  const progress = check ? (expected ? Math.min(100, cursor / expected * 100) : 0) : Math.min(100, activeMs / session.plan.durationMs * 100);
  const secondary = check ? `${Math.round(progress)}% of standardized form` : `${formatRemaining(Math.max(0, session.plan.durationMs - activeMs))} remaining`;
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="special-domain-session" data-special-domain-flow="${session.flow}">
    <div class="practice-lab-shell">
      <header class="practice-real-text-session-header">
        <div><div class="eyebrow">${escapeHtml(check ? names.check : `${names.mode} Practice`)}</div><h1>${escapeHtml(secondary)}</h1><p>Type the visible text exactly. Live WPM and aggregate accuracy are hidden.</p></div>
        <button type="button" data-special-domain-session-action="stop">STOP</button>
      </header>
      <div class="practice-weak-key-progress" role="progressbar" aria-label="${check ? "Check form progress" : "Practice time"}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><span style="width:${progress.toFixed(2)}%"></span></div>
      <section class="practice-real-text-typing" aria-label="${escapeHtml(check ? names.check : `${names.mode} Practice`)} typing material">${renderText(session.contentPlan, snapshot)}</section>
      <textarea data-special-domain-input aria-label="${escapeHtml(names.mode)} typing input" inputmode="text" autocomplete="off" autocorrect="off" spellcheck="false" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea>
    </div>
  </section>`;
}

const categoryLabel = (value) => ({
  "capital-letter": "Capitals",
  comma: "Comma",
  "terminal-mark": "Terminal marks",
  "colon-semicolon": "Colon / semicolon",
  "quote-apostrophe": "Quotes / apostrophes",
  "bracket-dash": "Brackets / dash",
  digit: "Digits",
  "operator-symbol": "Operators",
  "identifier-symbol": "Identifiers",
  "commerce-percent-symbol": "Commerce / percent",
})[value] ?? value;

function categoryRows(categories = {}) {
  return Object.entries(categories).map(([key, value]) => `<tr><th scope="row">${escapeHtml(categoryLabel(key))}</th><td>${pct(value.firstPassAccuracy)}</td><td>${value.timingEligibleCount >= 5 ? pct(value.disfluencyRate) : "—"}</td></tr>`).join("");
}
function abilityInterval(estimate) {
  return finite(estimate?.interval95LowerWpm) && finite(estimate?.interval95UpperWpm)
    ? `${number(estimate.interval95LowerWpm)}–${number(estimate.interval95UpperWpm)} WPM`
    : "—";
}

export function renderPracticeSpecialDomainResult(root, session, finalResult, abilityState = null) {
  const result = finalResult?.summary?.trainingQuality ?? null;
  const check = session.flow === "check";
  const punctuation = session.plan.experimentId.startsWith("punctuation-capitals");
  const names = labels(session);
  const ability = abilityState?.estimate ?? abilityState?.currentEstimate ?? null;
  const derived = punctuation
    ? `<section class="practice-lab-empty-state"><h2>Boundary Control</h2><dl class="practice-real-text-result-grid"><div><dt>After-punctuation spacing</dt><dd>${pct(result?.postPunctuationBoundary?.firstPassAccuracy)}</dd></div><div><dt>Sentence capitals</dt><dd>${pct(result?.sentenceCapital?.firstPassAccuracy)}</dd></div></dl></section>`
    : `<section class="practice-lab-empty-state"><h2>Sequences</h2><dl class="practice-real-text-result-grid"><div><dt>Digit runs</dt><dd>${pct(result?.digitRuns?.wholeRunFirstPassAccuracy)}</dd></div><div><dt>Mixed practical tokens</dt><dd>${pct(result?.mixedPracticalTokens?.wholeTokenFirstPassAccuracy)}</dd></div></dl></section>`;
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="special-domain-result"><div class="practice-lab-shell"><main class="practice-lab-detail">
    <div class="eyebrow">${escapeHtml(check ? `${names.check} result` : `${names.mode} Practice result`)}</div>
    <h1>${escapeHtml(check ? `${names.mode} Ability` : `${names.mode} Practice`)}</h1>
    <dl class="practice-real-text-result-grid">
      <div><dt>WPM</dt><dd>${number(result?.wpm)} WPM</dd></div>
      <div><dt>Domain first-pass accuracy</dt><dd>${pct(result?.domainFirstPassAccuracy)}</dd></div>
    </dl>
    ${check ? `<section class="practice-lab-empty-state"><h2>Current protocol ability</h2><dl class="practice-real-text-result-grid"><div><dt>Estimate WPM</dt><dd>${number(ability?.estimateWpm)} WPM</dd></div><div><dt>95% model interval</dt><dd>${abilityInterval(ability)}</dd></div><div><dt>Confidence</dt><dd>${escapeHtml(ability?.confidenceLevel ?? abilityState?.confidenceLevel ?? "—")}</dd></div></dl></section>` : ""}
    <section class="practice-lab-empty-state"><h2>${punctuation ? "Punctuation Profile" : "Domain Profile"}</h2><table><thead><tr><th scope="col">Category</th><th scope="col">Accuracy</th><th scope="col">Disfluency</th></tr></thead><tbody>${categoryRows(result?.categories)}</tbody></table></section>
    ${derived}
    <div class="practice-lab-notice">${punctuation ? "Uppercase-letter accuracy measures expected textual output; it does not score which Shift key, Caps Lock, software keyboard, or other input method produced it." : "This is a transcription protocol. It measures typing digits and symbols, not numeracy, arithmetic skill, or a required physical modifier technique."}</div>
    <button type="button" data-special-domain-session-action="finish">BACK TO ${escapeHtml(names.mode.toUpperCase())}</button>
  </main></div></section>`;
  root.querySelector?.("[data-special-domain-session-action='finish']")?.focus?.({ preventScroll: true });
}

export async function mountPracticeSpecialDomainSession({ root, session, runtime = null, onExit = () => {}, logger = null, dependencies = {} } = {}) {
  if (!root?.addEventListener || !session?.experiment || !session?.contentPlan || !session?.plan) throw new TypeError("PL30 session host requires a prepared session");
  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore();
  const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore: dependencies.manifestStore ?? createPracticeManifestStore() });
  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  if (initialized.profile.profileId !== session.plan.profileId || initialized.context.contextId !== session.plan.contextId) throw Object.assign(new Error("Practice context changed after PL30 preparation"), { code: "PRACTICE_CONTEXT_MISMATCH" });
  const engine = (dependencies.engineFactory ?? createPracticeSessionEngine)({ repository, sessionId: session.plan.sessionId, profileId: initialized.profile.profileId, contextId: initialized.context.contextId, logger });

  let closed = false;
  let interrupted = false;
  let completing = false;
  let finalResult = null;
  let unsubscribe = null;
  let pulseLoop = null;
  const running = () => !closed && !interrupted && !completing && !finalResult;
  const focus = () => queueMicrotask(() => { if (running()) root.querySelector?.("[data-special-domain-input]")?.focus?.({ preventScroll: true }); });

  async function cleanup(notify = true) {
    if (closed) return;
    closed = true;
    pulseLoop?.stop();
    unsubscribe?.();
    root.removeEventListener("beforeinput", beforeInput);
    root.removeEventListener("keydown", keyDown);
    root.removeEventListener("click", click);
    root.removeEventListener("pointerdown", pointerDown);
    globalThis.document?.removeEventListener?.("visibilitychange", visibilityChange);
    try { await engine.destroy(); } catch {}
    try { dataStore.close?.(); } catch {}
    if (notify) onExit(finalResult);
  }
  async function interrupt(reason = "manual-stop") {
    if (!running()) return;
    interrupted = true;
    pulseLoop?.stop();
    try { await engine.abandon(reason); } catch {}
    await cleanup(true);
  }
  const beforeInput = (event) => {
    const capture = event.target?.closest?.("[data-special-domain-input]");
    if (!capture || !root.contains?.(capture) || !running()) return;
    event.preventDefault();
    if (INSERT_TYPES.has(event.inputType) && typeof event.data === "string") {
      for (const char of Array.from(event.data.normalize("NFC"))) engine.handleInput(normalizedInput(char === " " ? "space" : "character", char));
    } else if (event.inputType === "deleteContentBackward") engine.handleInput(normalizedInput("backspace", ""));
    else if (event.inputType === "deleteWordBackward") engine.handleInput(normalizedInput("word-delete", ""));
    capture.value = "";
  };
  const keyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && ["v", "x"].includes(String(event.key).toLowerCase())) event.preventDefault();
    if (event.key === "Escape") { event.preventDefault(); void interrupt("manual-stop"); }
  };
  const click = (event) => {
    const button = event.target?.closest?.("[data-special-domain-session-action]");
    if (!button || !root.contains?.(button)) return;
    if (button.dataset.specialDomainSessionAction === "stop") void interrupt("manual-stop");
    else if (button.dataset.specialDomainSessionAction === "finish") void cleanup(true);
  };
  const pointerDown = () => focus();
  const visibilityChange = () => {
    if (globalThis.document?.visibilityState === "hidden" && running()) void interrupt("visibility-hidden");
  };
  async function pulse() {
    if (!running() || session.flow === "check") return;
    const tick = await engine.tick();
    if (tick?.completed || !running()) return;
    renderActive(root, session, engine.getSnapshot());
    focus();
  }

  try {
    await engine.prepare({ experiment: session.experiment, configuration: session.configuration, contentPlan: session.contentPlan });
    unsubscribe = engine.subscribe((snapshot, event) => {
      if (!running() && event !== "completed") return;
      if (event === "completed") {
        completing = true;
        pulseLoop?.stop();
        void engine.complete().then(async (result) => {
          if (closed || interrupted) return;
          finalResult = result;
          completing = false;
          const abilityState = session.flow === "check" ? await runtime?.getAbilityState?.(session.experiment.abilityChannel).catch(() => null) : null;
          renderPracticeSpecialDomainResult(root, session, result, abilityState);
        }).catch((error) => {
          completing = false;
          logger?.warn?.("PL30 completion retrieval failed", error);
          void interrupt("measurement-corruption");
        });
        return;
      }
      if (snapshot.lifecycleState === "active") { renderActive(root, session, snapshot); focus(); }
    });
    root.addEventListener("beforeinput", beforeInput);
    root.addEventListener("keydown", keyDown);
    root.addEventListener("click", click);
    root.addEventListener("pointerdown", pointerDown);
    globalThis.document?.addEventListener?.("visibilitychange", visibilityChange);
    const start = await engine.start();
    renderActive(root, session, start);
    focus();
    if (session.flow === "practice") {
      pulseLoop = createPracticeSessionPulse({ run: pulse, intervalMs: 100, isActive: running, onError: (error) => { logger?.warn?.("PL30 session pulse failed", error); return interrupt("measurement-corruption"); } });
      pulseLoop.start();
    }
  } catch (error) {
    logger?.warn?.("PL30 session start failed", error);
    await cleanup(true);
    throw error;
  }
  return Object.freeze({
    stop: () => interrupt("manual-stop"),
    exit: () => cleanup(true),
    getSnapshot: () => engine.getSnapshot(),
  });
}
