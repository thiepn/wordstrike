import { appState } from "./state.js";
import { CAMPAIGN_SPEED_UNLOCKS, getCampaignBest60SecondWpm } from "./storage.js";

const CAMPAIGN_SCREEN_SELECTOR = ".game-screen:not(.endless-screen):not(.boss-screen)";
const CAMPAIGN_ROUTE_SELECTOR = ".campaign-progress-screen";
const MAX_INTEGRITY = 3;
let syncQueued = false;

function setText(node, value) {
  if (!node) return;
  const next = String(value);
  if (node.textContent !== next) node.textContent = next;
}

function createLabel(text) {
  const label = document.createElement("span");
  label.className = "campaign-hud-label";
  label.textContent = text;
  return label;
}

function createMetric(labelText, valueNode, className = "") {
  const metric = document.createElement("div");
  metric.className = `campaign-hud-metric ${className}`.trim();
  const label = createLabel(labelText);
  valueNode.classList.add("campaign-hud-value");
  metric.append(valueNode, label);
  return metric;
}

function buildIntegrityPips(className) {
  const pips = document.createElement("span");
  pips.className = className;
  pips.setAttribute("aria-hidden", "true");
  for (let index = 0; index < MAX_INTEGRITY; index += 1) {
    const segment = document.createElement("i");
    segment.dataset.integritySegment = String(index + 1);
    pips.append(segment);
  }
  return pips;
}

function enhanceHud(screen) {
  const hud = screen.querySelector(".hud");
  if (!hud || hud.dataset.ui5Enhanced === "true") return;

  const back = hud.querySelector(".gameplay-pause-button");
  const level = hud.querySelector("#hud-level");
  const wpm = hud.querySelector("#hud-wpm");
  const accuracy = hud.querySelector("#hud-accuracy");
  const lives = hud.querySelector("#hud-lives");
  const score = hud.querySelector("#hud-score");
  const multiplier = hud.querySelector("#hud-combo");
  if (!back || !level || !wpm || !accuracy || !lives || !score || !multiplier) return;

  hud.dataset.ui5Enhanced = "true";
  hud.classList.add("campaign-gameplay-hud");
  back.classList.add("campaign-hud-back");

  const primary = document.createElement("div");
  primary.className = "campaign-hud-primary";

  // Span keeps metric div ordering stable so the mobile CSS maps WPM and ACC deliberately.
  const identity = document.createElement("span");
  identity.className = "campaign-hud-identity";
  identity.append(createLabel("LEVEL"), level);

  const pace = createMetric("WPM", wpm, "campaign-hud-pace");
  const acc = createMetric("ACC", accuracy);

  const combo = document.createElement("div");
  combo.className = "campaign-hud-metric campaign-hud-combo";
  const comboCount = document.createElement("strong");
  comboCount.dataset.campaignComboCount = "";
  comboCount.className = "campaign-hud-value campaign-hud-combo-count";
  combo.append(comboCount, createLabel("COMBO"), multiplier);

  const scoreMetric = createMetric("SCORE", score, "campaign-hud-score");

  const integrity = document.createElement("div");
  integrity.className = "campaign-hud-integrity";
  const integrityCopy = document.createElement("span");
  integrityCopy.className = "campaign-hud-integrity-copy";
  integrityCopy.append(createLabel("CORE"));
  integrity.append(integrityCopy, buildIntegrityPips("campaign-hud-integrity-pips"));
  lives.classList.add("campaign-hud-legacy-integrity");
  integrity.append(lives);

  primary.append(back, identity, pace, acc, combo, scoreMetric, integrity);

  const secondary = document.createElement("div");
  secondary.className = "campaign-hud-secondary";

  const threat = document.createElement("span");
  threat.className = "campaign-hud-threat";
  threat.append(createLabel("THREATS"));
  const threatValue = document.createElement("strong");
  threatValue.dataset.campaignResolved = "";
  threat.append(threatValue);

  const progress = document.createElement("div");
  progress.className = "campaign-mission-progress";
  progress.dataset.campaignProgress = "";
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", "Campaign mission progress");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", "100");
  progress.setAttribute("aria-valuenow", "0");
  const progressFill = document.createElement("span");
  progressFill.className = "campaign-mission-progress-fill";
  progress.append(progressFill);

  const target = document.createElement("span");
  target.className = "campaign-target-state";
  target.dataset.campaignTargetState = "";
  target.textContent = "SCANNING";

  secondary.append(threat, progress, target);
  hud.replaceChildren(primary, secondary);
}

