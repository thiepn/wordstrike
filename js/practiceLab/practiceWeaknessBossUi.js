import { createPracticeSegmenter } from "./practiceTextSegmentation.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const finite = Number.isFinite;
const number = (value, digits = 1) => finite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
const percent = (value) => finite(value) ? `${number(value * 100, 1)}%` : "—";
const signed = (value) => finite(value) ? `${value >= 0 ? "+" : ""}${number(value, 1)}` : "—";
const titleTarget = (candidate) => candidate ? `${candidate.entityType}: ${candidate.entityKey}` : "—";
const REASON_LABELS = Object.freeze({
  "confirmed-limiter": "Confirmed limiter evidence",
  "likely-limiter": "Likely limiter evidence",
  "high-impact": "High current impact",
  "learning-headroom": "Learning headroom remains",
  "independent-limiter": "Independent limiter",
  "partial-hierarchy": "Partly explained by a broader limiter",
  "slow-pattern": "Slow-pattern evidence",
  "hesitation-pattern": "Hesitation-pattern evidence",
  "accuracy-pattern": "Accuracy-pattern evidence",
  "recovery-pattern": "Recovery-pattern evidence",
  "launch-pattern": "Launch-pattern evidence",
  "instability-pattern": "Instability-pattern evidence",
  "mixed-pattern": "Mixed limiter pattern",
});

function candidateCard(candidate, { recommended = false } = {}) {
  const reasons = (candidate.reasonCodes ?? []).slice(0, 4).map((reason) => `<li>${escapeHtml(REASON_LABELS[reason] ?? reason)}</li>`).join("");
  return `<article class="practice-lab-empty-state" data-boss-candidate="${escapeHtml(candidate.statId)}">
    <div class="eyebrow">${recommended ? "Recommended Boss" : "Alternative Boss"}</div>
    <h2>${escapeHtml(candidate.bossTheme?.name ?? "Weakness Boss")}</h2>
    <p><strong>${escapeHtml(titleTarget(candidate))}</strong></p>
    <p>${escapeHtml(candidate.bossTheme?.description ?? "A current Practice limiter selected from local evidence.")}</p>
    ${reasons ? `<ul>${reasons}</ul>` : ""}
    <button type="button" data-practice-action="weakness-boss-start" data-boss-stat-id="${escapeHtml(candidate.statId)}">${recommended ? "START RECOMMENDED BOSS" : "CHOOSE THIS BOSS"}</button>
  </article>`;
}

