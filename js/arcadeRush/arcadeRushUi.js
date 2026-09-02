import {
  ARCADE_RUSH_DISPLAY_NAME,
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_WAVE_COUNT,
} from "./arcadeRushContract.js";
import {
  ARCADE_RUSH_BOSS_TARGET_DURATION_MS,
  getArcadeRushWaveProfile,
} from "./arcadeRushConfig.js";
import { ARCADE_RUSH_BOSS_MAX_HP } from "./arcadeRushBoss.js";

export const ARCADE_RUSH_UI_VERSION = 1;

export const ARCADE_RUSH_UI_PORT_METHODS = Object.freeze([
  "renderReady",
  "renderHud",
  "renderWaveTransition",
  "renderBossIntro",
  "renderResults",
  "clearGameplay",
]);

export const ARCADE_RUSH_UI_ACTIONS = Object.freeze({
  START: "start",
  BACK: "back",
  PAUSE: "pause",
  RESUME: "resume",
  RESTART: "restart",
  PLAY_AGAIN: "play-again",
  MODE_SELECT: "mode-select",
  MAIN_MENU: "main-menu",
  LEADERBOARD: "leaderboard",
});

export const ARCADE_RUSH_UI_CSS = `
.arcade-rush-ui{--rush-panel:rgb(16 23 32/.96);--rush-line:rgb(0 255 242/.32);width:100%;min-height:100dvh;color:var(--text,#e8f0f5)}
.arcade-rush-ui *{box-sizing:border-box}.arcade-rush-ui button{min-height:44px;touch-action:manipulation}
.arcade-rush-shell{width:min(980px,calc(100% - 32px));margin:auto;padding:max(24px,env(safe-area-inset-top)) 0 max(24px,env(safe-area-inset-bottom))}
.arcade-rush-kicker{margin:0 0 10px;color:var(--primary,#00fff2);font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
.arcade-rush-title{margin:0;font-size:clamp(34px,8vw,72px);line-height:.95;letter-spacing:.06em;text-transform:uppercase}
.arcade-rush-subtitle{max-width:680px;margin:16px 0 0;color:var(--text-secondary,#bdc9d3);line-height:1.65}
.arcade-rush-ready{display:grid;place-items:center;padding:24px 0}.arcade-rush-ready-card,.arcade-rush-results-card{border:1px solid rgb(0 255 242/.55);background:radial-gradient(circle at 50% 0%,rgb(0 255 242/.11),transparent 46%),rgb(10 14 20/.98);box-shadow:0 18px 64px rgb(0 0 0/.3)}
.arcade-rush-ready-card,.arcade-rush-results-card{padding:clamp(22px,5vw,48px)}
.arcade-rush-rule-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:30px 0}.arcade-rush-rule,.arcade-rush-stat{padding:14px;border:1px solid var(--rush-line);background:rgb(255 255 255/.02)}
.arcade-rush-rule strong,.arcade-rush-stat strong{display:block;font-size:clamp(17px,3vw,24px)}.arcade-rush-rule span,.arcade-rush-stat span{display:block;margin-top:5px;color:var(--text-muted,#a5b3bf);font-size:10px;letter-spacing:.12em;text-transform:uppercase}
.arcade-rush-pb{display:flex;align-items:baseline;justify-content:space-between;gap:18px;margin:0 0 24px;padding:16px 0;border-block:1px solid var(--rush-line)}.arcade-rush-pb span{color:var(--text-muted,#a5b3bf);font-size:11px;letter-spacing:.14em;text-transform:uppercase}.arcade-rush-pb strong{color:var(--primary,#00fff2);font-size:clamp(22px,5vw,36px)}
.arcade-rush-actions{display:flex;flex-wrap:wrap;gap:10px}.arcade-rush-action{min-width:150px;padding:11px 16px;border:1px solid rgb(0 255 242/.55);background:transparent;color:var(--text,#e8f0f5);cursor:pointer;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.arcade-rush-action:hover,.arcade-rush-action:focus-visible{outline:none;border-color:var(--primary,#00fff2);background:rgb(0 255 242/.08);color:var(--primary,#00fff2)}.arcade-rush-action-primary{background:var(--primary,#00fff2);color:var(--bg,#0a0e14)}.arcade-rush-action-secondary{border-color:var(--border-subtle,#46515e);color:var(--text-secondary,#bdc9d3)}.arcade-rush-action[disabled]{cursor:not-allowed;opacity:.45}
.arcade-rush-gameplay{position:relative;width:100%;height:100dvh;min-height:520px;overflow:hidden;background:radial-gradient(circle at 50% 50%,rgb(0 255 242/.06),transparent 26%),var(--bg,#0a0e14)}
.arcade-rush-hud{position:relative;z-index:20;display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;align-items:center;gap:8px;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 12px max(12px,env(safe-area-inset-left));border-bottom:1px solid var(--rush-line);background:rgb(10 14 20/.92);backdrop-filter:blur(10px)}.arcade-rush-hud-stat{min-width:0;padding:7px 10px}.arcade-rush-hud-stat span{display:block;color:var(--text-muted,#a5b3bf);font-size:9px;letter-spacing:.15em}.arcade-rush-hud-stat strong{display:block;margin-top:2px;font-size:clamp(15px,3vw,24px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.arcade-rush-word-layer{position:absolute;inset:0;z-index:2;pointer-events:none}.arcade-rush-core{position:absolute;top:50%;left:50%;z-index:1;width:clamp(72px,12vw,118px);aspect-ratio:1;translate:-50% -50%;border:1px solid rgb(0 255 242/.55);border-radius:50%;background:radial-gradient(circle,rgb(0 255 242/.16),rgb(0 255 242/.03) 55%,transparent 58%);box-shadow:0 0 48px rgb(0 255 242/.12)}
.arcade-rush-boss-panel{position:absolute;top:clamp(82px,13vh,112px);left:50%;z-index:12;width:min(760px,calc(100% - 28px));translate:-50% 0;padding:14px 16px 16px;border:1px solid rgb(255 60 172/.38);background:rgb(10 14 20/.94)}.arcade-rush-boss-header{display:flex;justify-content:space-between;gap:16px;margin-bottom:10px}.arcade-rush-boss-header strong{color:var(--secondary,#ff3cac);letter-spacing:.12em}.arcade-rush-boss-header span{color:var(--text-secondary,#bdc9d3);font-size:11px}.arcade-rush-boss-meter{height:5px;margin-bottom:13px;background:rgb(255 255 255/.08);overflow:hidden}.arcade-rush-boss-meter i{display:block;width:100%;height:100%;transform-origin:left;background:var(--secondary,#ff3cac)}.arcade-rush-phrase{min-height:34px;margin:0;color:var(--text-muted,#a5b3bf);font-size:clamp(18px,4vw,30px);line-height:1.35;text-align:center;text-transform:uppercase}.arcade-rush-phrase .typed{color:var(--primary,#00fff2)}
.arcade-rush-overlay{position:absolute;inset:0;z-index:40;display:grid;place-items:center;padding:24px;background:rgb(10 14 20/.72);backdrop-filter:blur(6px)}.arcade-rush-overlay[hidden],.arcade-rush-boss-panel[hidden]{display:none}.arcade-rush-overlay-card{width:min(620px,100%);padding:clamp(22px,5vw,42px);border:1px solid rgb(0 255 242/.55);background:rgb(10 14 20/.98);text-align:center}.arcade-rush-overlay-label{color:var(--primary,#00fff2);font-size:11px;letter-spacing:.18em}.arcade-rush-overlay h2{margin:8px 0;font-size:clamp(28px,7vw,54px);letter-spacing:.06em}.arcade-rush-overlay p{margin:8px 0 0;color:var(--text-secondary,#bdc9d3);line-height:1.55}.arcade-rush-countdown{margin-top:20px;color:var(--primary,#00fff2);font-size:clamp(30px,9vw,64px);font-weight:900}
.arcade-rush-results{min-height:100dvh;overflow-y:auto;padding:24px 0}.arcade-rush-result-label{margin:0;color:var(--primary,#00fff2);font-size:11px;letter-spacing:.18em}.arcade-rush-results.failed .arcade-rush-result-label{color:var(--danger,#ff4757)}.arcade-rush-result-score{margin:10px 0 0;font-size:clamp(44px,12vw,92px);line-height:.95}.arcade-rush-new-best{display:inline-block;margin-top:12px;padding:6px 9px;border:1px solid rgb(76 255 142/.48);color:var(--success,#4cff8e);font-size:11px;letter-spacing:.13em}.arcade-rush-result-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:28px 0}.arcade-rush-breakdown{margin:0 0 24px;border-block:1px solid var(--rush-line);color:var(--text-secondary,#bdc9d3)}.arcade-rush-breakdown summary{min-height:44px;padding:13px 0;cursor:pointer;color:var(--text-muted,#a5b3bf);font-size:11px;letter-spacing:.12em}.arcade-rush-breakdown dl{display:grid;grid-template-columns:1fr auto;gap:8px 18px;margin:0;padding:0 0 16px}.arcade-rush-breakdown dt,.arcade-rush-breakdown dd{margin:0}.arcade-rush-breakdown dd{text-align:right}
.arcade-rush-ui [data-rush-role="status"]{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media(max-width:760px){.arcade-rush-rule-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.arcade-rush-result-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.arcade-rush-hud{grid-template-columns:repeat(4,minmax(0,1fr))}.arcade-rush-hud>.arcade-rush-action{grid-column:1/-1;min-height:44px}}
@media(max-width:520px){.arcade-rush-shell{width:min(calc(100% - 20px),980px)}.arcade-rush-actions{display:grid;grid-template-columns:1fr}.arcade-rush-action{width:100%;min-width:0}.arcade-rush-hud{gap:0}.arcade-rush-hud-stat{padding-inline:5px;text-align:center}.arcade-rush-hud-stat strong{font-size:15px}.arcade-rush-boss-panel{top:104px}}
@media(prefers-reduced-motion:reduce){.arcade-rush-ui *,.arcade-rush-ui *::before,.arcade-rush-ui *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}
.arcade-rush-ui[data-reduced-motion="true"] *{animation:none!important;transition:none!important}
`;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function number(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function integer(value, fallback = 0) { const n = Math.trunc(number(value, fallback)); return Number.isSafeInteger(n) ? n : fallback; }

export function escapeArcadeRushHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
export function formatArcadeRushNumber(value) { return Math.max(0, integer(value)).toLocaleString("en-US"); }
export function formatArcadeRushAccuracy(value) { return `${clamp(number(value), 0, 100).toFixed(1)}%`; }
export function formatArcadeRushDuration(ms) {
  const seconds = Math.floor(Math.max(0, integer(ms)) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function styles() { return `<style data-rush-styles>${ARCADE_RUSH_UI_CSS}</style>`; }
function button(action, label, { primary = false, secondary = false, autofocus = false, disabled = false } = {}) {
  const classes = ["arcade-rush-action", primary ? "arcade-rush-action-primary" : "", secondary ? "arcade-rush-action-secondary" : ""].filter(Boolean).join(" ");
  return `<button type="button" class="${classes}" data-rush-action="${action}" ${autofocus ? "data-rush-autofocus" : ""} ${disabled ? 'disabled aria-disabled="true"' : ""}>${escapeArcadeRushHtml(label)}</button>`;
}
function status(message = "") { return `<div role="status" aria-live="polite" aria-atomic="true" data-rush-role="status">${escapeArcadeRushHtml(message)}</div>`; }

export function buildArcadeRushReadyMarkup({ personalBest = null, developerMode = true } = {}) {
  const best = Number.isFinite(Number(personalBest)) ? formatArcadeRushNumber(personalBest) : "—";
  return `${styles()}<section class="screen arcade-rush-ui arcade-rush-ready" data-rush-view="ready" data-reduced-motion="false" aria-labelledby="rush-ready-title"><div class="arcade-rush-shell"><div class="arcade-rush-ready-card"><p class="arcade-rush-kicker">${developerMode ? "DEV PREVIEW · " : ""}SHORT-FORM SCORE ATTACK</p><h1 class="arcade-rush-title" id="rush-ready-title">${ARCADE_RUSH_DISPLAY_NAME}</h1><p class="arcade-rush-subtitle">Race through escalating waves, protect the Core, defeat Core Breaker, and chase your high score.</p><div class="arcade-rush-rule-grid" aria-label="Arcade Rush rules"><div class="arcade-rush-rule"><strong>${ARCADE_RUSH_WAVE_COUNT}</strong><span>Waves</span></div><div class="arcade-rush-rule"><strong>+1</strong><span>Final Boss</span></div><div class="arcade-rush-rule"><strong>${ARCADE_RUSH_STARTING_INTEGRITY}</strong><span>Core Integrity</span></div><div class="arcade-rush-rule"><strong>~5 MIN</strong><span>Target Run</span></div></div><div class="arcade-rush-pb"><span>Personal Best</span><strong>${best}</strong></div><div class="arcade-rush-actions">${button(ARCADE_RUSH_UI_ACTIONS.START,"Start Rush",{primary:true,autofocus:true})}${button(ARCADE_RUSH_UI_ACTIONS.BACK,"Back",{secondary:true})}</div>${status("Arcade Rush ready.")}</div></div></section>`;
}

function gameplayShell() {
  return `${styles()}<section class="screen arcade-rush-ui arcade-rush-gameplay" data-rush-view="gameplay" data-reduced-motion="false" aria-label="Arcade Rush gameplay"><header class="arcade-rush-hud" aria-label="Arcade Rush status"><div class="arcade-rush-hud-stat"><span>SCORE</span><strong data-rush-role="score">0</strong></div><div class="arcade-rush-hud-stat"><span>COMBO</span><strong data-rush-role="combo">0</strong></div><div class="arcade-rush-hud-stat"><span>CORE</span><strong data-rush-role="core">5/5</strong></div><div class="arcade-rush-hud-stat"><span>WAVE</span><strong data-rush-role="wave">1/6</strong></div>${button(ARCADE_RUSH_UI_ACTIONS.PAUSE,"Pause",{secondary:true})}</header><div class="arcade-rush-core" aria-hidden="true"></div><div class="arcade-rush-word-layer" data-rush-word-layer aria-hidden="true"></div><section class="arcade-rush-boss-panel" data-rush-role="boss-panel" hidden aria-label="Core Breaker"><div class="arcade-rush-boss-header"><strong>CORE BREAKER</strong><span data-rush-role="boss-meta">HP ${ARCADE_RUSH_BOSS_MAX_HP}/${ARCADE_RUSH_BOSS_MAX_HP}</span></div><div class="arcade-rush-boss-meter" aria-hidden="true"><i data-rush-role="boss-meter"></i></div><p class="arcade-rush-phrase" data-rush-role="boss-phrase"></p></section><div class="arcade-rush-overlay" data-rush-role="transition-overlay" hidden></div><div class="arcade-rush-overlay" data-rush-role="pause-overlay" hidden><div class="arcade-rush-overlay-card"><p class="arcade-rush-overlay-label">RUN PAUSED</p><h2>PAUSED</h2><p>Core pressure and boss timers are frozen.</p><div class="arcade-rush-actions">${button(ARCADE_RUSH_UI_ACTIONS.RESUME,"Resume",{primary:true,autofocus:true})}${button(ARCADE_RUSH_UI_ACTIONS.RESTART,"Restart")}${button(ARCADE_RUSH_UI_ACTIONS.MODE_SELECT,"Mode Select",{secondary:true})}</div></div></div>${status()}</section>`;
}

function role(root, name) { return root?.querySelector?.(`[data-rush-role="${name}"]`) || null; }
function setText(root, name, value) { const el = role(root,name); if (!el) return false; el.textContent = String(value ?? ""); return true; }
function setHtml(root, name, value) { const el = role(root,name); if (!el) return false; el.innerHTML = String(value ?? ""); return true; }
function setHidden(root, name, value) { const el = role(root,name); if (!el) return false; el.hidden = Boolean(value); return true; }
function applyMotion(root, reduced) { root?.querySelector?.(".arcade-rush-ui")?.setAttribute?.("data-reduced-motion", reduced ? "true" : "false"); }
function focusDefault(root) { root?.querySelector?.("[data-rush-autofocus]")?.focus?.(); }
function ensureGameplay(root) { if (root?.querySelector?.('[data-rush-view="gameplay"]')) return; root.innerHTML = gameplayShell(); }
function waveLabel(snapshot = {}) { if (["BOSS","BOSS_INTRO"].includes(snapshot.phase)) return "BOSS"; return `${clamp(integer(snapshot.currentWave,1),1,ARCADE_RUSH_WAVE_COUNT)}/${ARCADE_RUSH_WAVE_COUNT}`; }
function phraseHtml(boss = {}) { const phrase = String(boss.currentPhrase || ""); const typed = clamp(integer(boss.typedIndex),0,phrase.length); return `<span class="typed">${escapeArcadeRushHtml(phrase.slice(0,typed))}</span><span>${escapeArcadeRushHtml(phrase.slice(typed))}</span>`; }
function updateHud(root, snapshot = {}) {
  setText(root,"score",formatArcadeRushNumber(snapshot.score)); setText(root,"combo",formatArcadeRushNumber(snapshot.combo)); setText(root,"core",`${clamp(integer(snapshot.integrity),0,5)}/5`); setText(root,"wave",waveLabel(snapshot));
  const boss = snapshot.boss; const showBoss = Boolean(boss && snapshot.runState === "boss-active"); setHidden(root,"boss-panel",!showBoss);
  if (showBoss) { const maxHp = Math.max(1,integer(boss.maxHp,ARCADE_RUSH_BOSS_MAX_HP)); const hp = clamp(integer(boss.hp),0,maxHp); setText(root,"boss-meta",`HP ${hp}/${maxHp} · ${formatArcadeRushDuration(boss.durationRemainingMs)} · STRIKE ${formatArcadeRushDuration(boss.attackRemainingMs)}`); setHtml(root,"boss-phrase",phraseHtml(boss)); const meter = role(root,"boss-meter"); if (meter?.style) meter.style.transform = `scaleX(${clamp(hp/maxHp,0,1)})`; }
  setHidden(root,"pause-overlay",snapshot.runState !== "paused");
}
function transitionMarkup(snapshot = {}, detail = {}) { const cleared = clamp(integer(detail.clearedWave,snapshot.wavesCompleted||snapshot.currentWave),1,6); const nextWave = clamp(integer(detail.nextWave,cleared+1),1,6); const next = getArcadeRushWaveProfile(nextWave); const count = Math.max(1,Math.ceil(number(snapshot.transitionRemainingMs,2500)/1000)); return `<div class="arcade-rush-overlay-card"><p class="arcade-rush-overlay-label">WAVE ${cleared} CLEARED</p><h2>${detail.perfect ? "PERFECT WAVE" : `SCORE ${formatArcadeRushNumber(snapshot.score)}`}</h2><p>WAVE ${nextWave}: ${escapeArcadeRushHtml(next?.name || "NEXT WAVE")}</p><div class="arcade-rush-countdown">${count}</div></div>`; }
function bossIntroMarkup(snapshot = {}) { const count = Math.max(1,Math.ceil(number(snapshot.bossIntroRemainingMs,2500)/1000)); return `<div class="arcade-rush-overlay-card"><p class="arcade-rush-overlay-label">FINAL BOSS</p><h2>CORE BREAKER</h2><p>Complete ${ARCADE_RUSH_BOSS_MAX_HP} phrase sequences before the Core falls.</p><div class="arcade-rush-countdown">${count}</div></div>`; }
function resultStage(result = {}) { const data = result.modeData || {}; return integer(data.wavesCompleted) >= 6 ? "FINAL BOSS" : `WAVE ${clamp(integer(data.finalWave,1),1,6)}/6`; }
function breakdown(data = {}) { return [["Word Points",data.wordPoints],["Wave Clear",data.waveClearBonus],["Perfect Waves",data.perfectWaveBonus],["Boss",data.bossBonus],["Integrity",data.integrityBonus],["Accuracy",data.accuracyBonus],["Boss Time",data.timeBonus]].map(([label,value])=>`<dt>${label}</dt><dd>${formatArcadeRushNumber(value)}</dd>`).join(""); }

export function buildArcadeRushResultsMarkup(result, { isPersonalBest = false, leaderboardAvailable = false } = {}) {
  const success = result?.success === true; const data = result?.modeData || {}; const context = success ? "" : `<p class="arcade-rush-subtitle">${resultStage(result)} · ${integer(data.wavesCompleted)}/6 WAVES CLEARED</p>`;
  return `${styles()}<section class="screen arcade-rush-ui arcade-rush-results ${success?"success":"failed"}" data-rush-view="results" data-reduced-motion="false" aria-labelledby="rush-results-title"><div class="arcade-rush-shell"><div class="arcade-rush-results-card"><p class="arcade-rush-result-label" id="rush-results-title">${success?"ARCADE RUSH COMPLETE":"CORE DESTROYED"}</p><div class="arcade-rush-result-score">${formatArcadeRushNumber(result?.score)}</div>${isPersonalBest?'<span class="arcade-rush-new-best">NEW PERSONAL BEST</span>':""}${context}<div class="arcade-rush-result-grid"><div class="arcade-rush-stat"><strong>${Math.round(number(result?.wpm))}</strong><span>WPM</span></div><div class="arcade-rush-stat"><strong>${formatArcadeRushAccuracy(result?.accuracy)}</strong><span>Accuracy</span></div><div class="arcade-rush-stat"><strong>${formatArcadeRushNumber(result?.combo?.maximum)}</strong><span>Max Combo</span></div><div class="arcade-rush-stat"><strong>${clamp(integer(data.integrityRemaining),0,5)}/5</strong><span>Core</span></div><div class="arcade-rush-stat"><strong>${formatArcadeRushDuration(result?.activeDurationMs)}</strong><span>Time</span></div></div><details class="arcade-rush-breakdown"><summary>Score breakdown</summary><dl>${breakdown(data)}</dl></details><div class="arcade-rush-actions">${button(ARCADE_RUSH_UI_ACTIONS.PLAY_AGAIN,"Play Again",{primary:true,autofocus:true})}${button(ARCADE_RUSH_UI_ACTIONS.MODE_SELECT,"Mode Select")}${button(ARCADE_RUSH_UI_ACTIONS.MAIN_MENU,"Main Menu",{secondary:true})}${button(ARCADE_RUSH_UI_ACTIONS.LEADERBOARD,"View Leaderboard",{secondary:true,disabled:!leaderboardAvailable})}</div>${status(success?"Arcade Rush complete.":"Arcade Rush failed. Core destroyed.")}</div></div></section>`;
}

export function isArcadeRushUiPort(value) { return Boolean(value && typeof value === "object" && ARCADE_RUSH_UI_PORT_METHODS.every((method)=>typeof value[method] === "function")); }
export function createArcadeRushUiPort(value) { if (!isArcadeRushUiPort(value)) return null; return Object.freeze(Object.fromEntries(ARCADE_RUSH_UI_PORT_METHODS.map((method)=>[method,value[method]]))); }
function prefersReducedMotion(explicit) { if (typeof explicit === "boolean") return explicit; try { return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true; } catch { return false; } }

export function createArcadeRushDomUiController({ root, actions = {}, reducedMotion = null } = {}) {
  if (!root || !("innerHTML" in root) || typeof root.addEventListener !== "function" || typeof root.removeEventListener !== "function") return null;
  const reduced = prefersReducedMotion(reducedMotion); let view = "empty"; let runState = null; let destroyed = false;
  const invoke = (action,payload=null) => typeof actions[action] === "function" ? (actions[action](payload),true) : false;
  const announce = (message) => setText(root,"status",message);
  const renderReady = (options={}) => { if (destroyed) return false; root.innerHTML = buildArcadeRushReadyMarkup(options); view="ready"; runState=null; applyMotion(root,reduced); focusDefault(root); return true; };
  const renderHud = (snapshot={}) => { if (destroyed) return false; ensureGameplay(root); view="gameplay"; runState=snapshot.runState||null; applyMotion(root,reduced); updateHud(root,snapshot); setHidden(root,"transition-overlay",true); if (runState === "paused") announce("Arcade Rush paused."); return true; };
  const renderWaveTransition = (snapshot={},detail={}) => { renderHud(snapshot); runState="transitioning"; setHtml(root,"transition-overlay",transitionMarkup(snapshot,detail)); setHidden(root,"transition-overlay",false); announce(`Wave ${detail.clearedWave||snapshot.wavesCompleted} cleared.`); return true; };
  const renderBossIntro = (snapshot={}) => { renderHud(snapshot); runState="boss-intro"; setHtml(root,"transition-overlay",bossIntroMarkup(snapshot)); setHidden(root,"transition-overlay",false); announce("Final boss. Core Breaker."); return true; };
  const renderResults = (result,options={}) => { if (destroyed || !result) return false; root.innerHTML = buildArcadeRushResultsMarkup(result,options); view="results"; runState=result.success?"complete":"failed"; applyMotion(root,reduced); focusDefault(root); return true; };
  const clearGameplay = () => { if (destroyed) return false; root.innerHTML=""; view="empty"; runState=null; return true; };
  const activate = (action,payload=null) => !destroyed && Object.values(ARCADE_RUSH_UI_ACTIONS).includes(action) && invoke(action,payload);
  const click = (event) => { const target = event?.target?.closest?.("[data-rush-action]"); if (!target || target.disabled) return; const action = target.getAttribute?.("data-rush-action"); if (activate(action,{event,view,runState})) event.preventDefault?.(); };
  const handleKey = (event) => { if (destroyed || !event || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return false; let action=null; if (view === "ready") { if (["Enter"," "].includes(event.key)) action=ARCADE_RUSH_UI_ACTIONS.START; else if (event.key === "Escape") action=ARCADE_RUSH_UI_ACTIONS.BACK; } else if (view === "results") { if (event.key === "Enter") action=ARCADE_RUSH_UI_ACTIONS.PLAY_AGAIN; else if (event.key === "Escape") action=ARCADE_RUSH_UI_ACTIONS.MODE_SELECT; } else if (view === "gameplay" && event.key === "Escape") action=runState === "paused" ? ARCADE_RUSH_UI_ACTIONS.RESUME : ARCADE_RUSH_UI_ACTIONS.PAUSE; if (!action) return false; const handled=activate(action,{event,view,runState}); if (handled) event.preventDefault?.(); return handled; };
  const destroy = () => { if (destroyed) return false; root.removeEventListener("click",click); root.innerHTML=""; view="empty"; runState=null; destroyed=true; return true; };
  root.addEventListener("click",click);
  return Object.freeze({renderReady,renderHud,renderWaveTransition,renderBossIntro,renderResults,clearGameplay,activate,announce,handleKey,destroy,getView:()=>view,getRunState:()=>runState,getReducedMotion:()=>reduced});
}

export function createArcadeRushUiBindings(ui, { resultOptions = () => ({}) } = {}) {
  if (!isArcadeRushUiPort(ui)) return null; let transitionDetail=null;
  const route = (snapshot={}) => { if (snapshot.result && ["complete","failed"].includes(snapshot.runState)) return ui.renderResults(snapshot.result,resultOptions(snapshot.result)||{}); if (snapshot.runState === "transitioning") return ui.renderWaveTransition(snapshot,transitionDetail||{}); if (snapshot.runState === "boss-intro") return ui.renderBossIntro(snapshot); return ui.renderHud(snapshot); };
  return Object.freeze({onUpdate:route,onWaveTransition(snapshot,detail){transitionDetail=detail||{};ui.renderWaveTransition(snapshot,transitionDetail);},onWaveStart(snapshot){transitionDetail=null;ui.renderHud(snapshot);},onBossIntro(snapshot){transitionDetail=null;ui.renderBossIntro(snapshot);},onBossStart(snapshot){ui.renderHud(snapshot);},onPause(snapshot){ui.renderHud(snapshot);},onResume:route,onComplete(_snapshot,result){ui.renderResults(result,resultOptions(result)||{});},onFailure(_snapshot,result){ui.renderResults(result,resultOptions(result)||{});},onCleanup(){transitionDetail=null;ui.clearGameplay();}});
}