function enhanceCore(screen) {
  const core = screen.querySelector(".core");
  if (!core || core.dataset.ui5Enhanced === "true") return;
  core.dataset.ui5Enhanced = "true";
  core.classList.add("campaign-core");
  core.setAttribute("role", "img");

  const field = document.createElement("span");
  field.className = "campaign-core-field";
  field.setAttribute("aria-hidden", "true");

  const orbitA = document.createElement("span");
  orbitA.className = "campaign-core-orbit campaign-core-orbit-a";
  orbitA.setAttribute("aria-hidden", "true");

  const orbitB = document.createElement("span");
  orbitB.className = "campaign-core-orbit campaign-core-orbit-b";
  orbitB.setAttribute("aria-hidden", "true");

  const reactor = document.createElement("span");
  reactor.className = "campaign-core-reactor";
  reactor.setAttribute("aria-hidden", "true");

  const segments = buildIntegrityPips("campaign-core-integrity");
  const coreLabel = document.createElement("span");
  coreLabel.className = "campaign-core-label";
  coreLabel.textContent = "CORE";
  coreLabel.setAttribute("aria-hidden", "true");

  core.append(field, orbitA, orbitB, reactor, segments, coreLabel);
}

function enhanceKeyboardTrigger(screen) {
  const trigger = screen.querySelector(".gameplay-keyboard-trigger");
  if (!trigger || trigger.dataset.ui5Enhanced === "true") return;
  trigger.dataset.ui5Enhanced = "true";
  trigger.classList.add("campaign-keyboard-trigger");
  trigger.textContent = "KEYBOARD";
  trigger.setAttribute("aria-label", "Open gameplay keyboard");
}

function targetingCopy(game) {
  const targeting = game?.targetingState;
  if (targeting?.mode === "locked" || game?.activeTargetId) return "TARGET LOCKED";
  const candidates = Array.isArray(targeting?.candidateIds) ? targeting.candidateIds.length : 0;
  if (targeting?.mode === "ambiguous" || candidates > 1) return `${candidates} CANDIDATES`;
  if (targeting?.prefix) return "ACQUIRING";
  return "SCANNING";
}

function syncIntegrity(screen, lives) {
  const safeLives = Math.max(0, Math.min(MAX_INTEGRITY, Number.isFinite(lives) ? Math.round(lives) : MAX_INTEGRITY));
  screen.dataset.coreIntegrity = String(safeLives);
  const core = screen.querySelector(".campaign-core");
  if (core) {
    core.dataset.integrity = String(safeLives);
    core.setAttribute("aria-label", `Campaign Core, integrity ${safeLives} of ${MAX_INTEGRITY}`);
  }
  screen.querySelectorAll("[data-integrity-segment]").forEach((segment) => {
    const segmentNumber = Number(segment.dataset.integritySegment);
    segment.classList.toggle("is-depleted", segmentNumber > safeLives);
  });
}

function syncPresentation(screen) {
  const game = appState.game;
  if (!game || game.mode !== "normal") return;

  const completed = Math.max(0, Number(game.completedWordCount) || 0);
  const missed = Math.max(0, Number(game.missedWordCount) || 0);
  const resolved = completed + missed;
  const total = Math.max(1, Number(game.config?.wordCount) || resolved || 1);
  const progressPercent = Math.max(0, Math.min(100, (resolved / total) * 100));
  const lives = Number.isFinite(Number(game.lives)) ? Number(game.lives) : MAX_INTEGRITY;
  const comboCount = Math.max(0, Number(game.comboCount ?? game.combo ?? 0) || 0);

  setText(screen.querySelector("[data-campaign-resolved]"), `${resolved} / ${total}`);
  setText(screen.querySelector("[data-campaign-combo-count]"), comboCount);
  setText(screen.querySelector("[data-campaign-target-state]"), targetingCopy(game));

  const progress = screen.querySelector("[data-campaign-progress]");
  if (progress) {
    const rounded = Math.round(progressPercent);
    progress.setAttribute("aria-valuenow", String(rounded));
    progress.setAttribute("aria-valuetext", `${resolved} of ${total} threats resolved`);
    const fill = progress.querySelector(".campaign-mission-progress-fill");
    if (fill) fill.style.setProperty("--campaign-progress", `${progressPercent}%`);
  }

  syncIntegrity(screen, lives);
}

function enhanceCampaignScreen() {
  const screen = document.querySelector(CAMPAIGN_SCREEN_SELECTOR);
  if (!screen) return;
  screen.classList.add("campaign-gameplay-screen");
  enhanceHud(screen);
  enhanceCore(screen);
  enhanceKeyboardTrigger(screen);
  syncPresentation(screen);
}

function speedUnlockCopy(wpm, level, bestWpm) {
  const threshold = `${wpm} WPM in the 60-second Typing Test`;
  if (bestWpm >= wpm) {
    return `${threshold} unlocks through Level ${level}. Your best: ${Math.round(bestWpm)} WPM.`;
  }
  if (bestWpm > 0) {
    return `Score ${wpm} WPM in the 60-second Typing Test to unlock through Level ${level}. Your best: ${Math.round(bestWpm)} WPM.`;
  }
  return `Score ${wpm} WPM in the 60-second Typing Test to unlock through Level ${level}.`;
}

