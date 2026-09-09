import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";
import {
  PRACTICE_BURST_RECOVERY_DURATION_MS,
  PRACTICE_BURST_SPRINT_COUNT,
  PRACTICE_BURST_SPRINT_DURATION_MS,
  PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS,
} from "./practiceBurstSprintsConstants.js";

const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const n = (value, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
const pct = (value) => Number.isFinite(value) ? `${n(value, 1)}%` : "—";

function textWindow(contentPlan, snapshot) {
  const chars = Array.from(contentPlan.text);
  const cursor = snapshot.cursorIndex ?? 0;
  const errors = new Set(snapshot.errorPositions ?? []);
  const start = Math.max(0, cursor - 120);
  const end = Math.min(chars.length, cursor + 360);
  return chars.slice(start, end).map((value, offset) => {
    const index = start + offset;
    const classes = ["practice-real-text-char"];
    if (index < cursor) classes.push(errors.has(index) ? "is-error" : "is-typed");
    if (index === cursor) classes.push("is-current");
    return `<span class="${classes.join(" ")}">${value === " " ? "&nbsp;" : escapeHtml(value)}</span>`;
  }).join("");
}

function renderSprint(root, session, snapshot, sprintOrdinal) {
  const activeMs = snapshot.timing?.activeDurationMs ?? 0;
  const sprintStart = (sprintOrdinal - 1) * PRACTICE_BURST_SPRINT_DURATION_MS;
  const elapsed = Math.max(0, Math.min(PRACTICE_BURST_SPRINT_DURATION_MS, activeMs - sprintStart));
  const remaining = Math.max(0, PRACTICE_BURST_SPRINT_DURATION_MS - elapsed);
  const overall = Math.min(100, 100 * activeMs / PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS);
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="burst-sprints-session"><div class="practice-lab-shell"><header class="practice-real-text-session-header"><div><div class="eyebrow">Burst Sprints · sprint ${sprintOrdinal} of ${PRACTICE_BURST_SPRINT_COUNT}</div><h1>Fast, but controlled</h1><p>${n(remaining / 1000, 1)} s remaining in this sprint</p></div><button type="button" data-burst-session-action="stop" aria-label="Stop Burst Sprints">STOP</button></header><div role="progressbar" aria-label="Burst Sprints active progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(overall)}"><div style="width:${overall}%"></div></div><p class="practice-lab-muted" aria-live="polite">Push above your sustainable pace without deliberately sacrificing control. Live WPM is hidden so the bout stays execution-focused.</p><section class="practice-real-text-typing" aria-label="Burst sprint passage" style="max-width:100%;overflow-wrap:anywhere">${textWindow(session.contentPlan, snapshot)}</section><textarea data-burst-input aria-label="Burst Sprints typing input" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea></div></section>`;
}

function renderRecovery(root, sprintOrdinal, remainingMs) {
  const nextSprint = Math.min(PRACTICE_BURST_SPRINT_COUNT, sprintOrdinal + 1);
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="burst-sprints-recovery"><div class="practice-lab-shell"><header class="practice-real-text-session-header"><div><div class="eyebrow">Burst Sprints · recovery</div><h1>Release and reset</h1><p>${n(Math.max(0, remainingMs) / 1000, 1)} s until sprint ${nextSprint}</p></div><button type="button" data-burst-session-action="stop" aria-label="Stop Burst Sprints">STOP</button></header><section class="practice-lab-empty-state"><p>Do not type during recovery. The timer is excluded from active sprint measurement.</p><p class="practice-lab-muted">Sprint ${sprintOrdinal} complete · next: ${nextSprint} of ${PRACTICE_BURST_SPRINT_COUNT}</p></section></div></section>`;
}

function renderRows(sprints = [], selected = new Set()) {
  return sprints.map((sprint) => `<tr><th scope="row">${escapeHtml(sprint.sprintId)}</th><td>${n(sprint.correctedWpm, 1)}</td><td>${pct(sprint.strictAccuracy)}</td><td>${pct(Number.isFinite(sprint.correctionOverheadRate) ? sprint.correctionOverheadRate * 100 : null)}</td><td>${sprint.eligible ? "eligible" : "excluded"}</td><td>${selected.has(sprint.sprintId) ? "used" : "—"}</td></tr>`).join("");
}

function renderResult(root, artifact, interrupted = false) {
  const selected = new Set(artifact?.selectedSprintIds ?? []);
  const reserve = Number.isFinite(artifact?.burstReservePercent) ? `${artifact.burstReservePercent >= 0 ? "+" : ""}${n(artifact.burstReservePercent, 1)}%` : "—";
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="burst-sprints-result"><div class="practice-lab-shell"><main class="practice-lab-detail"><div class="eyebrow">Burst Sprints ${interrupted ? "stopped" : "complete"}</div><h1>${interrupted ? "Incomplete sprint protocol" : "Burst ability diagnostic"}</h1><p role="status">${escapeHtml(artifact?.status ?? (interrupted ? "interrupted" : "incomplete"))}</p><dl class="practice-real-text-result-grid"><div><dt>Robust burst estimate</dt><dd>${n(artifact?.burstEstimateWpm, 1)} WPM</dd></div><div><dt>Estimate accuracy</dt><dd>${pct(artifact?.burstAccuracy)}</dd></div><div><dt>Eligible sprints</dt><dd>${artifact?.eligibleSprintCount ?? 0} / ${PRACTICE_BURST_SPRINT_COUNT}</dd></div><div><dt>Controlled-speed reference</dt><dd>${n(artifact?.referenceControlledWpm, 1)} WPM</dd></div><div><dt>Burst reserve</dt><dd>${reserve}</dd></div></dl><div style="overflow-x:auto;max-width:100%"><table><thead><tr><th>Sprint</th><th>Corrected WPM</th><th>Accuracy</th><th>Correction overhead</th><th>Eligibility</th><th>Estimator</th></tr></thead><tbody>${renderRows(artifact?.sprints, selected)}</tbody></table></div><div class="practice-lab-notice" role="note"><p>${escapeHtml(artifact?.interpretation ?? "No burst estimate was admitted.")}</p><p>The result is a short-form burst estimate under this six-bout protocol, not a universal maximum typing speed or a single lucky personal best.</p></div><button type="button" data-burst-session-action="finish">BACK TO BURST SPRINTS</button></main></div></section>`;
}

function normalizedInput(type, value) {
  return {
    type,
    value,
    source: "browser-input",
    monotonicTimestampMs: Math.max(0, globalThis.performance?.now?.() ?? Date.now()),
    wallTimestampUtc: new Date().toISOString(),
    modifiers: { ctrl: false, meta: false, alt: false, shift: false },
  };
}

export async function mountPracticeBurstSprintsSession({ root, session, onExit = () => {}, logger = null, dependencies = {} } = {}) {
  if (!root?.addEventListener || !session?.experiment || !session?.contentPlan) throw new TypeError("Burst Sprints host requires a prepared session");
  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore();
  const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore: dependencies.manifestStore ?? createPracticeManifestStore() });
  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  if (initialized.context.contextId !== session.contextId || initialized.profile.profileId !== session.profileId) throw Object.assign(new Error("Practice context changed after Burst Sprints preparation"), { code: "PRACTICE_CONTEXT_MISMATCH" });
  const engine = (dependencies.engineFactory ?? createPracticeSessionEngine)({ repository, sessionId: session.sessionId, profileId: session.profileId, contextId: session.contextId, logger });

  let finalResult = null;
  let closed = false;
  let unsubscribe = null;
  let pulseTimer = null;
  let phase = "sprint";
  let sprintOrdinal = 1;
  let recoveryEndsAt = null;
  let transitionPromise = null;

  const focus = () => queueMicrotask(() => root.querySelector?.("[data-burst-input]")?.focus?.({ preventScroll: true }));
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    if (pulseTimer) clearInterval(pulseTimer);
    unsubscribe?.();
    root.removeEventListener("beforeinput", beforeInput);
    root.removeEventListener("keydown", keyDown);
    root.removeEventListener("click", click);
    globalThis.document?.removeEventListener?.("visibilitychange", visibilityChange);
    try { await engine.destroy(); } catch {}
    try { dataStore.close?.(); } catch {}
    onExit(finalResult);
  };

  const buildInterruptedArtifact = async () => {
    const snapshot = engine.getSnapshot();
    const result = session.experiment.burstAccumulator?.finalize({ finalActiveDurationMs: snapshot.timing?.activeDurationMs ?? 0 });
    const { analyzePracticeBurstSprintsResult } = await import("./practiceBurstSprintsAnalyzer.js");
    return analyzePracticeBurstSprintsResult({ burstResult: result, plan: session.plan, foundationAnalysis: null }).trainingQuality;
  };

  const interrupt = async (reason = "manual-stop") => {
    if (closed || finalResult) return;
    session.experiment.burstAccumulator?.markInterrupted(reason);
    try { await engine.interrupt(reason); } catch {}
    const artifact = await buildInterruptedArtifact();
    finalResult = { interrupted: true, artifact };
    renderResult(root, artifact, true);
  };

  const beforeInput = (event) => {
    const target = event.target?.closest?.("[data-burst-input]");
    if (!target || closed || finalResult || phase !== "sprint" || !root.contains?.(target)) return;
    event.preventDefault();
    const activeMs = engine.getSnapshot().timing?.activeDurationMs ?? 0;
    const sprintEnd = sprintOrdinal * PRACTICE_BURST_SPRINT_DURATION_MS;
    if (activeMs >= sprintEnd) return;
    if (INSERT_TYPES.has(event.inputType) && typeof event.data === "string") {
      for (const char of Array.from(event.data.normalize("NFC"))) engine.handleInput(normalizedInput(char === " " ? "space" : "character", char));
    } else if (event.inputType === "deleteContentBackward") engine.handleInput(normalizedInput("backspace", ""));
    else if (event.inputType === "deleteWordBackward") engine.handleInput(normalizedInput("word-delete", ""));
    target.value = "";
  };

  const keyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      void interrupt("manual-stop");
    } else if ((event.ctrlKey || event.metaKey) && ["v", "x"].includes(String(event.key).toLowerCase())) event.preventDefault();
  };

  const click = (event) => {
    const button = event.target?.closest?.("[data-burst-session-action]");
    if (!button || !root.contains?.(button)) return;
    if (button.dataset.burstSessionAction === "stop") void interrupt("manual-stop");
    else if (button.dataset.burstSessionAction === "finish") void cleanup();
  };

  const visibilityChange = () => {
    if (globalThis.document?.visibilityState === "hidden" && !closed && !finalResult) void interrupt("visibility-hidden");
  };

  async function beginRecovery() {
    if (transitionPromise || sprintOrdinal >= PRACTICE_BURST_SPRINT_COUNT || finalResult || closed) return;
    phase = "transition";
    transitionPromise = engine.pause("burst-recovery").then(() => {
      recoveryEndsAt = Date.now() + PRACTICE_BURST_RECOVERY_DURATION_MS;
      phase = "recovery";
      renderRecovery(root, sprintOrdinal, PRACTICE_BURST_RECOVERY_DURATION_MS);
    }).catch((error) => {
      logger?.warn?.("Burst Sprints recovery pause failed", error);
      void interrupt("measurement-corruption");
    }).finally(() => { transitionPromise = null; });
    await transitionPromise;
  }

  async function endRecovery() {
    if (transitionPromise || phase !== "recovery" || finalResult || closed) return;
    phase = "transition";
    transitionPromise = engine.resume().then((snapshot) => {
      sprintOrdinal += 1;
      recoveryEndsAt = null;
      phase = "sprint";
      renderSprint(root, session, snapshot, sprintOrdinal);
      focus();
    }).catch((error) => {
      logger?.warn?.("Burst Sprints recovery resume failed", error);
      void interrupt("measurement-corruption");
    }).finally(() => { transitionPromise = null; });
    await transitionPromise;
  }

  async function pulse() {
    if (closed || finalResult || transitionPromise) return;
    if (phase === "recovery") {
      const remaining = Math.max(0, (recoveryEndsAt ?? Date.now()) - Date.now());
      renderRecovery(root, sprintOrdinal, remaining);
      if (remaining <= 0) await endRecovery();
      return;
    }
    if (phase !== "sprint") return;
    const snapshot = engine.getSnapshot();
    const activeMs = snapshot.timing?.activeDurationMs ?? 0;
    const sprintEnd = sprintOrdinal * PRACTICE_BURST_SPRINT_DURATION_MS;
    if (sprintOrdinal < PRACTICE_BURST_SPRINT_COUNT && activeMs >= sprintEnd) {
      await beginRecovery();
      return;
    }
    if (sprintOrdinal === PRACTICE_BURST_SPRINT_COUNT && activeMs >= PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS) {
      try { await engine.tick(); } catch (error) {
        logger?.warn?.("Burst Sprints completion tick failed", error);
        await interrupt("measurement-corruption");
      }
      return;
    }
    renderSprint(root, session, snapshot, sprintOrdinal);
    focus();
  }

  root.addEventListener("beforeinput", beforeInput);
  root.addEventListener("keydown", keyDown);
  root.addEventListener("click", click);
  globalThis.document?.addEventListener?.("visibilitychange", visibilityChange);

  await engine.prepare({ experiment: session.experiment, configuration: session.configuration, contentPlan: session.contentPlan });
  unsubscribe = engine.subscribe((snapshot, event) => {
    if (event === "completed") {
      void engine.complete().then((result) => {
        finalResult = result;
        phase = "result";
        renderResult(root, result.summary?.trainingQuality, false);
      }).catch((error) => {
        logger?.warn?.("Burst Sprints completion retrieval failed", error);
        void interrupt("measurement-corruption");
      });
      return;
    }
    if (!finalResult && phase === "sprint" && snapshot.lifecycleState === "active") {
      renderSprint(root, session, snapshot, sprintOrdinal);
      focus();
    }
  });

  const startSnapshot = await engine.start();
  renderSprint(root, session, startSnapshot, sprintOrdinal);
  focus();
  pulseTimer = setInterval(() => { void pulse(); }, 50);

  return Object.freeze({
    getSnapshot: () => Object.freeze({
      engine: engine.getSnapshot(),
      phase,
      sprintOrdinal,
      recoveryRemainingMs: phase === "recovery" ? Math.max(0, (recoveryEndsAt ?? Date.now()) - Date.now()) : 0,
    }),
    exit: cleanup,
    interrupt,
  });
}