export function renderPracticeWeaknessBossDetail(root, view, { focusSelector = null } = {}) {
  if (!root || typeof root.innerHTML !== "string") throw new TypeError("Weakness Boss renderer requires a root element");
  const loading = view?.status === "loading" || view?.status === "idle";
  const candidates = view?.candidates ?? [];
  const recommended = candidates[0] ?? null;
  const alternatives = candidates.slice(1, 5);
  const body = loading
    ? `<section class="practice-lab-empty-state" aria-live="polite"><h2>Finding a Boss…</h2><p>Checking current local Practice evidence and training-content availability.</p></section>`
    : view?.status === "unavailable"
      ? `<section class="practice-lab-empty-state"><h2>Weakness Boss unavailable</h2><p>Current Practice evidence or local training content could not be read.</p>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}</section>`
      : !recommended
        ? `<section class="practice-lab-empty-state"><h2>No Boss ready yet</h2><p>There is no current likely or confirmed limiter with enough learning headroom and valid training content. Keep practicing normally and check again later.</p></section>`
        : `<div class="practice-lab-category-grid">${candidateCard(recommended, { recommended: true })}${alternatives.map((candidate) => candidateCard(candidate)).join("")}</div>`;
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="weakness-boss-detail"><div class="practice-lab-shell">
    <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">DEVELOPER PREVIEW</span></header>
    <main class="practice-lab-detail">
      <div class="eyebrow">Advanced · Adaptive Practice</div><h1>Weakness Boss</h1>
      <p class="practice-lab-lead">Face one current Practice limiter in a focused fixed-dose encounter.</p>
      <div class="practice-lab-notice" role="note"><strong>Challenge progress, not a skill score.</strong><br>The Boss challenge uses one fixed Practice dose. Boss HP represents challenge progress, not your skill score. Defeating a Boss does not mean the target is mastered, retained, transferred, or permanently fixed.</div>
      ${body}
    </main></div></section>`;
  (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='weakness-boss-start']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
  return true;
}

export function getPracticeWeaknessBossPhase(contentPlan, cursorIndex = 0) {
  const phases = contentPlan?.metadata?.weaknessBoss?.phaseRanges ?? [];
  return phases.find((phase) => cursorIndex >= phase.startIndex && cursorIndex < phase.endIndex)
    ?? phases.find((phase) => phase.startIndex >= cursorIndex)
    ?? phases.at(-1)
    ?? null;
}

function phaseInstruction(phase) {
  if (!phase) return "Type the displayed text.";
  if (phase.id === "opening-probe") return "Opening Probe. Type naturally; target cues are off.";
  if (phase.id === "break-guard") return "Break Guard. Strong target cues are active.";
  if (phase.id === "pressure") return "Pressure. Target cues are reduced.";
  if (phase.id === "final-form") return "Final Form. Cues are off and target-free material is interleaved.";
  return "Final Probe. Type naturally; this is a same-session comparison, not a mastery test.";
}

function typingText(contentPlan, snapshot, phase) {
  if (!phase) return "";
  const segment = createPracticeSegmenter();
  const graphemes = segment(contentPlan.text);
  const cursor = Number(snapshot?.cursorIndex ?? 0);
  const errors = new Set(snapshot?.errorPositions ?? []);
  const targets = phase.cue === "off" ? new Set() : new Set(phase.targetPositions ?? []);
  const output = [];
  for (let index = phase.startIndex; index < phase.endIndex; index += 1) {
    const classes = ["practice-weak-key-char"];
    if (index < cursor) classes.push(errors.has(index) ? "is-error" : "is-typed");
    if (index === cursor) classes.push("is-current");
    if (targets.has(index)) classes.push(phase.cue === "strong" ? "is-target-strong" : "is-target-subtle");
    const value = graphemes[index];
    output.push(`<span class="${classes.join(" ")}" data-char-index="${index}">${value === " " ? "&nbsp;" : value === "\n" ? "<br>" : escapeHtml(value)}</span>`);
  }
  return output.join("");
}

export function renderPracticeWeaknessBossBattle(root, { session, snapshot, gameplay }) {
  const phase = getPracticeWeaknessBossPhase(session.contentPlan, snapshot?.cursorIndex ?? 0);
  const hp = Math.max(0, Math.min(100, Number(gameplay?.bossHp ?? 100)));
  const paused = snapshot?.lifecycleState === "paused";
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="weakness-boss-session"><div class="practice-lab-shell">
    <header class="practice-weak-key-session-header"><div><div class="eyebrow">Weakness Boss</div><h1>${escapeHtml(session.weaknessBossPlan.bossTheme.name)}</h1><p>Target: <strong>${escapeHtml(titleTarget(session.weaknessBossPlan.target))}</strong></p></div>
      <div class="practice-weak-key-session-actions"><button type="button" data-weakness-boss-session-action="${paused ? "resume" : "pause"}">${paused ? "RESUME" : "PAUSE"}</button><button type="button" data-weakness-boss-session-action="abandon">EXIT SESSION</button></div></header>
    <section class="practice-lab-empty-state"><div class="eyebrow">Boss HP</div><div role="progressbar" aria-label="Boss HP remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(hp)}" aria-valuetext="${Math.round(hp)}% remaining"><strong>${Math.round(hp)}% remaining</strong></div><div class="practice-weak-key-progress"><span style="width:${hp.toFixed(2)}%"></span></div></section>
    <section class="practice-weak-key-phase-card" aria-live="polite"><div class="practice-lab-card-meta"><span>Phase ${phase?.ordinal ?? "—"} of 5 · ${escapeHtml(phase?.label ?? "")}</span><span>Clean streak: ${Number(gameplay?.battle?.cleanTargetStreak ?? 0)}</span></div><p>${escapeHtml(phaseInstruction(phase))}</p></section>
    <section class="practice-weak-key-typing" aria-label="Current Weakness Boss typing passage" data-session-paused="${paused ? "true" : "false"}">${typingText(session.contentPlan, snapshot, phase)}</section>
    ${paused ? '<div class="practice-lab-notice" role="status"><strong>Paused.</strong> Paused time is excluded from active typing time.</div>' : ""}
    <textarea data-weakness-boss-input aria-label="Weakness Boss typing input" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0"></textarea>
  </div></section>`;
}

export function renderPracticeWeaknessBossResult(root, finalResult) {
  const summary = finalResult?.summary ?? finalResult ?? null;
  const result = summary?.trainingQuality ?? null;
  const opening = result?.openingProbe ?? summary?.beforeMetrics ?? null;
  const final = result?.finalProbe ?? summary?.afterMetrics ?? null;
  const defeated = result?.clearStatus === "defeated";
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="weakness-boss-result"><div class="practice-lab-shell"><main class="practice-lab-detail">
    <div class="eyebrow">Weakness Boss complete</div><h1>${defeated ? "Boss Defeated" : "Encounter Incomplete"}</h1>
    <p class="practice-lab-lead">${escapeHtml(result?.boss?.archetype ?? "Weakness Boss")} · ${escapeHtml(titleTarget(result?.target))}</p>
    <dl class="practice-weak-key-result-grid"><div><dt>Opening → Final quality</dt><dd>${number(opening?.quality)} → ${number(final?.quality)}</dd></div><div><dt>Immediate quality delta</dt><dd>${signed(result?.immediateQualityDelta)}</dd></div><div><dt>Battle first-pass accuracy</dt><dd>${percent(result?.battle?.battleFirstPassAccuracy)}</dd></div><div><dt>Max clean target streak</dt><dd>${number(result?.battle?.maxCleanTargetStreak, 0)}</dd></div></dl>
    <div class="practice-lab-notice" role="note"><strong>This clear is challenge completion, not mastery.</strong><br>The Final Probe is only a same-session comparison. Boss defeat does not establish durable learning, retention, transfer, or a permanent fix. Later independent Practice evidence is required.</div>
    <div class="practice-weak-key-result-actions"><button type="button" data-weakness-boss-session-action="repeat">FIGHT AGAIN</button><button type="button" data-weakness-boss-session-action="finish">BACK TO WEAKNESS BOSS</button></div>
  </main></div></section>`;
}
