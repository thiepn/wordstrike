import { createPracticeSessionPulse } from "./practiceSessionPulse.js";
import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";

const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
const n = (value, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
const pct = (value) => Number.isFinite(value) ? `${n(value, 1)}%` : "—";

function textWindow(contentPlan, snapshot) {
  const chars = Array.from(contentPlan.text); const cursor = snapshot.cursorIndex ?? 0; const errors = new Set(snapshot.errorPositions ?? []); const start = Math.max(0, cursor - 160); const end = Math.min(chars.length, cursor + 420);
  return chars.slice(start, end).map((value, offset) => { const index = start + offset; const classes = ["practice-real-text-char"]; if (index < cursor) classes.push(errors.has(index) ? "is-error" : "is-typed"); if (index === cursor) classes.push("is-current"); return `<span class="${classes.join(" ")}">${value === " " ? "&nbsp;" : escapeHtml(value)}</span>`; }).join("");
}
function renderActive(root, session, snapshot) {
  const active = snapshot.timing?.activeDurationMs ?? 0; const stage = session.experiment.paceAccumulator?.getCurrentStage(active); const remainingTotal = Math.max(0, session.plan.totalActiveDurationMs - active); const overall = Math.min(100, 100 * active / session.plan.totalActiveDurationMs);
  const stageLabel = stage?.kind === "calibration" ? "Calibration" : stage?.kind === "validation" ? "Validation" : `Stage ${stage?.stageOrdinal ?? "—"} of 5`;
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="pace-ladder-session"><div class="practice-lab-shell"><header class="practice-real-text-session-header"><div><div class="eyebrow">Pace Ladder · diagnostic</div><h1>${stageLabel}</h1><p>Target ${n(stage?.targetWpm, 0)} WPM · ${n((stage?.remainingMs ?? 0) / 1000, 0)} s in this stage · ${n(remainingTotal / 1000, 0)} s total remaining</p></div><button type="button" data-pace-session-action="stop" aria-label="Stop Pace Ladder">STOP</button></header><div role="progressbar" aria-label="Pace Ladder progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(overall)}" style="max-width:100%"><div style="width:${overall}%"></div></div><p class="practice-lab-muted" aria-live="polite">Keep typing naturally. The target is protocol information only; no live speed-chasing feedback is shown.</p><section class="practice-real-text-typing" aria-label="Pace Ladder diagnostic passage" style="max-width:100%;overflow-wrap:anywhere">${textWindow(session.contentPlan, snapshot)}</section><textarea data-pace-input aria-label="Pace Ladder typing input" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea></div></section>`;
}
function rows(stages = []) { return stages.map((s) => `<tr><th scope="row">${escapeHtml(s.stageId)}</th><td>${n(s.targetWpm, 0)}</td><td>${n(s.correctedWpm, 1)}</td><td>${pct(s.strictAccuracy)}</td><td>${pct(Number.isFinite(s.correctionOverheadRate) ? s.correctionOverheadRate * 100 : null)}</td><td>${n(s.pauseP95Ms, 0)}</td><td>${n(s.ikiCv, 2)}</td><td>${escapeHtml(s.coverage)}</td></tr>`).join(""); }
function renderResult(root, artifact, interrupted = false) {
  const summary = artifact?.summary ?? {}; const band = summary.recommendedPracticeBandWpm;
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="pace-ladder-result"><div class="practice-lab-shell"><main class="practice-lab-detail"><div class="eyebrow">Pace Ladder ${interrupted ? "stopped" : "complete"}</div><h1>${interrupted ? "Incomplete diagnostic" : "Control frontier diagnostic"}</h1><p role="status">${escapeHtml(summary.status ?? (interrupted ? "interrupted" : "insufficient-measurement"))}</p><dl class="practice-real-text-result-grid"><div><dt>Sustainable pace</dt><dd>${n(summary.sustainableWpm, 0)} WPM</dd></div><div><dt>Stretch pace</dt><dd>${n(summary.stretchWpm, 0)} WPM</dd></div><div><dt>Over-limit pace</dt><dd>${n(summary.overLimitWpm, 0)} WPM</dd></div><div><dt>PL14 frontier</dt><dd>${n(summary.frontierWpm, 0)} WPM · ${escapeHtml(summary.frontierStatus ?? "insufficient-measurement")}</dd></div><div><dt>Practice band</dt><dd>${band ? `${n(band[0], 0)}–${n(band[1], 0)} WPM` : "—"}</dd></div></dl><div style="overflow-x:auto;max-width:100%"><table><thead><tr><th>Stage</th><th>Target</th><th>Corrected</th><th>Accuracy</th><th>Corrections</th><th>Pause p95</th><th>Rhythm CV</th><th>Coverage</th></tr></thead><tbody>${rows(artifact?.stages)}</tbody></table></div><div class="practice-lab-notice" role="note"><p>This is the fastest pace you sustained under this protocol.</p><p>This does not estimate your true maximum speed.</p><p>For accuracy-focused practice, this band is a reasonable starting point.</p></div><button type="button" data-pace-session-action="finish">BACK TO PACE LADDER</button></main></div></section>`;
}
function input(type, value) { return { type, value, source: "browser-input", monotonicTimestampMs: Math.max(0, globalThis.performance?.now?.() ?? Date.now()), wallTimestampUtc: new Date().toISOString(), modifiers: { ctrl: false, meta: false, alt: false, shift: false } }; }

export async function mountPracticePaceLadderSession({ root, session, onExit = () => {}, logger = null, dependencies = {} } = {}) {
  if (!root?.addEventListener || !session?.experiment || !session?.contentPlan) throw new TypeError("Pace Ladder host requires a prepared session");
  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore();
  const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore: dependencies.manifestStore ?? createPracticeManifestStore() });
  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  if (initialized.context.contextId !== session.contextId || initialized.profile.profileId !== session.profileId) throw Object.assign(new Error("Practice context changed after Pace Ladder preparation"), { code: "PRACTICE_CONTEXT_MISMATCH" });
  const engine = (dependencies.engineFactory ?? createPracticeSessionEngine)({ repository, sessionId: session.sessionId, profileId: session.profileId, contextId: session.contextId, logger });
  let finalResult = null;
  let closed = false;
  let interrupted = false;
  let completing = false;
  let unsubscribe = null;
  let pulseLoop = null;
  const running = () => !closed && !interrupted && !completing && !finalResult;
  const focus = () => queueMicrotask(() => {
    if (running()) root.querySelector?.("[data-pace-input]")?.focus?.({ preventScroll: true });
  });
  const cleanup = async (notify = true) => {
    if (closed) return;
    closed = true;
    pulseLoop?.stop();
    unsubscribe?.();
    root.removeEventListener("beforeinput", beforeInput);
    root.removeEventListener("keydown", keyDown);
    root.removeEventListener("click", click);
    globalThis.document?.removeEventListener?.("visibilitychange", visibilityChange);
    try { await engine.destroy(); } catch {}
    try { dataStore.close?.(); } catch {}
    if (notify) onExit(finalResult);
  };
  const interrupt = async (reason) => {
    if (!running()) return;
    interrupted = true;
    pulseLoop?.stop();
    session.experiment.paceAccumulator?.markInterrupted(reason);
    const snapshot = engine.getSnapshot();
    try { await engine.interrupt(reason); } catch {}
    if (closed) return;
    const paceResult = session.experiment.paceAccumulator?.finalize({ finalActiveDurationMs: snapshot.timing?.activeDurationMs ?? 0 });
    const { analyzePracticePaceLadderResult } = await import("./practicePaceLadderAnalyzer.js");
    if (closed) return;
    const analysis = analyzePracticePaceLadderResult({ paceResult, plan: session.plan, foundationAnalysis: null, startedAt: session.preparedAt, completedAt: new Date().toISOString() });
    finalResult = { interrupted: true, artifact: analysis.trainingQuality };
    renderResult(root, analysis.trainingQuality, true);
  };
  const beforeInput = (event) => {
    const target = event.target?.closest?.("[data-pace-input]");
    if (!target || !running() || !root.contains?.(target)) return;
    event.preventDefault();
    if (INSERT_TYPES.has(event.inputType) && typeof event.data === "string") {
      for (const ch of Array.from(event.data.normalize("NFC"))) engine.handleInput(input(ch === " " ? "space" : "character", ch));
    } else if (event.inputType === "deleteContentBackward") engine.handleInput(input("backspace", ""));
    else if (event.inputType === "deleteWordBackward") engine.handleInput(input("word-delete", ""));
    target.value = "";
  };
  const keyDown = (event) => {
    if (event.key === "Escape") { event.preventDefault(); void interrupt("manual-stop"); }
    else if ((event.ctrlKey || event.metaKey) && ["v", "x"].includes(String(event.key).toLowerCase())) event.preventDefault();
  };
  const click = (event) => {
    const button = event.target?.closest?.("[data-pace-session-action]");
    if (!button || !root.contains?.(button)) return;
    if (button.dataset.paceSessionAction === "stop") void interrupt("manual-stop");
    else if (button.dataset.paceSessionAction === "finish") void cleanup();
  };
  const visibilityChange = () => {
    if (globalThis.document?.visibilityState === "hidden" && running()) void interrupt("visibility-hidden");
  };

  try {
    await engine.prepare({ experiment: session.experiment, configuration: session.configuration, contentPlan: session.contentPlan });
    unsubscribe = engine.subscribe((snapshot, event) => {
      if (!running()) return;
      if (event === "completed") {
        completing = true;
        pulseLoop?.stop();
        void engine.complete().then((result) => {
          if (closed || interrupted) return;
          finalResult = result;
          renderResult(root, result.summary?.trainingQuality, false);
        }).catch((error) => {
          completing = false;
          logger?.warn?.("Pace Ladder completion retrieval failed", error);
          void interrupt("measurement-corruption");
        });
        return;
      }
      if (snapshot.lifecycleState === "active") { renderActive(root, session, snapshot); focus(); }
    });
    root.addEventListener("beforeinput", beforeInput);
    root.addEventListener("keydown", keyDown);
    root.addEventListener("click", click);
    globalThis.document?.addEventListener?.("visibilitychange", visibilityChange);
    const snapshot = await engine.start();
    if (running()) { renderActive(root, session, snapshot); focus(); }
    pulseLoop = createPracticeSessionPulse({
      ...dependencies.pulseTimers,
      intervalMs: 200,
      isActive: running,
      run: async () => {
        const { completed, snapshot: tickSnapshot } = await engine.tick();
        if (running() && !completed && tickSnapshot) { renderActive(root, session, tickSnapshot); focus(); }
      },
      onError: async (error) => {
        logger?.warn?.("Pace Ladder timer failed", error);
        await interrupt("measurement-corruption");
      },
    });
    pulseLoop.start();
    visibilityChange();
  } catch (error) {
    await cleanup(false);
    throw error;
  }
  return Object.freeze({ getSnapshot: () => engine.getSnapshot(), exit: cleanup, interrupt });
}
