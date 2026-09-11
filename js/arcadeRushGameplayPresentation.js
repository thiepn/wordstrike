import {
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_WAVE_COUNT,
} from "./arcadeRush/arcadeRushContract.js";
import { getArcadeRushWaveProfile } from "./arcadeRush/arcadeRushConfig.js";

const GAMEPLAY_SELECTOR = '.arcade-rush-ui[data-rush-view="gameplay"]';
const READY_SELECTOR = '.arcade-rush-ui[data-rush-view="ready"]';
const CORE_ROLE = '[data-rush-role="core"]';
const WAVE_ROLE = '[data-rush-role="wave"]';
const COMBO_ROLE = '[data-rush-role="combo"]';
const BOSS_PANEL_ROLE = '[data-rush-role="boss-panel"]';
const BOSS_META_ROLE = '[data-rush-role="boss-meta"]';
const BOSS_METER_ROLE = '[data-rush-role="boss-meter"]';
const TRANSITION_ROLE = '[data-rush-role="transition-overlay"]';
const PAUSE_ROLE = '[data-rush-role="pause-overlay"]';

let frameId = null;
let observer = null;

function integer(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scheduleEnhancement() {
  if (frameId != null) return;
  const schedule = globalThis.requestAnimationFrame || ((callback) => globalThis.setTimeout(callback, 0));
  frameId = schedule(() => {
    frameId = null;
    enhanceCurrentArcadeRushView();
  });
}

function parseFraction(text, fallbackMax) {
  const match = String(text ?? "").match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return { value: 0, max: fallbackMax };
  return {
    value: clamp(integer(match[1]), 0, integer(match[2], fallbackMax)),
    max: Math.max(1, integer(match[2], fallbackMax)),
  };
}

function setProgressbar(element, { label, value, max }) {
  if (!element) return;
  element.setAttribute("role", "progressbar");
  element.setAttribute("aria-label", label);
  element.setAttribute("aria-valuemin", "0");
  element.setAttribute("aria-valuemax", String(max));
  element.setAttribute("aria-valuenow", String(value));
}

function preventDevIndicatorControlCollision() {
  const indicator = document.querySelector(".dev-mode-indicator");
  if (indicator) indicator.style.pointerEvents = "none";
}

function buildRouteVisual(documentRef) {
  const route = documentRef.createElement("div");
  route.className = "arcade-rush-route-visual";
  route.setAttribute("aria-label", "Arcade Rush route: six waves followed by Core Breaker");

  const track = documentRef.createElement("div");
  track.className = "arcade-rush-route-track";

  for (let wave = 1; wave <= ARCADE_RUSH_WAVE_COUNT; wave += 1) {
    const profile = getArcadeRushWaveProfile(wave);
    const node = documentRef.createElement("span");
    node.className = "arcade-rush-route-node";
    node.dataset.wave = String(wave);
    node.title = `Wave ${wave}: ${profile?.name || `Wave ${wave}`}`;
    node.setAttribute("aria-hidden", "true");
    track.append(node);
  }

  const boss = documentRef.createElement("span");
  boss.className = "arcade-rush-route-node arcade-rush-route-boss";
  boss.title = "Final Boss: Core Breaker";
  boss.setAttribute("aria-hidden", "true");
  track.append(boss);

  route.append(track);
  return route;
}

function enhanceReady(root) {
  if (!root || root.dataset.ui9Enhanced === "ready") return;
  root.dataset.ui9Enhanced = "ready";
  root.classList.add("arcade-rush-ui9");

  const card = root.querySelector(".arcade-rush-ready-card");
  const rules = root.querySelector(".arcade-rush-rule-grid");
  if (!card || !rules || card.querySelector(".arcade-rush-route-visual")) return;
  card.insertBefore(buildRouteVisual(root.ownerDocument || document), rules);
}

function ensureCoreIntegrity(core) {
  if (!core) return null;
  let integrity = core.querySelector(".arcade-rush-core-integrity");
  if (integrity) return integrity;

  integrity = (core.ownerDocument || document).createElement("div");
  integrity.className = "arcade-rush-core-integrity";
  integrity.setAttribute("aria-hidden", "true");
  for (let index = 0; index < ARCADE_RUSH_STARTING_INTEGRITY; index += 1) {
    const segment = (core.ownerDocument || document).createElement("i");
    segment.dataset.segment = String(index + 1);
    integrity.append(segment);
  }
  core.append(integrity);
  return integrity;
}

function updateCoreState(root) {
  const metric = root.querySelector(CORE_ROLE);
  const core = root.querySelector(".arcade-rush-core");
  if (!metric || !core) return;

  const fraction = parseFraction(metric.textContent, ARCADE_RUSH_STARTING_INTEGRITY);
  const integrity = clamp(fraction.value, 0, ARCADE_RUSH_STARTING_INTEGRITY);
  root.dataset.ui9Integrity = String(integrity);
  core.dataset.ui9Integrity = String(integrity);
  setProgressbar(core, {
    label: "Arcade Rush Core integrity",
    value: integrity,
    max: ARCADE_RUSH_STARTING_INTEGRITY,
  });

  const segments = ensureCoreIntegrity(core)?.querySelectorAll("i") || [];
  segments.forEach((segment, index) => {
    segment.dataset.filled = index < integrity ? "true" : "false";
  });
}

function ensureWaveName(root, waveMetric) {
  if (!waveMetric?.parentElement) return null;
  let label = waveMetric.parentElement.querySelector(".arcade-rush-wave-name");
  if (!label) {
    label = (root.ownerDocument || document).createElement("span");
    label.className = "arcade-rush-wave-name";
    label.setAttribute("aria-hidden", "true");
    waveMetric.parentElement.append(label);
  }
  return label;
}

function updateWaveState(root) {
  const metric = root.querySelector(WAVE_ROLE);
  if (!metric) return;

  const text = String(metric.textContent || "").trim().toUpperCase();
  const label = ensureWaveName(root, metric);
  if (text === "BOSS") {
    root.dataset.ui9Wave = "boss";
    if (label) label.textContent = "CORE BREAKER";
    return;
  }

  const wave = clamp(parseFraction(text, ARCADE_RUSH_WAVE_COUNT).value || 1, 1, ARCADE_RUSH_WAVE_COUNT);
  const profile = getArcadeRushWaveProfile(wave);
  root.dataset.ui9Wave = String(wave);
  if (label) label.textContent = String(profile?.name || `Wave ${wave}`).toUpperCase();
}

function updateComboState(root) {
  const combo = Math.max(0, integer(root.querySelector(COMBO_ROLE)?.textContent));
  root.dataset.ui9ComboTier = combo >= 50 ? "overdrive" : combo >= 25 ? "surge" : combo >= 10 ? "charged" : "base";
}

function updatePhaseState(root) {
  const boss = root.querySelector(BOSS_PANEL_ROLE);
  const transition = root.querySelector(TRANSITION_ROLE);
  const pause = root.querySelector(PAUSE_ROLE);
  let phase = "wave";
  if (pause && !pause.hidden) phase = "paused";
  else if (transition && !transition.hidden) phase = root.dataset.ui9Wave === "boss" ? "boss-intro" : "transition";
  else if (boss && !boss.hidden) phase = "boss";
  root.dataset.ui9Phase = phase;
}

function updateBossAccessibility(root) {
  const panel = root.querySelector(BOSS_PANEL_ROLE);
  const meta = root.querySelector(BOSS_META_ROLE);
  const meter = root.querySelector(".arcade-rush-boss-meter");
  const meterFill = root.querySelector(BOSS_METER_ROLE);
  if (!panel || panel.hidden || !meta || !meter) return;

  const hp = String(meta.textContent || "").match(/HP\s+(\d+)\s*\/\s*(\d+)/i);
  if (!hp) return;
  const value = Math.max(0, integer(hp[1]));
  const max = Math.max(1, integer(hp[2], 1));
  setProgressbar(meter, { label: "Core Breaker health", value, max });
  meter.removeAttribute("aria-hidden");
  if (meterFill) meterFill.setAttribute("aria-hidden", "true");
}

function enhanceGameplay(root) {
  if (!root) return;
  root.classList.add("arcade-rush-ui9");
  root.dataset.ui9Enhanced = "gameplay";
  updateCoreState(root);
  updateWaveState(root);
  updateComboState(root);
  updatePhaseState(root);
  updateBossAccessibility(root);
}

export function enhanceCurrentArcadeRushView() {
  const ready = document.querySelector(READY_SELECTOR);
  const gameplay = document.querySelector(GAMEPLAY_SELECTOR);
  if (ready || gameplay) preventDevIndicatorControlCollision();
  if (ready) enhanceReady(ready);
  if (gameplay) enhanceGameplay(gameplay);
  return Boolean(ready || gameplay);
}

export function syncArcadeRushGameplayPresentation() {
  return enhanceCurrentArcadeRushView();
}

// Legacy/isolated explicit lifecycle hook. Production V10 uses the shared
// presentationLifecycle observer and therefore does not call this automatically.
export function startArcadeRushGameplayPresentation() {
  if (observer || !globalThis.MutationObserver || !document?.querySelector) {
    scheduleEnhancement();
    return Boolean(observer);
  }
  const app = document.querySelector("#app");
  if (!app) return false;
  observer = new MutationObserver(scheduleEnhancement);
  observer.observe(app, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
  scheduleEnhancement();
  return true;
}

export function stopArcadeRushGameplayPresentation() {
  observer?.disconnect?.();
  observer = null;
  if (frameId != null) {
    const cancel = globalThis.cancelAnimationFrame || globalThis.clearTimeout;
    cancel?.(frameId);
  }
  frameId = null;
  return true;
}