function buildSpeedUnlockBadge() {
  const badge = document.createElement("span");
  badge.className = "campaign-speed-unlock-badge";
  badge.setAttribute("aria-hidden", "true");
  badge.innerHTML = `
    <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
      <path d="M9.35 1 3.8 8.42h3.55L6.65 15l5.55-7.42H8.65L9.35 1Z"></path>
    </svg>`;
  return badge;
}

function enhanceCampaignSpeedUnlocks() {
  const screen = document.querySelector(CAMPAIGN_ROUTE_SELECTOR);
  if (!screen) return;
  const bestWpm = getCampaignBest60SecondWpm();

  for (const { wpm, level } of CAMPAIGN_SPEED_UNLOCKS) {
    const node = screen.querySelector(`.campaign-node[data-level="${level}"]`);
    if (!node || node.dataset.speedUnlockDecorated === "true") continue;

    node.dataset.speedUnlockDecorated = "true";
    node.classList.add("has-speed-unlock");
    node.classList.toggle("is-speed-unlocked", bestWpm >= wpm);

    const copy = speedUnlockCopy(wpm, level, bestWpm);
    const marker = node.querySelector(".campaign-node-marker");
    marker?.append(buildSpeedUnlockBadge());

    const tooltip = document.createElement("span");
    tooltip.className = "campaign-speed-unlock-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = copy;
    node.append(tooltip);
    node.title = copy;

    const label = node.getAttribute("aria-label") || `Level ${level}`;
    node.setAttribute("aria-label", `${label}. Typing Test speed unlock: ${wpm} WPM.`);
  }
}

function injectSpeedUnlockStyles() {
  if (document.getElementById("campaign-speed-unlock-styles")) return;
  const style = document.createElement("style");
  style.id = "campaign-speed-unlock-styles";
  style.textContent = `
    .campaign-node.has-speed-unlock .campaign-node-marker{overflow:visible}
    .campaign-speed-unlock-badge{position:absolute;z-index:4;top:-6px;right:-7px;display:grid;place-items:center;width:17px;height:17px;border:1px solid rgb(118 132 144/48%);background:rgb(9 14 20/98%);color:rgb(151 166 178/72%);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);box-shadow:0 0 0 2px rgb(var(--custom-bg-rgb,10 14 20)/88%)}
    .campaign-speed-unlock-badge svg{width:9px;height:9px;fill:currentColor}
    .campaign-node.is-speed-unlocked .campaign-speed-unlock-badge{border-color:rgb(var(--custom-accent-rgb,0 255 242)/72%);color:var(--color-accent);box-shadow:0 0 0 2px rgb(var(--custom-bg-rgb,10 14 20)/88%),0 0 12px rgb(var(--custom-accent-rgb,0 255 242)/20%)}
    .campaign-speed-unlock-tooltip{position:absolute;z-index:50;left:50%;bottom:calc(100% + 8px);width:max-content;max-width:min(280px,78vw);padding:8px 10px;border:1px solid rgb(var(--custom-border-rgb,142 160 174)/32%);background:rgb(var(--custom-bg-rgb,10 14 20)/98%);color:var(--color-text-secondary);font-family:var(--font-ui);font-size:.68rem;font-weight:560;letter-spacing:.01em;line-height:1.4;text-align:left;text-transform:none;white-space:normal;box-shadow:0 12px 28px rgb(0 0 0/38%);opacity:0;visibility:hidden;pointer-events:none;transform:translate(-50%,4px);transition:opacity var(--motion-fast),transform var(--motion-fast),visibility var(--motion-fast)}
    .campaign-node.has-speed-unlock:hover .campaign-speed-unlock-tooltip,.campaign-node.has-speed-unlock:focus-visible .campaign-speed-unlock-tooltip{opacity:1;visibility:visible;transform:translate(-50%,0)}
    .campaign-node:disabled.has-speed-unlock:hover .campaign-speed-unlock-badge{border-color:rgb(118 132 144/58%);color:rgb(151 166 178/82%)}
    @media (max-width:720px){.campaign-speed-unlock-tooltip{max-width:min(230px,72vw);font-size:.64rem}}
  `;
  document.head.append(style);
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    enhanceCampaignScreen();
    enhanceCampaignSpeedUnlocks();
  });
}

injectSpeedUnlockStyles();
const appRoot = document.querySelector("#app");
if (appRoot) {
  new MutationObserver(queueSync).observe(appRoot, { childList: true, subtree: true });
  queueSync();
}
