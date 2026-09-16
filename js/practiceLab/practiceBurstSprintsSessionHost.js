import { createPracticeSessionPulse } from "./practiceSessionPulse.js";
import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionEngine } from "./practiceSessionEngine.js";
import {
  PRACTICE_BURST_PREVIEW_DURATION_MS,
  PRACTICE_BURST_RECOVERY_DURATION_MS,
  PRACTICE_BURST_SPRINT_COUNT,
  PRACTICE_BURST_SPRINT_DURATION_MS,
  PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS,
  PRACTICE_BURST_WARMUP_DURATION_MS,
} from "./practiceBurstSprintsConstants.js";

const INSERT_TYPES = new Set(["insertText", "insertCompositionText"]);
const esc = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
const num = (value, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
const pct = (value) => Number.isFinite(value) ? `${num(value, 1)}%` : "—";

function textWindow(contentPlan, snapshot) {
  const chars = Array.from(contentPlan.text); const cursor = snapshot.cursorIndex ?? 0; const errors = new Set(snapshot.errorPositions ?? []); const start = Math.max(0, cursor - 120); const end = Math.min(chars.length, cursor + 360);
  return chars.slice(start, end).map((value, offset) => { const index = start + offset; const classes = ["practice-real-text-char"]; if (index < cursor) classes.push(errors.has(index) ? "is-error" : "is-typed"); if (index === cursor) classes.push("is-current"); return `<span class="${classes.join(" ")}">${value === " " ? "&nbsp;" : esc(value)}</span>`; }).join("");
}
function shell(root, body, view) { root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="${view}"><div class="practice-lab-shell">${body}</div></section>`; }
function stopButton() { return `<button type="button" data-burst-session-action="stop" aria-label="Stop Burst Sprints">STOP</button>`; }
function renderWarmup(root, session, snapshot) {
  const remaining = Math.max(0, PRACTICE_BURST_WARMUP_DURATION_MS - (snapshot.timing?.activeDurationMs ?? 0));
  shell(root, `<header><div class="eyebrow">Burst Sprints · warm-up</div><h1>Type naturally</h1><p>${num(remaining / 1000)} s remaining</p>${stopButton()}</header><p class="practice-lab-muted">Warm-up contributes ordinary diagnostic evidence, not Burst ability estimation.</p><section class="practice-real-text-typing">${textWindow(session.contentPlan, snapshot)}</section><textarea data-burst-input aria-label="Burst Sprints warm-up input" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea>`, "burst-sprints-warmup");
}
function renderPreview(root, session, snapshot, ordinal, remainingMs) {
  shell(root, `<header><div class="eyebrow">Burst Sprints · preview ${ordinal} of ${PRACTICE_BURST_SPRINT_COUNT}</div><h1>Preview</h1><p>${num(Math.max(0, remainingMs) / 1000)} s</p>${stopButton()}</header><p class="practice-lab-muted">Input is disabled until the sprint begins.</p><section class="practice-real-text-typing" aria-label="Upcoming sprint text">${textWindow(session.contentPlan, snapshot)}</section>`, "burst-sprints-preview");
}
function renderSprint(root, session, snapshot, ordinal) {
  const start = PRACTICE_BURST_WARMUP_DURATION_MS + (ordinal - 1) * PRACTICE_BURST_SPRINT_DURATION_MS; const active = snapshot.timing?.activeDurationMs ?? 0; const remaining = Math.max(0, PRACTICE_BURST_SPRINT_DURATION_MS - Math.max(0, active - start));
  shell(root, `<header><div class="eyebrow">Burst Sprints · sprint ${ordinal} of ${PRACTICE_BURST_SPRINT_COUNT}</div><h1>Fast, but controlled</h1><p>${num(remaining / 1000)} s</p>${stopButton()}</header><p class="practice-lab-muted">No intermediate sprint result is shown.</p><section class="practice-real-text-typing">${textWindow(session.contentPlan, snapshot)}</section><textarea data-burst-input aria-label="Burst Sprints typing input" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea>`, "burst-sprints-session");
}
function renderRecovery(root, ordinal, remainingMs) {
  shell(root, `<header><div class="eyebrow">Burst Sprints · recovery after ${ordinal}</div><h1>Release and reset</h1><p>${num(Math.max(0, remainingMs) / 1000)} s</p>${stopButton()}</header><section class="practice-lab-empty-state"><p>Input is disabled. Upcoming sprint text is hidden during recovery.</p></section>`, "burst-sprints-recovery");
}
function rows(sprints = [], selected = new Set()) { return sprints.map((s) => `<tr><th>${esc(s.sprintId)}</th><td>${num(s.grossForwardWpm)}</td><td>${num(s.burstEffectiveWpm)}</td><td>${pct(s.firstPassAccuracy)}</td><td>${s.carryoverOpenError ? "carryover" : s.eligible ? "eligible" : "excluded"}</td><td>${selected.has(s.sprintId) ? "used" : "—"}</td></tr>`).join(""); }
function renderResult(root, artifact, interrupted = false) {
  const selected = new Set(artifact?.selectedSprintIds ?? []);
  shell(root, `<main class="practice-lab-detail"><div class="eyebrow">Burst Sprints ${interrupted ? "stopped" : "complete"}</div><h1>${interrupted ? "Incomplete sprint protocol" : "Burst diagnostic"}</h1><dl class="practice-real-text-result-grid"><div><dt>Best observed sprint</dt><dd>${num(artifact?.bestObservedSprintWpm)} WPM</dd></div><div><dt>Session burst estimate</dt><dd>${num(artifact?.sessionBurstEstimateWpm)} WPM</dd></div><div><dt>Current PL13 Burst Ability</dt><dd>${num(artifact?.currentBurstAbilityWpm)} WPM</dd></div><div><dt>PL14 Burst Reserve</dt><dd>${num(artifact?.pl14BurstReserveWpm)} WPM</dd></div><div><dt>Eligible sprints</dt><dd>${artifact?.eligibleSprintCount ?? 0} / 6</dd></div></dl><table><thead><tr><th>Sprint</th><th>Gross</th><th>Burst effective</th><th>First-pass accuracy</th><th>Validity</th><th>Estimator</th></tr></thead><tbody>${rows(artifact?.sprints, selected)}</tbody></table><div class="practice-lab-notice"><p>${esc(artifact?.interpretation ?? "No burst estimate admitted.")}</p><p>The 75% floor is a measurement-validity rule, not a recommended typing accuracy target.</p></div><button type="button" data-burst-session-action="finish">BACK TO BURST SPRINTS</button></main>`, "burst-sprints-result");
}
function normalizedInput(type, value) { return { type, value, source: "browser-input", monotonicTimestampMs: Math.max(0, globalThis.performance?.now?.() ?? Date.now()), wallTimestampUtc: new Date().toISOString(), modifiers: { ctrl: false, meta: false, alt: false, shift: false } }; }

export async function mountPracticeBurstSprintsSession({ root, session, onExit = () => {}, logger = null, dependencies = {} } = {}) {
  if (!root?.addEventListener || !session?.experiment || !session?.contentPlan) throw new TypeError("Burst Sprints host requires a prepared session");
  const dataStore = dependencies.dataStore ?? createPracticeIndexedDbStore(); const repository = dependencies.repository ?? createPracticeRepository({ dataStore, manifestStore: dependencies.manifestStore ?? createPracticeManifestStore() }); const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  if (initialized.context.contextId !== session.contextId || initialized.profile.profileId !== session.profileId) throw Object.assign(new Error("Practice context changed after Burst Sprints preparation"), { code: "PRACTICE_CONTEXT_MISMATCH" });
  const engine = (dependencies.engineFactory ?? createPracticeSessionEngine)({ repository, sessionId: session.sessionId, profileId: session.profileId, contextId: session.contextId, logger }); const wallNow = dependencies.wallNow ?? (() => Date.now());
  let finalResult = null, closed = false, unsubscribe = null, pulseLoop = null, interrupted = false, completing = false, phase = "warmup", sprintOrdinal = 0, inactiveEndsAt = null, inactiveStartedAt = null, protocolInactiveMs = 0, transitionPromise = null;
  const running = () => !closed && !interrupted && !completing && !finalResult; const inputEnabled = () => phase === "warmup" || phase === "sprint";
  const inactiveRemainingMs = () => (phase === "preview" || phase === "recovery") ? Math.max(0, (inactiveEndsAt ?? wallNow()) - wallNow()) : 0;
  const publicSnapshot = () => {
    const remainingMs = inactiveRemainingMs();
    const engineSnapshot = engine.getSnapshot();
    return Object.freeze({
      ...engineSnapshot,
      phase,
      sprintOrdinal,
      recoveryRemainingMs: phase === "recovery" ? remainingMs : 0,
      previewRemainingMs: phase === "preview" ? remainingMs : 0,
      protocolInactiveMs,
      burstProtocol: Object.freeze({ phase, sprintOrdinal, recoveryRemainingMs: phase === "recovery" ? remainingMs : 0, previewRemainingMs: phase === "preview" ? remainingMs : 0, protocolInactiveMs }),
    });
  };
  const focus = () => queueMicrotask(() => { if (running() && inputEnabled()) root.querySelector?.("[data-burst-input]")?.focus?.({ preventScroll: true }); });
  const cleanup = async (notify = true) => { if (closed) return; closed = true; pulseLoop?.stop(); unsubscribe?.(); root.removeEventListener("beforeinput", beforeInput); root.removeEventListener("keydown", keyDown); root.removeEventListener("click", click); globalThis.document?.removeEventListener?.("visibilitychange", visibilityChange); try { await engine.destroy(); } catch {} try { dataStore.close?.(); } catch {} if (notify) onExit(finalResult); };
  const interruptedArtifact = async () => { const snapshot = engine.getSnapshot(); const result = session.experiment.burstAccumulator?.finalize({ finalActiveDurationMs: snapshot.timing?.activeDurationMs ?? 0 }); const { analyzePracticeBurstSprintsResult } = await import("./practiceBurstSprintsAnalyzer.js"); return analyzePracticeBurstSprintsResult({ burstResult: result, plan: session.plan }).trainingQuality; };
  const interrupt = async (reason = "manual-stop") => {
    if (!running()) return;
    interrupted = true;
    pulseLoop?.stop();
    if (inactiveStartedAt != null) { protocolInactiveMs += Math.max(0, wallNow() - inactiveStartedAt); inactiveStartedAt = null; }
    session.experiment.burstAccumulator?.markInterrupted(reason);
    try { await engine.interrupt(reason); } catch {}
    if (closed) return;
    const artifact = await interruptedArtifact();
    if (closed) return;
    finalResult = { interrupted: true, artifact, protocolInactiveMs };
    phase = "interrupted";
    renderResult(root, artifact, true);
  };
  const beforeInput = (event) => { const target = event.target?.closest?.("[data-burst-input]"); if (!target || !running() || !root.contains?.(target)) return; if (!inputEnabled()) { event.preventDefault(); return; } event.preventDefault(); if (INSERT_TYPES.has(event.inputType) && typeof event.data === "string") for (const char of Array.from(event.data.normalize("NFC"))) engine.handleInput(normalizedInput(char === " " ? "space" : "character", char)); else if (event.inputType === "deleteContentBackward") engine.handleInput(normalizedInput("backspace", "")); else if (event.inputType === "deleteWordBackward") engine.handleInput(normalizedInput("word-delete", "")); target.value = ""; };
  const keyDown = (event) => { if (event.key === "Escape") { event.preventDefault(); void interrupt("manual-stop"); } else if (!inputEnabled() || ((event.ctrlKey || event.metaKey) && ["v", "x"].includes(String(event.key).toLowerCase()))) event.preventDefault(); };
  const click = (event) => { const button = event.target?.closest?.("[data-burst-session-action]"); if (!button || !root.contains?.(button)) return; if (button.dataset.burstSessionAction === "stop") void interrupt("manual-stop"); else if (button.dataset.burstSessionAction === "finish") void cleanup(); };
  const visibilityChange = () => { if (globalThis.document?.visibilityState === "hidden" && running()) { if (phase === "sprint") session.experiment.burstAccumulator?.markSprintCorrupted(sprintOrdinal, "visibility"); void interrupt("visibility-hidden"); } };
  const startInactive = async (nextPhase, durationMs) => { if (transitionPromise || !running()) return; phase = "transition"; transitionPromise = engine.pause(`protocol-inactive:burst-${nextPhase}`).then(() => { if (!running()) return; inactiveStartedAt = wallNow(); inactiveEndsAt = inactiveStartedAt + durationMs; phase = nextPhase; const snap = engine.getSnapshot(); if (nextPhase === "preview") renderPreview(root, session, snap, sprintOrdinal + 1, durationMs); else renderRecovery(root, sprintOrdinal, durationMs); }).catch((error) => { logger?.warn?.("Burst protocol inactive transition failed", error); void interrupt("measurement-corruption"); }).finally(() => { transitionPromise = null; }); await transitionPromise; };
  const switchInactive = (nextPhase, durationMs) => { const now = wallNow(); if (inactiveStartedAt != null) protocolInactiveMs += Math.max(0, now - inactiveStartedAt); inactiveStartedAt = now; inactiveEndsAt = now + durationMs; phase = nextPhase; renderPreview(root, session, engine.getSnapshot(), sprintOrdinal + 1, durationMs); };
  const startSprint = async () => { if (transitionPromise || phase !== "preview" || !running()) return; const now = wallNow(); if (inactiveStartedAt != null) protocolInactiveMs += Math.max(0, now - inactiveStartedAt); inactiveStartedAt = null; phase = "transition"; transitionPromise = engine.resume().then((snapshot) => { if (!running()) return; sprintOrdinal += 1; phase = "sprint"; inactiveEndsAt = null; session.experiment.burstAccumulator?.markSprintStart(sprintOrdinal); renderSprint(root, session, snapshot, sprintOrdinal); focus(); }).catch((error) => { logger?.warn?.("Burst sprint start failed", error); void interrupt("measurement-corruption"); }).finally(() => { transitionPromise = null; }); await transitionPromise; };
  async function pulse() {
    if (!running() || transitionPromise) return;
    if (phase === "preview" || phase === "recovery") { const remaining = inactiveRemainingMs(); if (phase === "preview") renderPreview(root, session, engine.getSnapshot(), sprintOrdinal + 1, remaining); else renderRecovery(root, sprintOrdinal, remaining); if (remaining <= 0) { if (phase === "recovery") switchInactive("preview", PRACTICE_BURST_PREVIEW_DURATION_MS); else await startSprint(); } return; }
    const snapshot = engine.getSnapshot(); const activeMs = snapshot.timing?.activeDurationMs ?? 0;
    if (phase === "warmup") { if (activeMs >= PRACTICE_BURST_WARMUP_DURATION_MS) { await startInactive("preview", PRACTICE_BURST_PREVIEW_DURATION_MS); return; } renderWarmup(root, session, snapshot); focus(); return; }
    if (phase === "sprint") { const end = PRACTICE_BURST_WARMUP_DURATION_MS + sprintOrdinal * PRACTICE_BURST_SPRINT_DURATION_MS; if (activeMs >= end && sprintOrdinal < PRACTICE_BURST_SPRINT_COUNT) { await startInactive("recovery", PRACTICE_BURST_RECOVERY_DURATION_MS); return; } if (sprintOrdinal === PRACTICE_BURST_SPRINT_COUNT && activeMs >= PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS) { await engine.tick(); return; } renderSprint(root, session, snapshot, sprintOrdinal); focus(); }
  }
  try {
    await engine.prepare({ experiment: session.experiment, configuration: session.configuration, contentPlan: session.contentPlan });
    unsubscribe = engine.subscribe((snapshot, event) => { if (!running()) return; if (event === "completed") { completing = true; pulseLoop?.stop(); void engine.complete().then((result) => { if (closed || interrupted) return; if (inactiveStartedAt != null) { protocolInactiveMs += Math.max(0, wallNow() - inactiveStartedAt); inactiveStartedAt = null; } finalResult = { ...result, protocolInactiveMs }; phase = "result"; renderResult(root, result.summary?.trainingQuality, false); }).catch((error) => { logger?.warn?.("Burst completion failed", error); void interrupt("measurement-corruption"); }); return; } if (snapshot.lifecycleState === "active" && phase === "warmup") { renderWarmup(root, session, snapshot); focus(); } });
    root.addEventListener("beforeinput", beforeInput); root.addEventListener("keydown", keyDown); root.addEventListener("click", click); globalThis.document?.addEventListener?.("visibilitychange", visibilityChange);
    const start = await engine.start(); renderWarmup(root, session, start); focus(); pulseLoop = createPracticeSessionPulse({ ...dependencies.pulseTimers, intervalMs: 50, isActive: running, run: pulse, onError: (error) => { logger?.warn?.("Burst timer failed", error); return interrupt("measurement-corruption"); } }); pulseLoop.start(); visibilityChange();
  } catch (error) { await cleanup(false); throw error; }
  return Object.freeze({ stop: () => interrupt("manual-stop"), interrupt, exit: cleanup, getSnapshot: publicSnapshot });
}
